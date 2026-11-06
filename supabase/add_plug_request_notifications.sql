-- ============================================================================
-- Wanted Board notifications: sellers get notified when a plug request posts
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- Why a trigger: notifications RLS only lets a user insert rows for THEMSELVES,
-- so the broadcast the client fires today (lib/plugRequests.ts ->
-- broadcastNotification) is silently rejected for every seller. This
-- SECURITY DEFINER trigger does it server-side instead.
--
-- Scope parity with the (broken) client code: notifies ALL sellers except the
-- requester. If it gets noisy, narrow this later to sellers with listings
-- matching the request category.
--
-- Dependencies: plug_requests, profiles.is_seller
-- ============================================================================

-- ── 1. Trigger function ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_sellers_on_plug_request()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, title, message, link)
  SELECT
    p.id,
    'New Wanted Board Request',
    'Someone is looking for "' || NEW.title || '" on the Wanted Board' ||
    CASE
      WHEN NEW.budget IS NOT NULL THEN ' (GH₵ ' || NEW.budget::text || ')'
      ELSE ''
    END || '.',
    '/requests'
  FROM public.profiles p
  WHERE p.is_seller = true
    AND p.id <> NEW.user_id;

  RETURN NEW;
END;
$$;

-- ── 2. Trigger ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_plug_request_notification ON public.plug_requests;
CREATE TRIGGER trg_plug_request_notification
AFTER INSERT ON public.plug_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_sellers_on_plug_request();
