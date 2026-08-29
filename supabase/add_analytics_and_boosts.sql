-- ═══════════════════════════════════════════════════════════════════
-- MONETIZATION INFRASTRUCTURE (IDEMPOTENT)
-- Safe to run multiple times — uses ADD COLUMN IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Analytics events table ─────────────────────────────────────
-- Create the table only if it doesn't exist at all.
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL DEFAULT 'listing_view',
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- If the table already existed (e.g. from a prior partial run), ensure
-- every column is present. ADD COLUMN IF NOT EXISTS is safe on existing cols.
ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'listing_view',
  ADD COLUMN IF NOT EXISTS listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Add the CHECK constraint only if it doesn't already exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'analytics_events_event_type_check'
  ) THEN
    ALTER TABLE public.analytics_events
      ADD CONSTRAINT analytics_events_event_type_check
      CHECK (event_type IN ('listing_view', 'whatsapp_click'));
  END IF;
END $$;

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Public can insert (anonymous views are valid).
DROP POLICY IF EXISTS "Anyone can insert analytics events" ON public.analytics_events;
CREATE POLICY "Anyone can insert analytics events"
  ON public.analytics_events FOR INSERT
  WITH CHECK (true);

-- Only admins can read all analytics.
DROP POLICY IF EXISTS "Admins can read analytics events" ON public.analytics_events;
CREATE POLICY "Admins can read analytics events"
  ON public.analytics_events FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Sellers can read analytics for their own listings.
DROP POLICY IF EXISTS "Sellers can read own listing analytics" ON public.analytics_events;
CREATE POLICY "Sellers can read own listing analytics"
  ON public.analytics_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.listings
      WHERE listings.id = analytics_events.listing_id
        AND listings.seller_id = auth.uid()
    )
  );

-- Indexes for common queries.
CREATE INDEX IF NOT EXISTS idx_analytics_events_listing_id
  ON public.analytics_events (listing_id);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at
  ON public.analytics_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_type_listing
  ON public.analytics_events (event_type, listing_id);

-- ── 2. Listing counters (denormalized for fast reads) ─────────────

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS whatsapp_click_count INTEGER NOT NULL DEFAULT 0;

-- Function: increment a listing counter atomically.
CREATE OR REPLACE FUNCTION public.increment_listing_counter(
  p_listing_id UUID,
  p_counter TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_counter = 'view_count' THEN
    UPDATE public.listings SET view_count = view_count + 1 WHERE id = p_listing_id;
  ELSIF p_counter = 'whatsapp_click_count' THEN
    UPDATE public.listings SET whatsapp_click_count = whatsapp_click_count + 1 WHERE id = p_listing_id;
  END IF;
END;
$$;

-- Allow anon + authenticated to call the counter function.
GRANT EXECUTE ON FUNCTION public.increment_listing_counter(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.increment_listing_counter(UUID, TEXT) TO authenticated;

-- ── 3. Boost system ──────────────────────────────────────────────

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS boosted_until TIMESTAMPTZ;

-- Index for sort order: boosted listings first.
CREATE INDEX IF NOT EXISTS idx_listings_boosted
  ON public.listings (boosted_until DESC NULLS LAST, created_at DESC)
  WHERE approval_status = 'approved' AND deleted_at IS NULL;

-- ── 4. Banner ads table ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.banner_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  subtitle TEXT,
  image_url TEXT,
  link_url TEXT NOT NULL,
  bg_color TEXT DEFAULT '#0a0a0c',
  text_color TEXT DEFAULT '#ffffff',
  is_active BOOLEAN NOT NULL DEFAULT true,
  slot INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

ALTER TABLE public.banner_ads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active banner ads" ON public.banner_ads;
CREATE POLICY "Anyone can view active banner ads"
  ON public.banner_ads FOR SELECT
  USING (
    is_active = true
    AND (expires_at IS NULL OR expires_at > now())
  );

DROP POLICY IF EXISTS "Admins can manage banner ads" ON public.banner_ads;
CREATE POLICY "Admins can manage banner ads"
  ON public.banner_ads FOR ALL
  TO authenticated
  USING (public.is_admin());

-- ═══════════════════════════════════════════════════════════════════
-- DONE. Safe to re-run if any step failed partway.
-- ═══════════════════════════════════════════════════════════════════
