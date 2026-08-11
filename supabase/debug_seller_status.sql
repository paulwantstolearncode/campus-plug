-- ============================================================================
-- DEBUG: "Something went wrong. Please try again." on /become-seller
-- ----------------------------------------------------------------------------
-- Symptom (confirmed from browser console):
--   PATCH /rest/v1/profiles?<id>=eq.<uuid>&select=id   ->  500
--   ...which is exactly what the become-seller submit runs:
--     supabase.from('profiles').update({
--       whatsapp_number: '233...', seller_status: 'pending'
--     }).eq('id', user.id).select('id')
--
-- A 500 means Postgres raised an ERROR while applying the UPDATE. (An RLS
-- denial would return 403, or 200 with zero rows — not 500.) So the cause is
-- one of:
--   A) a profiles policy that errors when evaluated
--      - infinite recursion (a policy chain that reads the same table back)
--      - a policy referencing a column that doesn't exist on the table
--      - a policy calling a function that doesn't exist
--   B) a CHECK constraint on profiles that the payload violates
--   C) something account-specific (no profiles row for the user)
--
-- Run the numbered blocks TOP TO BOTTOM in the Supabase SQL editor
-- (Dashboard -> SQL Editor -> New query -> paste -> Run).
-- Blocks 1-4 just print current state. Block 5 reproduces the exact failing
-- UPDATE inside a transaction that ROLLS BACK — nothing is written.
-- ============================================================================

-- 1) SCHEMA: which columns does profiles actually have?
--    Expect: id, full_name, whatsapp_number, is_seller, seller_status,
--    is_admin, created_at. A missing seller_status (or is_admin) is a
--    strong root-cause candidate.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
order by ordinal_position;

-- 1b) CHECK constraints on profiles. A whatsapp_number format rule that
--     rejects '233...' international format would 500 on this exact update.
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.profiles'::regclass and contype = 'c';

-- 2) Does the admin-check function used by the policies exist?
select p.oid::regprocedure as function_signature
from pg_proc p
where p.pronamespace = 'public'::regnamespace and p.proname = 'is_admin';

-- 3) PROFILES POLICIES — the ACTUAL production state. Look for:
--    - a policy whose qual/with_check queries 'profiles' again (recursion risk)
--    - a qual/with_check referencing a column not listed in block 1
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'profiles'
order by cmd, policyname;

-- 4) LISTINGS POLICIES — a listings policy that queries profiles would close
--    a recursion cycle with the profiles SELECT policies (profiles -> listings
--    via the "seller info" EXISTS -> back to profiles via this policy).
select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'listings'
order by cmd, policyname;

-- 5) REPRODUCE the exact become-seller UPDATE as an authenticated user.
--    Picks the most recent non-seller profile so there are no placeholders.
--    Ends in ROLLBACK — nothing is written.
--    IF IT PRINTS AN ERROR: that error message IS the root cause. Copy it.
begin;

-- Pick the target UUID BEFORE dropping to the authenticated role (the editor
-- runs as postgres/superuser, so it can see every profile row here).
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub',
    (select p.id::text from public.profiles p
     where coalesce(p.is_seller, false) = false
     order by p.created_at desc
     limit 1),
    'role', 'authenticated'
  )::text,
  true
);

set local role authenticated;

-- Sanity: which user are we acting as? (NULL = no non-seller profiles exist.)
select auth.uid() as acting_as;

-- The EXACT update the become-seller page runs (same payload, same filter).
update public.profiles
set whatsapp_number = '233593759569',
    seller_status = 'pending'
where id = auth.uid();

-- Reached only if the update succeeded: then the 500 is specific to the
-- reporting user's account, not the update itself.
select id, is_seller, is_admin, seller_status, whatsapp_number
from public.profiles
where id = auth.uid();

rollback;

-- 6) (Only relevant if block 5 succeeded) — does EVERY auth user have a
--    profile row? A user without one makes .single() error on page load, and
--    their submit would silently match 0 rows instead of erroring.
select u.id, u.email,
       (p.id is not null) as has_profile_row
from auth.users u
left join public.profiles p on p.id = u.id
order by u.created_at desc;
