-- ============================================================================
-- Bundled listings + multi-photo uploads
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- DEPENDENCY: the admin policies below use public.is_admin(), which is created
-- by supabase/profiles_rls_policies.sql. Run that file first if this is a
-- fresh database.
--
-- RECURSION NOTE: the SELECT/INSERT policies below use EXISTS subqueries on
-- the `listings` table. Postgres applies listings' own RLS policies inside
-- those subqueries, so keep any listings policy free of subqueries against
-- listing_images/listing_items (or they would recurse).
--
-- What this adds:
--   * listing_images  — up to 5 photos per listing (display_order = order)
--   * listing_items   — unlimited bundled items/services within one listing
--   * RLS for both, matching the app's operations (anon view approved,
--     sellers manage their own, admins manage all)
--   * Migrates existing listings.image_url rows into listing_images
--
-- Backward compat:
--   * listings.image_url stays as the primary/cover image
--   * listings.price stays as the starting price of the bundle
-- ============================================================================

-- Rollback (commented, in case things go wrong)
-- DROP TABLE listing_items;
-- DROP TABLE listing_images;

-- ---------------------------------------------------------------------------
-- Multiple images per listing
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listing_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID REFERENCES listings(id) ON DELETE CASCADE NOT NULL,
  image_url TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS listing_images_listing_id_idx ON listing_images(listing_id);
CREATE INDEX IF NOT EXISTS listing_images_display_order_idx ON listing_images(listing_id, display_order);

-- ---------------------------------------------------------------------------
-- Multiple items within one listing (the bundle)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- RLS policies for listing_images
-- ---------------------------------------------------------------------------
ALTER TABLE listing_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view images of approved listings"
ON listing_images FOR SELECT
TO authenticated, anon
USING (
  EXISTS (
    SELECT 1 FROM listings
    WHERE listings.id = listing_images.listing_id
    AND listings.approval_status = 'approved'
  )
);

CREATE POLICY "Sellers can view own listing images"
ON listing_images FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM listings
    WHERE listings.id = listing_images.listing_id
    AND listings.seller_id = auth.uid()
  )
);

CREATE POLICY "Sellers can insert own listing images"
ON listing_images FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM listings
    WHERE listings.id = listing_images.listing_id
    AND listings.seller_id = auth.uid()
  )
);

-- Needed for reordering photos (display_order changes) — the feature spec
-- requires add/remove/reorder, so sellers get UPDATE on their own images.
CREATE POLICY "Sellers can update own listing images"
ON listing_images FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM listings
    WHERE listings.id = listing_images.listing_id
    AND listings.seller_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM listings
    WHERE listings.id = listing_images.listing_id
    AND listings.seller_id = auth.uid()
  )
);

CREATE POLICY "Sellers can delete own listing images"
ON listing_images FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM listings
    WHERE listings.id = listing_images.listing_id
    AND listings.seller_id = auth.uid()
  )
);

CREATE POLICY "Admins can manage all listing images"
ON listing_images FOR ALL
TO authenticated
USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- RLS policies for listing_items (same pattern as images)
-- ---------------------------------------------------------------------------
ALTER TABLE listing_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view items of approved listings"
ON listing_items FOR SELECT
TO authenticated, anon
USING (
  EXISTS (
    SELECT 1 FROM listings
    WHERE listings.id = listing_items.listing_id
    AND listings.approval_status = 'approved'
  )
);

CREATE POLICY "Sellers can view own listing items"
ON listing_items FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM listings
    WHERE listings.id = listing_items.listing_id
    AND listings.seller_id = auth.uid()
  )
);

CREATE POLICY "Sellers can manage own listing items"
ON listing_items FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM listings
    WHERE listings.id = listing_items.listing_id
    AND listings.seller_id = auth.uid()
  )
);

CREATE POLICY "Admins can manage all listing items"
ON listing_items FOR ALL
TO authenticated
USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- Migrate existing single images to listing_images
-- ---------------------------------------------------------------------------
INSERT INTO listing_images (listing_id, image_url, display_order)
SELECT id, image_url, 0
FROM listings
WHERE image_url IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM listing_images WHERE listing_id = listings.id);

-- Keep listings.image_url as backward compat (primary image)
-- Keep listings.price as backward compat (starting price of bundle)

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
-- SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('listing_images','listing_items');
-- SELECT policyname, tablename, cmd FROM pg_policies WHERE tablename IN ('listing_images','listing_items') ORDER BY tablename, cmd, policyname;
-- SELECT l.id, l.title, count(li.id) AS photos, count(it.id) AS items
-- FROM listings l
-- LEFT JOIN listing_images li ON li.listing_id = l.id
-- LEFT JOIN listing_items it ON it.listing_id = l.id
-- GROUP BY l.id, l.title
-- ORDER BY l.created_at DESC;
