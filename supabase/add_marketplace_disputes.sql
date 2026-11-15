-- ============================================================================
-- Marketplace disputes: buyer/seller conflict resolution
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- Tables:
--   * disputes: one dispute per order. status: open -> resolved -> closed.
--     resolution: refund_full, refund_partial, release_to_seller, no_action.
--   * dispute_messages: chat-like messages within a dispute (admin + parties).
--
-- RLS: parties (buyer/seller) + admin see their own disputes.
//   Only admin can change status/resolution.
//
// Dependencies: orders (add_orders.sql), profiles.
// ============================================================================

-- ── 1. Disputes table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  opened_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 5 AND 500),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'closed')),
  resolution TEXT
    CHECK (resolution IN ('refund_full', 'refund_partial', 'release_to_seller', 'no_action')),
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id)
);

ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Parties and admin can view disputes" ON public.disputes;
CREATE POLICY "Parties and admin can view disputes"
ON public.disputes FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = disputes.order_id
      AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Order party can open dispute" ON public.disputes;
CREATE POLICY "Order party can open dispute"
ON public.disputes FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = opened_by
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = disputes.order_id
      AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Admin can update dispute" ON public.disputes;
CREATE POLICY "Admin can update dispute"
ON public.disputes FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ── 2. Dispute messages ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dispute_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dispute_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dispute participants can view messages" ON public.dispute_messages;
CREATE POLICY "Dispute participants can view messages"
ON public.dispute_messages FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.disputes d
    JOIN public.orders o ON o.id = d.order_id
    WHERE d.id = dispute_messages.dispute_id
      AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Dispute participants can insert messages" ON public.dispute_messages;
CREATE POLICY "Dispute participants can insert messages"
ON public.dispute_messages FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.disputes d
      JOIN public.orders o ON o.id = d.order_id
      WHERE d.id = dispute_messages.dispute_id
        AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())
    )
  )
);

-- ── 3. Verify ──────────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('disputes', 'dispute_messages')
ORDER BY tablename, cmd;
