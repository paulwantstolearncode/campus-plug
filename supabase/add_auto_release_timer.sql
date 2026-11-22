-- ============================================================================
-- Auto-release timer: confirm orders after 48h in 'delivered'
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- Problem: if a buyer goes silent after 'delivered', funds hang indefinitely and
-- the seller has to chase. This schedules a pg_cron job (hourly) that confirms
-- any order that has sat in 'delivered' for more than 48 hours with no open
-- dispute. Confirming the order fires release_escrow_on_complete(), which
-- releases the escrow to the seller.
--
-- WHY A TRUSTED SYSTEM CAPABILITY:
--   advance_order() normally authorizes against auth.uid(). Inside pg_cron
--   there is no JWT, so this function sets a transaction-local, order-specific
--   capability before calling advance_order(). The canonical RPC accepts that
--   capability only for this exact stale delivered order and re-checks the
--   dispute freeze and service appointment window. The capability is cleared
--   immediately after the call; this function never updates orders directly.
--
-- Guards (enforced here and re-checked by canonical advance_order()):
--   * status = 'delivered'          — nothing else is auto-confirmed
--   * updated_at < now() - 48h      — the buyer's confirmation window
--   * no open dispute               — a dispute freezes auto-release
--   * terminal states re-checked    — an order cannot be confirmed twice
--
-- Dependencies: orders + order_events (add_orders.sql), disputes
--   (add_marketplace_disputes.sql), release_escrow_on_complete() trigger
--   (add_escrow_release_on_complete.sql).
--
-- NOTE: add_service_booking_orders.sql supersedes this function with the
-- appointment-aware service version. Run that migration after this one (and
-- re-run it if this base file is ever re-applied). The canonical advance_order()
-- capability check lives in lockdown_order_payment_state.sql, which MUST RUN
-- LAST before this cron job is allowed to execute.
-- ============================================================================

-- ── 1. System function: confirm stale delivered orders ─────────────────────
CREATE OR REPLACE FUNCTION public.auto_release_stale_orders()
RETURNS integer
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_order RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_order IN
    SELECT o.id, o.status
    FROM public.orders o
    WHERE o.status = 'delivered'
      AND o.updated_at < now() - interval '48 hours'
      AND NOT EXISTS (
        SELECT 1 FROM public.disputes d
        WHERE d.order_id = o.id
          AND d.status = 'open'
      )
    FOR UPDATE SKIP LOCKED
  LOOP
    -- The canonical RPC accepts this order-specific capability only for a
    -- stale delivered order with no open dispute. actor_id remains NULL in the
    -- audit event, identifying the system actor.
    PERFORM set_config('app.auto_release_order_id', v_order.id::text, true);
    PERFORM public.advance_order(
      v_order.id,
      'confirmed',
      'Auto-confirmed after 48h delivery window with no buyer confirmation and no open dispute'
    );
    PERFORM set_config('app.auto_release_order_id', '', true);

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$fn$;

-- Cron runs as the database owner; no browser role should call this directly.
REVOKE ALL ON FUNCTION public.auto_release_stale_orders() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_release_stale_orders() FROM anon, authenticated;

-- ── 2. Schedule the hourly job ──────────────────────────────────────────────
-- Requires pg_cron (Dashboard -> Database -> Extensions). If the extension is
-- unavailable on your plan, skip section 2 and point any external scheduler
-- (Vercel cron, GitHub Actions) at an RPC that calls
-- public.auto_release_stale_orders().
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('order-auto-release')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'order-auto-release');

SELECT cron.schedule(
  'order-auto-release',
  '0 * * * *',
  $job$SELECT public.auto_release_stale_orders();$job$
);

-- ── 3. Verify ───────────────────────────────────────────────────────────────
SELECT jobname, schedule, command
FROM cron.job
WHERE jobname = 'order-auto-release';
