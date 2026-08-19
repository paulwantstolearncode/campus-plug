-- ============================================================================
-- Feedback System: user-submitted feedback (bugs, features, general)
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- Dependencies: public.is_admin() from profiles_rls_policies.sql
-- ============================================================================

-- ── 1. Feedback table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT,
  rating SMALLINT CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  category TEXT NOT NULL CHECK (category IN ('bug', 'feature', 'general', 'complaint')),
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 10 AND 2000),
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- INSERT: anyone can insert (including anonymous / unauthenticated users).
DROP POLICY IF EXISTS "Anyone can insert feedback" ON public.feedback;
CREATE POLICY "Anyone can insert feedback"
ON public.feedback FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- SELECT: only admins can read all feedback.
DROP POLICY IF EXISTS "Admins can read all feedback" ON public.feedback;
CREATE POLICY "Admins can read all feedback"
ON public.feedback FOR SELECT
TO authenticated
USING (public.is_admin());

-- UPDATE: only admins can update (to mark as read).
DROP POLICY IF EXISTS "Admins can update feedback" ON public.feedback;
CREATE POLICY "Admins can update feedback"
ON public.feedback FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- DELETE: only admins can delete.
DROP POLICY IF EXISTS "Admins can delete feedback" ON public.feedback;
CREATE POLICY "Admins can delete feedback"
ON public.feedback FOR DELETE
TO authenticated
USING (public.is_admin());

-- ── 3. Indexes ───────────────────────────────────────────────────────────────
-- Admin list view: newest first.
CREATE INDEX IF NOT EXISTS feedback_created_idx ON feedback (created_at DESC);

-- Unread queue: fast filter for the admin badge count.
CREATE INDEX IF NOT EXISTS feedback_unread_idx ON feedback (created_at DESC) WHERE is_read = false;
