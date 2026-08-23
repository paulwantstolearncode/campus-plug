-- Allow public read access to basic profile details for shops & listings.
--
-- WHY: /shop/[id] fetches the seller's profile server-side with the anon
-- client (visitors have no session). The only SELECT policies on profiles
-- were own-row ("Users can view own profile") and admin ("Admins can view
-- all profiles"), so anonymous requests returned 0 rows -> getSellerWithListings
-- returned null -> "Seller not found" for every logged-out visitor.
--
-- What becomes publicly readable: id, full_name, avatar_url, whatsapp_number,
-- campus_location, created_at, is_seller, seller_status (+ is_admin boolean).
-- profiles holds no email column (email lives in auth.users, still private),
-- and whatsapp_number is already rendered publicly on listing cards.
--
-- Write/escalation rules are untouched: INSERT/UPDATE stay locked down by
-- harden_profiles_rls.sql (own-row + admin-only + escalation trigger).
--
-- Run in the Supabase SQL editor BEFORE pushing any code that depends on it.
-- Idempotent: safe to re-run.

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles
  FOR SELECT USING (true);

-- Verify: expect 3 SELECT policies now (own-row, admin, public).
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'profiles'
order by cmd;
