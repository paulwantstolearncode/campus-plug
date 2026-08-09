-- ============================================================================
-- Categories for listings
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- Adds a single-category-per-listing system:
--   * listings.category stores the kebab-case slug (e.g. "hair-beauty",
--     "clothing-fashion") — canonical list lives in lib/categories.ts.
--   * NULLABLE on purpose: the 8+ existing listings have no category, and a
--     NOT NULL constraint would break them. They render as "📋 Uncategorized"
--     until backfilled (manually, via the admin panel, after deploy).
--   * The plain B-tree index keeps category filters fast as listings grow.
--
-- No RLS change needed: category is a plain public column on listings and the
-- existing SELECT/INSERT policies already cover it.
--
-- Verify:
--   select category, count(*) from listings group by category;
-- ============================================================================

ALTER TABLE listings
ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS listings_category_idx ON listings(category);
