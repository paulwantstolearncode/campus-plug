-- ============================================================
-- SMS rate limiting
-- ============================================================
-- Tracks send-otp requests by key (IP or phone number).
-- A SECURITY DEFINER function enforces per-window limits
-- so the anon/authenticated client can call it safely.
-- ============================================================

-- 1. Table
CREATE TABLE IF NOT EXISTS public.sms_rate_limits (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key          text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  hit_count    int NOT NULL DEFAULT 1,
  UNIQUE(key)
);

-- 2. RLS — no public reads; writes only via service role / definer func
ALTER TABLE public.sms_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No public read on sms_rate_limits" ON public.sms_rate_limits;
CREATE POLICY "No public read on sms_rate_limits"
  ON public.sms_rate_limits FOR SELECT
  USING (false);

DROP POLICY IF EXISTS "Service role insert sms_rate_limits" ON public.sms_rate_limits;
CREATE POLICY "Service role insert sms_rate_limits"
  ON public.sms_rate_limits FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role update sms_rate_limits" ON public.sms_rate_limits;
CREATE POLICY "Service role update sms_rate_limits"
  ON public.sms_rate_limits FOR UPDATE
  USING (true);

-- 3. Index
CREATE INDEX IF NOT EXISTS idx_sms_rate_limits_key
  ON public.sms_rate_limits (key);

-- 4. SECURITY DEFINER function — runs with owner privileges
--    Returns true if request is allowed, false if rate-limited.
CREATE OR REPLACE FUNCTION public.check_sms_rate_limit(
  limit_key text,
  max_hits int,
  window_seconds int
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  row_rec RECORD;
BEGIN
  -- Try to find existing window
  SELECT id, window_start, hit_count
    INTO row_rec
    FROM public.sms_rate_limits
    WHERE key = limit_key;

  IF NOT FOUND THEN
    -- First hit — insert
    INSERT INTO public.sms_rate_limits (key, window_start, hit_count)
    VALUES (limit_key, now(), 1);
    RETURN true;
  END IF;

  -- Window expired? Reset
  IF extract(epoch from (now() - row_rec.window_start)) > window_seconds THEN
    UPDATE public.sms_rate_limits
      SET window_start = now(), hit_count = 1
      WHERE id = row_rec.id;
    RETURN true;
  END IF;

  -- Within window — increment
  UPDATE public.sms_rate_limits
    SET hit_count = hit_count + 1
    WHERE id = row_rec.id;

  RETURN (row_rec.hit_count + 1) <= max_hits;
END;
$$;

-- 5. Allow anon + authenticated to execute the function
GRANT EXECUTE ON FUNCTION public.check_sms_rate_limit(text, int, int) TO anon;
GRANT EXECUTE ON FUNCTION public.check_sms_rate_limit(text, int, int) TO authenticated;
