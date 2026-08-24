-- ============================================================
-- Soft deletes for listings and plug_requests
-- ============================================================
-- Adds a nullable `deleted_at` timestamptz to both tables.
-- Row is considered soft-deleted when deleted_at IS NOT NULL.
-- Hard-deletes (sales, orders, reviews) are NOT touched.
-- ============================================================

-- 1. Add columns (idempotent)
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.plug_requests
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 2. Indexes for fast exclusion filters
CREATE INDEX IF NOT EXISTS idx_listings_deleted_at
  ON public.listings (deleted_at);

CREATE INDEX IF NOT EXISTS idx_plug_requests_deleted_at
  ON public.plug_requests (deleted_at);

-- 3. Partial index: only non-deleted rows (most queries)
CREATE INDEX IF NOT EXISTS idx_listings_active
  ON public.listings (created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_plug_requests_active
  ON public.plug_requests (created_at DESC)
  WHERE deleted_at IS NULL;

-- 4. Helper function: check if row is not soft-deleted
CREATE OR REPLACE FUNCTION public.is_not_deleted(ts timestamptz)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ts IS NULL;
$$;
