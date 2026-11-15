-- ============================================================================
-- Marketplace payments: MoMo checkout + escrow holding
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- Tables:
--   * payment_transactions: one row per payment attempt. status: pending ->
--     paid -> released -> refunded. amount includes platform_fee.
--   * order_payments: links an order to its payment transaction(s).
--
-- RLS: buyer/seller/admin see their own rows. Service role (Edge Function)
--   manages webhook updates.
-- Dependencies: orders (add_orders.sql), profiles, listings.
-- ============================================================================

-- ── 1. Payment transactions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  platform_fee NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (platform_fee >= 0),
  mo_mo_reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'released', 'refunded', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ
);

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Parties can view own payment transactions" ON public.payment_transactions;
CREATE POLICY "Parties can view own payment transactions"
ON public.payment_transactions FOR SELECT
TO authenticated
USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

DROP POLICY IF EXISTS "Admins can view all payment transactions" ON public.payment_transactions;
CREATE POLICY "Admins can view all payment transactions"
ON public.payment_transactions FOR SELECT
TO authenticated
USING (public.is_admin());

-- ── 2. Order→payment link ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES public.payment_transactions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id)
);

ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Parties can view own order payments" ON public.order_payments;
CREATE POLICY "Parties can view own order payments"
ON public.order_payments FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_payments.order_id
      AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())
  )
);

-- ── 3. SECURITY DEFINER: record_payment() ──────────────────────────────────
-- Called by the MoMo webhook Edge Function. Marks the transaction paid and
-- advances the order to 'paid' (seller can then start fulfillment).
CREATE OR REPLACE FUNCTION public.record_payment(
  p_order_id UUID,
  p_mo_mo_reference TEXT,
  p_amount NUMERIC(10, 2)
)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_order RECORD;
  v_payment UUID;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- Upsert the payment transaction (idempotent by mo_mo_reference).
  INSERT INTO public.payment_transactions (
    order_id, buyer_id, seller_id, amount, platform_fee,
    mo_mo_reference, status, paid_at
  )
  VALUES (
    v_order.id,
    v_order.buyer_id,
    v_order.seller_id,
    p_amount,
    round(p_amount * 0.05, 2),   -- 5% platform fee
    p_mo_mo_reference,
    'paid',
    now()
  )
  ON CONFLICT (mo_mo_reference) DO UPDATE
  SET status = 'paid',
      paid_at = now()
  WHERE payment_transactions.status <> 'paid'
  RETURNING id INTO v_payment;

  -- Link order → payment (idempotent).
  INSERT INTO public.order_payments (order_id, payment_id)
  VALUES (p_order_id, v_payment)
  ON CONFLICT (order_id) DO NOTHING;

  -- Advance order to paid via the existing RPC (enforces transition rules).
  PERFORM public.advance_order(p_order_id, 'paid', 'MoMo payment received: ' || p_mo_mo_reference);
END;
$$;

-- ── 4. SECURITY DEFINER: release_escrow() ──────────────────────────────────
-- Called when buyer confirms delivery (order → complete). Marks payment
-- released and credits seller net of platform fee.
CREATE OR REPLACE FUNCTION public.release_escrow(
  p_order_id UUID
)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_payment RECORD;
  v_order RECORD;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status <> 'complete' THEN
    RAISE EXCEPTION 'Order is not complete; cannot release escrow';
  END IF;

  SELECT * INTO v_payment
  FROM public.payment_transactions
  WHERE order_id = p_order_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No payment found for order';
  END IF;

  IF v_payment.status <> 'paid' THEN
    RAISE EXCEPTION 'Payment is not paid; cannot release escrow';
  END IF;

  UPDATE public.payment_transactions
  SET status = 'released',
      released_at = now()
  WHERE id = v_payment.id;

  -- In a fuller implementation, credit seller_wallet here.
END;
$$;

-- ── 5. Verify ──────────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('payment_transactions', 'order_payments')
ORDER BY tablename, cmd;

SELECT proname, prosecdef
FROM pg_proc
WHERE proname IN ('record_payment', 'release_escrow');
