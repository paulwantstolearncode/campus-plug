-- ============================================================================
-- Ensure bundled-listings schema: tables + RLS policies (idempotent).
-- ----------------------------------------------------------------------------
-- Self-contained repair script for the multi-photo + bundles migration.
-- Safe to run on a fresh database OR one that already has some of this
-- (every table is IF NOT EXISTS, every policy is DROP + CREATE).
-- OPEN THIS FILE LOCALLY, Ctrl+A / Cmd+A to select ALL, copy, paste into the
-- Supabase SQL editor, then Run. Don't copy from chat or a rendered view —
-- that's how the content got truncated last time.
-- ============================================================================

CREATE TABLE IF NOT EXISTS listing_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID REFERENCES listings(id) ON DELETE CASCADE NOT NULL,
  image_url TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS listing_images_listing_id_idx ON listing_images(listing_id);
CREATE INDEX IF NOT EXISTS listing_images_display_order_idx ON listing_images(listing_id, display_order);

CREATE TABLE IF NOT EXISTS listing_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID REFERENCES listings(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  price DECIMAL NOT NULL CHECK (price >= 0),
  description TEXT,
  duration TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS listing_items_listing_id_idx ON listing_items(listing_id);

ALTER TABLE listing_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view images of approved listings" ON listing_images;
CREATE POLICY "Anyone can view images of approved listings"
ON listing_images FOR SELECT TO authenticated, anon
USING (
  EXISTS (SELECT 1 FROM listings WHERE listings.id = listing_images.listing_id AND listings.approval_status = 'approved')
);

DROP POLICY IF EXISTS "Sellers can view own listing images" ON listing_images;
CREATE POLICY "Sellers can view own listing images"
ON listing_images FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM listings WHERE listings.id = listing_images.listing_id AND listings.seller_id = auth.uid())
);

DROP POLICY IF EXISTS "Sellers can insert own listing images" ON listing_images;
CREATE POLICY "Sellers can insert own listing images"
ON listing_images FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM listings WHERE listings.id = listing_images.listing_id AND listings.seller_id = auth.uid())
);

DROP POLICY IF EXISTS "Sellers can update own listing images" ON listing_images;
CREATE POLICY "Sellers can update own listing images"
ON listing_images FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM listings WHERE listings.id = listing_images.listing_id AND listings.seller_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM listings WHERE listings.id = listing_images.listing_id AND listings.seller_id = auth.uid())
);

DROP POLICY IF EXISTS "Sellers can delete own listing images" ON listing_images;
CREATE POLICY "Sellers can delete own listing images"
ON listing_images FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM listings WHERE listings.id = listing_images.listing_id AND listings.seller_id = auth.uid())
);

DROP POLICY IF EXISTS "Admins can manage all listing images" ON listing_images;
CREATE POLICY "Admins can manage all listing images"
ON listing_images FOR ALL TO authenticated
USING (public.is_admin());

ALTER TABLE listing_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view items of approved listings" ON listing_items;
CREATE POLICY "Anyone can view items of approved listings"
ON listing_items FOR SELECT TO authenticated, anon
USING (
  EXISTS (SELECT 1 FROM listings WHERE listings.id = listing_items.listing_id AND listings.approval_status = 'approved')
);

DROP POLICY IF EXISTS "Sellers can view own listing items" ON listing_items;
CREATE POLICY "Sellers can view own listing items"
ON listing_items FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM listings WHERE listings.id = listing_items.listing_id AND listings.seller_id = auth.uid())
);

DROP POLICY IF EXISTS "Sellers can manage own listing items" ON listing_items;
CREATE POLICY "Sellers can manage own listing items"
ON listing_items FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM listings WHERE listings.id = listing_items.listing_id AND listings.seller_id = auth.uid())
);

DROP POLICY IF EXISTS "Admins can manage all listing items" ON listing_items;
CREATE POLICY "Admins can manage all listing items"
ON listing_items FOR ALL TO authenticated
USING (public.is_admin());

INSERT INTO listing_images (listing_id, image_url, display_order)
SELECT id, image_url, 0
FROM listings
WHERE image_url IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM listing_images WHERE listing_id = listings.id);

-- Verify: expect listing_images = 6 policies, listing_items = 4 policies.
SELECT tablename, count(*) AS policies
FROM pg_policies
WHERE tablename IN ('listing_images', 'listing_items')
GROUP BY tablename;
