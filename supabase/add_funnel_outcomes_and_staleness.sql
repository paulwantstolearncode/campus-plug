-- ============================================================================
-- Funnel outcomes + listing staleness (IDEMPOTENT)
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Safe to re-run: every step is additive or DROP+CREATE'd to the same shape.
--
-- What this adds:
--
--   1) whatsapp_outcome analytics events. Buyers/sellers report what happened
--      AFTER a WhatsApp click: messaged / replied / sold / no_response.
--      Extends the existing analytics_events event_type CHECK constraint
--      (the two original types are untouched — nothing existing breaks).
--
--   2) listings.sold_at. Sellers/admins can mark a listing sold; sold rows
--      drop out of the public feed (app queries add `.is('sold_at', null)`).
--
--   3) listings.last_activity_at. Bumped automatically whenever a
--      whatsapp_click or whatsapp_outcome event lands for the listing.
--      Drives the "still available?" staleness nudge (> 30 days idle).
--
--   4) RPCs (SECURITY DEFINER, auth-checked):
--        log_whatsapp_outcome(listing_id, outcome)   -> buyer follow-up
--        mark_listing_sold(listing_id)               -> seller/admin
--        mark_listing_available(listing_id)          -> undo
--
--   5) Defensive RLS on listings: sellers update own rows, admins update all
--      (DROP IF EXISTS + CREATE POLICY, per project ground rules).
--
-- Companion file: funnel_metrics_queries.sql (read-only, run any time).
-- ============================================================================

-- Rollback (commented, in case things go wrong)
-- DROP TRIGGER IF EXISTS trg_touch_listing_activity ON public.analytics_events;
-- DROP FUNCTION IF EXISTS public.touch_listing_activity_on_event();
-- DROP FUNCTION IF EXISTS public.is_stale(TIMESTAMPTZ);
-- DROP FUNCTION IF EXISTS public.log_whatsapp_outcome(UUID, TEXT);
-- DROP FUNCTION IF EXISTS public.mark_listing_sold(UUID);
-- DROP FUNCTION IF EXISTS public.mark_listing_available(UUID);
-- ALTER TABLE public.listings DROP COLUMN IF EXISTS sold_at;
-- ALTER TABLE public.listings DROP COLUMN IF EXISTS last_activity_at;
-- ALTER TABLE public.analytics_events DROP CONSTRAINT IF EXISTS analytics_events_event_type_check;
-- ALTER TABLE public.analytics_events ADD CONSTRAINT analytics_events_event_type_check
--   CHECK (event_type IN ('listing_view', 'whatsapp_click'));

-- ── 1. Extend analytics event types with whatsapp_outcome ───────────────────
DO $$
BEGIN
  ALTER TABLE public.analytics_events
    DROP CONSTRAINT IF EXISTS analytics_events_event_type_check;
  ALTER TABLE public.analytics_events
    ADD CONSTRAINT analytics_events_event_type_check
    CHECK (event_type IN ('listing_view', 'whatsapp_click', 'whatsapp_outcome'));
END $$;

-- ── 2. listings: sold_at (mark sold) ────────────────────────────────────────
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ;

-- Sold rows for dashboard/admin queries.
CREATE INDEX IF NOT EXISTS idx_listings_sold
  ON public.listings (sold_at DESC)
  WHERE sold_at IS NOT NULL;

-- Live feed index: non-deleted AND non-sold. The older idx_listings_active is
-- left in place (harmless redundancy; dropping a live index is riskier than
-- leaving it).
CREATE INDEX IF NOT EXISTS idx_listings_live
  ON public.listings (created_at DESC)
  WHERE deleted_at IS NULL AND sold_at IS NULL;

-- ── 3. listings: last_activity_at (staleness signal) ────────────────────────
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT now();

-- Backfill for rows created before this column existed (ALTER TABLE does NOT
-- apply volatile defaults to existing rows, so this is required).
UPDATE public.listings SET last_activity_at = created_at
WHERE last_activity_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_listings_last_activity
  ON public.listings (last_activity_at DESC NULLS LAST)
  WHERE deleted_at IS NULL AND sold_at IS NULL;

