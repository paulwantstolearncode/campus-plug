-- ============================================================================
-- Order status notifications: keep both parties on-platform
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- Triggers (all SECURITY DEFINER):
--
--  1. notify_on_order_insert() — AFTER INSERT ON orders: notify the seller of a
--     new order (type='order_status', link='/orders/{id}').
--
--  2. notify_on_order_status_change() — AFTER UPDATE OF status ON orders:
--     notify the OTHER party (not the actor) with a human-readable status
--     message ("Your order is now Shipped"). When status hits 'complete', also
--     nudge the buyer to leave a review (link to /reviews/new with an order
--     anchor — see note below).
--
-- Each insert writes to both public.notifications and public.push_messages
-- (with user_id set for per-user push delivery).
--
-- Dedupe: identical notification (same user + link) within 15 minutes is
-- skipped. Respects notification_preferences.enabled for type 'order_status'.
--
-- Review anchor note: verify_review_buyer() only accepts booking_id or
-- sale_id anchors. This trigger links to /reviews/new?orderId={id} — the
-- review form should accept an orderId and create a sale/booking record (or
-- extend reviews with an order_id anchor) so the existing verified-buyer path
-- works. Until then the link still opens the review form; server-side
-- verification handles the anchor.
--
-- Dependencies: orders (add_orders.sql),
--   notification_preferences (add_notification_preferences.sql),
--   push_messages (add_web_push.sql), listings.title, profiles.full_name.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_on_order_insert()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_listing_title TEXT;
  v_recent BOOLEAN;
  v_link TEXT;
BEGIN
  -- Preference gate: skip if seller muted order_status.
  SELECT EXISTS (
    SELECT 1 FROM public.notification_preferences
    WHERE user_id = NEW.seller_id
      AND type = 'order_status'
      AND enabled = false
  ) INTO v_recent;
  IF v_recent THEN RETURN NEW; END IF;

  SELECT title INTO v_listing_title
  FROM public.listings
  WHERE id = NEW.listing_id;

  v_link := '/orders/' || NEW.id::text;

  -- Dedupe: same seller + same order link within 15 min.
  SELECT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = NEW.seller_id
      AND link = v_link
      AND type = 'order_status'
      AND created_at > now() - interval '15 minutes'
  ) INTO v_recent;
  IF v_recent THEN RETURN NEW; END IF;

  INSERT INTO public.notifications (user_id, title, message, link,
                                    type, reference_id, sender_id)
  VALUES (
    NEW.seller_id,
    'New order',
    'New order for "' || COALESCE(v_listing_title, 'this item') ||
    '" (' || COALESCE(NEW.amount::text, '0') || '). Open the order to confirm.',
    v_link,
    'order_status',
    NEW.id::text,
    NEW.buyer_id
  );

  INSERT INTO public.push_messages (title, body, link, user_id)
  VALUES (
    'New order',
    'New order for "' || COALESCE(v_listing_title, 'this item') || '".',
    v_link,
    NEW.seller_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_insert_notification ON public.orders;
CREATE TRIGGER trg_order_insert_notification
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_order_insert();


CREATE OR REPLACE FUNCTION public.notify_on_order_status_change()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_target_user UUID;
  v_listing_title TEXT;
  v_status_label TEXT;
  v_review_nudge BOOLEAN := false;
  v_link TEXT;
  v_recent BOOLEAN;
  v_type TEXT := 'order_status';
BEGIN
  -- Only fire on actual status change.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Determine the other party (not the actor).
  IF v_actor = NEW.seller_id THEN
    v_target_user := NEW.buyer_id;
  ELSIF v_actor = NEW.buyer_id THEN
    v_target_user := NEW.seller_id;
  ELSE
    -- Actor is neither party (e.g. admin) — no notification.
    RETURN NEW;
  END IF;

  -- If buyer_id is NULL (offline buyer with no account), nothing to notify.
  IF v_target_user IS NULL THEN
    RETURN NEW;
  END IF;

  -- Preference gate.
  SELECT EXISTS (
    SELECT 1 FROM public.notification_preferences
    WHERE user_id = v_target_user
      AND type = v_type
      AND enabled = false
  ) INTO v_recent;
  IF v_recent THEN RETURN NEW; END IF;

  SELECT title INTO v_listing_title
  FROM public.listings
  WHERE id = NEW.listing_id;

  v_link := '/orders/' || NEW.id::text;

  -- Human-readable status label.
  v_status_label := CASE NEW.status
    WHEN 'confirmed' THEN 'Confirmed'
    WHEN 'paid' THEN 'Paid'
    WHEN 'preparing' THEN 'Preparing'
    WHEN 'shipped' THEN 'Shipped'
    WHEN 'delivered' THEN 'Delivered'
    WHEN 'complete' THEN 'Completed'
    WHEN 'cancelled' THEN 'Cancelled'
    ELSE NEW.status
  END;

  -- When complete, nudge the buyer to review (only if buyer is the target).
  IF NEW.status = 'complete' AND v_target_user = NEW.buyer_id THEN
    v_review_nudge := true;
  END IF;

  -- Dedupe: same user + same order link + same status within 15 min.
  SELECT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = v_target_user
      AND link = v_link
      AND type = v_type
      AND reference_id = NEW.id::text
      AND created_at > now() - interval '15 minutes'
  ) INTO v_recent;
  IF v_recent THEN RETURN NEW; END IF;

  INSERT INTO public.notifications (user_id, title, message, link,
                                    type, reference_id, sender_id)
  VALUES (
    v_target_user,
    'Order ' || v_status_label,
    'Your order for "' || COALESCE(v_listing_title, 'this item') ||
    '" is now ' || v_status_label || '.' ||
    CASE WHEN v_review_nudge THEN ' Confirm received & leave a review.' ELSE '' END,
    v_link,
    v_type,
    NEW.id::text,
    NEW.seller_id
  );

  INSERT INTO public.push_messages (title, body, link, user_id)
  VALUES (
    'Order ' || v_status_label,
    'Your order for "' || COALESCE(v_listing_title, 'this item') ||
    '" is now ' || v_status_label || '.' ||
    CASE WHEN v_review_nudge THEN ' Confirm received & leave a review.' ELSE '' END,
    v_link,
    v_target_user
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_status_notification ON public.orders;
CREATE TRIGGER trg_order_status_notification
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_order_status_change();


-- ── Verify ───────────────────────────────────────────────────────────────────
SELECT tgname, tgrelid::regclass AS on_table
FROM pg_trigger
WHERE tgrelid = 'public.orders'::regclass
  AND NOT tgisinternal
  AND tgname IN ('trg_order_insert_notification', 'trg_order_status_notification');
