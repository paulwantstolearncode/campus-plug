-- ============================================================================
-- Harden RLS on profiles: users manage their own profile but CANNOT escalate
-- privileges or approve themselves.
-- ============================================================================
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- What this changes vs. profiles_rls_policies.sql
-- ------------------------------------------------
-- The old "Users can update own profile" policy was a blanket `auth.uid() = id`
-- check, so a user could run `update profiles set is_admin = true` (or
-- `seller_status = 'approved'`) on their own row and it would pass.
--
-- This file replaces it with a column-scoped WITH CHECK that enforces:
--   * is_admin      : cannot change (must equal the pre-update value)
--   * is_seller     : cannot change (must equal the pre-update value)
--   * seller_status : may only be set to 'pending' (or left unchanged)
-- Admins keep full update access (approve/reject sellers, grant admin) via the
-- unchanged admin policy, which is OR'd with the user policy per Postgres RLS
-- semantics.
--
-- It also hardens INSERT: a user may only create their OWN row as a plain
-- pending application (is_admin = false, is_seller = false, seller_status
-- null/'pending') -- no admin-by-insert.
--
-- Why the subqueries cannot cause infinite recursion
-- --------------------------------------------------
-- Each subquery reads profiles through the table's SELECT policies, which are
-- plain `auth.uid() = id` predicates that never query profiles, and the admin
-- check runs through the security-definer is_admin() function (runs as
-- postgres, RLS bypassed inside). So evaluating these expressions never
-- re-triggers another policy that reads profiles.
--
-- Why "is not distinct from" means "unchanged"
-- --------------------------------------------
-- A subquery inside WITH CHECK reads the PRE-update committed row (the new
-- candidate row is not committed yet), so comparing the new column value to
-- the subquery result tests whether the user left it alone.
--
-- Why the become-seller flow still works (app/become-seller/page.tsx)
-- -------------------------------------------------------------------
--   * update { whatsapp_number, seller_status: 'pending' } on own row
--     -> seller_status = 'pending' is allowed; is_admin/is_seller unchanged.
--   * fallback upsert { id, whatsapp_number, seller_status: 'pending',
--     is_seller: false } when no row exists
--     -> INSERT path: own id, is_admin false, is_seller false, 'pending' OK.
--     -> ON CONFLICT UPDATE branch (rare race): is_seller false is unchanged,
--        seller_status 'pending' is allowed. OK.
--
-- Note on full_name: nothing in the app writes it today (the auth callback
-- only exchanges the OAuth code), so no policy restricts it -- owners may
-- freely set their own full_name. Deliberate; do not "harden" it.
--
-- The INSERT policy relies on is_admin defaulting to false (added by
-- add_admin_column.sql: `not null default false`), so payloads that omit it
-- still produce is_admin = false.

-- 0) Admin-check helper (idempotent; already exists if you ran
--    profiles_rls_policies.sql).
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  );
$$;

-- 1) Replace the permissive self-update policy with the hardened one.
drop policy if exists "Users can update own profile" on public.profiles;

create policy "Users can update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (
  auth.uid() = id
  and is_admin is not distinct from (
    select p.is_admin from public.profiles p where p.id = auth.uid()
  )
  and is_seller is not distinct from (
    select p.is_seller from public.profiles p where p.id = auth.uid()
  )
  and (
    seller_status is not distinct from (
      select p.seller_status from public.profiles p where p.id = auth.uid()
    )
    or seller_status = 'pending'
  )
);

-- 2) Harden the insert path (become-seller fallback creates a row when none
--    exists; the auth trigger inserts via security definer, which bypasses
--    this policy).
drop policy if exists "Users can insert own profile" on public.profiles;

create policy "Users can insert own profile"
on public.profiles for insert
to authenticated
with check (
  auth.uid() = id
  and is_admin = false
  and is_seller = false
  and (seller_status is null or seller_status = 'pending')
);

-- 3) Own-row select -- unchanged, recreated for idempotency.
drop policy if exists "Users can view own profile" on public.profiles;

create policy "Users can view own profile"
on public.profiles for select
to authenticated
using (auth.uid() = id);

-- 4) Admin policies -- unchanged, recreated for idempotency.
drop policy if exists "Admins can view all profiles" on public.profiles;

create policy "Admins can view all profiles"
on public.profiles for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can update all profiles" on public.profiles;

create policy "Admins can update all profiles"
on public.profiles for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- 5) Sanity check: list the policies that now exist (expect 5 rows).
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'profiles'
order by cmd, policyname;

-- ============================================================================
-- VERIFICATION (optional -- everything below runs inside a transaction that is
-- ROLLED BACK, so nothing is written to the database)
-- ============================================================================
-- The SQL editor runs as the superuser, so RLS is bypassed by default. To test
-- the policies the way a real request hits them, drop to the `authenticated`
-- role and mock the JWT claims, all inside a transaction we discard.
--
-- First, get the two UUIDs you need (run these separately, outside the
-- transaction below):
--   select id, email from auth.users;
--      -> pick a NON-ADMIN user (preferably one who has NOT been approved yet)
--   select id from public.profiles where is_admin = true;
--      -> the admin user
-- Then paste them into the <NON_ADMIN_UUID> / <ADMIN_UUID> placeholders below
-- and run the whole block. Read the result table of each step: expected values
-- are noted inline; the two "MUST FAIL" steps print an ERROR, which is the pass
-- condition (the savepoints let the transaction continue).
--
-- If a step errors for an unexpected reason, check whether profiles has its own
-- CHECK constraints (e.g. a whatsapp_number format regex) that the harness's
-- placeholder values might trip -- that would be a column constraint error, not
-- an RLS denial.

begin;

-- Impersonate the non-admin user.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<NON_ADMIN_UUID>', 'role', 'authenticated')::text,
  true
);

-- Sanity: auth.uid() must resolve to the non-admin UUID.
select auth.uid() as acting_as;

-- a) Self-promotion attempt -> MUST FAIL with
--    "new row violates row-level security policy for table profiles"
--    (the error + rollback to savepoint is the pass condition).
savepoint t_a;
update public.profiles set is_admin = true where id = '<NON_ADMIN_UUID>';
rollback to savepoint t_a;

-- b) Normal become-seller apply (mirrors app/become-seller/page.tsx) ->
--    MUST SUCCEED; seller_status becomes 'pending', is_admin/is_seller false.
savepoint t_b;
update public.profiles
set whatsapp_number = '233200000000', seller_status = 'pending'
where id = '<NON_ADMIN_UUID>';
select id, is_admin, is_seller, seller_status
from public.profiles where id = '<NON_ADMIN_UUID>';  -- expect pending / false / false
rollback to savepoint t_b;

-- c) Self-approval attempt -> MUST FAIL with the same RLS error as (a).
savepoint t_c;
update public.profiles set seller_status = 'approved' where id = '<NON_ADMIN_UUID>';
rollback to savepoint t_c;

-- d) The admin approves the non-admin user -> MUST SUCCEED.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<ADMIN_UUID>', 'role', 'authenticated')::text,
  true
);
savepoint t_d;
update public.profiles
set seller_status = 'approved', is_seller = true
where id = '<NON_ADMIN_UUID>';
select id, is_admin, is_seller, seller_status
from public.profiles where id = '<NON_ADMIN_UUID>';  -- expect approved / true
rollback to savepoint t_d;

-- Discard everything (including the pending change in (b)).
rollback;
