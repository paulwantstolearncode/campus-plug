-- ============================================================================
-- Order/payment state-machine lockdown and canonical status rename
-- ----------------------------------------------------------------------------
-- Run LAST after add_service_booking_orders.sql and
-- add_momo_payment_intents.sql. Do not apply older order-transition migrations
-- after this file: this is authoritative for order creation, advance_order(),
-- record_payment(), and linked-booking synchronization.
--
-- Canonical order flow:
--   awaiting_payment -> paid -> collecting -> out_for_delivery -> delivered
--   -> confirmed
-- Additional explicit transitions:
--   awaiting_payment -> cancelled
--   paid -> cancelled
--   delivered -> disputed
--   disputed -> refunded
--
-- No SQL is applied by the application. Run this manually in Supabase before
-- deploying the corresponding application changes.
-- ============================================================================

BEGIN;

-- ── 1. Rename legacy statuses without firing business triggers ──────────────
-- In particular, renaming complete -> confirmed must not release escrow or send
-- fresh notifications. The transaction restores every trigger on commit; on
-- error, the whole migration (including DISABLE TRIGGER) rolls back.
ALTER TABLE public.orders DISABLE TRIGGER USER;

DO $$
DECLARE
  v_old_definition TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid)
  INTO v_old_definition
  FROM pg_constraint
  WHERE conrelid = 'public.orders'::regclass
    AND conname = 'orders_status_check';

  -- The guard makes rerunning this migration safe: a final 'confirmed' status
  -- is renamed only while the legacy constraint (which allows 'complete') is
  -- still installed.
  IF v_old_definition LIKE '%''complete''%' THEN
    UPDATE public.orders
    SET status = CASE status
      WHEN 'confirmed' THEN 'awaiting_payment'
      WHEN 'preparing' THEN 'collecting'
      WHEN 'shipped' THEN 'out_for_delivery'
      WHEN 'complete' THEN 'confirmed'
      ELSE status
    END
    WHERE status IN ('confirmed', 'preparing', 'shipped', 'complete');
  END IF;
END;
$$;

ALTER TABLE public.orders ENABLE TRIGGER USER;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check CHECK (
    status IN (
      'awaiting_payment', 'paid', 'collecting', 'out_for_delivery',
      'delivered', 'confirmed', 'cancelled', 'disputed', 'refunded'
    )
  );
ALTER TABLE public.orders
  ALTER COLUMN status SET DEFAULT 'awaiting_payment';

-- ── 2. Remove every direct participant write path ───────────────────────────
DROP POLICY IF EXISTS "Participants can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Participants can update own orders" ON public.orders;
DROP POLICY IF EXISTS "Participants can insert own order events" ON public.order_events;

REVOKE INSERT, UPDATE, DELETE ON public.orders FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.payment_transactions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.order_events FROM authenticated;

