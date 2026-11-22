-- ============================================================================
-- Service bookings -> paid orders
-- ----------------------------------------------------------------------------
-- Run AFTER add_orders.sql, add_sales_tracking.sql, add_dispute_lock.sql,
-- add_auto_release_timer.sql, add_marketplace_payments.sql,
-- add_review_order_anchor.sql and add_order_completion_notification.sql.
-- Idempotent: safe to re-run. This file supersedes earlier advance_order()
-- and auto_release_stale_orders() definitions until the final lockdown.
-- lockdown_order_payment_state.sql MUST RUN LAST.
--
-- New service bookings are created atomically with a prepaid order. MoMo
-- payment moves the order awaiting_payment -> paid, confirming the booking.
-- Service fulfillment ends at confirmed. Confirmation releases the existing
-- escrow and synchronizes the booking amount/timestamp.
--
-- Auto-release waits for BOTH 48 hours after delivery and 48 hours after the
-- appointment. Legacy service orders without an appointment are never
-- auto-released.
-- ============================================================================

-- ── 1. Appointment + bidirectional booking/order link ───────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_order_id_unique
ON public.bookings (order_id)
WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_service_schedule
ON public.orders (scheduled_for)
WHERE kind = 'service' AND status = 'delivered';

-- Existing service orders may predate appointments. Require a schedule for new
-- orders and appointment edits without freezing legacy status transitions.
CREATE OR REPLACE FUNCTION public.require_service_appointment()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.kind = 'service' AND NEW.scheduled_for IS NULL THEN
    RAISE EXCEPTION 'Service orders require an appointment';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_require_service_appointment ON public.orders;
CREATE TRIGGER trg_require_service_appointment
BEFORE INSERT OR UPDATE OF kind, scheduled_for ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.require_service_appointment();

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled'));

