-- ============================================================================
-- Review order anchor: tie reviews to orders (not just bookings/sales)
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- Adds order_id to public.reviews so a buyer can only review a seller after
-- completing an order (status = 'complete'). The existing verify_review_buyer
-- function accepts booking_id or sale_id anchors; this extends it to order_id.
-- Dependencies: reviews (add_reviews_system.sql), orders (add_orders.sql).
-- ============================================================================

-- ── 1. Add order_id column ─────────────────────────────────────────────────
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;

-- ── 2. Index ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_reviews_order_id
ON public.reviews (order_id);

-- ── 3. Verify ──────────────────────────────────────────────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'reviews'
  AND column_name = 'order_id';
