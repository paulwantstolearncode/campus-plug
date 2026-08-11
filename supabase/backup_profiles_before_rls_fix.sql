-- ============================================================================
-- BACKUP: profiles table before running fix_profile_update_recursion.sql
-- ----------------------------------------------------------------------------
-- Run this FIRST in Supabase SQL Editor. Export the full-backup query's
-- results as CSV for safety. Idempotent: safe to re-run.
--
-- Captured: 2026-08-11 14:39 UTC
-- Purpose : Snapshot of profiles before the RLS/trigger change
--           (fix_profile_update_recursion.sql)
-- Safe    : Pure SELECT queries only -- this file writes NOTHING.
-- ============================================================================

-- 0) SCHEMA CHECK ------------------------------------------------------------
--    Confirms the real column list of profiles. The backup query below uses
--    the 7 columns the app touches (id, full_name, whatsapp_number, is_seller,
--    is_admin, seller_status, created_at). If this list shows anything extra,
--    add that column to the full-backup query in section 2 before exporting.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
order by ordinal_position;

-- 1) ROW-COUNT VERIFICATION --------------------------------------------------
--    Run first and screenshot the result. Use these numbers to confirm the
--    backup in section 2 captured EVERY row (total_profiles must match the
--    number of rows in the CSV minus its header line).
select
  count(*)                                   as total_profiles,
  count(*) filter (where is_seller = true)   as approved_sellers,
  count(*) filter (where is_admin = true)    as admins,
  count(*) filter (where seller_status = 'pending')  as pending_sellers,
  count(*) filter (where seller_status = 'approved') as approved_status,
  count(*) filter (where seller_status = 'rejected') as rejected_status,
  count(*) filter (where seller_status is null)      as no_status,
  max(created_at) as most_recent_signup,
  min(created_at) as oldest_signup
from public.profiles;

-- 2) FULL BACKUP (export this result as CSV) --------------------------------
--    All 7 columns the app uses, oldest -> newest. Export via:
--      Results panel -> "Export" dropdown -> "Export as CSV"
--    Do NOT use "Limit 100 rows" -- switch the limit dropdown to 1000+ first
--    (or the export silently truncates!). See instructions in section 3.
select
  id,
  full_name,
  whatsapp_number,
  is_seller,
  is_admin,
  seller_status,
  created_at
from public.profiles
order by created_at asc;

-- 3) INSTRUCTIONS ------------------------------------------------------------
--    How to capture the backup:
--      1. Open Supabase Dashboard -> SQL Editor -> New query.
--      2. Paste this whole file, click Run.
--      3. Screenshot the section 0 (schema) and section 1 (row counts) results.
--      4. Click the section 2 results panel, then the "Export" dropdown
--         (top-right of the Results tab) -> "Export as CSV".
--         IMPORTANT: before exporting, set the "Limit 100 rows" dropdown
--         (top toolbar) to a value >= total_profiles (e.g. 1000). A limit
--         smaller than the table would silently export a partial backup.
--      5. Save the CSV to:
--            C:\Users\Owner\Projects\campus-plug\backups\
--         with the name:
--            profiles_backup_2026-08-11.csv
--         (Keep this folder out of git -- it's a local safety net.)
--
--    How to verify the backup is COMPLETE before running the fix:
--      * The number of data rows in the CSV (total lines minus the header)
--        must equal total_profiles from section 1.
--      * Spot-check the four breakdowns: admins, approved sellers, pending,
--        rejected counts in the CSV should match section 1's filters.
--      * Confirm the CSV contains today's newest created_at
--        (most_recent_signup from section 1).
--      * Confirm the CSV opens in Excel/Sheets without mangled UUIDs
--        (set the id column to text format if Excel converts them).
--
--    THEN run fix_profile_update_recursion.sql. After it runs, re-run
--    section 1 and confirm the counts are unchanged (the fix only replaces
--    a policy + adds a trigger; it must not add/remove/alter any row).
-- ============================================================================
