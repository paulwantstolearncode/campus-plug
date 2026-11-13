-- ============================================================================
-- Notification preferences: per-user, per-type mute toggles
-- Idempotent: safe to re-run.
--
-- New table public.notification_preferences:
--   * user_id UUID    — references auth.users, ON DELETE CASCADE
--   * type TEXT       — matches notifications.type enum-like values
--   * enabled BOOLEAN — default true; false = mute this type for this user
--   * PRIMARY KEY (user_id, type)
--
-- RLS: users manage their own rows (auth.uid() = user_id). Admins can view all
-- via public.is_admin().
--
-- Trigger contracts: every order/review/chat trigger below checks
--   SELECT 1 FROM notification_preferences
--   WHERE user_id = <target> AND type = <event type> AND enabled = false
--   and CONTINUE (skips the notification) when a row matches. This lets
--   sellers mute "order updates" but keep "reviews", etc. Users with no row at
--   all default to enabled (true).
--
-- Dependencies: notifications (add_notifications.sql), auth.users.
-- ============================================================================

-- ── 1. Table ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, type)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- ── 2. RLS ───────────────────────────────────────────────────────────────────
-- Users manage their own rows.
DROP POLICY IF EXISTS "Users manage own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users manage own notification preferences"
ON public.notification_preferences
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Admins can view all (for the admin panel).
DROP POLICY IF EXISTS "Admins can view all notification preferences" ON public.notification_preferences;
CREATE POLICY "Admins can view all notification preferences"
ON public.notification_preferences
FOR SELECT
TO authenticated
USING (public.is_admin());

-- ── 3. Index ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_enabled
ON public.notification_preferences (user_id, enabled);

-- ── 4. Verify ────────────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'notification_preferences'
ORDER BY cmd, policyname;

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'notification_preferences'
ORDER BY ordinal_position;
