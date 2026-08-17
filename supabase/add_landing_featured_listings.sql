-- ============================================================================
-- Admin-curated featured listings for the landing page
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- 6 fixed slots (1-6). The logged-out landing page shows slots in order and
-- fills any empty ones with the newest approved listings.
--
-- Two deliberate conventions vs. a naive draft:
--   1. DROP POLICY IF EXISTS + CREATE POLICY (repo pattern — CREATE POLICY
--      has no IF NOT EXISTS, so a bare CREATE would 42710 on re-run).
--   2. The admin check uses public.is_admin() (SECURITY DEFINER) instead of a
--      raw subquery on profiles. A raw `select 1 from profiles where ...`
--      inside a policy is exactly the pattern that caused the 42P17 infinite
--      recursion incident — is_admin() bypasses RLS on profiles, so no cycle
--      is possible.
-- ============================================================================

-- ── 1. Table: 6 slots, listing_id nullable (deleted listings leave the slot
--              empty instead of taking the slot down) ───────────────────────
CREATE TABLE IF NOT EXISTS public.landing_featured_listings (
  slot INTEGER PRIMARY KEY CHECK (slot BETWEEN 1 AND 6),
  listing_id UUID REFERENCES public.listings(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- One listing can only occupy one slot (partial index so empty slots don't
-- collide on NULL).
CREATE UNIQUE INDEX IF NOT EXISTS landing_featured_listings_listing_id_unique
ON public.landing_featured_listings (listing_id)
WHERE listing_id IS NOT NULL;

-- ── 2. Seed the 6 empty slots (safe on every run) ──────────────────────────
INSERT INTO public.landing_featured_listings (slot)
SELECT generate_series(1, 6)
ON CONFLICT (slot) DO NOTHING;

-- ── 3. RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.landing_featured_listings ENABLE ROW LEVEL SECURITY;

-- Anyone (logged out included) can read the slot assignments — the landing
-- page needs them before signup. Exposes only slot + listing_id.
DROP POLICY IF EXISTS "Anyone can view landing featured listings" ON public.landing_featured_listings;
CREATE POLICY "Anyone can view landing featured listings"
ON public.landing_featured_listings
FOR SELECT
USING (true);

-- Only admins can assign/clear slots.
DROP POLICY IF EXISTS "Admins can manage landing featured listings" ON public.landing_featured_listings;
CREATE POLICY "Admins can manage landing featured listings"
ON public.landing_featured_listings
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ── 4. Verify ──────────────────────────────────────────────────────────────
SELECT slot, listing_id
FROM public.landing_featured_listings
ORDER BY slot;

SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'landing_featured_listings'
ORDER BY cmd, policyname;
