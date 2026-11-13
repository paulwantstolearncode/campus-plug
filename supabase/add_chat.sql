-- ============================================================================
-- Chat: conversations + messages with contact-reveal gating
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- Tables:
--   * conversations: one thread between a buyer and seller, optionally tied
--     to a listing. contact_revealed_at tracks when both sides unlocked each
--     other's phone number (see contact gating below).
--   * chat_messages: messages within a conversation. sender_id is who sent it.
--
-- RLS: participants only (buyer or seller). chat_messages policies reference
-- conversations via EXISTS subquery — conversations policies never query
-- chat_messages, so no recursion (same discipline as the reviews system).
--
-- Contact gating:
--   * Phone numbers are never exposed through chat queries.
--   * A "Reveal contact" button unlocks only when BOTH: (a) at least one
--     review links buyer↔seller, or an order is complete between them; and
--     (b) both sides have tapped confirm. State lives in contact_revealed_at.
--
-- Indexes: (conversation_id, created_at) for message fetch; (last_message_at
-- DESC) for inbox ordering; (buyer_id), (seller_id) for participant lookup.
--
-- Dependencies: listings, profiles (auth.users via FK).
-- ============================================================================

-- ── 1. Conversations table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES public.listings(id) ON DELETE SET NULL,
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  contact_revealed_at TIMESTAMPTZ,
  -- One conversation per listing + buyer + seller pair (listing_id not null).
  -- Null listing_id (free conversation) rows are not unique-constrained —
  -- multiple free threads between the same pair are allowed for now.
  CONSTRAINT conversations_participants_distinct
    CHECK (buyer_id <> seller_id)
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_one_per_listing_pair
ON public.conversations (listing_id, buyer_id, seller_id)
WHERE listing_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_buyer
ON public.conversations (buyer_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_seller
ON public.conversations (seller_id, last_message_at DESC);

-- ── 2. RLS: conversations ────────────────────────────────────────────────────
-- Participants can see their own conversations.
DROP POLICY IF EXISTS "Participants can view own conversations" ON public.conversations;
CREATE POLICY "Participants can view own conversations"
ON public.conversations FOR SELECT
TO authenticated
USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- Participants can insert a conversation they are part of.
DROP POLICY IF EXISTS "Participants can insert own conversations" ON public.conversations;
CREATE POLICY "Participants can insert own conversations"
ON public.conversations FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- Participants can update their own conversations (e.g. contact_revealed_at).
DROP POLICY IF EXISTS "Participants can update own conversations" ON public.conversations;
CREATE POLICY "Participants can update own conversations"
ON public.conversations FOR UPDATE
TO authenticated
USING (auth.uid() = buyer_id OR auth.uid() = seller_id)
WITH CHECK (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- ── 3. Chat messages table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created
ON public.chat_messages (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_created
ON public.chat_messages (sender_id, created_at DESC);

-- ── 4. RLS: chat_messages ────────────────────────────────────────────────────
-- Participants of the parent conversation can view messages.
DROP POLICY IF EXISTS "Participants can view own conversation messages" ON public.chat_messages;
CREATE POLICY "Participants can view own conversation messages"
ON public.chat_messages FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = chat_messages.conversation_id
      AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
  )
);

-- Participants can insert messages into conversations they are part of.
DROP POLICY IF EXISTS "Participants can insert own conversation messages" ON public.chat_messages;
CREATE POLICY "Participants can insert own conversation messages"
ON public.chat_messages FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = chat_messages.conversation_id
      AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
  )
);

-- Participants can mark messages read (set read_at) in conversations they join.
DROP POLICY IF EXISTS "Participants can mark own conversation messages read" ON public.chat_messages;
CREATE POLICY "Participants can mark own conversation messages read"
ON public.chat_messages FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = chat_messages.conversation_id
      AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = chat_messages.conversation_id
      AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
  )
);

-- ── 5. Verify ────────────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('conversations', 'chat_messages')
ORDER BY tablename, cmd, policyname;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'conversations'
ORDER BY ordinal_position;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'chat_messages'
ORDER BY ordinal_position;

SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public' AND tablename IN ('conversations', 'chat_messages')
ORDER BY tablename, indexname;
