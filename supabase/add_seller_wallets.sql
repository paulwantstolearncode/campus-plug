-- ============================================================================
-- Seller wallet + payout ledger (item 1) and disbursement bookkeeping (item 2)
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- Problem: release_escrow() flipped payment_transactions.status to 'released'
-- but no money was ever recorded anywhere. There was no seller balance, no
-- payout record, and no way to prove a seller was paid. This migration makes
-- the ledger authoritative:
--
--   * seller_wallets   one row per seller: current balance + lifetime totals
--   * wallet_entries   append-only ledger. amount is SIGNED: + credit, - debit.
--                      balance_after snapshots the wallet at write time.
--   * disbursements    every real money movement OUT of the platform:
--                        seller_payout - seller withdrawal
--                        buyer_refund  - refund back to the buyer's MoMo
--                      Status: requested -> processing -> paid | failed | cancelled
--
-- Money only enters the ledger through escrow release (escrow_credit) and only
-- leaves it through complete_disbursement() (payout_debit / refund_debit).
-- Every write is SECURITY DEFINER; there are no INSERT/UPDATE policies, so a
-- browser can never write its own balance.
--
-- Idempotency (item 21): a unique index allows at most one escrow_credit per
-- order and at most one ledger row per disbursement. Re-running release twice
-- credits once.
--
-- RUN ORDER (this file supersedes the release functions):
--   add_marketplace_payments.sql
--   -> add_escrow_release_on_complete.sql
--   -> add_auto_release_timer.sql
--   -> add_seller_wallets.sql   (this file, last of the escrow group)
--   -> add_momo_payment_intents.sql
--
-- Dependencies: orders, order_events (add_orders.sql), payment_transactions
--   (add_marketplace_payments.sql), disputes (add_marketplace_disputes.sql),
--   auth.users, public.is_admin().
-- ============================================================================

-- ── 1. Wallet accounts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.seller_wallets (
  seller_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Live balance. May go negative if a refund is ordered after the seller has
  -- already withdrawn; available_to_withdraw clamps at 0, so a negative balance
  -- blocks new payouts instead of silently paying out money we don't hold.
  balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  lifetime_released NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (lifetime_released >= 0),
  lifetime_paid_out NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (lifetime_paid_out >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.seller_wallets ENABLE ROW LEVEL SECURITY;

-- ── 2. Disbursements (payouts + buyer refunds) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.disbursements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('seller_payout', 'buyer_refund')),
  -- The seller whose wallet is debited / who receives the payout.
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Present for buyer_refund so the buyer can see their own refund row.
  buyer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE RESTRICT,
  dispute_id UUID REFERENCES public.disputes(id) ON DELETE SET NULL,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  momo_phone TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'mtn'
    CHECK (provider IN ('mtn', 'vodafone', 'airteltigo')),
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'processing', 'paid', 'failed', 'cancelled')),
  provider_reference TEXT,
  failure_reason TEXT,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  processed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_disbursements_seller_created
