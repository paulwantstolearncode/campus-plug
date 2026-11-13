-- ============================================================================
-- Push delivery: per-user targeting on push_messages
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- Problem: push_messages has no user_id column, so Phase 1 triggers insert
-- broadcast-style rows that the admin-push Edge Function only delivers to
-- admin subscriptions. Regular users never receive OS-level push for their
-- own order/review notifications.
--
-- Fix (additive, backward compatible):
--   * Add nullable user_id to public.push_messages — NULL keeps the existing
--     admin-broadcast behavior; a set user_id routes to that user's subs.
--   * Re-create the Phase 1 SECURITY DEFINER trigger functions so their
--     push_messages INSERT includes the target user_id.
--   * Index (user_id) WHERE processed_at IS NULL for the drain query.
--
-- The admin-push Edge Function (supabase/functions/admin-push/index.ts) must
-- be re-deployed after this migration so it reads user_id and delivers to the
-- right subscriptions.
--
-- Dependencies: push_messages (add_web_push.sql), notifications triggers
-- (add_order_completion_notification.sql, add_review_notification.sql).
-- ============================================================================

-- ── 1. Add user_id to push_messages (additive) ───────────────────────────────
ALTER TABLE public.push_messages
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- ── 2. Index for per-user drain ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_push_messages_user_unprocessed
ON public.push_messages (user_id)
WHERE processed_at IS NULL;

