-- ============================================================================
-- Booking notifications: seller gets an in-app notification when a buyer books
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- Why a trigger: notifications RLS only lets a user insert rows for THEMSELVES
-- ("Authenticated users can insert notifications", WITH CHECK auth.uid() =
-- user_id), so the buyer's browser can never write the seller a notification.
-- A SECURITY DEFINER trigger inserts as the table owner, bypassing that
-- restriction without loosening any RLS policy.
--
-- Dependencies: bookings (booking insert), listings.title, profiles.full_name
-- ============================================================================

-- ── 1. Trigger function ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_seller_on_booking()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_listing_title TEXT;
  v_buyer_name TEXT;
BEGIN
  SELECT title INTO v_listing_title
  FROM public.listings
  WHERE id = NEW.listing_id;

  SELECT full_name INTO v_buyer_name
  FROM public.profiles
  WHERE id = NEW.buyer_id;

  INSERT INTO public.notifications (user_id, title, message, link)
  VALUES (
    NEW.seller_id,
    'New Service Booking',
    (COALESCE(v_buyer_name, 'A buyer')) || ' booked "' ||
    COALESCE(v_listing_title, 'your service') || '" for ' ||
    COALESCE(NEW.booking_date::text, '') || ' at ' ||
    COALESCE(NEW.booking_time::text, '') || '. Open your dashboard to confirm.',
    '/dashboard'
  );

  RETURN NEW;
END;
$$;

-- ── 2. Trigger ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_booking_notification ON public.bookings;
CREATE TRIGGER trg_booking_notification
AFTER INSERT ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.notify_seller_on_booking();
