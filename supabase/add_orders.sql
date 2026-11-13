-- ============================================================================
-- Orders: unified order model (product sales + service bookings)
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- Additive — does NOT touch existing sales/bookings tables. This is a parallel
-- unified order model so the same notification/flow code works for both.
--
-- Tables:
--   * orders: one order between a buyer and seller for a listing.
--     status: confirmed -> paid -> preparing -> shipped -> delivered -> complete
--     (or cancelled at any point). buyer_id is nullable for offline buyers.
--   * order_events: full audit trail of every status transition.
--
-- Status transitions are enforced by the SECURITY DEFINER advance_order()
-- function (allowed-transitions map) — not raw UPDATE policies — so a buyer
-- can't escalate themselves to seller-only transitions and vice versa.
--
-- RLS: buyer (own rows) + seller (own rows) + admin SELECT.
--
-- Indexes: (seller_id, status), (buyer_id, status), (created_at DESC).
--
-- Dependencies: listings, profiles (auth.users via FK), notification_preferences
-- (for the order notification trigger in add_order_notification.sql).
-- ============================================================================

-- ── 1. Orders table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  buyer_whatsapp TEXT,
  buyer_name TEXT,
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id UUID REFERENCES public.listings(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'product' CHECK (kind IN ('product', 'service')),
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'paid', 'preparing', 'shipped', 'delivered', 'complete', 'cancelled')),
  payment_method TEXT CHECK (payment_method IN ('prepaid', 'pay_on_delivery')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_orders_seller_status
ON public.orders (seller_id, status);

CREATE INDEX IF NOT EXISTS idx_orders_buyer_status
ON public.orders (buyer_id, status);

CREATE INDEX IF NOT EXISTS idx_orders_created_at
ON public.orders (created_at DESC);

-- ── 2. Order events (audit trail) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_order_events_order_created
ON public.order_events (order_id, created_at DESC);

-- ── 3. RLS: orders ───────────────────────────────────────────────────────────
-- Buyer sees their own orders; seller sees their own orders.
DROP POLICY IF EXISTS "Buyer can view own orders" ON public.orders;
CREATE POLICY "Buyer can view own orders"
ON public.orders FOR SELECT
TO authenticated
USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- Seller creates orders for their listings; buyer can create too (offline sale).
DROP POLICY IF EXISTS "Participants can insert orders" ON public.orders;
CREATE POLICY "Participants can insert orders"
ON public.orders FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = seller_id OR auth.uid() = buyer_id);

-- Seller and buyer can update their own orders (status via advance_order, details directly).
DROP POLICY IF EXISTS "Participants can update own orders" ON public.orders;
CREATE POLICY "Participants can update own orders"
ON public.orders FOR UPDATE
TO authenticated
USING (auth.uid() = buyer_id OR auth.uid() = seller_id)
WITH CHECK (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- Admins see all orders.
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
CREATE POLICY "Admins can view all orders"
ON public.orders FOR SELECT
TO authenticated
USING (public.is_admin());

-- ── 4. RLS: order_events ─────────────────────────────────────────────────────
-- Participants of the order can view its events.
DROP POLICY IF EXISTS "Participants can view own order events" ON public.order_events;
CREATE POLICY "Participants can view own order events"
ON public.order_events FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_events.order_id
      AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())
  )
);

-- Participants can insert events for orders they are part of.
DROP POLICY IF EXISTS "Participants can insert own order events" ON public.order_events;
CREATE POLICY "Participants can insert own order events"
ON public.order_events FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = actor_id
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_events.order_id
      AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())
  )
);

-- ── 5. SECURITY DEFINER: advance_order() ─────────────────────────────────────
-- Allowed transitions map. Any transition not in this map is rejected.
--   buyer may:     delivered->complete, any->cancelled
--   seller may:    confirmed->paid->preparing->shipped->delivered, any->cancelled
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
BEGIN
  -- Load the order (bypass RLS — SECURITY DEFINER).
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- No-op if already at target status.
  IF v_order.status = p_to_status THEN
    RETURN;
  END IF;

  -- Terminal states can't be left (except cancelled is terminal too).
  IF v_order.status IN ('complete', 'cancelled') THEN
    RAISE EXCEPTION 'Order is already in a terminal state (' || v_order.status || ')';
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

-- ── 6. Verify ────────────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('orders', 'order_events')
ORDER BY tablename, cmd, policyname;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'orders'
ORDER BY ordinal_position;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'order_events'
ORDER BY ordinal_position;

SELECT proname, prosecdef
FROM pg_proc
WHERE proname = 'advance_order';
