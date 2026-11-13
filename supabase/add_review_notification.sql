-- ============================================================================
-- Review-driven notifications: seller alerted on new review, reviewer alerted
-- on seller reply
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- Two triggers, both SECURITY DEFINER:
--
--  1. notify_seller_on_review() — fires on reviews INSERT. Notifies NEW.seller_id:
--     "You got a {rating}★ review — reply?" Links to /dashboard#reviews.
--
--  2. notify_reviewer_on_reply() — fires on review_responses INSERT. Notifies
--     the reviewer (reviews.reviewer_id): "{seller} replied to your review."
--     Links to /listing/{listing_id} (listing pulled via the review's
--     booking/sale join).
--
-- Each insert writes to both public.notifications and public.push_messages.
--
-- Dedupe: identical notification (same user + link) within 15 minutes is
-- skipped, matching add_admin_alert_notifications.sql.
--
-- Preferences: each trigger checks notification_preferences; if a row exists
-- with enabled = false for this (user, type), the notification is skipped.
--
-- Dependencies: notifications (add_notifications.sql),
--   notification_preferences (add_notification_preferences.sql),
--   push_messages (add_web_push.sql), reviews, review_responses,
--   bookings (listing_id), sales (listing_id), listings (id, title),
--   profiles (full_name).
-- ============================================================================

-- ── 1. Seller notified on new review ─────────────────────────────────────────
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
  -- Preference gate: skip if seller muted review_received.
  SELECT EXISTS (
    SELECT 1 FROM public.notification_preferences
    WHERE user_id = NEW.seller_id
      AND type = 'review_received'
      AND enabled = false
  ) INTO v_recent;
  IF v_recent THEN RETURN NEW; END IF;

  -- Dedupe: same seller + same dashboard-reviews link within 15 min.
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

  -- Best-effort listing title for context (review anchors to booking or sale).
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

  INSERT INTO public.push_messages (title, body, link)
  VALUES (
    'New ' || NEW.rating || '★ review',
    'You got a ' || NEW.rating || '★ review — reply in your dashboard.',
    v_link
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seller_review_notification ON public.reviews;
CREATE TRIGGER trg_seller_review_notification
AFTER INSERT ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION public.notify_seller_on_review();


-- ── 2. Reviewer notified on seller reply ─────────────────────────────────────
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
  -- Pull the reviewer from the review.
  SELECT r.reviewer_id INTO v_reviewer_id
  FROM public.reviews r
  WHERE r.id = NEW.review_id;

  -- Preference gate: skip if reviewer muted review_replied.
  SELECT EXISTS (
    SELECT 1 FROM public.notification_preferences
    WHERE user_id = v_reviewer_id
      AND type = 'review_replied'
      AND enabled = false
  ) INTO v_recent;
  IF v_recent THEN RETURN NEW; END IF;

  -- Dedupe: same reviewer + same listing link within 15 min.
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

  -- Resolve the listing via the review's booking or sale anchor.
  SELECT l.id, l.title INTO v_listing_id, v_listing_title
  FROM public.listings l
  WHERE l.id = (
    SELECT COALESCE(
      (SELECT b.listing_id FROM public.bookings b WHERE b.id = (SELECT booking_id FROM public.reviews WHERE id = NEW.review_id) LIMIT 1),
      (SELECT s.listing_id FROM public.sales s WHERE s.id = (SELECT sale_id FROM public.reviews WHERE id = NEW.review_id) LIMIT 1)
    )
  );

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

  INSERT INTO public.push_messages (title, body, link)
  VALUES (
    'Seller replied to your review',
    (COALESCE(v_seller_name, 'The seller')) || ' replied to your review.',
    v_listing_link
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reviewer_reply_notification ON public.review_responses;
CREATE TRIGGER trg_reviewer_reply_notification
AFTER INSERT ON public.review_responses
FOR EACH ROW
EXECUTE FUNCTION public.notify_reviewer_on_reply();


-- ── 3. Verify ────────────────────────────────────────────────────────────────
SELECT tgname, tgrelid::regclass AS on_table
FROM pg_trigger
WHERE tgrelid IN ('public.reviews'::regclass, 'public.review_responses'::regclass)
  AND NOT tgisinternal
  AND tgname IN ('trg_seller_review_notification', 'trg_reviewer_reply_notification')
ORDER BY tgrelid::regclass::text, tgname;
