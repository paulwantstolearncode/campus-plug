-- Fix infinite RLS recursion on profiles + sane admin policies.
-- Run this in the Supabase SQL editor.
--
-- Symptom it fixes: app/admin shows
--   "infinite recursion detected in policy for relation 'profiles'"
-- caused by an RLS policy on profiles that re-queries profiles
-- (e.g. "Admins can view all rows" wizard policy). This replaces ALL
-- policies on profiles with a set that matches the app's actual usage:
--   - users read / insert / update only their own profile row
--   - admins read / update every profile (approve/reject sellers)
-- The admin check uses a security definer function, which bypasses RLS
-- on profiles and therefore cannot recurse.

-- 1) Admin check helper. Security definer = runs as the function owner
--    (postgres), so the inner profiles query ignores RLS entirely.
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

-- 2) Drop every existing policy on profiles (including the recursive one).
--    Names are read from pg_policies so you don't need to know them.
do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
  loop
    execute format('drop policy if exists %I on public.profiles', p.policyname);
  end loop;
end $$;

-- 3) Recreate policies the app actually needs.
--    (handle_new_user trigger inserts via security definer, so no insert
--    policy is needed for signups — the ones below cover the app's calls.)

-- Users can view their own profile (home, services, become-seller, new, admin).
create policy "Users can view own profile"
on public.profiles for select
to authenticated
using (auth.uid() = id);

-- become-seller upsert path (accounts created before the trigger existed).
create policy "Users can insert own profile"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

-- become-seller updates WhatsApp number + status on their own row.
create policy "Users can update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Admin panel reads all pending sellers.
create policy "Admins can view all profiles"
on public.profiles for select
to authenticated
using (public.is_admin());

-- Admin panel approves / rejects sellers.
create policy "Admins can update all profiles"
on public.profiles for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- 4) Verify: should list the 5 policies above, no errors.
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'profiles'
order by cmd;
