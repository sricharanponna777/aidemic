-- ============================================================================
-- Notify a student by email the moment a parent's invite code is redeemed
-- (parent_links.status flips 'pending' -> 'active'). Fires for both the
-- student-initiated and teacher-initiated invite flows, since both end by
-- going through redeem_parent_invite_code() (see 20260720100000).
-- ============================================================================

-- Reuses the app_config table + pg_net extension already created in
-- 20260720100000_add_parent_role_and_links.sql for the weekly digest.
CREATE OR REPLACE FUNCTION notify_parent_link_activated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url TEXT;
  v_secret TEXT;
BEGIN
  SELECT value INTO v_url FROM app_config WHERE key = 'parent_link_notification_function_url';
  IF v_url IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_secret FROM app_config WHERE key = 'parent_link_notification_secret';

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-link-secret', coalesce(v_secret, '')),
    body := jsonb_build_object('student_id', NEW.student_id, 'parent_id', NEW.parent_id)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS parent_link_activated_notify ON parent_links;
CREATE TRIGGER parent_link_activated_notify
AFTER UPDATE ON parent_links
FOR EACH ROW
WHEN (NEW.status = 'active' AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION notify_parent_link_activated();

-- ============================================================================
-- One-time setup after `supabase functions deploy parent-link-notification`
-- (see CLAUDE.md for the exact commands):
--
--   insert into app_config (key, value) values
--     ('parent_link_notification_function_url', 'https://<project-ref>.functions.supabase.co/parent-link-notification'),
--     ('parent_link_notification_secret', '<same value passed to `supabase secrets set PARENT_LINK_NOTIFICATION_SECRET=...`>')
--   on conflict (key) do update set value = excluded.value;
--
-- Until those rows exist, notify_parent_link_activated() is a safe no-op.
-- ============================================================================
