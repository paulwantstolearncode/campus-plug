-- ============================================================================
-- Refund audit: record refunds in resolve_dispute()
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- Updates resolve_dispute() to insert a refund_audit row whenever a refund
-- (full or partial) is issued, capturing who approved, the amount, and the
-- split between buyer and seller.
--
-- Dependencies: refund_audit (add_refund_audit.sql), resolve_dispute()
--   (add_resolve_dispute.sql + add_partial_refund_amount.sql).
--
-- RUN ORDER: add_resolve_dispute.sql -> add_partial_refund_amount.sql -> this
-- file. This is the authoritative resolve_dispute() definition.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.resolve_dispute(
  p_dispute_id UUID,
  p_resolution TEXT,
  p_refund_amount NUMERIC(10, 2) DEFAULT NULL
)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_dispute RECORD;
  v_order RECORD;
  v_payment RECORD;
  v_note TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can resolve disputes';
  END IF;

  IF p_resolution NOT IN ('refund_full', 'refund_partial', 'release_to_seller', 'no_action') THEN
    RAISE EXCEPTION 'Invalid resolution: %', p_resolution;
  END IF;

  SELECT * INTO v_dispute
  FROM public.disputes
  WHERE id = p_dispute_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dispute not found';
  END IF;

  IF v_dispute.status <> 'open' THEN
    RAISE EXCEPTION 'Dispute is already %', v_dispute.status;
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_dispute.order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- Get the payment transaction for fee/split info.
  SELECT * INTO v_payment
  FROM public.payment_transactions
  WHERE order_id = v_order.id
    AND status IN ('paid', 'released')
  ORDER BY created_at DESC
  LIMIT 1;

  -- Validate refund amount for partial refunds.
  IF p_resolution = 'refund_partial' THEN
    IF p_refund_amount IS NULL THEN
      RAISE EXCEPTION 'refund_partial requires a refund amount';
    END IF;
    IF p_refund_amount <= 0 THEN
      RAISE EXCEPTION 'Refund amount must be greater than 0';
    END IF;
    IF p_refund_amount > v_order.amount THEN
      RAISE EXCEPTION 'Refund amount % cannot exceed order amount %', p_refund_amount, v_order.amount;
    END IF;
  END IF;

  UPDATE public.disputes
  SET status = 'resolved',
      resolution = p_resolution,
      refund_amount = p_refund_amount,
      resolved_by = auth.uid(),
      resolved_at = now()
  WHERE id = p_dispute_id;

  v_note := 'Dispute resolved: ' || p_resolution ||
    CASE WHEN p_refund_amount IS NOT NULL THEN ' (refund ' || p_refund_amount || ')' ELSE '' END;

  IF p_resolution = 'release_to_seller' THEN
    IF v_order.status NOT IN ('complete', 'cancelled') THEN
      INSERT INTO public.order_events (order_id, actor_id, from_status, to_status, note)
      VALUES (v_order.id, auth.uid(), v_order.status, 'complete', v_note);

      UPDATE public.orders
      SET status = 'complete',
          updated_at = now(),
          completed_at = now()
      WHERE id = v_order.id;
    END IF;
  ELSIF p_resolution IN ('refund_full', 'refund_partial') THEN
    UPDATE public.payment_transactions
    SET status = 'refunded'
    WHERE order_id = v_order.id
      AND status IN ('paid', 'released');

    IF v_order.status NOT IN ('complete', 'cancelled') THEN
      INSERT INTO public.order_events (order_id, actor_id, from_status, to_status, note)
      VALUES (v_order.id, auth.uid(), v_order.status, 'cancelled', v_note);

      UPDATE public.orders
      SET status = 'cancelled',
          updated_at = now()
      WHERE id = v_order.id;
    END IF;

    -- ── Refund audit trail ──
    DECLARE
      v_refund_amount NUMERIC(10, 2) := COALESCE(p_refund_amount, v_order.amount);
      v_platform_fee NUMERIC(10, 2) := COALESCE(v_payment.platform_fee, round(v_order.amount * 0.08, 2));
      v_seller_retains NUMERIC(10, 2) := v_order.amount - v_refund_amount - v_platform_fee;
    BEGIN
      INSERT INTO public.refund_audit (
        dispute_id, order_id, resolved_by, resolution,
        refund_amount, order_amount, platform_fee, seller_retains
      ) VALUES (
        p_dispute_id, v_order.id, auth.uid(), p_resolution,
        v_refund_amount, v_order.amount, v_platform_fee, GREATEST(v_seller_retains, 0)
      );
    END;
  END IF;
  -- no_action: the dispute is closed with the order and money left as they are.
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_dispute(UUID, TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_dispute(UUID, TEXT, NUMERIC) TO authenticated;

-- ── Verify ──
SELECT count(*) AS refund_audit_rows
FROM public.refund_audit;