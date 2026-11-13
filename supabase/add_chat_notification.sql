-- ============================================================================
-- Chat notifications: balanced batching trigger
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- Trigger: AFTER INSERT ON chat_messages → notify the other participant.
--
-- Balanced batching rule:
--   * No chat notification for this recipient + conversation in the last
--     5 minutes → individual notification (type='chat_message') + push, with
--     message preview.
--   * One exists within 5 minutes → update it to type='chat_batched' with
--     message "X sent you N more messages" (incrementing the count stored in
--     reference_id) rather than stacking.
--   * Older than 5 minutes → conversation reopened, fire individual again.
--
-- Each insert writes to both public.notifications and public.push_messages
-- (with user_id set so the admin-push Edge Function delivers per-user).
--
-- Preferences: respects notification_preferences.enabled for type
-- 'chat_message'. 15-minute dedupe on (user_id, link) as a safety net for
-- individual notifications (consistent with Phase 1).
--
-- Dependencies: chat_messages + conversations (add_chat.sql),
--   notification_preferences (add_notification_preferences.sql),
--   push_messages (add_web_push.sql), profiles.full_name.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_on_chat_message()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_recipient UUID;
  v_sender_name TEXT;
  v_link TEXT;
  v_existing_id UUID;
  v_existing_type TEXT;
  v_existing_created TIMESTAMPTZ;
  v_batch_count_text TEXT;
  v_batch_count INTEGER;
  v_pref_disabled BOOLEAN;
  v_message_preview TEXT;
  v_dup BOOLEAN;
BEGIN
  -- Find the recipient: the other participant in the conversation.
  SELECT CASE WHEN c.buyer_id = NEW.sender_id THEN c.seller_id ELSE c.buyer_id END
  INTO v_recipient
  FROM public.conversations c
  WHERE c.id = NEW.conversation_id;

  IF v_recipient IS NULL THEN
    RETURN NEW;
  END IF;

  -- Preference gate: skip if recipient muted chat_message.
  SELECT EXISTS (
    SELECT 1 FROM public.notification_preferences
    WHERE user_id = v_recipient
      AND type = 'chat_message'
      AND enabled = false
  ) INTO v_pref_disabled;
  IF v_pref_disabled THEN RETURN NEW; END IF;

  -- Sender name + message preview for the notification text.
  SELECT full_name INTO v_sender_name
  FROM public.profiles
  WHERE id = NEW.sender_id;

  v_link := '/messages/' || NEW.conversation_id::text;

  v_message_preview := CASE
    WHEN char_length(NEW.content) > 100 THEN substring(NEW.content from 1 for 100) || '…'
    ELSE NEW.content
  END;

  -- Look for the most recent chat notification for this recipient + conversation.
  SELECT id, type, created_at, reference_id
  INTO v_existing_id, v_existing_type, v_existing_created, v_batch_count_text
  FROM public.notifications
  WHERE user_id = v_recipient
    AND link = v_link
    AND type IN ('chat_message', 'chat_batched')
  ORDER BY created_at DESC
  LIMIT 1;

  -- Within the 5-minute batching window: update the existing notification
  -- instead of stacking a new one.
  IF v_existing_id IS NOT NULL
     AND v_existing_created > now() - interval '5 minutes' THEN

    IF v_existing_type = 'chat_message' THEN
      -- First follow-up within 5 min: convert individual → batched (count 2).
      v_batch_count := 2;
    ELSIF v_existing_type = 'chat_batched' THEN
      -- Increment the running batch count.
      v_batch_count := COALESCE(NULLIF(v_batch_count_text, '')::INTEGER, 1) + 1;
    ELSE
      v_batch_count := 2;
    END IF;

    UPDATE public.notifications
    SET type = 'chat_batched',
        title = 'New messages',
        message = COALESCE(v_sender_name, 'Someone') || ' sent you ' || v_batch_count || ' more messages',
        reference_id = v_batch_count::text,
        created_at = now(),
        is_read = false
    WHERE id = v_existing_id;

    INSERT INTO public.push_messages (title, body, link, user_id)
    VALUES (
      'New messages',
      COALESCE(v_sender_name, 'Someone') || ' sent you ' || v_batch_count || ' more messages',
      v_link,
      v_recipient
    );

  ELSE
    -- Outside the 5-minute window (or none exists): conversation reopened.
    -- 15-minute dedupe safety net: skip if an identical individual notification
    -- was already sent to this recipient for this link within 15 minutes.
    SELECT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE user_id = v_recipient
        AND link = v_link
        AND type = 'chat_message'
        AND created_at > now() - interval '15 minutes'
    ) INTO v_dup;
    IF v_dup THEN RETURN NEW; END IF;

    INSERT INTO public.notifications (user_id, title, message, link,
                                      type, reference_id, sender_id)
    VALUES (
      v_recipient,
      'New message',
      COALESCE(v_sender_name, 'Someone') || ': ' || v_message_preview,
      v_link,
      'chat_message',
      NEW.id::text,
      NEW.sender_id
    );

    INSERT INTO public.push_messages (title, body, link, user_id)
    VALUES (
      'New message',
      COALESCE(v_sender_name, 'Someone') || ': ' || v_message_preview,
      v_link,
      v_recipient
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_message_notification ON public.chat_messages;
CREATE TRIGGER trg_chat_message_notification
AFTER INSERT ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_chat_message();


-- ── Verify ───────────────────────────────────────────────────────────────────
SELECT tgname, tgrelid::regclass AS on_table
FROM pg_trigger
WHERE tgrelid = 'public.chat_messages'::regclass
  AND NOT tgisinternal
  AND tgname = 'trg_chat_message_notification';