-- ── 2. Atomic service order + booking creation ──────────────────────────────
CREATE OR REPLACE FUNCTION public.create_service_order(
  p_listing_id UUID,
  p_scheduled_for TIMESTAMPTZ,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_buyer UUID := auth.uid();
  v_listing RECORD;
  v_order_id UUID;
BEGIN
  IF v_buyer IS NULL THEN
    RAISE EXCEPTION 'Sign in to book a service';
  END IF;

  IF p_scheduled_for IS NULL OR p_scheduled_for <= now() THEN
    RAISE EXCEPTION 'Choose an appointment in the future';
  END IF;

  IF p_notes IS NOT NULL AND char_length(p_notes) > 1000 THEN
    RAISE EXCEPTION 'Booking notes cannot exceed 1000 characters';
  END IF;

  SELECT id, seller_id, price, listing_type, approval_status, deleted_at, sold_at
  INTO v_listing
  FROM public.listings
  WHERE id = p_listing_id;

  IF NOT FOUND OR v_listing.listing_type <> 'service' THEN
    RAISE EXCEPTION 'Service not found';
  END IF;

  IF v_listing.approval_status <> 'approved'
     OR v_listing.deleted_at IS NOT NULL
     OR v_listing.sold_at IS NOT NULL THEN
    RAISE EXCEPTION 'This service is not available for booking';
  END IF;

  IF v_listing.seller_id = v_buyer THEN
    RAISE EXCEPTION 'You cannot book your own service';
  END IF;

  IF v_listing.price IS NULL OR v_listing.price <= 0 THEN
    RAISE EXCEPTION 'This service does not have a valid booking price';
  END IF;

  INSERT INTO public.orders (
    buyer_id, seller_id, listing_id, kind, amount, status,
    payment_method, scheduled_for
  ) VALUES (
    v_buyer, v_listing.seller_id, v_listing.id, 'service', v_listing.price,
    'awaiting_payment', 'prepaid', p_scheduled_for
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.bookings (
    listing_id, buyer_id, seller_id, booking_date, booking_time,
    notes, status, order_id
  ) VALUES (
    v_listing.id,
    v_buyer,
    v_listing.seller_id,
    (p_scheduled_for AT TIME ZONE 'Africa/Accra')::date,
    (p_scheduled_for AT TIME ZONE 'Africa/Accra')::time,
    NULLIF(BTRIM(p_notes), ''),
    'pending',
    v_order_id
  );

  INSERT INTO public.order_events (order_id, actor_id, from_status, to_status, note)
  VALUES (
    v_order_id,
    v_buyer,
    NULL,
    'awaiting_payment',
    'Service booking created; awaiting MoMo payment'
  );

  RETURN v_order_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_service_order(UUID, TIMESTAMPTZ, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_service_order(UUID, TIMESTAMPTZ, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_service_order(UUID, TIMESTAMPTZ, TEXT) TO authenticated;

-- ── 3. Keep linked booking financial/status fields order-driven ─────────────
CREATE OR REPLACE FUNCTION public.protect_order_linked_booking()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF OLD.order_id IS NULL
     OR current_setting('app.service_booking_sync', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.listing_id IS DISTINCT FROM OLD.listing_id
     OR NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
     OR NEW.seller_id IS DISTINCT FROM OLD.seller_id
     OR NEW.booking_date IS DISTINCT FROM OLD.booking_date
     OR NEW.booking_time IS DISTINCT FROM OLD.booking_time
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
     OR NEW.actual_amount IS DISTINCT FROM OLD.actual_amount THEN
    RAISE EXCEPTION 'This booking is managed by order %. Update the order instead.', OLD.order_id;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_protect_order_linked_booking ON public.bookings;
CREATE TRIGGER trg_protect_order_linked_booking
BEFORE UPDATE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.protect_order_linked_booking();

CREATE OR REPLACE FUNCTION public.sync_service_booking_from_order()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.kind <> 'service' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Allows only this trusted synchronization path through the protection
  -- trigger above. The setting is transaction-local.
  PERFORM set_config('app.service_booking_sync', 'on', true);

  UPDATE public.bookings
  SET status = CASE
        WHEN NEW.status = 'confirmed' THEN 'completed'
        WHEN NEW.status IN ('cancelled', 'refunded') THEN 'cancelled'
        WHEN NEW.status IN (
          'paid', 'collecting', 'out_for_delivery', 'delivered', 'disputed'
        ) THEN 'confirmed'
        WHEN NEW.status = 'awaiting_payment' THEN 'pending'
        ELSE status
      END,
      completed_at = CASE
        WHEN NEW.status = 'confirmed' THEN COALESCE(NEW.completed_at, now())
        ELSE NULL
      END,
      actual_amount = CASE
        WHEN NEW.status = 'confirmed' THEN NEW.amount
        ELSE NULL
      END
  WHERE order_id = NEW.id;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sync_service_booking_from_order ON public.orders;
CREATE TRIGGER trg_sync_service_booking_from_order
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_service_booking_from_order();

-- ── 4. Service-aware, dispute-locked order transitions ──────────────────────
CREATE OR REPLACE FUNCTION public.advance_order(
  p_order_id UUID,
  p_to_status TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_order RECORD;
  v_actor UUID := auth.uid();
  v_allowed BOOLEAN := false;
  v_open_dispute BOOLEAN := false;
  v_is_auto_release BOOLEAN := false;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.disputes d
    WHERE d.order_id = p_order_id
      AND d.status = 'open'
  ) INTO v_open_dispute;

  IF v_open_dispute THEN
    RAISE EXCEPTION 'Order % has an open dispute. Resolve the dispute before changing order status.', p_order_id;
  END IF;

  v_is_auto_release := v_actor IS NULL
    AND COALESCE(
      current_setting('app.auto_release_order_id', true) = p_order_id::text,
      false
    )
    AND v_order.status = 'delivered'
    AND p_to_status = 'confirmed'
    AND v_order.updated_at < now() - interval '48 hours'
    AND (
      v_order.kind <> 'service'
      OR (
        v_order.scheduled_for IS NOT NULL
        AND v_order.scheduled_for <= now() - interval '48 hours'
      )
    );

  IF v_order.status = p_to_status THEN
    RETURN;
  END IF;

  IF v_order.status IN ('confirmed', 'cancelled', 'refunded') THEN
    RAISE EXCEPTION 'Order is already in a terminal state (%)', v_order.status;
  END IF;

  IF v_actor = v_order.seller_id THEN
    -- Prepaid services become paid only through record_payment(). Sellers may
    -- confirm payment manually only for product/pay-on-delivery orders.
    IF v_order.status = 'awaiting_payment' AND p_to_status = 'paid'
       AND (v_order.kind = 'product' OR v_order.payment_method = 'pay_on_delivery') THEN
      v_allowed := true;
    ELSIF v_order.status = 'paid' AND p_to_status = 'collecting' THEN
      v_allowed := true;
    ELSIF v_order.status = 'collecting' AND p_to_status = 'out_for_delivery' THEN
      v_allowed := true;
    ELSIF v_order.status = 'out_for_delivery' AND p_to_status = 'delivered' THEN
      v_allowed := true;
    ELSIF p_to_status = 'cancelled' THEN
      v_allowed := true;
    END IF;
  ELSIF v_actor = v_order.buyer_id THEN
    IF v_order.status = 'delivered' AND p_to_status = 'confirmed' THEN
      v_allowed := true;
    ELSIF p_to_status = 'cancelled' THEN
      v_allowed := true;
    END IF;
  END IF;

  IF v_is_auto_release THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Status transition % -> % not allowed for this role', v_order.status, p_to_status;
  END IF;

  INSERT INTO public.order_events (order_id, actor_id, from_status, to_status, note)
  VALUES (p_order_id, v_actor, v_order.status, p_to_status, p_note);

  UPDATE public.orders
  SET status = p_to_status,
      updated_at = now(),
      completed_at = CASE WHEN p_to_status = 'confirmed' THEN now() ELSE completed_at END
  WHERE id = p_order_id;
END;
$fn$;

-- ── 5. Appointment-aware automatic escrow release ───────────────────────────
CREATE OR REPLACE FUNCTION public.auto_release_stale_orders()
RETURNS integer
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_order RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_order IN
    SELECT o.id, o.status, o.kind
    FROM public.orders o
    WHERE o.status = 'delivered'
      AND o.updated_at < now() - interval '48 hours'
      AND (
        o.kind <> 'service'
        OR (
          o.scheduled_for IS NOT NULL
          AND o.scheduled_for <= now() - interval '48 hours'
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.disputes d
        WHERE d.order_id = o.id
          AND d.status = 'open'
      )
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM set_config('app.auto_release_order_id', v_order.id::text, true);
    PERFORM public.advance_order(
      v_order.id,
      'confirmed',
      CASE
        WHEN v_order.kind = 'service'
          THEN 'Auto-confirmed after the appointment and 48h service confirmation window with no open dispute'
        ELSE 'Auto-confirmed after 48h delivery window with no buyer confirmation and no open dispute'
      END
    );
    PERFORM set_config('app.auto_release_order_id', '', true);

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.auto_release_stale_orders() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_release_stale_orders() FROM anon, authenticated;

-- ── 6. Order-backed verified reviews ────────────────────────────────────────
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reviews_order_id
ON public.reviews (order_id);

CREATE UNIQUE INDEX IF NOT EXISTS one_review_per_order_reviewer
ON public.reviews (order_id, reviewer_id)
WHERE order_id IS NOT NULL;

ALTER TABLE public.reviews
  DROP CONSTRAINT IF EXISTS review_has_transaction;

ALTER TABLE public.reviews
  ADD CONSTRAINT review_has_transaction CHECK (
    (CASE WHEN booking_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN sale_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN order_id IS NOT NULL THEN 1 ELSE 0 END) <= 1
  );

CREATE OR REPLACE FUNCTION public.verify_review_buyer()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $fn$
DECLARE
  is_verified_buyer BOOLEAN := false;
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.reviewer_id = NEW.seller_id THEN
    RAISE EXCEPTION 'Sellers cannot review themselves';
  END IF;

  NEW.is_flagged := false;
  NEW.is_hidden := false;
  NEW.flagged_reason := NULL;

  IF (CASE WHEN NEW.booking_id IS NOT NULL THEN 1 ELSE 0 END) +
     (CASE WHEN NEW.sale_id IS NOT NULL THEN 1 ELSE 0 END) +
     (CASE WHEN NEW.order_id IS NOT NULL THEN 1 ELSE 0 END) <> 1 THEN
    RAISE EXCEPTION 'A review must reference exactly one booking, sale, or order';
  END IF;

  IF NEW.booking_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.bookings
      WHERE id = NEW.booking_id
        AND buyer_id = NEW.reviewer_id
        AND seller_id = NEW.seller_id
        AND status = 'completed'
        -- Paid service bookings use the order anchor, preventing two reviews
        -- for the same underlying transaction.
        AND order_id IS NULL
    ) INTO is_verified_buyer;

    IF NOT is_verified_buyer THEN
      RAISE EXCEPTION 'Only the buyer of a completed legacy booking can review this seller; paid bookings use their order';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.order_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.orders
      WHERE id = NEW.order_id
        AND buyer_id = NEW.reviewer_id
        AND seller_id = NEW.seller_id
        AND status = 'confirmed'
    ) INTO is_verified_buyer;

    IF NOT is_verified_buyer THEN
      RAISE EXCEPTION 'Only the buyer of a completed order can review this seller';
    END IF;

    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.sales s
    LEFT JOIN public.profiles p ON p.id = NEW.reviewer_id
    WHERE s.id = NEW.sale_id
      AND s.seller_id = NEW.seller_id
      AND s.status = 'completed'
      AND (
        s.buyer_id = NEW.reviewer_id
        OR (
          s.buyer_whatsapp IS NOT NULL
          AND p.whatsapp_number IS NOT NULL
          AND s.buyer_whatsapp = p.whatsapp_number
        )
      )
  ) INTO is_verified_buyer;

  IF NOT is_verified_buyer THEN
    RAISE EXCEPTION 'Only the buyer of a completed sale can review this seller';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS verify_review_buyer ON public.reviews;
CREATE TRIGGER verify_review_buyer
BEFORE INSERT ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION public.verify_review_buyer();

-- The original update-rules trigger predates order_id. Add a small independent
-- lock so reviewers/sellers cannot move a review to a different order.
CREATE OR REPLACE FUNCTION public.lock_review_order_anchor()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.order_id IS DISTINCT FROM OLD.order_id
     AND auth.uid() IS NOT NULL
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'The order attached to a review cannot be changed';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS lock_review_order_anchor ON public.reviews;
CREATE TRIGGER lock_review_order_anchor
BEFORE UPDATE ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION public.lock_review_order_anchor();

-- ── 7. Avoid duplicate legacy booking notifications for paid orders ─────────
-- Order notifications are the source of truth for linked bookings. In
-- particular, completion links to the order review instead of a booking review.
DROP TRIGGER IF EXISTS trg_booking_notification ON public.bookings;
CREATE TRIGGER trg_booking_notification
AFTER INSERT OR UPDATE OF status ON public.bookings
FOR EACH ROW
WHEN (NEW.order_id IS NULL)
EXECUTE FUNCTION public.notify_seller_on_booking();

DROP TRIGGER IF EXISTS trg_buyer_booking_complete ON public.bookings;
CREATE TRIGGER trg_buyer_booking_complete
AFTER UPDATE OF status ON public.bookings
FOR EACH ROW
WHEN (NEW.order_id IS NULL)
EXECUTE FUNCTION public.notify_buyer_on_booking_complete();

-- ── 8. Verify ───────────────────────────────────────────────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'orders' AND column_name = 'scheduled_for')
    OR (table_name = 'bookings' AND column_name IN ('order_id', 'status')));

SELECT tgname, tgrelid::regclass AS on_table
FROM pg_trigger
WHERE tgname IN (
  'trg_protect_order_linked_booking',
  'trg_sync_service_booking_from_order',
  'verify_review_buyer',
  'lock_review_order_anchor'
)
ORDER BY tgrelid::regclass::text, tgname;
