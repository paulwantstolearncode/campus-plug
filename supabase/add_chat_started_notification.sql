-- ============================================================================
-- Chat started notification: tell someone a thread was opened with them
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- Why: add_chat_notification.sql only fires on chat_messages. A thread can
-- exist before any message does ("Message seller" inserts the conversation,
-- then the thread loads), so the other side currently gets nothing until a
-- message is actually sent — and that first message may be batched 5 minutes
-- later. A live enquiry can therefore go unnoticed for a whole session.
-- This closes the gap at the moment the thread exists.
--
-- Behaviour:
--   * AFTER INSERT ON conversations → notify the OTHER participant (the one who
--     did not create the row), type='chat_started', plus a push_messages row so
--     the admin-push drain delivers it to that device.
--   * The notice is a placeholder. When the first chat_message lands, the
--     BEFORE INSERT trigger below deletes the unread placeholder so the richer
--     "New message: <preview>" notification replaces it instead of stacking two
--     rows for one event.
--   * Dedupe: no second chat_started for the same recipient + thread within
--     15 minutes.
--   * Preferences: honours notification_preferences for 'chat_started' AND
--     'chat_message' — someone who muted chat entirely gets neither.
--   * Who initiated is taken from auth.uid(), because conversations has no
--     created_by column; with no JWT (service role, seed data) it falls back to
--     treating the buyer as initiator.
--
-- Names: first token of profiles.full_name only. A notification is not a place
-- to surface a full name, and one name reads better in a push preview anyway.
--
-- Dependencies: conversations + chat_messages (add_chat.sql), notifications +
--   type/reference_id/sender_id (add_notifications.sql,
--   add_notification_types.sql), push_messages (add_web_push.sql),
--   notification_preferences, listings.title, profiles.full_name.
-- ============================================================================

-- ── 1. Notify the other participant when a conversation is created ───────────
CREATE OR REPLACE FUNCTION public.notify_on_conversation_started()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_recipient UUID;
  v_initiator UUID;
  v_initiator_name TEXT;
  v_listing_title TEXT;
  v_link TEXT;
  v_title TEXT := 'New chat request';
  v_body TEXT;
  v_muted BOOLEAN;
  v_dup BOOLEAN;
BEGIN
  -- Resolve both sides: who opened the thread, and who should hear about it.
  IF v_actor = NEW.buyer_id THEN
    v_initiator := NEW.buyer_id;
    v_recipient := NEW.seller_id;
  ELSIF v_actor = NEW.seller_id THEN
    v_initiator := NEW.seller_id;
    v_recipient := NEW.buyer_id;
  ELSE
    -- No JWT (service role / seed): assume the buyer opened it.
    v_initiator := NEW.buyer_id;
    v_recipient := NEW.seller_id;
  END IF;

  IF v_recipient IS NULL OR v_recipient = v_initiator THEN
    RETURN NEW;
  END IF;

  -- Preference gate: chat muted at all → stay quiet.
  SELECT EXISTS (
    SELECT 1 FROM public.notification_preferences
    WHERE user_id = v_recipient
      AND type IN ('chat_started', 'chat_message')
      AND enabled = false
  ) INTO v_muted;
  IF v_muted THEN RETURN NEW; END IF;

  v_link := '/messages/' || NEW.id::text;

  SELECT NULLIF(split_part(coalesce(full_name, ''), ' ', 1), '')
  INTO v_initiator_name
  FROM public.profiles
  WHERE id = v_initiator;

  SELECT title INTO v_listing_title
  FROM public.listings
  WHERE id = NEW.listing_id;

  IF v_listing_title IS NOT NULL AND v_listing_title <> '' THEN
    v_body := coalesce(v_initiator_name, 'Someone')
              || ' started a chat about ' || v_listing_title;
  ELSE
    v_body := coalesce(v_initiator_name, 'Someone') || ' started a chat with you';
  END IF;

  -- Dedupe: the same thread already announced itself recently.
  SELECT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = v_recipient
      AND link = v_link
      AND type = 'chat_started'
      AND created_at > now() - interval '15 minutes'
  ) INTO v_dup;
  IF v_dup THEN RETURN NEW; END IF;

  INSERT INTO public.notifications (user_id, title, message, link,
                                    type, reference_id, sender_id)
  VALUES (v_recipient, v_title, v_body, v_link,
          'chat_started', NEW.id::text, v_initiator);

  INSERT INTO public.push_messages (title, body, link, user_id)
  VALUES (v_title, v_body, v_link, v_recipient);

  RETURN NEW;
END;
$$;

-- ── 2. Retire the placeholder once the first real message arrives ────────────
-- Runs BEFORE the message insert, so notify_on_chat_message() (AFTER INSERT)
-- writes its own row into a clean slot rather than on top of the placeholder.
CREATE OR REPLACE FUNCTION public.clear_chat_started_on_first_message()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_recipient UUID;
BEGIN
  SELECT CASE WHEN c.buyer_id = NEW.sender_id THEN c.seller_id ELSE c.buyer_id END
  INTO v_recipient
  FROM public.conversations c
  WHERE c.id = NEW.conversation_id;

  IF v_recipient IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only unread placeholders: once read, it is history the user may want.
  DELETE FROM public.notifications
  WHERE user_id = v_recipient
    AND link = '/messages/' || NEW.conversation_id::text
    AND type = 'chat_started'
    AND is_read = false;

  RETURN NEW;
END;
$$;

-- ── 3. Triggers ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_conversation_started_notification ON public.conversations;
CREATE TRIGGER trg_conversation_started_notification
AFTER INSERT ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_conversation_started();

DROP TRIGGER IF EXISTS trg_clear_chat_started ON public.chat_messages;
CREATE TRIGGER trg_clear_chat_started
BEFORE INSERT ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.clear_chat_started_on_first_message();

-- ── 4. Verify ───────────────────────────────────────────────────────────────
SELECT tgname, tgrelid::regclass AS on_table, tgtype
FROM pg_trigger
WHERE tgname IN ('trg_conversation_started_notification', 'trg_clear_chat_started')
  AND NOT tgisinternal
ORDER BY tgname;

SELECT proname, prosecdef
FROM pg_proc
WHERE proname IN ('notify_on_conversation_started', 'clear_chat_started_on_first_message')
ORDER BY proname;
