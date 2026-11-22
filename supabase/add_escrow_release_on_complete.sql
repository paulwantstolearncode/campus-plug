-- ============================================================================
-- Escrow release on order confirmation
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- When an order's status transitions to 'confirmed' (buyer confirmed delivery),
-- automatically release escrow: mark the payment transaction 'released' and set
-- released_at. This is the marketplace money moment — seller gets paid net of
-- the 8% platform commission.
--
-- Runs as SECURITY DEFINER so it can update payment_transactions even though
-- the buyer (who clicked confirm) only has RLS SELECT on their own orders.
--
-- Dependencies: orders (add_orders.sql), payment_transactions
--   (add_marketplace_payments.sql), release_escrow() RPC
--   (add_marketplace_payments.sql).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.release_escrow_on_complete()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_payment_id UUID;
  v_status TEXT;
BEGIN
  -- Only fire on actual transition INTO 'confirmed'.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- Find the most recent paid (not yet released) payment for this order.
  SELECT id INTO v_payment_id
  FROM public.payment_transactions
  WHERE order_id = NEW.id
    AND status = 'paid'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_payment_id IS NOT NULL THEN
    UPDATE public.payment_transactions
    SET status = 'released',
        released_at = now()
    WHERE id = v_payment_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_release_escrow_on_complete ON public.orders;
CREATE TRIGGER trg_release_escrow_on_complete
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.release_escrow_on_complete();

-- ── Verify ──────────────────────────────────────────────────────────────────
SELECT tgname, tgrelid::regclass AS on_table
FROM pg_trigger
WHERE tgrelid = 'public.orders'::regclass
  AND NOT tgisinternal
  AND tgname = 'trg_release_escrow_on_complete';
