-- Post-lockdown hardening: order/payment write isolation + privilege hygiene
-- Applied manually to production via SQL Editor; captured here for reproducibility.
-- All statements are idempotent (safe to re-run; REVOKE of an absent privilege is a no-op).

-- 1. No direct writes to money tables from API roles (state changes via SECURITY DEFINER RPCs only)
REVOKE INSERT, UPDATE, DELETE ON public.orders FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.orders FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.payment_transactions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.payment_transactions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.order_events FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.order_events FROM anon;

-- 2. Read access (RLS policies scope what rows are visible)
GRANT SELECT ON public.orders TO authenticated;
GRANT SELECT ON public.payment_transactions TO authenticated;
GRANT SELECT ON public.order_events TO authenticated;
GRANT SELECT ON public.orders TO anon;

-- 3. Strip default-privilege residue; anon gets nothing payment-related
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.orders FROM anon, authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.payment_transactions FROM anon, authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.order_events FROM anon, authenticated;
REVOKE SELECT ON public.payment_transactions FROM anon;
REVOKE SELECT ON public.order_events FROM anon;
