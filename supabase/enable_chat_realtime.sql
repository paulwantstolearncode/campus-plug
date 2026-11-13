-- ============================================================================
-- Live chat: publish chat_messages to Supabase Realtime
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- WHY: the messaging UI subscribes to Postgres Changes on public.chat_messages
-- (lib/chat.ts: subscribeToConversationMessages / subscribeToInbox) so new
-- messages and read receipts appear without a page reload. Realtime only emits
-- changes for tables that are part of the `supabase_realtime` publication; a
-- table created with plain SQL is not added automatically, so without this the
-- subscriptions connect but never fire (the UI still refreshes on tab focus).
--
-- RLS is unchanged and still enforced: Realtime only delivers rows the
-- subscribing user is allowed to SELECT, and the existing chat_messages
-- policies already limit those to the conversations the user takes part in.
--
-- REPLICA IDENTITY FULL is required to filter UPDATE events on a non-PK column
-- (the thread filters on conversation_id); without it, updates carry only the
-- primary key and the filter cannot match.
--
-- Dependencies: chat_messages (add_chat.sql).
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
END $$;

ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;

-- ── Verify ───────────────────────────────────────────────────────────────────
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
ORDER BY tablename;
