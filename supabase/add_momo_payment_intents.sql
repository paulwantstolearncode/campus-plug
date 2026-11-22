-- ============================================================================
-- MoMo payment intents + refund settlement state
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- Why: the checkout used to call momoCheckout() from the browser. Non-public
-- env vars are undefined in client bundles, so that path could only ever run
-- the simulated dev flow - a production charge was impossible. Payments are now
-- initiated server-side (app/api/momo/initiate) which writes a PENDING row here
-- before the STK prompt is sent, so the status endpoint (item 5) has a
-- reference to verify with the provider.
--
-- Also: refunds used to flip payment_transactions straight to 'refunded' the
-- moment an admin resolved a dispute, even though no money had moved. The new
-- state machine is:
--
--   paid -> refund_pending  (resolve_dispute decides a refund)
--   refund_pending -> refunded  (complete_disbursement confirms the MoMo
--                                transfer actually succeeded)
--
-- This file mirrors the canonical resolve_dispute() definition and supersedes
-- add_refund_audit_to_resolve_dispute.sql. lockdown_order_payment_state.sql is
-- the final authority and adds the post-settlement order projection.
--
-- RUN ORDER: add_refund_audit.sql -> add_partial_refund_amount.sql ->
--   add_refund_audit_to_resolve_dispute.sql -> add_seller_wallets.sql ->
--   add_momo_payment_intents.sql (this file) ->
--   lockdown_order_payment_state.sql.
-- ============================================================================

-- ── 1. Extra payment metadata ───────────────────────────────────────────────
-- Payer phone + provider are needed to send a refund back to the same wallet.
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS payer_phone TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT;

-- ── 2. Allow a pending -> refund_pending -> refunded lifecycle ──────────────
ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_status_check;

ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_status_check
  CHECK (status IN ('pending', 'paid', 'released', 'refund_pending', 'refunded', 'failed'));

CREATE INDEX IF NOT EXISTS idx_payment_transactions_order_created
ON public.payment_transactions (order_id, created_at DESC);

-- ── 3. resolve_dispute(): refunds await settlement ─────────────────────────
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

  -- Only a legacy delivered/open-dispute pair can still release to the seller.
  -- A canonical disputed order has no disputed -> confirmed escape hatch.
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
    IF v_order.status = 'delivered' THEN
      INSERT INTO public.order_events (order_id, actor_id, from_status, to_status, note)
      VALUES (v_order.id, auth.uid(), 'delivered', 'disputed', v_note);

      UPDATE public.orders
      SET status = 'disputed', updated_at = now()
      WHERE id = v_order.id;
    END IF;

    -- Money has NOT moved yet. complete_disbursement() marks this row refunded
    -- only after the provider confirms the transfer; the final lockdown trigger
    -- then performs disputed -> refunded. Cancelled orders remain cancelled.
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

-- ── 4. Verify ──────────────────────────────────────────────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'payment_transactions'
  AND column_name IN ('payer_phone', 'provider', 'status')
ORDER BY column_name;

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.payment_transactions'::regclass
  AND conname = 'payment_transactions_status_check';