ON public.disbursements (seller_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_disbursements_status
ON public.disbursements (status, created_at);

-- One live/paid refund per order. Prevents an admin double-click from paying
-- the buyer twice after a dispute is resolved.
CREATE UNIQUE INDEX IF NOT EXISTS idx_disbursements_one_refund_per_order
ON public.disbursements (order_id)
WHERE kind = 'buyer_refund' AND status IN ('requested', 'processing', 'paid');

ALTER TABLE public.disbursements ENABLE ROW LEVEL SECURITY;

-- ── 3. Ledger ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wallet_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE RESTRICT,
  disbursement_id UUID REFERENCES public.disbursements(id) ON DELETE RESTRICT,
  entry_type TEXT NOT NULL
    CHECK (entry_type IN ('escrow_credit', 'payout_debit', 'refund_debit', 'adjustment')),
  -- Signed: positive credits the wallet, negative debits it. Never zero.
  amount NUMERIC(12, 2) NOT NULL CHECK (amount <> 0),
  balance_after NUMERIC(12, 2) NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_entries_seller_created
ON public.wallet_entries (seller_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_entries_order
ON public.wallet_entries (order_id);

-- Idempotency anchors.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_entries_escrow_credit_once
ON public.wallet_entries (order_id)
WHERE entry_type = 'escrow_credit' AND order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_entries_one_per_disbursement
ON public.wallet_entries (disbursement_id)
WHERE disbursement_id IS NOT NULL;

ALTER TABLE public.wallet_entries ENABLE ROW LEVEL SECURITY;

-- ── 4. RLS: read-only for the owner, all for admins ─────────────────────────
-- No INSERT/UPDATE/DELETE policies on purpose: every write goes through the
-- SECURITY DEFINER functions below.

DROP POLICY IF EXISTS "Sellers can view own wallet" ON public.seller_wallets;
CREATE POLICY "Sellers can view own wallet"
ON public.seller_wallets FOR SELECT
TO authenticated
USING (auth.uid() = seller_id);

DROP POLICY IF EXISTS "Admins can view all wallets" ON public.seller_wallets;
CREATE POLICY "Admins can view all wallets"
ON public.seller_wallets FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "Sellers can view own wallet entries" ON public.wallet_entries;
CREATE POLICY "Sellers can view own wallet entries"
ON public.wallet_entries FOR SELECT
TO authenticated
USING (auth.uid() = seller_id);

DROP POLICY IF EXISTS "Admins can view all wallet entries" ON public.wallet_entries;
CREATE POLICY "Admins can view all wallet entries"
ON public.wallet_entries FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "Parties can view own disbursements" ON public.disbursements;
CREATE POLICY "Parties can view own disbursements"
ON public.disbursements FOR SELECT
TO authenticated
USING (auth.uid() = seller_id OR auth.uid() = buyer_id);

DROP POLICY IF EXISTS "Admins can view all disbursements" ON public.disbursements;
CREATE POLICY "Admins can view all disbursements"
ON public.disbursements FOR SELECT
TO authenticated
USING (public.is_admin());

-- ── 5. Ledger writer ────────────────────────────────────────────────────────
-- The only function that moves a wallet balance. Locks the wallet row and the
-- idempotency key so two concurrent releases can't double-credit.
CREATE OR REPLACE FUNCTION public.wallet_apply_entry(
  p_seller_id UUID,
  p_order_id UUID,
  p_disbursement_id UUID,
  p_entry_type TEXT,
  p_amount NUMERIC(12, 2),
  p_description TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS NUMERIC
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_balance NUMERIC(12, 2);
  v_exists UUID;
BEGIN
  IF p_amount IS NULL OR p_amount = 0 THEN
    RAISE EXCEPTION 'Wallet entry amount cannot be zero';
  END IF;

  IF p_entry_type NOT IN ('escrow_credit', 'payout_debit', 'refund_debit', 'adjustment') THEN
    RAISE EXCEPTION 'Invalid wallet entry type: %', p_entry_type;
  END IF;

  -- Serialize on the idempotency key first.
  IF p_order_id IS NOT NULL AND p_entry_type = 'escrow_credit' THEN
    PERFORM pg_advisory_xact_lock(hashtext('wallet:order:' || p_order_id::text));
    SELECT id INTO v_exists
    FROM public.wallet_entries
    WHERE order_id = p_order_id AND entry_type = 'escrow_credit';
    IF v_exists IS NOT NULL THEN
      SELECT balance INTO v_balance FROM public.seller_wallets WHERE seller_id = p_seller_id;
      RETURN COALESCE(v_balance, 0);
    END IF;
  END IF;

  IF p_disbursement_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('wallet:disbursement:' || p_disbursement_id::text));
    SELECT id INTO v_exists
    FROM public.wallet_entries
    WHERE disbursement_id = p_disbursement_id;
    IF v_exists IS NOT NULL THEN
      SELECT balance INTO v_balance FROM public.seller_wallets WHERE seller_id = p_seller_id;
      RETURN COALESCE(v_balance, 0);
    END IF;
  END IF;

  INSERT INTO public.seller_wallets (seller_id)
  VALUES (p_seller_id)
  ON CONFLICT (seller_id) DO NOTHING;

  SELECT balance INTO v_balance
  FROM public.seller_wallets
  WHERE seller_id = p_seller_id
  FOR UPDATE;

  v_balance := v_balance + p_amount;

  UPDATE public.seller_wallets
  SET balance = v_balance,
      lifetime_released = lifetime_released
        + CASE WHEN p_entry_type = 'escrow_credit' THEN p_amount ELSE 0 END,
      lifetime_paid_out = lifetime_paid_out
        + CASE WHEN p_entry_type = 'payout_debit' THEN -p_amount ELSE 0 END,
      updated_at = now()
  WHERE seller_id = p_seller_id;

  INSERT INTO public.wallet_entries (
    seller_id, order_id, disbursement_id, entry_type,
    amount, balance_after, description, created_by
  ) VALUES (
    p_seller_id, p_order_id, p_disbursement_id, p_entry_type,
    p_amount, v_balance, p_description, p_created_by
  );

  RETURN v_balance;
END;
$fn$;

-- ── 6. Available balance ────────────────────────────────────────────────────
-- Balance minus money already requested/being processed for payout.
CREATE OR REPLACE FUNCTION public.wallet_available(p_seller_id UUID)
RETURNS NUMERIC
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_balance NUMERIC(12, 2);
  v_pending NUMERIC(12, 2);
BEGIN
  IF auth.uid() IS DISTINCT FROM p_seller_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT COALESCE(balance, 0) INTO v_balance
  FROM public.seller_wallets
  WHERE seller_id = p_seller_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_pending
  FROM public.disbursements
  WHERE seller_id = p_seller_id
    AND kind = 'seller_payout'
    AND status IN ('requested', 'processing');

  RETURN GREATEST(COALESCE(v_balance, 0) - v_pending, 0);
END;
$fn$;

-- ── 7. Seller: request a payout ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.request_payout(
  p_amount NUMERIC(10, 2),
  p_momo_phone TEXT,
  p_provider TEXT DEFAULT 'mtn'
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_seller UUID := auth.uid();
  v_available NUMERIC(12, 2);
  v_id UUID;
BEGIN
  IF v_seller IS NULL THEN
    RAISE EXCEPTION 'Sign in to request a payout';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payout amount must be greater than 0';
  END IF;

  IF p_momo_phone IS NULL OR length(trim(p_momo_phone)) < 9 THEN
    RAISE EXCEPTION 'A valid MoMo phone number is required';
  END IF;

  IF p_provider NOT IN ('mtn', 'vodafone', 'airteltigo') THEN
    RAISE EXCEPTION 'Unsupported MoMo provider: %', p_provider;
  END IF;

  -- Serialize payouts for this seller so two taps can't both pass the check.
  PERFORM pg_advisory_xact_lock(hashtext('payout:' || v_seller::text));

  SELECT public.wallet_available(v_seller) INTO v_available;

  IF p_amount > v_available THEN
    RAISE EXCEPTION 'Payout amount (%) exceeds available balance (%)', p_amount, v_available;
  END IF;

  INSERT INTO public.disbursements (
    kind, seller_id, amount, momo_phone, provider, status, requested_by
  ) VALUES (
    'seller_payout', v_seller, p_amount, trim(p_momo_phone), p_provider, 'requested', v_seller
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

-- Seller can cancel a payout that has not started processing yet.
CREATE OR REPLACE FUNCTION public.cancel_payout(p_disbursement_id UUID)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_row RECORD;
BEGIN
  SELECT * INTO v_row
  FROM public.disbursements
  WHERE id = p_disbursement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout not found';
  END IF;

  IF v_row.kind <> 'seller_payout' THEN
    RAISE EXCEPTION 'Only payouts can be cancelled';
  END IF;

  IF v_row.seller_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not your payout';
  END IF;

  IF v_row.status <> 'requested' THEN
    RAISE EXCEPTION 'Payout is already %', v_row.status;
  END IF;

  UPDATE public.disbursements
  SET status = 'cancelled',
      processed_at = now()
  WHERE id = p_disbursement_id;
END;
$fn$;

-- ── 8. Refund queueing (admin) ──────────────────────────────────────────────
-- resolve_dispute() decides the refund; this queues the actual MoMo transfer.
CREATE OR REPLACE FUNCTION public.queue_refund_disbursement(
  p_dispute_id UUID,
  p_momo_phone TEXT,
  p_provider TEXT DEFAULT 'mtn'
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_dispute RECORD;
  v_order RECORD;
  v_audit RECORD;
  v_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can queue refunds';
  END IF;

  IF p_momo_phone IS NULL OR length(trim(p_momo_phone)) < 9 THEN
    RAISE EXCEPTION 'A valid buyer MoMo phone number is required';
  END IF;

  IF p_provider NOT IN ('mtn', 'vodafone', 'airteltigo') THEN
    RAISE EXCEPTION 'Unsupported MoMo provider: %', p_provider;
  END IF;

  SELECT * INTO v_dispute FROM public.disputes WHERE id = p_dispute_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dispute not found';
  END IF;

  IF v_dispute.resolution NOT IN ('refund_full', 'refund_partial') THEN
    RAISE EXCEPTION 'Dispute resolution is %, not a refund', COALESCE(v_dispute.resolution, 'none');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_dispute.order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  SELECT * INTO v_audit
  FROM public.refund_audit
  WHERE dispute_id = p_dispute_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No refund audit row for this dispute';
  END IF;

  INSERT INTO public.disbursements (
    kind, seller_id, buyer_id, order_id, dispute_id,
    amount, momo_phone, provider, status, requested_by
  ) VALUES (
    'buyer_refund', v_order.seller_id, v_order.buyer_id, v_order.id, p_dispute_id,
    v_audit.refund_amount, trim(p_momo_phone), p_provider, 'requested', auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

-- ── 9. Disbursement lifecycle (server / admin) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_disbursement_processing(p_disbursement_id UUID)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $fn$
BEGIN
  UPDATE public.disbursements
  SET status = 'processing'
  WHERE id = p_disbursement_id
    AND status = 'requested';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Disbursement is not awaiting processing';
  END IF;
END;
$fn$;

-- Marks a disbursement paid and writes the matching ledger debit.
-- p_actor is the admin who triggered it (NULL when a webhook/cron did).
CREATE OR REPLACE FUNCTION public.complete_disbursement(
  p_disbursement_id UUID,
  p_provider_reference TEXT,
  p_actor UUID DEFAULT NULL
)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_row RECORD;
  v_released NUMERIC(12, 2);
BEGIN
  SELECT * INTO v_row
  FROM public.disbursements
  WHERE id = p_disbursement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Disbursement not found';
  END IF;

  -- Idempotent: a provider retry or double call is a no-op.
  IF v_row.status = 'paid' THEN
    RETURN;
  END IF;

  IF v_row.status NOT IN ('requested', 'processing') THEN
    RAISE EXCEPTION 'Disbursement is %', v_row.status;
  END IF;

  UPDATE public.disbursements
  SET status = 'paid',
      provider_reference = COALESCE(p_provider_reference, provider_reference),
      failure_reason = NULL,
      processed_by = p_actor,
      processed_at = now()
  WHERE id = p_disbursement_id;

  IF v_row.kind = 'seller_payout' THEN
    PERFORM public.wallet_apply_entry(
      v_row.seller_id,
      NULL,
      v_row.id,
      'payout_debit',
      -v_row.amount,
      'Payout to ' || v_row.momo_phone,
      p_actor
    );
  ELSE
    -- Refund: only claw back from the seller wallet if the escrow had already
    -- been released to them. If the money was still held, it never entered the
    -- wallet, so the refund comes straight out of escrow.
    SELECT COALESCE(SUM(amount), 0) INTO v_released
    FROM public.wallet_entries
    WHERE order_id = v_row.order_id
      AND entry_type = 'escrow_credit';

    IF v_released > 0 THEN
      PERFORM public.wallet_apply_entry(
        v_row.seller_id,
        v_row.order_id,
        v_row.id,
        'refund_debit',
        -LEAST(v_row.amount, v_released),
        'Refund to buyer for order ' || v_row.order_id,
        p_actor
      );
    END IF;

    UPDATE public.payment_transactions
    SET status = 'refunded'
    WHERE order_id = v_row.order_id
      AND status = 'refund_pending';
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.fail_disbursement(
  p_disbursement_id UUID,
  p_reason TEXT,
  p_actor UUID DEFAULT NULL
)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $fn$
BEGIN
  UPDATE public.disbursements
  SET status = 'failed',
      failure_reason = COALESCE(p_reason, 'Provider rejected the transfer'),
      processed_by = p_actor,
      processed_at = now()
  WHERE id = p_disbursement_id
    AND status IN ('requested', 'processing');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Disbursement is not awaiting processing';
  END IF;
END;
$fn$;

-- ── 10. Escrow release now writes the ledger ────────────────────────────────
CREATE OR REPLACE FUNCTION public.release_escrow_on_complete()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_payment RECORD;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_payment
  FROM public.payment_transactions
  WHERE order_id = NEW.id
    AND status = 'paid'
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  UPDATE public.payment_transactions
  SET status = 'released',
      released_at = now()
  WHERE id = v_payment.id;

  -- Credit the seller their net of the 8% platform commission. Idempotent per order.
  PERFORM public.wallet_apply_entry(
    v_payment.seller_id,
    NEW.id,
    NULL,
    'escrow_credit',
    v_payment.amount - v_payment.platform_fee,
    'Escrow released for order ' || NEW.id,
    NULL
  );

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_release_escrow_on_complete ON public.orders;
CREATE TRIGGER trg_release_escrow_on_complete
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.release_escrow_on_complete();

-- Keep the manual RPC in step with the trigger (it does the same ledger write).
CREATE OR REPLACE FUNCTION public.release_escrow(p_order_id UUID)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_order RECORD;
  v_payment RECORD;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Order is not confirmed; cannot release escrow';
  END IF;

  SELECT * INTO v_payment
  FROM public.payment_transactions
  WHERE order_id = p_order_id
    AND status = 'paid'
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    -- Already released is not an error; the ledger is the source of truth.
    RETURN;
  END IF;

  UPDATE public.payment_transactions
  SET status = 'released',
      released_at = now()
  WHERE id = v_payment.id;

  PERFORM public.wallet_apply_entry(
    v_payment.seller_id,
    p_order_id,
    NULL,
    'escrow_credit',
    v_payment.amount - v_payment.platform_fee,
    'Escrow released for order ' || p_order_id,
    auth.uid()
  );
END;
$fn$;

-- ── 11. Grants ──────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.wallet_apply_entry(UUID, UUID, UUID, TEXT, NUMERIC, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wallet_apply_entry(UUID, UUID, UUID, TEXT, NUMERIC, TEXT, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_apply_entry(UUID, UUID, UUID, TEXT, NUMERIC, TEXT, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.wallet_available(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wallet_available(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.request_payout(NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_payout(NUMERIC, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.cancel_payout(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_payout(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.queue_refund_disbursement(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_refund_disbursement(UUID, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.mark_disbursement_processing(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_disbursement(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_disbursement(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_disbursement_processing(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_disbursement(UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_disbursement(UUID, TEXT, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.release_escrow(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_escrow(UUID) TO service_role;

-- ── 12. Verify ──────────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('seller_wallets', 'wallet_entries', 'disbursements')
ORDER BY tablename, policyname;

SELECT tgname, tgrelid::regclass AS on_table
FROM pg_trigger
WHERE tgrelid = 'public.orders'::regclass
  AND NOT tgisinternal
  AND tgname = 'trg_release_escrow_on_complete';
