-- ============================================================================
-- Order completion notifications: close the buyer-review leak
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- Three triggers, all SECURITY DEFINER (notifications RLS blocks clients from
-- inserting rows for other users):
--
--  1. notify_seller_on_booking() — EXTENDED: now fires AFTER INSERT OR UPDATE
--     OF status on bookings. New booking → seller alert (existing behavior).
--     pending→completed/cancelled → seller alert about the status change.
--
--  2. notify_buyer_on_sale_complete() — NEW: fires on sales.status UPDATE when
--     status changes to completed/refunded/cancelled. Notifies NEW.buyer_id
--     (falls back to profile lookup by buyer_whatsapp if buyer_id is NULL).
--     Message: "Your purchase of {title} is marked {status}. Confirm received
--     & leave a review." Links to /reviews/new?saleId={id}.
--
--  3. notify_buyer_on_booking_complete() — NEW: fires on bookings.status UPDATE
--     to completed. Notifies NEW.buyer_id. Links to /reviews/new?bookingId={id}.
--
-- Each insert writes to both public.notifications (with type/reference_id/
-- sender_id tags) and public.push_messages (OS-level push outbox).
--
-- Dedupe: identical notification (same user + link) within 15 minutes is
-- skipped, matching add_admin_alert_notifications.sql. New-booking inserts are
-- keyed on the booking id link so they never suppress each other.
--
-- Preferences: each trigger checks notification_preferences; if a row exists
-- with enabled = false for this (user, type), the notification is skipped.
--
-- Dependencies: notifications (add_notifications.sql),
--   notification_preferences (add_notification_preferences.sql),
--   push_messages (add_web_push.sql), sales.buyer_id (add_reviews_system.sql),
--   bookings.buyer_id/seller_id (existing), listings.title, profiles.full_name
--   + whatsapp_number.
-- ============================================================================

-- ── 1. Extended: seller notified on new booking AND on status change ─────────
CREATE OR REPLACE FUNCTION public.notify_seller_on_booking()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_listing_title TEXT;
  v_buyer_name TEXT;
  v_recent BOOLEAN;