-- ── 3. RPC-only product order creation ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_product_order(
  p_listing_id UUID,
  p_amount NUMERIC(10, 2),
  p_payment_method TEXT DEFAULT 'prepaid'
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
    RAISE EXCEPTION 'Sign in to create an order';
  END IF;

  IF p_payment_method IS DISTINCT FROM 'prepaid' THEN
    RAISE EXCEPTION 'Orders require MoMo payment before delivery';
  END IF;

  SELECT id, seller_id, price, listing_type, approval_status, deleted_at, sold_at
  INTO v_listing
  FROM public.listings
  WHERE id = p_listing_id;

  IF NOT FOUND OR v_listing.listing_type <> 'product' THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF v_listing.approval_status <> 'approved'
     OR v_listing.deleted_at IS NOT NULL
     OR v_listing.sold_at IS NOT NULL THEN
    RAISE EXCEPTION 'This product is not available';
  END IF;

  IF v_listing.seller_id = v_buyer THEN
    RAISE EXCEPTION 'You cannot buy your own listing';
  END IF;

  IF v_listing.price IS NULL OR v_listing.price <= 0 THEN
    RAISE EXCEPTION 'This product does not have a valid price';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Order amount must be positive';
  END IF;
  IF round(p_amount, 2) <> round(v_listing.price, 2) THEN
    RAISE EXCEPTION 'Order amount must match the current listing price';
  END IF;

  INSERT INTO public.orders (
    buyer_id, seller_id, listing_id, kind, amount, status, payment_method
  ) VALUES (
    v_buyer, v_listing.seller_id, v_listing.id, 'product', p_amount,
    'awaiting_payment', 'prepaid'
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_events (order_id, actor_id, from_status, to_status, note)
  VALUES (
    v_order_id, v_buyer, NULL, 'awaiting_payment', 'Product order created'
  );

  RETURN v_order_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_product_order(UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_product_order(UUID, NUMERIC, TEXT) TO authenticated;

-- Service creation remains atomic: one order, one booking, one initial event.
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
    v_listing.id, v_buyer, v_listing.seller_id,
    (p_scheduled_for AT TIME ZONE 'Africa/Accra')::date,
    (p_scheduled_for AT TIME ZONE 'Africa/Accra')::time,
    NULLIF(BTRIM(p_notes), ''), 'pending', v_order_id
  );

  INSERT INTO public.order_events (order_id, actor_id, from_status, to_status, note)
  VALUES (
    v_order_id, v_buyer, NULL, 'awaiting_payment',
    'Service booking created; awaiting MoMo payment'
  );

  RETURN v_order_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_service_order(UUID, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_service_order(UUID, TIMESTAMPTZ, TEXT) TO authenticated;

-- ── 4. Canonical transition validation ──────────────────────────────────────
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
  v_is_participant BOOLEAN;
  v_transition_allowed BOOLEAN := false;
  v_role_allowed BOOLEAN := false;
  v_is_auto_release BOOLEAN := false;
  v_payment RECORD;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- Validate the pair independently of the caller. No role can invent another
  -- transition, including admins and service-role callers using this RPC.
  v_transition_allowed := (
    (v_order.status = 'awaiting_payment' AND p_to_status = 'paid') OR
    (v_order.status = 'paid' AND p_to_status = 'collecting') OR
    (v_order.status = 'collecting' AND p_to_status = 'out_for_delivery') OR
    (v_order.status = 'out_for_delivery' AND p_to_status = 'delivered') OR
    (v_order.status = 'delivered' AND p_to_status = 'confirmed') OR
    (v_order.status = 'awaiting_payment' AND p_to_status = 'cancelled') OR
    (v_order.status = 'paid' AND p_to_status = 'cancelled') OR
    (v_order.status = 'delivered' AND p_to_status = 'disputed') OR
    (v_order.status = 'disputed' AND p_to_status = 'refunded')
  );

  IF NOT v_transition_allowed THEN
    RAISE EXCEPTION 'Status transition % -> % is not allowed', v_order.status, p_to_status;
  END IF;

  -- pg_cron has no buyer JWT. auto_release_stale_orders() identifies the exact
  -- locked row with a transaction-local capability; every time/appointment
  -- invariant is repeated here so the capability cannot confirm an early or
  -- unscheduled service order. The open-dispute check below still applies.
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

  v_is_participant := v_actor IS NOT NULL AND (
    COALESCE(v_actor = v_order.buyer_id, false)
    OR COALESCE(v_actor = v_order.seller_id, false)
  );

  -- An existing dispute freezes normal fulfillment. Opening/resolving the
  -- dispute is handled by the two explicitly exempted transitions below.
  IF p_to_status NOT IN ('disputed', 'refunded') AND EXISTS (
    SELECT 1 FROM public.disputes d
    WHERE d.order_id = p_order_id AND d.status = 'open'
  ) THEN
    RAISE EXCEPTION 'Order % has an open dispute', p_order_id;
  END IF;

  IF p_to_status IN ('collecting', 'out_for_delivery', 'delivered') THEN
    v_role_allowed := COALESCE(v_actor = v_order.seller_id, false);
  ELSIF p_to_status = 'confirmed' THEN
    v_role_allowed := COALESCE(v_actor = v_order.buyer_id, false) OR v_is_auto_release;
  ELSIF p_to_status = 'cancelled' THEN
    v_role_allowed := v_is_participant;
  ELSIF p_to_status = 'disputed' THEN
    -- A dispute row must exist; open_order_dispute() creates it atomically
    -- before calling this function. Direct status-only disputes are rejected.
    v_role_allowed := v_is_participant AND EXISTS (
      SELECT 1 FROM public.disputes d
      WHERE d.order_id = p_order_id
        AND d.status = 'open'
        AND d.opened_by = v_actor
    );
  ELSIF p_to_status = 'refunded' THEN
    -- Never label an order refunded until settlement has confirmed the refund.
    v_role_allowed := public.is_admin() AND EXISTS (
      SELECT 1 FROM public.payment_transactions p
      WHERE p.order_id = p_order_id AND p.status = 'refunded'
    );
  END IF;

  -- awaiting_payment -> paid is deliberately excluded here: record_payment()
  -- is the only function permitted to confirm a MoMo collection.
  IF p_to_status = 'paid' THEN
    v_role_allowed := false;
  END IF;

  IF v_role_allowed IS NOT TRUE THEN
    RAISE EXCEPTION 'Status transition % -> % is not allowed for this role', v_order.status, p_to_status;
  END IF;

  -- Cancelling after collection starts the refund path in the same transaction.
  -- The order remains cancelled while settlement is pending; participants can
  -- open a recovery dispute from the cancelled-order UI. Never claim that the
  -- refund completed until complete_disbursement() marks the payment refunded.
  IF v_order.status = 'paid' AND p_to_status = 'cancelled' THEN
    SELECT * INTO v_payment
    FROM public.payment_transactions
    WHERE order_id = p_order_id AND status = 'paid'
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cannot cancel paid order % without a paid payment to refund', p_order_id;
    END IF;

    UPDATE public.payment_transactions
    SET status = 'refund_pending'
    WHERE id = v_payment.id AND status = 'paid';
  END IF;

  INSERT INTO public.order_events (order_id, actor_id, from_status, to_status, note)
  VALUES (
    p_order_id, v_actor, v_order.status, p_to_status,
    CASE
      WHEN v_order.status = 'paid' AND p_to_status = 'cancelled'
        THEN COALESCE(p_note || ' — ', '') || 'Payment marked refund_pending'
      ELSE p_note
    END
  );

  UPDATE public.orders
  SET status = p_to_status,
      updated_at = now(),
      completed_at = CASE
        WHEN p_to_status = 'confirmed' THEN now()
        ELSE completed_at
      END
  WHERE id = p_order_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.advance_order(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_order(UUID, TEXT, TEXT) TO authenticated;

-- Dispute creation and the delivered -> disputed transition are atomic. A
-- cancelled order keeps its cancelled status but can still open a recovery
-- dispute, including when its payment is refund_pending.
DROP POLICY IF EXISTS "Order party can open dispute" ON public.disputes;
REVOKE INSERT ON public.disputes FROM authenticated;

CREATE OR REPLACE FUNCTION public.open_order_dispute(
  p_order_id UUID,
  p_reason TEXT
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_actor UUID := auth.uid();
  v_order RECORD;
  v_dispute_id UUID;
  v_reason TEXT := BTRIM(p_reason);
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Sign in to open a dispute';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 5 OR char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Dispute reason must contain between 5 and 500 characters';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF NOT (
    COALESCE(v_actor = v_order.buyer_id, false)
    OR COALESCE(v_actor = v_order.seller_id, false)
  ) THEN
    RAISE EXCEPTION 'Only an order participant can open a dispute';
  END IF;

  -- Return the existing case instead of allowing a unique-violation race or a
  -- second dispute for the same order.
  SELECT id INTO v_dispute_id
  FROM public.disputes
  WHERE order_id = p_order_id;
  IF FOUND THEN
    RETURN v_dispute_id;
  END IF;

  IF v_order.status NOT IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Disputes can be opened after delivery or cancellation';
  END IF;

  INSERT INTO public.disputes (order_id, opened_by, reason)
  VALUES (p_order_id, v_actor, v_reason)
  RETURNING id INTO v_dispute_id;

  IF v_order.status = 'delivered' THEN
    PERFORM public.advance_order(p_order_id, 'disputed', v_reason);
  END IF;

  RETURN v_dispute_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.open_order_dispute(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_order_dispute(UUID, TEXT) TO authenticated;

-- ── 5. Payment-attempt uniqueness ────────────────────────────────────────────
-- Fail loudly rather than silently choosing which existing real payment to
-- discard. If this guard fires, reconcile duplicate collections manually first.
DO $$
BEGIN
  IF EXISTS (
    SELECT order_id
    FROM public.payment_transactions
    WHERE status IN ('paid', 'released', 'refund_pending', 'refunded')
    GROUP BY order_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate successful payments exist; reconcile them before installing the uniqueness guard';
  END IF;

  IF EXISTS (
    SELECT order_id
    FROM public.payment_transactions
    WHERE status = 'pending'
    GROUP BY order_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate pending payment intents exist; reconcile them before installing the uniqueness guard';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_transactions_one_success_per_order
ON public.payment_transactions (order_id)
WHERE status IN ('paid', 'released', 'refund_pending', 'refunded');

-- Concurrent initiation requests cannot create two live prompts for one order.
-- Failed attempts do not block a deliberate retry; inconclusive attempts stay
-- pending and are resumed with their original provider reference.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_transactions_one_pending_per_order
ON public.payment_transactions (order_id)
WHERE status = 'pending';

-- ── 6. Hardened payment settlement ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_payment(
  p_order_id UUID,
  p_mo_mo_reference TEXT,
  p_amount NUMERIC(10, 2)
)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_order RECORD;
  v_payment RECORD;
BEGIN
  IF p_mo_mo_reference IS NULL OR BTRIM(p_mo_mo_reference) = '' THEN
    RAISE EXCEPTION 'Payment reference is required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  -- Settlement for an order is serialized. Together with the partial unique
  -- index, this closes webhook/polling races and double-successful collections.
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  SELECT * INTO v_payment
  FROM public.payment_transactions
  WHERE mo_mo_reference = p_mo_mo_reference
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment intent not found for reference';
  END IF;

  IF v_payment.order_id <> p_order_id THEN
    RAISE EXCEPTION 'Payment reference belongs to a different order';
  END IF;

  IF round(p_amount, 2) <> round(v_order.amount, 2)
     OR round(p_amount, 2) <> round(v_payment.amount, 2) THEN
    RAISE EXCEPTION 'Payment amount does not match the order and payment intent';
  END IF;

  IF v_payment.status IN ('released', 'refund_pending', 'refunded') THEN
    RAISE EXCEPTION 'Payment is already in terminal/refund state %', v_payment.status;
  END IF;

  -- A replay of the same successful reference is an idempotent no-op.
  IF v_payment.status = 'paid' THEN
    RETURN;
  END IF;

  IF v_payment.status <> 'pending' THEN
    RAISE EXCEPTION 'Only a pending payment can be marked paid (current state: %)', v_payment.status;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payment_transactions p
    WHERE p.order_id = p_order_id
      AND p.id <> v_payment.id
      AND p.status IN ('paid', 'released', 'refund_pending', 'refunded')
  ) THEN
    RAISE EXCEPTION 'Order already has a successful payment';
  END IF;

  IF v_order.status <> 'awaiting_payment' THEN
    RAISE EXCEPTION 'Order is not awaiting payment (current state: %)', v_order.status;
  END IF;

  IF v_order.kind = 'service'
     AND (v_order.scheduled_for IS NULL OR v_order.scheduled_for <= now()) THEN
    RAISE EXCEPTION 'Cannot confirm payment for a past or unscheduled appointment';
  END IF;

  UPDATE public.payment_transactions
  SET status = 'paid',
      platform_fee = round(p_amount * 0.08, 2),
      paid_at = now()
  WHERE id = v_payment.id
    AND status = 'pending';

  INSERT INTO public.order_payments (order_id, payment_id)
  VALUES (p_order_id, v_payment.id)
  ON CONFLICT (order_id) DO NOTHING;

  INSERT INTO public.order_events (order_id, actor_id, from_status, to_status, note)
  VALUES (
    p_order_id, NULL, 'awaiting_payment', 'paid',
    'MoMo payment received: ' || p_mo_mo_reference
  );

  UPDATE public.orders
  SET status = 'paid', updated_at = now()
  WHERE id = p_order_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.record_payment(UUID, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment(UUID, TEXT, NUMERIC) TO service_role;

-- ── 7. Canonical dispute resolution and refund settlement ───────────────────
-- A refund decision never marks an order refunded before money settles. The
-- payment moves to refund_pending; sync_refunded_order_from_payment() performs
-- the explicit disputed -> refunded transition after settlement. Paid
-- cancellations stay cancelled and retain their recovery-dispute path.
CREATE OR REPLACE FUNCTION public.resolve_dispute(
  p_dispute_id UUID,
  p_resolution TEXT,
  p_refund_amount NUMERIC(10, 2) DEFAULT NULL
)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_dispute RECORD;
  v_order RECORD;
  v_payment RECORD;
  v_note TEXT;
  v_refund_amount NUMERIC(10, 2);
  v_platform_fee NUMERIC(10, 2);
  v_seller_retains NUMERIC(10, 2);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can resolve disputes';
  END IF;
  IF p_resolution NOT IN ('refund_full', 'refund_partial', 'release_to_seller', 'no_action') THEN
    RAISE EXCEPTION 'Invalid resolution: %', p_resolution;
  END IF;
  IF p_resolution = 'refund_partial' THEN
    IF p_refund_amount IS NULL OR p_refund_amount <= 0 THEN
      RAISE EXCEPTION 'refund_partial requires a positive refund amount';
    END IF;
  END IF;

  SELECT * INTO v_dispute
  FROM public.disputes
  WHERE id = p_dispute_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dispute not found';
  END IF;
  IF v_dispute.status <> 'open' THEN
    RAISE EXCEPTION 'Dispute is already %', v_dispute.status;
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_dispute.order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF p_refund_amount > v_order.amount THEN
    RAISE EXCEPTION 'Refund amount % cannot exceed order amount %', p_refund_amount, v_order.amount;
  END IF;

  -- release_to_seller remains available for a legacy open dispute that never
  -- moved its delivered order to disputed. Once disputed, the canonical graph
  -- intentionally permits only disputed -> refunded, not disputed -> confirmed.
  IF p_resolution = 'release_to_seller' AND v_order.status <> 'delivered' THEN
    RAISE EXCEPTION 'Canonical flow does not allow % -> confirmed', v_order.status;
  END IF;

  IF p_resolution IN ('refund_full', 'refund_partial') THEN
    IF v_order.status NOT IN ('delivered', 'disputed', 'cancelled') THEN
      RAISE EXCEPTION 'Refunds require a delivered, disputed, or cancelled order';
    END IF;

    SELECT * INTO v_payment
    FROM public.payment_transactions
    WHERE order_id = v_order.id
      AND status IN ('paid', 'released', 'refund_pending', 'refunded')
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No successful payment exists to refund';
    END IF;
    IF v_payment.status = 'refunded' THEN
      RAISE EXCEPTION 'Payment has already been refunded';
    END IF;
  END IF;

  UPDATE public.disputes
  SET status = 'resolved',
      resolution = p_resolution,
      refund_amount = CASE
        WHEN p_resolution = 'refund_full' THEN v_order.amount
        WHEN p_resolution = 'refund_partial' THEN p_refund_amount
        ELSE NULL
      END,
      resolved_by = auth.uid(),
      resolved_at = now()
  WHERE id = p_dispute_id;

  v_note := 'Dispute resolved: ' || p_resolution ||
    CASE WHEN p_refund_amount IS NOT NULL THEN ' (refund ' || p_refund_amount || ')' ELSE '' END;

  IF p_resolution = 'release_to_seller' THEN
    INSERT INTO public.order_events (order_id, actor_id, from_status, to_status, note)
    VALUES (v_order.id, auth.uid(), 'delivered', 'confirmed', v_note);

    UPDATE public.orders
    SET status = 'confirmed', updated_at = now(), completed_at = now()
    WHERE id = v_order.id;
  ELSIF p_resolution IN ('refund_full', 'refund_partial') THEN
    -- Upgrade a legacy delivered/open-dispute pair through the permitted pair
    -- before starting its refund. Fresh disputes already have disputed status.
    IF v_order.status = 'delivered' THEN
      INSERT INTO public.order_events (order_id, actor_id, from_status, to_status, note)
      VALUES (v_order.id, auth.uid(), 'delivered', 'disputed', v_note);

      UPDATE public.orders
      SET status = 'disputed', updated_at = now()
      WHERE id = v_order.id;
    END IF;

    UPDATE public.payment_transactions
    SET status = 'refund_pending'
    WHERE id = v_payment.id AND status IN ('paid', 'released', 'refund_pending');

    v_refund_amount := COALESCE(p_refund_amount, v_order.amount);
    v_platform_fee := COALESCE(v_payment.platform_fee, round(v_order.amount * 0.08, 2));
    v_seller_retains := v_order.amount - v_refund_amount - v_platform_fee;

    INSERT INTO public.refund_audit (
      dispute_id, order_id, resolved_by, resolution,
      refund_amount, order_amount, platform_fee, seller_retains
    ) VALUES (
      p_dispute_id, v_order.id, auth.uid(), p_resolution,
      v_refund_amount, v_order.amount, v_platform_fee,
      GREATEST(v_seller_retains, 0)
    );
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.resolve_dispute(UUID, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_dispute(UUID, TEXT, NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_refunded_order_from_payment()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_order RECORD;
BEGIN
  IF NEW.status <> 'refunded' OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = NEW.order_id
  FOR UPDATE;

  -- Paid cancellations intentionally remain cancelled. Only a disputed order
  -- takes the canonical disputed -> refunded transition after settlement.
  IF FOUND AND v_order.status = 'disputed' THEN
    INSERT INTO public.order_events (order_id, actor_id, from_status, to_status, note)
    VALUES (
      NEW.order_id, NULL, 'disputed', 'refunded',
      'MoMo refund settled: ' || COALESCE(NEW.mo_mo_reference, NEW.id::text)
    );

    UPDATE public.orders
    SET status = 'refunded', updated_at = now()
    WHERE id = NEW.order_id;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sync_refunded_order_from_payment ON public.payment_transactions;
CREATE TRIGGER trg_sync_refunded_order_from_payment
AFTER UPDATE OF status ON public.payment_transactions
FOR EACH ROW
EXECUTE FUNCTION public.sync_refunded_order_from_payment();

-- ── 8. Order notifications use canonical statuses ───────────────────────────
-- Redefine the active trigger here as well as in add_order_notification.sql so
-- applying this migration alone cannot leave legacy status labels installed.
CREATE OR REPLACE FUNCTION public.notify_on_order_status_change()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $fn$
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
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF v_actor = NEW.seller_id THEN
    v_target_user := NEW.buyer_id;
  ELSIF v_actor = NEW.buyer_id THEN
    v_target_user := NEW.seller_id;
  ELSE
    RETURN NEW;
  END IF;

  IF v_target_user IS NULL THEN
    RETURN NEW;
  END IF;

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

  v_status_label := CASE NEW.status
    WHEN 'awaiting_payment' THEN 'Awaiting payment'
    WHEN 'paid' THEN 'Paid'
    WHEN 'collecting' THEN 'Collecting'
    WHEN 'out_for_delivery' THEN 'Out for delivery'
    WHEN 'delivered' THEN 'Delivered'
    WHEN 'confirmed' THEN 'Confirmed'
    WHEN 'cancelled' THEN 'Cancelled'
    WHEN 'disputed' THEN 'Disputed'
    WHEN 'refunded' THEN 'Refunded'
    ELSE NEW.status
  END;

  IF NEW.status = 'confirmed' AND v_target_user = NEW.buyer_id THEN
    v_review_nudge := true;
  END IF;

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
$fn$;

DROP TRIGGER IF EXISTS trg_order_status_notification ON public.orders;
CREATE TRIGGER trg_order_status_notification
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_order_status_change();

-- ── 9. Linked booking projection uses canonical statuses ────────────────────
CREATE OR REPLACE FUNCTION public.sync_service_booking_from_order()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.kind <> 'service' THEN
    RETURN NEW;
  END IF;

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
      booking_date = COALESCE(
        (NEW.scheduled_for AT TIME ZONE 'Africa/Accra')::date, booking_date
      ),
      booking_time = COALESCE(
        (NEW.scheduled_for AT TIME ZONE 'Africa/Accra')::time, booking_time
      ),
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
AFTER UPDATE OF status, amount, scheduled_for ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_service_booking_from_order();

-- Backfill the projection after the trigger-disabled legacy status rename.
-- protect_order_linked_booking() only permits this trusted synchronization path.
-- Keep the flag transaction-local so later client writes remain protected.
SELECT set_config('app.service_booking_sync', 'on', true);

UPDATE public.bookings b
SET status = CASE
      WHEN o.status = 'confirmed' THEN 'completed'
      WHEN o.status IN ('cancelled', 'refunded') THEN 'cancelled'
      WHEN o.status IN (
        'paid', 'collecting', 'out_for_delivery', 'delivered', 'disputed'
      ) THEN 'confirmed'
      WHEN o.status = 'awaiting_payment' THEN 'pending'
      ELSE b.status
    END,
    booking_date = COALESCE(
      (o.scheduled_for AT TIME ZONE 'Africa/Accra')::date, b.booking_date
    ),
    booking_time = COALESCE(
      (o.scheduled_for AT TIME ZONE 'Africa/Accra')::time, b.booking_time
    ),
    completed_at = CASE
      WHEN o.status = 'confirmed' THEN COALESCE(o.completed_at, now())
      ELSE NULL
    END,
    actual_amount = CASE WHEN o.status = 'confirmed' THEN o.amount ELSE NULL END
FROM public.orders o
WHERE b.order_id = o.id AND o.kind = 'service';

COMMIT;

-- ── 10. Static verification ────────────────────────────────────────────────
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'authenticated'
  AND table_schema = 'public'
  AND table_name IN ('orders', 'payment_transactions', 'order_events')
  AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
ORDER BY table_name, privilege_type;
-- Expected: zero rows.

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.orders'::regclass
  AND conname = 'orders_status_check';
