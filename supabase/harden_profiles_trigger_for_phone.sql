-- ============================================================================
-- Harden profiles trigger for phone-only signups + add phone column
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- This migration:
--   1. Adds a `phone` column to public.profiles (nullable)
--   2. Drops and recreates handle_new_user() so it:
--      - Copies the user's phone to profiles.phone
--      - Sets full_name to 'Student_[last 4 phone digits]' when no name is
--        provided (phone-only signups won't have raw_user_meta_data->>'full_name')
--      - Gracefully handles null email / null raw_user_meta_data
--   3. Recreates the trigger
-- ============================================================================

-- ── 1. Add phone column to profiles ────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text;

-- ── 2. Drop existing trigger (so we can replace the function) ──────────────
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- ── 3. Drop and recreate handle_new_user() ─────────────────────────────────
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_full_name text;
  v_phone     text;
BEGIN
  -- ── Extract phone ──────────────────────────────────────────────────────
  -- Supabase stores the phone on auth.users.phone when the user signs up
  -- via phone/OTP. raw_user_meta_data may also contain it.
  v_phone := COALESCE(
    new.phone,
    new.raw_user_meta_data ->> 'phone',
    NULL
  );

  -- ── Extract full_name ──────────────────────────────────────────────────
  -- Email signups provide full_name in raw_user_meta_data; phone-only
  -- signups typically do not, so we fall back to a generated name.
  v_full_name := COALESCE(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    NULL
  );

  IF v_full_name IS NULL OR trim(v_full_name) = '' THEN
    -- Generate a default name from the last 4 digits of the phone number,
    -- or use a random 4-digit suffix if phone is also missing.
    IF v_phone IS NOT NULL AND length(v_phone) >= 4 THEN
      v_full_name := 'Student_' || right(regexp_replace(v_phone, '[^0-9]', '', 'g'), 4);
    ELSE
      v_full_name := 'Student_' || floor(random() * 9000 + 1000)::int::text;
    END IF;
  END IF;

  INSERT INTO public.profiles (id, is_seller, is_admin, whatsapp_number, full_name, phone)
  VALUES (new.id, false, false, NULL, v_full_name, v_phone)
  ON CONFLICT (id) DO UPDATE
    SET phone     = COALESCE(EXCLUDED.phone, public.profiles.phone),
        full_name = CASE
                      WHEN public.profiles.full_name IS NULL OR public.profiles.full_name = ''
                      THEN EXCLUDED.full_name
                      ELSE public.profiles.full_name
                    END;

  RETURN new;
END;
$$;

-- ── 4. Recreate the trigger ───────────────────────────────────────────────
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
