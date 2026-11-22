-- ============================================================================
-- Admin refund audit trail: who approved what refund, when, and how much
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- Problem: resolve_dispute() writes a single order_events row with a note.
-- There's no record of which admin approved the refund, the exact amount moved,
-- or the split between buyer and seller. This is insufficient for financial
-- accountability.
--
-- This migration adds a refund_audit table that records every refund resolution
-- (full or partial) with the admin user, amount, order, and timestamp.
--
-- Dependencies: disputes (add_marketplace_disputes.sql), orders (add_orders.sql),
--   payment_transactions (add_marketplace_payments.sql), profiles.
-- ============================================================================

-- ── 1. Refund audit table ──
CREATE TABLE IF NOT EXISTS public.refund_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  resolved_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution TEXT NOT NULL CHECK (resolution IN ('refund_full', 'refund_partial')),
  refund_amount NUMERIC(10, 2) NOT NULL CHECK (refund_amount >= 0),
  order_amount NUMERIC(10, 2) NOT NULL CHECK (order_amount >= 0),
  platform_fee NUMERIC(10, 2) NOT NULL CHECK (platform_fee >= 0),
  seller_retains NUMERIC(10, 2) NOT NULL CHECK (seller_retains >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.refund_audit ENABLE ROW LEVEL SECURITY;

-- Admins see all refund audit records.
DROP POLICY IF EXISTS "Admins can view refund audit" ON public.refund_audit;
CREATE POLICY "Admins can view refund audit"
ON public.refund_audit FOR SELECT
TO authenticated
USING (public.is_admin());

-- Parties to the order can view audit records for their own orders.
DROP POLICY IF EXISTS "Order parties can view own refund audit" ON public.refund_audit;
CREATE POLICY "Order parties can view own refund audit"
ON public.refund_audit FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = refund_audit.order_id
      AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())
  )
);

-- Only admins can insert refund audit records (via resolve_dispute).
DROP POLICY IF EXISTS "Admins can insert refund audit" ON public.refund_audit;
CREATE POLICY "Admins can insert refund audit"
ON public.refund_audit FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

-- ── 2. Index for lookups ──
CREATE INDEX IF NOT EXISTS idx_refund_audit_order_id ON public.refund_audit(order_id);
CREATE INDEX IF NOT EXISTS idx_refund_audit_dispute_id ON public.refund_audit(dispute_id);
CREATE INDEX IF NOT EXISTS idx_refund_audit_created_at ON public.refund_audit(created_at DESC);

-- ── 3. Verify ──
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'refund_audit'
ORDER BY ordinal_position;