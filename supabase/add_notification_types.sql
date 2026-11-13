-- ============================================================================
-- Notification types extension: type, reference_id, sender_id + indexes + admin policy
-- Idempotent: safe to re-run.
--
-- Additive ALTER TABLE on public.notifications:
--   * type TEXT      — enum-like: order_complete / order_cancelled /
--     review_received / review_replied / chat_message / chat_batched /
--     badge_progress / order_reminder / deal_revealed
--   * reference_id TEXT — links to the object (sale.id, booking.id, review.id,
--     listing.id, chat_message.id)
--   * sender_id UUID   — who triggered it (needed for chat)
-- New indexes: (user_id, type, created_at DESC) and (user_id, is_read, type)
-- New policy: Admins can view all notifications (for the admin panel)
--
-- Why: order status changes, reviews, replies, badge progress and deal-reveal
-- prompts fire individual notifications + push. These columns let triggers tag
-- each row so the client can group/render by type without a schema change per
-- event.
--
-- Dependencies: notifications (add_notifications.sql), is_admin() from existing
-- RLS setup.
-- ============================================================================

-- ── 1. Additive columns on notifications ─────────────────────────────────────
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS type TEXT,
  ADD COLUMN IF NOT EXISTS reference_id TEXT,
  ADD COLUMN IF NOT EXISTS sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── 2. Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notifications_user_type_created
ON public.notifications (user_id, type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read_type
ON public.notifications (user_id, is_read, type);

-- ── 3. Admin policy (additive — does not touch user policies) ────────────────
DROP POLICY IF EXISTS "Admins can view all notifications" ON public.notifications;
CREATE POLICY "Admins can view all notifications"
ON public.notifications FOR SELECT
TO authenticated
USING (public.is_admin());

-- ── 4. Verify ────────────────────────────────────────────────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'notifications'
ORDER BY ordinal_position;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'notifications';

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'notifications'
ORDER BY cmd, policyname;
