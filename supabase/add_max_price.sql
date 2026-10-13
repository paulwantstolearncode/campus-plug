-- ============================================================
-- Price ranges on listings (max_price)
-- ============================================================
-- Adds an optional `max_price` column so a listing can carry a
-- variable price range (e.g. hostel rooms GH₵ 2,500 - 4,500, or
-- tiered clothing sizes). `price` stays the required base /
-- starting price; `max_price` is NULL for single fixed prices.
--
-- Idempotent: safe to re-run.
-- Run in the Supabase SQL editor BEFORE pushing code that uses it.
-- ============================================================

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS max_price numeric;
