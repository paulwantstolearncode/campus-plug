-- ============================================================================
-- Campus location on listings
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- Adds a nullable campus_location column so legacy listings keep working.
-- Sellers pick from a curated list (lib/campusLocations.ts) — no freeform
-- text. Displayed on cards + detail pages; marketplace filtering by location
-- is a later phase and intentionally out of scope here.
-- ============================================================================

-- ── 1. Column (nullable for backward compatibility) ────────────────────────
ALTER TABLE public.listings
ADD COLUMN IF NOT EXISTS campus_location TEXT;

CREATE INDEX IF NOT EXISTS listings_campus_location_idx
ON public.listings(campus_location)
WHERE campus_location IS NOT NULL;

COMMENT ON COLUMN public.listings.campus_location IS
'Campus location or delivery type. Nullable for legacy listings.';

-- ── 2. Verify ──────────────────────────────────────────────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'listings'
  AND column_name = 'campus_location';

SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'listings'
  AND indexname = 'listings_campus_location_idx';
