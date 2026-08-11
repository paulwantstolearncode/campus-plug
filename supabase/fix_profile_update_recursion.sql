-- ============================================================================
-- FIX: become-seller submit 500s with
--   ERROR: 42P17: infinite recursion detected in policy for relation "profiles"
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- Root cause
-- ----------
-- harden_profiles_rls.sql's "Users can update own profile" policy enforced the
-- no-escalation rules in its WITH CHECK using subqueries that re-read profiles
-- (`is_admin is not distinct from (select p.is_admin from profiles p ...)`).
-- Policy expressions are subject to RLS on the tables they read, so those
-- subqueries re-enter profiles, and in production the SELECT-policy graph
-- closes a cycle -> Postgres raises 42P17 and EVERY profiles UPDATE 500s.
-- The become-seller submit hits exactly that path:
--   PATCH /rest/v1/profiles?...&select=id  ->  500
--   -> alert "Something went wrong. Please try again."
--
-- Fix
-- ----
-- 1) Replace the recursive update policy with a plain own-row policy
--    (auth.uid() = id in both USING and WITH CHECK -- no table reads).
-- 2) Move the escalation rules into a BEFORE UPDATE trigger that compares
--    OLD vs NEW directly (no table reads, therefore recursion-free):
--      * is_admin      : cannot change (admins excepted)
--      * is_seller     : cannot change (admins excepted)
--      * seller_status : owner may only set it to 'pending'
--    The trigger trusts admins and non-JWT contexts (the SQL editor runs as
--    postgres, so the founder's manual `update profiles set is_admin = true`
--    admin grants keep working).
--
-- The hardening from harden_profiles_rls.sql is fully preserved -- self-
-- escalation to admin/seller/approved status is still impossible.
-- ============================================================================

-- 1) Replace the recursive update policy with a plain own-row policy.
drop policy if exists "Users can update own profile" on public.profiles;

create policy "Users can update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- 2) Escalation rules, enforced in a trigger instead of a recursive policy.
create or replace function public.prevent_profile_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Trusted contexts: admins, and non-JWT sessions (the SQL editor runs as
  -- postgres and has no JWT). Everyone else gets the rules below.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if new.is_admin is distinct from old.is_admin then
    raise exception 'Changing is_admin is not allowed';
  end if;

  if new.is_seller is distinct from old.is_seller then
    raise exception 'Changing is_seller is not allowed';
  end if;

  if new.seller_status is distinct from old.seller_status
     and new.seller_status <> 'pending' then
    raise exception 'Only admins can set seller_status to approved or rejected';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_profile_escalation on public.profiles;

create trigger prevent_profile_escalation
before update on public.profiles
for each row execute procedure public.prevent_profile_escalation();

-- 3) VERIFY ----------------------------------------------------------------
--    Reproduces the exact become-seller update, then the two attacks the
--    hardening blocks. Ends in ROLLBACK -- nothing is written.
begin;

-- Pick a non-seller BEFORE dropping to the authenticated role (the editor runs
-- as postgres, so it can see every profile row here).
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub',
    (select p.id::text from public.profiles p
     where coalesce(p.is_seller, false) = false
     order by p.created_at desc
     limit 1),
    'role', 'authenticated'
  )::text,
  true
);

set local role authenticated;

-- a) Normal become-seller apply -> MUST SUCCEED (this was the 500 before).
update public.profiles
set whatsapp_number = '233593759569',
    seller_status = 'pending'
where id = auth.uid();

select id, is_seller, is_admin, seller_status
from public.profiles
where id = auth.uid();  -- expect pending / false / false

-- b) Self-promotion -> MUST FAIL with "Changing is_admin is not allowed".
savepoint t_a;
update public.profiles set is_admin = true where id = auth.uid();
rollback to savepoint t_a;

-- c) Self-approval -> MUST FAIL with "Only admins can set seller_status...".
savepoint t_b;
update public.profiles set seller_status = 'approved' where id = auth.uid();
rollback to savepoint t_b;

rollback;
