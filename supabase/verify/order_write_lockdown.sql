-- ============================================================
-- order_write_lockdown.sql  (verification script — NOT a migration)
--
-- Regression check for the order/payment write lockdown.
-- Run in the Supabase SQL Editor after any migration touching
-- orders, payment_transactions, order_events, or their grants.
--
-- IMPORTANT: the SQL Editor executes as the postgres role, which
-- has BYPASSRLS and owns these tables — raw INSERT/UPDATE/DELETE
-- attempts here prove NOTHING. This script therefore checks the
-- privilege matrix declaratively (has_table_privilege) plus the
-- RLS policy surface.
--
-- PASS CRITERIA:
--   Section 1: rolbypassrls = true for postgres + service_role;
--              false for authenticated + anon.
--   Section 2 (core check):
--     authenticated: SELECT=true on all 3 tables; ALL other
--       privileges false.
--     anon: SELECT=true on orders ONLY; ALL other privileges
--       false (including SELECT on the payment tables).
--   Section 3: relrowsecurity = true on all 3 tables.
--   Section 4: every policy listed has cmd = SELECT. Any
--       INSERT/UPDATE/DELETE policy = FAIL.
--   Section 5 (optional live-fire): run the commented block at
--       the bottom separately; it must error 42501.
-- ============================================================

-- ---------- Section 1: role attributes ----------
SELECT rolname, rolsuper, rolbypassrls
FROM pg_roles
WHERE rolname IN ('postgres', 'authenticated', 'anon', 'service_role')
ORDER BY rolname;

-- ---------- Section 2: privilege matrix ----------
SELECT role, tbl,
  has_table_privilege(role, 'public.' || tbl, 'SELECT')     AS sel,
  has_table_privilege(role, 'public.' || tbl, 'INSERT')     AS ins,
  has_table_privilege(role, 'public.' || tbl, 'UPDATE')     AS upd,
  has_table_privilege(role, 'public.' || tbl, 'DELETE')     AS del,
  has_table_privilege(role, 'public.' || tbl, 'TRUNCATE')   AS trn,
  has_table_privilege(role, 'public.' || tbl, 'TRIGGER')    AS trg,
  has_table_privilege(role, 'public.' || tbl, 'REFERENCES') AS ref
FROM (VALUES ('authenticated'), ('anon')) AS r(role)
CROSS JOIN (VALUES ('orders'), ('payment_transactions'), ('order_events')) AS t(tbl)
ORDER BY role, tbl;

-- ---------- Section 3: RLS enabled ----------
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname IN ('orders', 'payment_transactions', 'order_events')
ORDER BY relname;

-- ---------- Section 4: policy surface (SELECT-only expected) ----------
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('orders', 'payment_transactions', 'order_events')
ORDER BY tablename, cmd;

-- ---------- Section 5: live-fire proof (run SEPARATELY) ----------
-- Replace the two UUIDs with a real listing id and user id.
-- Expected: ERROR 42501 permission denied for table orders.
-- The INSERT error aborts the transaction; nothing persists.
-- Repeat with payment_transactions for full coverage.
--
-- BEGIN;
-- SET LOCAL ROLE authenticated;
-- SELECT set_config('request.jwt.claims',
--   json_build_object('sub', '<user-uuid>', 'role', 'authenticated')::text, true);
-- INSERT INTO public.orders (listing_id, buyer_id, kind, amount, status, payment_method)
-- VALUES ('<listing-uuid>', '<user-uuid>', 'product', 1, 'awaiting_payment', 'momo');
-- ROLLBACK;
