-- ============================================================================
-- Sales Tracking System
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- Two tracks:
--   1. Service bookings: enhance the existing `bookings` table with a status
--      flow (pending -> completed / cancelled) + actual amount received.
--   2. Product sales: new `sales` + `sale_items` tables so sellers can record
--      product transactions (line items snapshot name/price at sale time).
--
-- Visibility (Decision 1): financial data is visible ONLY to the owning seller
-- (their dashboard) and to admins. There is NO anon policy on sales/sale_items.
--
-- Edit window (Decision 3): sellers may edit amounts/items/notes within 24
-- hours of created_at -- enforced in app code (lib/sales.ts), not RLS, so
-- status changes (refund/cancel) stay available forever.
--
-- Commission preview (Decision 4): computed client-side in the admin panel
-- only; never shown to sellers.
--
-- Recursion safety: every policy is a plain column predicate or an EXISTS
-- subquery whose target table's policies don't query back; admin checks go
-- through the security-definer public.is_admin() function. No cycles.
--
-- NOTE: bookings RLS must already be enabled (it is -- the app inserts
-- bookings and seller_dashboard_rls.sql adds SELECT policies). This file only
-- ADDS two bookings policies (seller UPDATE + admin SELECT); nothing existing
-- is changed.
-- ============================================================================

-- Rollback (commented, in case things go wrong)
-- DROP TABLE IF EXISTS sale_items;
-- DROP TABLE IF EXISTS sales;
-- ALTER TABLE bookings DROP COLUMN IF EXISTS status;
-- ALTER TABLE bookings DROP COLUMN IF EXISTS completed_at;
-- ALTER TABLE bookings DROP COLUMN IF EXISTS actual_amount;
-- ALTER TABLE bookings DROP COLUMN IF EXISTS seller_notes;

-- ── 1. Enhance bookings table for status tracking ────────────────────────────
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'
  CHECK (status IN ('pending', 'completed', 'cancelled')),
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS actual_amount NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS seller_notes TEXT;

CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings(status);
CREATE INDEX IF NOT EXISTS bookings_completed_at_idx ON bookings(completed_at);

-- ── 2. Sales table (product transactions) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES listings(id) ON DELETE CASCADE NOT NULL,
  seller_id UUID REFERENCES profiles(id) NOT NULL,
  buyer_name TEXT,
  buyer_whatsapp TEXT,
  total_amount NUMERIC(10, 2) NOT NULL CHECK (total_amount >= 0),
  seller_notes TEXT,
  status TEXT DEFAULT 'completed'
    CHECK (status IN ('completed', 'refunded', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sales_seller_idx ON sales(seller_id);
CREATE INDEX IF NOT EXISTS sales_listing_idx ON sales(listing_id);
CREATE INDEX IF NOT EXISTS sales_completed_idx ON sales(completed_at);
CREATE INDEX IF NOT EXISTS sales_status_idx ON sales(status);

-- ── 3. sale_items (line items, snapshot at time of sale) ─────────────────────
CREATE TABLE IF NOT EXISTS sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID REFERENCES sales(id) ON DELETE CASCADE NOT NULL,
  listing_item_id UUID REFERENCES listing_items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,            -- snapshot: name at sale time
  item_price NUMERIC(10, 2) NOT NULL, -- snapshot: unit price at sale time
  quantity INTEGER DEFAULT 1 CHECK (quantity > 0),
  subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0)
);

CREATE INDEX IF NOT EXISTS sale_items_sale_idx ON sale_items(sale_id);

-- ── 4. RLS: bookings status updates (REQUIRED for the dashboard's            ──
--        Mark Completed / Cancel buttons). Additive.                         ──
DROP POLICY IF EXISTS "Sellers can update own bookings" ON public.bookings;

CREATE POLICY "Sellers can update own bookings"
ON public.bookings FOR UPDATE
TO authenticated
USING (seller_id = auth.uid())
WITH CHECK (seller_id = auth.uid());

-- ── 5. RLS: admin reads all bookings (REQUIRED for the admin sales           ──
--        dashboard's service track). Additive.                               ──
DROP POLICY IF EXISTS "Admins can view all bookings" ON public.bookings;

CREATE POLICY "Admins can view all bookings"
ON public.bookings FOR SELECT
TO authenticated
USING (public.is_admin());

-- ── 6. RLS: sales ────────────────────────────────────────────────────────────
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sellers view own sales" ON public.sales;
CREATE POLICY "Sellers view own sales"
ON public.sales FOR SELECT
TO authenticated
USING (auth.uid() = seller_id);

DROP POLICY IF EXISTS "Admins view all sales" ON public.sales;
CREATE POLICY "Admins view all sales"
ON public.sales FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "Sellers insert own sales" ON public.sales;
CREATE POLICY "Sellers insert own sales"
ON public.sales FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = seller_id);

DROP POLICY IF EXISTS "Sellers update own sales" ON public.sales;
CREATE POLICY "Sellers update own sales"
ON public.sales FOR UPDATE
TO authenticated
USING (auth.uid() = seller_id)
WITH CHECK (auth.uid() = seller_id);
-- 24-hour edit window is enforced in app code (lib/sales.ts); status changes
-- (refund/cancel) remain available forever per Decision 3.

DROP POLICY IF EXISTS "Admins update all sales" ON public.sales;
CREATE POLICY "Admins update all sales"
ON public.sales FOR UPDATE
TO authenticated
USING (public.is_admin());

-- ── 7. RLS: sale_items (access inherited from the parent sale) ───────────────
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View sale items via parent sale" ON public.sale_items;
CREATE POLICY "View sale items via parent sale"
ON public.sale_items FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sales
    WHERE sales.id = sale_items.sale_id
      AND (sales.seller_id = auth.uid() OR public.is_admin())
  )
);

DROP POLICY IF EXISTS "Insert sale items via parent sale" ON public.sale_items;
CREATE POLICY "Insert sale items via parent sale"
ON public.sale_items FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sales
    WHERE sales.id = sale_items.sale_id AND sales.seller_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Update sale items via parent sale" ON public.sale_items;
CREATE POLICY "Update sale items via parent sale"
ON public.sale_items FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sales
    WHERE sales.id = sale_items.sale_id AND sales.seller_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Delete sale items via parent sale" ON public.sale_items;
CREATE POLICY "Delete sale items via parent sale"
ON public.sale_items FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sales
    WHERE sales.id = sale_items.sale_id AND sales.seller_id = auth.uid()
  )
);

-- ── 8. Verify ────────────────────────────────────────────────────────────────
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('sales', 'sale_items', 'bookings')
order by tablename, cmd, policyname;
