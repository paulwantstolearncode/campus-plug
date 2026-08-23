-- fix_featured_listings_rls.sql
-- Drops the single FOR ALL policy that was failing on INSERT/UPDATE.
-- Replaces with explicit per-operation policies using public.is_admin().
-- Idempotent: safe to run multiple times.

-- 1. Enable RLS (no-op if already enabled, safe either way)
ALTER TABLE public.landing_featured_listings ENABLE ROW LEVEL SECURITY;

-- 2. Drop old policies
DROP POLICY IF EXISTS "Anyone can view landing featured listings" ON public.landing_featured_listings;
DROP POLICY IF EXISTS "Admins can manage landing featured listings" ON public.landing_featured_listings;

-- 3. Public read — landing page needs this before signup
DROP POLICY IF EXISTS "Anyone can view featured listings" ON public.landing_featured_listings;
CREATE POLICY "Anyone can view featured listings"
  ON public.landing_featured_listings
  FOR SELECT
  USING (true);

-- 4. Admin INSERT
DROP POLICY IF EXISTS "Admins can insert featured listings" ON public.landing_featured_listings;
CREATE POLICY "Admins can insert featured listings"
  ON public.landing_featured_listings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- 5. Admin UPDATE
DROP POLICY IF EXISTS "Admins can update featured listings" ON public.landing_featured_listings;
CREATE POLICY "Admins can update featured listings"
  ON public.landing_featured_listings
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 6. Admin DELETE
DROP POLICY IF EXISTS "Admins can delete featured listings" ON public.landing_featured_listings;
CREATE POLICY "Admins can delete featured listings"
  ON public.landing_featured_listings
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- 7. Verify policies exist
SELECT schemaname, tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'landing_featured_listings'
ORDER BY policyname;
