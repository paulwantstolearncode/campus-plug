-- ============================================================
-- Funnel Outcome Tracking + Stale Listing Detection
-- Campus Plug — Sep 2026
--
-- RUN THIS IN SUPABASE SQL EDITOR BEFORE DEPLOYING.
-- ============================================================

-- 1. Add sold_at and last_activity_at to listings
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS sold_at timestamptz;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;

-- Indexes for filtering
CREATE INDEX IF NOT EXISTS idx_listings_sold_at ON public.listings (sold_at) WHERE sold_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_listings_last_activity ON public.listings (last_activity_at);

-- 2. Helper: is_stale — returns true when idle > 30 days
CREATE OR REPLACE FUNCTION public.is_stale(ts timestamptz)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ts IS NULL OR ts < now() - interval '30 days';
$$;

-- 3. RPC: log_whatsapp_outcome
-- Inserts a whatsapp_outcome event and bumps last_activity_at
CREATE OR REPLACE FUNCTION public.log_whatsapp_outcome(
  p_listing_id uuid,
  p_outcome text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.analytics_events (event_type, listing_id, metadata)
  VALUES ('whatsapp_outcome', p_listing_id, jsonb_build_object(
    'outcome', p_outcome,
    'source', 'buyer_followup'
  ));

  UPDATE public.listings
  SET last_activity_at = now()
  WHERE id = p_listing_id;
END;
$$;

-- 4. RPC: mark_listing_sold
CREATE OR REPLACE FUNCTION public.mark_listing_sold(
  p_listing_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.listings
  SET sold_at = now(), last_activity_at = now()
  WHERE id = p_listing_id;

  -- Also log a whatsapp_outcome event
  INSERT INTO public.analytics_events (event_type, listing_id, metadata)
  VALUES ('whatsapp_outcome', p_listing_id, jsonb_build_object(
    'outcome', 'sold',
    'source', 'seller_mark'
  ));
END;
$$;

-- 5. RPC: mark_listing_available
CREATE OR REPLACE FUNCTION public.mark_listing_available(
  p_listing_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.listings
  SET sold_at = NULL, last_activity_at = now()
  WHERE id = p_listing_id;
END;
$$;

-- 6. Trigger: auto-bump last_activity_at on whatsapp_click events
CREATE OR REPLACE FUNCTION public.bump_last_activity_on_click()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.event_type = 'whatsapp_click' THEN
    UPDATE public.listings
    SET last_activity_at = now()
    WHERE id = NEW.listing_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_last_activity ON public.analytics_events;
CREATE TRIGGER trg_bump_last_activity
  AFTER INSERT ON public.analytics_events
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_last_activity_on_click();
