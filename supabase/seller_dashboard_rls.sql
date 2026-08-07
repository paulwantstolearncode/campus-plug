-- ============================================================================
-- Seller dashboard RLS: sellers can see their bookings + who booked them.
-- ============================================================================
-- Run in the Supabase SQL editor. Idempotent (DROP POLICY IF EXISTS first).
--
-- Adds two policies:
--   1) "Sellers can view their bookings" on bookings (FOR SELECT)
--      using (seller_id = auth.uid())
--   2) "Sellers can view buyers of their bookings" on profiles (FOR SELECT)
--      using (exists a booking where seller_id = auth.uid() and buyer_id = id)
--
-- Policy 1 is REQUIRED for policy 2 to work: the profiles policy's EXISTS
-- subquery reads bookings under RLS as the current user, so without policy 1
-- the seller can't see their own bookings and the buyer rows stay hidden.
--
-- What the buyer row exposes: profiles.full_name (for Google sign-ins this is
-- the account email — the same field the admin panel shows). profiles has no
-- email column; that lives in auth.users.
--
-- Recursion-safe: policy 1 is a plain column predicate. Policy 2's subquery
-- reads bookings (whose policies don't reference profiles), and the existing
-- profiles policies (own-row / admins / sellers-of-approved-listings) don't
-- reference bookings. No cycles.

-- 0) DIAGNOSIS: current bookings policies (usually none or buyer-only).
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'bookings'
order by cmd, policyname;

--    Also confirm the schema the dashboard depends on: all three rows must
--    be 1, or the bookings query in app/dashboard/page.tsx will error (it
--    embeds buyer + listing and orders by created_at):
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='bookings' and column_name='created_at') as has_created_at,
  (select count(*) from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
    where tc.table_schema='public' and tc.table_name='bookings'
      and tc.constraint_type='FOREIGN KEY' and kcu.column_name='buyer_id') as has_buyer_fk,
  (select count(*) from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
    where tc.table_schema='public' and tc.table_name='bookings'
      and tc.constraint_type='FOREIGN KEY' and kcu.column_name='listing_id') as has_listing_fk;

-- 1) Sellers can view their bookings (dashboard + future seller features).
drop policy if exists "Sellers can view their bookings" on public.bookings;

create policy "Sellers can view their bookings"
on public.bookings for select
to authenticated
using (seller_id = auth.uid());

-- 2) Sellers can view the profiles of users who booked them.
drop policy if exists "Sellers can view buyers of their bookings" on public.profiles;

create policy "Sellers can view buyers of their bookings"
on public.profiles for select
to authenticated
using (
  exists (
    select 1 from public.bookings b
    where b.seller_id = auth.uid()
      and b.buyer_id = profiles.id
  )
);

-- 3) VERIFY (rollback-only, no placeholders) ----------------------------------
--    Impersonates the newest seller account and counts what they can see.
--    Ends in rollback, so nothing is written. Zero counts are fine if the
--    seller simply has no bookings yet.
begin;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub',
    (
      select p.id::text
      from public.profiles p
      where coalesce(p.is_seller, false) = true
      order by p.created_at desc
      limit 1
    ),
    'role', 'authenticated'
  )::text,
  true
);

-- Sanity: which seller are we acting as? (NULL = no seller profile exists.)
select auth.uid() as acting_as;

-- Expect: the number of that seller's bookings (0 is fine).
select count(*) as seller_visible_bookings
from public.bookings
where seller_id = auth.uid();

-- Expect: the number of distinct buyers visible (0 is fine).
select count(*) as seller_visible_buyers
from public.profiles p
where exists (
  select 1 from public.bookings b
  where b.seller_id = auth.uid() and b.buyer_id = p.id
);

rollback;
