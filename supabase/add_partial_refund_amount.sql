-- ============================================================================
-- Partial refund amounts: allow admins to specify how much to refund
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- Problem: resolve_dispute() accepts 'refund_partial' but has no amount
-- parameter. The admin can't say "refund 60%". This migration:
--   1. Adds a refund_amount column to disputes (NULL unless resolution is
--      refund_partial).
--   2. Adds p_refund_amount parameter to resolve_dispute().
--   3. Validates the amount: must be > 0 and <= order amount for partial
--      refunds; ignored for other resolutions.
--
-- Dependencies: disputes (add_marketplace_disputes.sql), orders (add_orders.sql).
--
-- RUN ORDER: this file is superseded by add_refund_audit_to_resolve_dispute.sql,
-- which redefines resolve_dispute() with the same refund-amount handling PLUS
-- the refund_audit insert. Run this file first, then that one. Re-running this
-- file afterwards would silently drop the audit write.
-- ============================================================================

-- ── 1. Add refund_amount column ──
ALTER TABLE public.disputes
ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10, 2);

-- ── 2. Update resolve_dispute() to accept an optional refund amount ──
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
  END IF;
  -- no_action: the dispute is closed with the order and money left as they are.
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_dispute(UUID, TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_dispute(UUID, TEXT, NUMERIC) TO authenticated;

-- ── 3. Verify ──
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'disputes'
ORDER BY ordinal_position;

SELECT proname, prosecdef
FROM pg_proc
WHERE proname = 'resolve_dispute';