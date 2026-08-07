-- ============================================================================
-- Fix marketplace visibility: non-sellers / non-admins see zero listings.
-- ============================================================================
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- Symptom: a logged-in user who is neither the listing's seller nor an admin
-- sees "Nothing here yet" even though approved listings exist, while the
-- admin sees everything.
--
-- Why it happens: RLS on listings and profiles only exposes OWN rows (plus
-- admins). The marketplace query embeds the seller's profile
-- (full_name, whatsapp_number), so ordinary buyers get filtered out of both —
-- empty feed AND no WhatsApp / Book buttons.
--
-- What this file adds (all ADDITIVE, no existing policy is dropped):
--   1) Anyone (anon + authenticated) can read APPROVED listings.
--   2) Admins can read every listing (already required by /admin's pending
--      tab; recreated idempotently so this file is self-sufficient).
--   3) Anyone can read basic seller info (name + WhatsApp) for sellers who
--      have at least one approved listing — powers the "Message" buttons and
--      the booking page's seller contact.
--
-- Recursion safety: every policy here is a plain column predicate or an
-- EXISTS subquery on listings that never queries profiles (or the new
-- listing_images / listing_items tables) back, and the existing profiles /
-- listings policies don't query those either. No cycles, so no
-- "infinite recursion detected" risk.

-- 0) DIAGNOSIS ----------------------------------------------------------------
--    Run this FIRST to confirm the root cause. If you don't see a policy that
--    lets anon/authenticated read approval_status = 'approved' rows from
--    listings, that is the bug.
--    Also confirm the new bundled-listing tables exist (the app's feed query
--    embeds listing_items; if it's missing, the query errors and the feed is
--    empty for everyone):
select tablename, policyname, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename in ('listings', 'profiles')
order by tablename, cmd, policyname;

select to_regclass('public.listing_items') as listing_items,
       to_regclass('public.listing_images') as listing_images;

-- 1) Public read of approved listings -----------------------------------------
drop policy if exists "Anyone can view approved listings" on public.listings;

create policy "Anyone can view approved listings"
on public.listings for select
to authenticated, anon
using (approval_status = 'approved');

-- 2) Admins can read every listing (incl. pending ones in the review queue) ---
drop policy if exists "Admins can view all listings" on public.listings;

create policy "Admins can view all listings"
on public.listings for select
to authenticated
using (public.is_admin());

-- 3) Buyers can see seller info for approved listings -------------------------
--    (seller name + WhatsApp on marketplace cards, detail page, booking page)
drop policy if exists "Anyone can view seller info of approved listings" on public.profiles;

create policy "Anyone can view seller info of approved listings"
on public.profiles for select
to authenticated, anon
using (
  exists (
    select 1 from public.listings
    where listings.seller_id = profiles.id
      and listings.approval_status = 'approved'
  )
);

-- 4) VERIFY -------------------------------------------------------------------
--    Impersonate a NON-ADMIN user and count what a buyer can actually see.
--    No placeholder to edit: the subquery below automatically picks the most
--    recently created non-admin profile. (To target a specific user instead,
--    replace the whole subquery with their UUID quoted as text, e.g.
--    'd41d8cd9-...'::text.)
--    The whole block rolls back, so nothing is written.
begin;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub',
    (
      select p.id::text
      from public.profiles p
      where coalesce(p.is_admin, false) = false
      order by p.created_at desc
      limit 1
    ),
    'role', 'authenticated'
  )::text,
  true
);

-- Sanity: which user are we acting as? (NULL means there is no non-admin
-- profile yet — supply an explicit UUID in the set_config above.)
select auth.uid() as acting_as;

-- Expect: the number of approved listings (8 in the reported bug).
select count(*) as buyer_visible_listings
from public.listings
where approval_status = 'approved';

-- Expect: >= 1 — sellers of approved listings are now readable.
select count(*) as buyer_visible_seller_info
from public.profiles p
where exists (
  select 1 from public.listings l
  where l.seller_id = p.id and l.approval_status = 'approved'
);

rollback;
