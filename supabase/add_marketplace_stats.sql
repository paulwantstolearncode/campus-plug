-- ============================================================================
-- Marketplace stats for the landing page social-proof pill
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- The logged-out landing page needs live counts for its hero pill
-- ("X UG students. Y listings. Live."). profiles RLS only lets users read
-- their OWN row (plus admins), so an anonymous COUNT query returns 0.
-- This function reads the two aggregate numbers with SECURITY DEFINER
-- (bypasses RLS, exactly like public.is_admin()) and exposes ONLY counts —
-- no names, no emails, no PII.
--
-- Recursion-safe: it reads profiles and listings directly; neither table's
-- policies reference this function, so there are no policy cycles.
-- ============================================================================

create or replace function public.marketplace_stats()
returns table (seller_count bigint, listing_count bigint)
language sql
security definer
set search_path = public
stable
as $$
  select
    (
      select count(*)
      from public.profiles
      where is_seller = true
        and seller_status = 'approved'
    ) as seller_count,
    (
      select count(*)
      from public.listings
      where approval_status = 'approved'
    ) as listing_count;
$$;

-- Callable by the landing page, logged in or not.
grant execute on function public.marketplace_stats() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Verify: should return two numbers matching what the admin panel shows.
-- ---------------------------------------------------------------------------
select * from public.marketplace_stats();
