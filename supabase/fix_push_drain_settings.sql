-- ============================================================================
-- Fix: store push-drain settings in a table, not database GUCs
-- ----------------------------------------------------------------------------
-- Why: `ALTER DATABASE postgres SET "app.settings.*"` fails with
-- 42501 permission denied on Supabase (SQL editor runs as a non-superuser
-- postgres role that cannot set custom GUCs). A table + SECURITY DEFINER
-- function achieves the same thing with standard permissions.
--
-- Run in the Supabase SQL editor. Idempotent: safe to re-run.
-- Replaces the GUC-reading cron command from add_web_push.sql.
-- ============================================================================

-- ── 1. Settings table (RLS on, no policies => only SECURITY DEFINER reads) ─
CREATE TABLE IF NOT EXISTS public.push_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.push_settings ENABLE ROW LEVEL SECURITY;

-- Intentionally NO policies: anon/authenticated get nothing; the SECURITY
-- DEFINER drain function reads it as the table owner.

-- ── 2. The two settings (upsert so re-running with a new secret updates) ───
INSERT INTO public.push_settings (key, value)
VALUES
  ('function_url', 'https://lmhumklhhbkqztzkibya.supabase.co/functions/v1/admin-push'),
  ('worker_secret', 'GDy3uLwBAf7OUd2jvwu5iXM8hHBriFxhMXO9G7_jfGsvuCk3pnh6wcKSKaE1krew')
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value, updated_at = now();

-- ── 3. SECURITY DEFINER drain caller: reads settings, fires one POST ───────
CREATE OR REPLACE FUNCTION public.run_admin_push_drain()
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_url TEXT;
  v_secret TEXT;
BEGIN
  SELECT value INTO v_url FROM public.push_settings WHERE key = 'function_url';
  SELECT value INTO v_secret FROM public.push_settings WHERE key = 'worker_secret';

  IF v_url IS NULL OR v_secret IS NULL OR v_url = '' OR v_secret = '' THEN
    RETURN; -- not configured yet; cron fires again in 2 minutes
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-push-worker-secret', v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 9000
  );
END;
$$;

-- ── 4. Point the cron job at the function (replaces the GUC-based command) ─
SELECT cron.unschedule('admin-push-drain');

SELECT cron.schedule(
  'admin-push-drain',
  '*/2 * * * *',
  $$SELECT public.run_admin_push_drain()$$
);

-- ── 5. Verify ──────────────────────────────────────────────────────────────
SELECT jobname, schedule FROM cron.job WHERE jobname = 'admin-push-drain';