BEGIN
  SELECT title INTO v_listing_title
  FROM public.listings
  WHERE id = NEW.listing_id;

  SELECT full_name INTO v_buyer_name
  FROM public.profiles
  WHERE id = NEW.buyer_id;

  IF TG_OP = 'INSERT' THEN
    -- Preference gate: skip if seller muted order_complete.
    SELECT EXISTS (
      SELECT 1 FROM public.notification_preferences
      WHERE user_id = NEW.seller_id
        AND type = 'order_complete'
        AND enabled = false
    ) INTO v_recent;
    IF v_recent THEN RETURN NEW; END IF;

    -- New booking: existing behavior — seller gets a "new booking" alert.
    INSERT INTO public.notifications (user_id, title, message, link,
                                      type, reference_id, sender_id)
    VALUES (
      NEW.seller_id,
      'New Service Booking',
      (COALESCE(v_buyer_name, 'A buyer')) || ' booked "' ||
      COALESCE(v_listing_title, 'your service') || '" for ' ||
      COALESCE(NEW.booking_date::text, '') || ' at ' ||
      COALESCE(NEW.booking_time::text, '') || '. Open your dashboard to confirm.',
      '/dashboard?booking=' || NEW.id::text,
      'order_complete',
      NEW.id::text,
      NEW.buyer_id
    );

    INSERT INTO public.push_messages (title, body, link)
    VALUES (
      'New Service Booking',
      COALESCE(v_buyer_name, 'A buyer') || ' booked "' ||
      COALESCE(v_listing_title, 'your service') || '".',
      '/dashboard?booking=' || NEW.id::text
    );

  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status IN ('completed', 'cancelled') THEN
    -- Status moved into completed/cancelled: tell the seller what changed.
    -- Preference gate.
    SELECT EXISTS (
      SELECT 1 FROM public.notification_preferences
      WHERE user_id = NEW.seller_id
        AND type = 'order_' || NEW.status
        AND enabled = false
    ) INTO v_recent;
    IF v_recent THEN RETURN NEW; END IF;

    -- Dedupe: same seller + same booking link within 15 min.
    SELECT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE user_id = NEW.seller_id
        AND link = '/dashboard?booking=' || NEW.id::text
        AND type = 'order_' || NEW.status
        AND created_at > now() - interval '15 minutes'
    ) INTO v_recent;
    IF v_recent THEN RETURN NEW; END IF;

    INSERT INTO public.notifications (user_id, title, message, link,
                                      type, reference_id, sender_id)
    VALUES (
      NEW.seller_id,
      'Booking ' || initcap(NEW.status),
      (COALESCE(v_buyer_name, 'A buyer')) || ' marked your booking for "' ||
      COALESCE(v_listing_title, 'your service') || '" as ' || NEW.status || '.',
      '/dashboard?booking=' || NEW.id::text,
      'order_' || NEW.status,
      NEW.id::text,
      NEW.buyer_id
    );

    INSERT INTO public.push_messages (title, body, link)
    VALUES (
      'Booking ' || initcap(NEW.status),
      COALESCE(v_buyer_name, 'A buyer') || ' marked your booking as ' ||
      NEW.status || '.',
      '/dashboard?booking=' || NEW.id::text
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_booking_notification ON public.bookings;
CREATE TRIGGER trg_booking_notification
AFTER INSERT OR UPDATE OF status ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.notify_seller_on_booking();


-- ── 2. NEW: buyer notified when a product sale reaches a terminal state ──────
CREATE OR REPLACE FUNCTION public.notify_buyer_on_sale_complete()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_listing_title TEXT;
  v_buyer_name TEXT;
  v_target_user UUID;
  v_recent BOOLEAN;
BEGIN
  -- Only fire when status actually entered a terminal state.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('completed', 'refunded', 'cancelled') THEN
    RETURN NEW;
  END IF;

  -- Resolve the buyer user_id: prefer sales.buyer_id, else look up profile
  -- by buyer_whatsapp, else skip (no addressable user).
  v_target_user := NEW.buyer_id;
  IF v_target_user IS NULL AND NEW.buyer_whatsapp IS NOT NULL THEN
    SELECT id INTO v_target_user
    FROM public.profiles
    WHERE whatsapp_number = NEW.buyer_whatsapp
    LIMIT 1;
  END IF;
  IF v_target_user IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT title INTO v_listing_title
  FROM public.listings
  WHERE id = NEW.listing_id;

  SELECT full_name INTO v_buyer_name
  FROM public.profiles
  WHERE id = v_target_user;

  -- Preference gate: skip if buyer muted this type.
  SELECT EXISTS (
    SELECT 1 FROM public.notification_preferences
    WHERE user_id = v_target_user
      AND type = 'order_' || NEW.status
      AND enabled = false
  ) INTO v_recent;
  IF v_recent THEN RETURN NEW; END IF;

  -- Dedupe: same buyer + same sale link within 15 min.
  SELECT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = v_target_user
      AND link = '/reviews/new?saleId=' || NEW.id::text
      AND created_at > now() - interval '15 minutes'
  ) INTO v_recent;
  IF v_recent THEN RETURN NEW; END IF;

  INSERT INTO public.notifications (user_id, title, message, link,
                                    type, reference_id, sender_id)
  VALUES (
    v_target_user,
    'Purchase ' || initcap(NEW.status),
    'Your purchase of "' || COALESCE(v_listing_title, 'this item') ||
    '" is marked ' || NEW.status ||
    CASE WHEN NEW.status = 'completed' THEN '. Confirm received & leave a review.'
         WHEN NEW.status = 'refunded' THEN '. Your payment was refunded.'
         ELSE '. This order was cancelled.'
    END,
    '/reviews/new?saleId=' || NEW.id::text,
    'order_' || NEW.status,
    NEW.id::text,
    NEW.seller_id
  );

  INSERT INTO public.push_messages (title, body, link)
  VALUES (
    'Purchase ' || initcap(NEW.status),
    'Your purchase of "' || COALESCE(v_listing_title, 'this item') ||
    '" is marked ' || NEW.status || '.',
    '/reviews/new?saleId=' || NEW.id::text
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_buyer_sale_complete ON public.sales;
CREATE TRIGGER trg_buyer_sale_complete
AFTER UPDATE OF status ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.notify_buyer_on_sale_complete();


-- ── 3. NEW: buyer notified when a service booking is completed ───────────────
CREATE OR REPLACE FUNCTION public.notify_buyer_on_booking_complete()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_listing_title TEXT;
  v_recent BOOLEAN;
BEGIN
  -- Only fire on the transition INTO completed.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;

  -- Preference gate: skip if buyer muted order_complete.
  SELECT EXISTS (
    SELECT 1 FROM public.notification_preferences
    WHERE user_id = NEW.buyer_id
      AND type = 'order_complete'
      AND enabled = false
  ) INTO v_recent;
  IF v_recent THEN RETURN NEW; END IF;

  -- Dedupe: same buyer + same booking link within 15 min.
  SELECT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = NEW.buyer_id
      AND link = '/reviews/new?bookingId=' || NEW.id::text
      AND created_at > now() - interval '15 minutes'
  ) INTO v_recent;
  IF v_recent THEN RETURN NEW; END IF;

  SELECT title INTO v_listing_title
  FROM public.listings
  WHERE id = NEW.listing_id;

  INSERT INTO public.notifications (user_id, title, message, link,
                                    type, reference_id, sender_id)
  VALUES (
    NEW.buyer_id,
    'Service completed',
    'Your booking for "' || COALESCE(v_listing_title, 'this service') ||
    '" is marked completed. Confirm received & leave a review.',
    '/reviews/new?bookingId=' || NEW.id::text,
    'order_complete',
    NEW.id::text,
    NEW.seller_id
  );

  INSERT INTO public.push_messages (title, body, link)
  VALUES (
    'Service completed',
    'Your booking for "' || COALESCE(v_listing_title, 'this service') ||
    '" is completed. Leave a review.',
    '/reviews/new?bookingId=' || NEW.id::text
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_buyer_booking_complete ON public.bookings;
CREATE TRIGGER trg_buyer_booking_complete
AFTER UPDATE OF status ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.notify_buyer_on_booking_complete();


-- ── 4. Verify ────────────────────────────────────────────────────────────────
SELECT tgname, tgrelid::regclass AS on_table
FROM pg_trigger
WHERE tgrelid IN ('public.bookings'::regclass, 'public.sales'::regclass)
  AND NOT tgisinternal
  AND tgname IN ('trg_booking_notification', 'trg_buyer_sale_complete',
                 'trg_buyer_booking_complete')
ORDER BY tgrelid::regclass::text, tgname;

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'notifications'
ORDER BY cmd, policyname;
