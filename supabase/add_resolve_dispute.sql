-- ============================================================================
-- Dispute resolution RPC
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- WHY: the admin UI used to update the dispute row and then call
-- advance_order(). advance_order() only accepts the buyer or the seller as the
-- actor, so an admin resolution always failed and the order stayed stuck in
-- 'delivered'. This function does the whole resolution in one SECURITY DEFINER
-- transaction: dispute row, order status, payment status and the audit event.
--
--   refund_full / refund_partial -> payment 'refunded', order 'cancelled'
--   release_to_seller            -> order 'complete' (escrow trigger releases)
--   no_action                    -> dispute closed, order untouched
--
-- Dependencies: disputes, dispute_messages (add_marketplace_disputes.sql),
--   orders + order_events (add_orders.sql), payment_transactions
--   (add_marketplace_payments.sql), is_admin() (profiles_rls_policies.sql).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.resolve_dispute(
  p_dispute_id UUID,
  p_resolution TEXT
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

  UPDATE public.disputes
  SET status = 'resolved',
      resolution = p_resolution,
      resolved_by = auth.uid(),
      resolved_at = now()
  WHERE id = p_dispute_id;

  v_note := 'Dispute resolved: ' || p_resolution;

  IF p_resolution = 'release_to_seller' THEN
    IF v_order.status NOT IN ('complete', 'cancelled') THEN
      INSERT INTO public.order_events (order_id, actor_id, from_status, to_status, note)
      VALUES (v_order.id, auth.uid(), v_order.status, 'complete', v_note);

      -- The escrow trigger (add_escrow_release_on_complete.sql) marks the
      -- payment 'released' as a side effect of this update.
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

REVOKE ALL ON FUNCTION public.resolve_dispute(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_dispute(UUID, TEXT) TO authenticated;

-- ── Verify ──────────────────────────────────────────────────────────────────
SELECT proname, prosecdef
FROM pg_proc
WHERE proname = 'resolve_dispute';
