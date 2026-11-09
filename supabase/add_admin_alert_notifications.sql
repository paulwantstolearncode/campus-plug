-- ============================================================================
-- Admin alert notifications: seller applications + new listing submissions
-- Behavior:
--   * profiles.seller_status flips to 'pending'  → every admin gets an
--     "New Seller Application" notification linking to /admin.
--   * listings.approval_status = 'pending' on INSERT → every admin gets a
--     "New Listing Awaiting Review" notification linking to /admin.
--   * Each notification row also enqueues a web push by inserting into
--     public.push_messages (consumed by the admin-push Edge Function, which
--     delivers OS-level notifications to subscribed browsers).
--
-- Why triggers: notifications RLS only lets a user insert rows for THEMSELVES,
-- so the applicant's browser can never write admin notifications. SECURITY
-- DEFINER functions insert as the table owner without loosening any policy.
--
-- Dedupe: repeated identical events within 15 minutes are skipped (a user
-- resubmitting an application or editing a pending listing won't spam admins).
--
-- Dependencies: notifications (add_notifications.sql), is_admin(),
--   push_subscriptions + push_messages (add_web_push.sql), pg_cron optional.
-- ============================================================================

-- ── 1. Trigger function: seller applications ───────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_admins_on_seller_application()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_admin UUID;
  v_recent BOOLEAN;
BEGIN
  -- Only fire when the status actually became 'pending' (not on every update)
  IF NEW.seller_status IS DISTINCT FROM 'pending'
     OR OLD.seller_status IS NOT DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  FOR v_admin IN
    SELECT id FROM public.profiles WHERE is_admin = true
  LOOP
    -- Skip if the same admin already saw this applicant in the last 15 min
    SELECT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE user_id = v_admin
        AND link = '/admin?tab=sellers&id=' || NEW.id::text
        AND created_at > now() - interval '15 minutes'
    ) INTO v_recent;
    IF v_recent THEN CONTINUE; END IF;

    INSERT INTO public.notifications (user_id, title, message, link)
    VALUES (
      v_admin,
      'New Seller Application',
      COALESCE(NEW.full_name, 'A student') || ' just applied to sell on Campus Plug. Review them in the admin panel.',
      '/admin?tab=sellers&id=' || NEW.id::text
    );

    INSERT INTO public.push_messages (title, body, link)
    VALUES (
      'New Seller Application',
      COALESCE(NEW.full_name, 'A student') || ' applied to become a seller.',
      '/admin?tab=sellers&id=' || NEW.id::text
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_seller_application ON public.profiles;
CREATE TRIGGER trg_admin_seller_application
AFTER UPDATE OF seller_status ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.notify_admins_on_seller_application();

-- ── 2. Trigger function: new listing submissions ───────────────────────────
-- Fires on INSERT (brand-new listing) and on UPDATE into 'pending' (a
-- previously approved listing reset to review after an edit — until staged
-- edits ship, that's the only signal that an edit needs re-review). When the
-- staged-edit flow lands, the UPDATE path stops occurring for approved
-- listings (edits go to listing_pending_edits instead) and this trigger
-- naturally degrades to INSERT-only.
CREATE OR REPLACE FUNCTION public.notify_admins_on_new_listing()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_admin UUID;
  v_seller_name TEXT;
  v_recent BOOLEAN;
  v_title TEXT;
BEGIN
  -- Only queue-worthy listings: pending approval and not soft-deleted
  IF NEW.approval_status IS DISTINCT FROM 'pending' OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- UPDATE path: only on the transition INTO pending. A no-op re-save of an
  -- already-pending row shouldn't re-alert.
  IF TG_OP = 'UPDATE' AND OLD.approval_status IS NOT DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_seller_name
  FROM public.profiles
  WHERE id = NEW.seller_id;

  IF TG_OP = 'UPDATE' THEN
    v_title := 'Listing Edit Awaiting Review';
  ELSE
    v_title := 'New Listing Awaiting Review';
  END IF;

  FOR v_admin IN
    SELECT id FROM public.profiles WHERE is_admin = true
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE user_id = v_admin
        AND title = v_title
        AND message = COALESCE(v_seller_name, 'A seller') || ' posted "' || NEW.title || '" — approve it in the admin panel.'
        AND created_at > now() - interval '15 minutes'
    ) INTO v_recent;
    IF v_recent THEN CONTINUE; END IF;

    INSERT INTO public.notifications (user_id, title, message, link)
    VALUES (
      v_admin,
      v_title,
      COALESCE(v_seller_name, 'A seller') || ' posted "' || NEW.title || '" — approve it in the admin panel.',
      '/admin?tab=listings&id=' || NEW.id::text
    );

    INSERT INTO public.push_messages (title, body, link)
    VALUES (
      v_title,
      COALESCE(v_seller_name, 'A seller') || ' posted "' || NEW.title || '".',
      '/admin?tab=listings&id=' || NEW.id::text
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_new_listing ON public.listings;
CREATE TRIGGER trg_admin_new_listing
AFTER INSERT OR UPDATE OF approval_status ON public.listings
FOR EACH ROW
EXECUTE FUNCTION public.notify_admins_on_new_listing();