-- ── 3. Re-create Phase 1 trigger functions with user_id on push_messages ─────
--    (CREATE OR REPLACE is idempotent; safe to re-run.)

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
    SELECT EXISTS (
      SELECT 1 FROM public.notification_preferences
      WHERE user_id = NEW.seller_id
        AND type = 'order_complete'
        AND enabled = false
    ) INTO v_recent;
    IF v_recent THEN RETURN NEW; END IF;

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

    INSERT INTO public.push_messages (title, body, link, user_id)
    VALUES (
      'New Service Booking',
      COALESCE(v_buyer_name, 'A buyer') || ' booked "' ||
      COALESCE(v_listing_title, 'your service') || '".',
      '/dashboard?booking=' || NEW.id::text,
      NEW.seller_id
    );

  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status IN ('completed', 'cancelled') THEN
    SELECT EXISTS (
      SELECT 1 FROM public.notification_preferences
      WHERE user_id = NEW.seller_id
        AND type = 'order_' || NEW.status
        AND enabled = false
    ) INTO v_recent;
    IF v_recent THEN RETURN NEW; END IF;

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

    INSERT INTO public.push_messages (title, body, link, user_id)
    VALUES (
      'Booking ' || initcap(NEW.status),
      COALESCE(v_buyer_name, 'A buyer') || ' marked your booking as ' ||
      NEW.status || '.',
      '/dashboard?booking=' || NEW.id::text,
      NEW.seller_id
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
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('completed', 'refunded', 'cancelled') THEN
    RETURN NEW;
  END IF;

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

  SELECT EXISTS (
    SELECT 1 FROM public.notification_preferences
    WHERE user_id = v_target_user
      AND type = 'order_' || NEW.status
      AND enabled = false
  ) INTO v_recent;
  IF v_recent THEN RETURN NEW; END IF;

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

  INSERT INTO public.push_messages (title, body, link, user_id)
  VALUES (
    'Purchase ' || initcap(NEW.status),
    'Your purchase of "' || COALESCE(v_listing_title, 'this item') ||
    '" is marked ' || NEW.status || '.',
    '/reviews/new?saleId=' || NEW.id::text,
    v_target_user
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_buyer_sale_complete ON public.sales;
CREATE TRIGGER trg_buyer_sale_complete
AFTER UPDATE OF status ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.notify_buyer_on_sale_complete();


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
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.notification_preferences
    WHERE user_id = NEW.buyer_id
      AND type = 'order_complete'
      AND enabled = false
  ) INTO v_recent;
  IF v_recent THEN RETURN NEW; END IF;

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

  INSERT INTO public.push_messages (title, body, link, user_id)
  VALUES (
    'Service completed',
    'Your booking for "' || COALESCE(v_listing_title, 'this service') ||
    '" is completed. Leave a review.',
    '/reviews/new?bookingId=' || NEW.id::text,
    NEW.buyer_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_buyer_booking_complete ON public.bookings;
CREATE TRIGGER trg_buyer_booking_complete
AFTER UPDATE OF status ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.notify_buyer_on_booking_complete();


CREATE OR REPLACE FUNCTION public.notify_seller_on_review()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_listing_title TEXT;
  v_seller_name TEXT;
  v_recent BOOLEAN;
  v_link TEXT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.notification_preferences
    WHERE user_id = NEW.seller_id
      AND type = 'review_received'
      AND enabled = false
  ) INTO v_recent;
  IF v_recent THEN RETURN NEW; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = NEW.seller_id
      AND link = '/dashboard#reviews'
      AND type = 'review_received'
      AND created_at > now() - interval '15 minutes'
  ) INTO v_recent;
  IF v_recent THEN RETURN NEW; END IF;

  SELECT full_name INTO v_seller_name
  FROM public.profiles
  WHERE id = NEW.seller_id;

  SELECT l.title INTO v_listing_title
  FROM public.listings l
  WHERE l.id = (
    SELECT COALESCE(
      (SELECT booking_id FROM public.bookings WHERE id = NEW.booking_id LIMIT 1),
      (SELECT sale_id FROM public.sales WHERE id = NEW.sale_id LIMIT 1)
    )
  );

  v_link := '/dashboard#reviews';

  INSERT INTO public.notifications (user_id, title, message, link,
                                    type, reference_id, sender_id)
  VALUES (
    NEW.seller_id,
    'New ' || NEW.rating || '★ review',
    'You got a ' || NEW.rating || '★ review' ||
    CASE WHEN v_listing_title IS NOT NULL THEN ' on "' || v_listing_title || '"' ELSE '' END ||
    ' — reply?' ||
    CASE WHEN NEW.review_text IS NOT NULL AND char_length(NEW.review_text) > 0
         THEN ' "' || NEW.review_text || '"' ELSE '' END,
    v_link,
    'review_received',
    NEW.id::text,
    NEW.reviewer_id
  );

  INSERT INTO public.push_messages (title, body, link, user_id)
  VALUES (
    'New ' || NEW.rating || '★ review',
    'You got a ' || NEW.rating || '★ review — reply in your dashboard.',
    v_link,
    NEW.seller_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seller_review_notification ON public.reviews;
CREATE TRIGGER trg_seller_review_notification
AFTER INSERT ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION public.notify_seller_on_review();


CREATE OR REPLACE FUNCTION public.notify_reviewer_on_reply()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_reviewer_id UUID;
  v_seller_name TEXT;
  v_listing_id UUID;
  v_listing_title TEXT;
  v_listing_link TEXT;
  v_recent BOOLEAN;
BEGIN
  SELECT r.reviewer_id INTO v_reviewer_id
  FROM public.reviews r
  WHERE r.id = NEW.review_id;

  SELECT EXISTS (
    SELECT 1 FROM public.notification_preferences
    WHERE user_id = v_reviewer_id
      AND type = 'review_replied'
      AND enabled = false
  ) INTO v_recent;
  IF v_recent THEN RETURN NEW; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = v_reviewer_id
      AND link LIKE '/listing/%'
      AND type = 'review_replied'
      AND created_at > now() - interval '15 minutes'
  ) INTO v_recent;
  IF v_recent THEN RETURN NEW; END IF;

  SELECT full_name INTO v_seller_name
  FROM public.profiles
  WHERE id = NEW.seller_id;

  SELECT l.id, l.title INTO v_listing_id, v_listing_title
  FROM public.listings l
  WHERE l.id = (
    SELECT COALESCE(
      (SELECT b.listing_id FROM public.bookings b WHERE b.id = (SELECT booking_id FROM public.reviews WHERE id = NEW.review_id) LIMIT 1),
      (SELECT s.listing_id FROM public.sales s WHERE s.id = (SELECT sale_id FROM public.reviews WHERE id = NEW.review_id) LIMIT 1)
    )
  );

  v_listing_link := '/listing/' || COALESCE(v_listing_id::text, '');

  INSERT INTO public.notifications (user_id, title, message, link,
                                    type, reference_id, sender_id)
  VALUES (
    v_reviewer_id,
    'Seller replied to your review',
    (COALESCE(v_seller_name, 'The seller')) || ' replied to your review' ||
    CASE WHEN v_listing_title IS NOT NULL THEN ' on "' || v_listing_title || '"' ELSE '' END ||
    ': "' || NEW.response_text || '".',
    v_listing_link,
    'review_replied',
    NEW.review_id::text,
    NEW.seller_id
  );

  INSERT INTO public.push_messages (title, body, link, user_id)
  VALUES (
    'Seller replied to your review',
    (COALESCE(v_seller_name, 'The seller')) || ' replied to your review.',
    v_listing_link,
    v_reviewer_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reviewer_reply_notification ON public.review_responses;
CREATE TRIGGER trg_reviewer_reply_notification
AFTER INSERT ON public.review_responses
FOR EACH ROW
EXECUTE FUNCTION public.notify_reviewer_on_reply();


-- ── 4. Verify ────────────────────────────────────────────────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'push_messages'
ORDER BY ordinal_position;

SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'push_messages';

SELECT tgname, tgrelid::regclass AS on_table
FROM pg_trigger
WHERE tgrelid IN ('public.bookings'::regclass, 'public.sales'::regclass,
                  'public.reviews'::regclass, 'public.review_responses'::regclass)
  AND NOT tgisinternal
  AND tgname IN ('trg_booking_notification', 'trg_buyer_sale_complete',
                 'trg_buyer_booking_complete', 'trg_seller_review_notification',
                 'trg_reviewer_reply_notification')
ORDER BY tgrelid::regclass::text, tgname;