-- Bump activity whenever a WhatsApp click or outcome lands for a listing.
CREATE OR REPLACE FUNCTION public.touch_listing_activity_on_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.listings SET last_activity_at = now() WHERE id = NEW.listing_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_listing_activity ON public.analytics_events;
CREATE TRIGGER trg_touch_listing_activity
  AFTER INSERT ON public.analytics_events
  FOR EACH ROW
  WHEN (NEW.event_type IN ('whatsapp_click', 'whatsapp_outcome'))
  EXECUTE FUNCTION public.touch_listing_activity_on_event();

-- Staleness helper. STABLE (not IMMUTABLE — depends on now()).
CREATE OR REPLACE FUNCTION public.is_stale(ts TIMESTAMPTZ)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT ts IS NOT NULL AND ts < now() - interval '30 days';
$$;

-- ── 4. RPC: log a post-WhatsApp outcome (buyer follow-up) ───────────────────
CREATE OR REPLACE FUNCTION public.log_whatsapp_outcome(
  p_listing_id UUID,
  p_outcome TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_outcome NOT IN ('messaged', 'replied', 'sold', 'no_response') THEN
    RAISE EXCEPTION 'Invalid outcome: %', p_outcome;
  END IF;

  INSERT INTO public.analytics_events (event_type, listing_id, user_id, metadata)
  VALUES (
    'whatsapp_outcome',
    p_listing_id,
    auth.uid(),
    jsonb_build_object('outcome', p_outcome, 'source', 'buyer_followup')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_whatsapp_outcome(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.log_whatsapp_outcome(UUID, TEXT) TO authenticated;

-- ── 5. RPC: mark a listing sold / available (seller or admin only) ──────────
CREATE OR REPLACE FUNCTION public.mark_listing_sold(p_listing_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seller_id UUID;
BEGIN
  SELECT seller_id INTO v_seller_id FROM public.listings WHERE id = p_listing_id;
  IF v_seller_id IS NULL THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;
  IF auth.uid() IS DISTINCT FROM v_seller_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only the seller or an admin can mark this listing sold';
  END IF;

  UPDATE public.listings SET sold_at = now() WHERE id = p_listing_id;

  INSERT INTO public.analytics_events (event_type, listing_id, user_id, metadata)
  VALUES (
    'whatsapp_outcome',
    p_listing_id,
    auth.uid(),
    jsonb_build_object('outcome', 'sold', 'source', 'seller_mark')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_listing_available(p_listing_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seller_id UUID;
BEGIN
  SELECT seller_id INTO v_seller_id FROM public.listings WHERE id = p_listing_id;
  IF v_seller_id IS NULL THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;
  IF auth.uid() IS DISTINCT FROM v_seller_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only the seller or an admin can change this listing';
  END IF;

  UPDATE public.listings SET sold_at = NULL WHERE id = p_listing_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_listing_sold(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.mark_listing_sold(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_listing_available(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.mark_listing_available(UUID) TO authenticated;

-- ── 6. Defensive RLS on listings (DROP IF EXISTS + CREATE, per ground rules) ─
-- The app updates listings from the seller dashboard (edit, boost); these
-- policies make this migration self-sufficient if the live DB ever lacks them.
DROP POLICY IF EXISTS "Sellers can update own listings" ON public.listings;
CREATE POLICY "Sellers can update own listings"
  ON public.listings FOR UPDATE
  TO authenticated
  USING (seller_id = auth.uid())
  WITH CHECK (seller_id = auth.uid());

DROP POLICY IF EXISTS "Admins can update all listings" ON public.listings;
CREATE POLICY "Admins can update all listings"
  ON public.listings FOR UPDATE
  TO authenticated
  USING (public.is_admin());

-- ── 7. Verify ───────────────────────────────────────────────────────────────
-- Should list three event types.
select pg_get_constraintdef(oid) as event_type_check
from pg_constraint
where conname = 'analytics_events_event_type_check';

-- Should show sold_at / last_activity_at on listings.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'listings'
  and column_name in ('sold_at', 'last_activity_at')
order by column_name;

-- Should show the new policies on listings.
select policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'listings'
order by cmd, policyname;
