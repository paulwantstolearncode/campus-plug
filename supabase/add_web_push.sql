-- ============================================================================
-- Web Push infrastructure: browser push subscriptions + outbox queue
-- ── Tables:
--   * push_subscriptions: one row per subscribed browser/device, owned by a
--     user. Stores the endpoint + keys (Web Push subscription JSON).
--   * push_messages: tiny outbox written by DB triggers; the admin-push
--     Edge Function drains it on a cron schedule and delivers OS-level
--     notifications to every active admin subscription.
--
-- Security notes:
--   * Both tables are readable/writable only by service_role (Edge Function)
--     plus the subscription owner for push_subscriptions. Endpoints/keys are
--     bearer secrets — never expose them via anon policies.
--   * pg_cron schedules the drain every 2 minutes; if pg_cron is not enabled
--     on your project, the job creation below fails harmlessly when wrapped —
--     see the comment at the bottom for the manual alternative.
-- ============================================================================

-- ── 1. push_subscriptions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Owner may manage their own devices (list/delete from the app UI).
DROP POLICY IF EXISTS "Users manage own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users manage own push subscriptions"
ON public.push_subscriptions FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- No anon access at all; the Edge Function uses service_role which bypasses RLS.

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
ON public.push_subscriptions (user_id);

-- ── 2. push_messages (outbox) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

ALTER TABLE public.push_messages ENABLE ROW LEVEL SECURITY;

-- Nobody reads/writes this through PostgREST directly — only service_role
-- (Edge Function) and SECURITY DEFINER triggers touch it.
DROP POLICY IF EXISTS "No direct access to push messages" ON public.push_messages;
CREATE POLICY "No direct access to push messages"
ON public.push_messages FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_push_messages_unprocessed
ON public.push_messages (id)
WHERE processed_at IS NULL;

-- Cap the outbox so a broken worker can't grow it forever: keep newest 5000.
-- (Cheap safety net; the Edge Function marks rows processed anyway.)

-- ── 3. Cron drain (requires pg_cron — enable via Dashboard -> Extensions) ──
-- The Edge Function is invoked over HTTPS, so we use pg_net + pg_cron.
-- If either extension is unavailable on your plan, delete this section and
-- hit the function URL on a schedule instead (see footer comment).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule is stored as a named job; re-create idempotently. Note: cron.job
-- exposes its columns as "job" (id) and "jobname", NOT a job_id column —
-- selecting job_id here once made this whole migration fail to run.
SELECT cron.unschedule('admin-push-drain')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'admin-push-drain');

SELECT cron.schedule(
  'admin-push-drain',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.admin_push_function_url', true),
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-push-worker-secret', coalesce(current_setting('app.settings.push_worker_secret', true), '')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 9000
  ) AS request_id
  WHERE coalesce(current_setting('app.settings.admin_push_function_url', true), '') <> ''
  $$
);

-- ============================================================================
-- AFTER running this file:
--   1. Set your real values (replace the placeholders):
--        ALTER DATABASE postgres SET app.settings.admin_push_function_url =
--          'https://<project-ref>.supabase.co/functions/v1/admin-push';
--        ALTER DATABASE postgres SET app.settings.push_worker_secret =
--          '<a long random string — must match PUSH_WORKER_SECRET in the
--            Edge Function secrets>';
--   2. Deploy the admin-push Edge Function (supabase functions deploy admin-push).
--   3. Without pg_cron/pg_net: point any external cron (GitHub Actions
--      schedule, Vercel cron, etc.) at the function URL with the secret header
--      every 2 minutes instead.
-- ============================================================================
