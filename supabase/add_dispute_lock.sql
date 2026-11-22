-- ============================================================================
-- Dispute lock on orders: freeze status transitions while a dispute is open
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- Problem: an order can advance past 'delivered' (to 'complete') while a
-- dispute is open, releasing escrow to the seller before the dispute is
-- resolved. This migration adds a guard in advance_order() that rejects any
-- status transition when a dispute with status = 'open' exists for the order.
--
-- Also adds a helper function has_open_dispute(order_id) for client-side
-- checks and UI indicators.
--
-- Dependencies: orders (add_orders.sql), disputes (add_marketplace_disputes.sql).
-- ============================================================================

-- ── 1. Guard advance_order(): reject transitions when an open dispute exists ──
CREATE OR REPLACE FUNCTION public.advance_order(
  p_order_id UUID,
  p_to_status TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_order RECORD;
  v_actor UUID := auth.uid();
  v_allowed BOOLEAN := false;
  v_open_dispute BOOLEAN := false;
BEGIN
  -- Load the order (bypass RLS — SECURITY DEFINER).
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- Dispute lock: no status transitions while a dispute is open.
  -- (An admin resolving the dispute is the only path forward.)
  SELECT EXISTS (
    SELECT 1 FROM public.disputes d
    WHERE d.order_id = p_order_id
      AND d.status = 'open'
  ) INTO v_open_dispute;

  IF v_open_dispute THEN
    RAISE EXCEPTION 'Order % has an open dispute. Resolve the dispute before changing order status.', p_order_id;
  END IF;

  -- No-op if already at target status.
  IF v_order.status = p_to_status THEN
    RETURN;
  END IF;

  -- Terminal states can't be left (except cancelled is terminal too).
  IF v_order.status IN ('complete', 'cancelled') THEN
    RAISE EXCEPTION 'Order is already in a terminal state (%)', v_order.status;
  END IF;

  -- Allowed transitions: seller-driven progress.
  IF v_actor = v_order.seller_id THEN
    IF v_order.status = 'confirmed' AND p_to_status = 'paid' THEN v_allowed := true;
    ELSIF v_order.status = 'paid' AND p_to_status = 'preparing' THEN v_allowed := true;
    ELSIF v_order.status = 'preparing' AND p_to_status = 'shipped' THEN v_allowed := true;
    ELSIF v_order.status = 'shipped' AND p_to_status = 'delivered' THEN v_allowed := true;
    ELSIF p_to_status = 'cancelled' THEN v_allowed := true;
    END IF;
  -- Buyer-driven: confirm delivery / complete, or cancel.
  ELSIF v_actor = v_order.buyer_id THEN
    IF v_order.status = 'delivered' AND p_to_status = 'complete' THEN v_allowed := true;
    ELSIF p_to_status = 'cancelled' THEN v_allowed := true;
    END IF;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Status transition % -> % not allowed for this role', v_order.status, p_to_status;
  END IF;

  -- Write the event + update the order in one transaction.
  INSERT INTO public.order_events (order_id, actor_id, from_status, to_status, note)
  VALUES (p_order_id, v_actor, v_order.status, p_to_status, p_note);

  UPDATE public.orders
  SET status = p_to_status,
      updated_at = now(),
      completed_at = CASE WHEN p_to_status = 'complete' THEN now() ELSE completed_at END
  WHERE id = p_order_id;
END;
$$;

-- ── 2. Helper: has_open_dispute(order_id) → boolean ──
CREATE OR REPLACE FUNCTION public.has_open_dispute(p_order_id UUID)
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.disputes
  WHERE order_id = p_order_id
    AND status = 'open';

  RETURN v_count > 0;
END;
$$;

-- ── 3. Verify ──
SELECT proname, prosecdef
FROM pg_proc
WHERE proname = 'advance_order';

SELECT proname, prosecdef
FROM pg_proc
WHERE proname = 'has_open_dispute';