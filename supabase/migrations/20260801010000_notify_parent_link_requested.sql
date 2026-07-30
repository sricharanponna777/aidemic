-- Migration: Notify student when parent submits link request
-- Purpose: Email the student immediately when a parent initiates a link request,
-- and make the existing activation notification link_source-aware
-- (parent-initiated activations should email the parent, not the student).

-- STEP 1: New trigger function — notify student of incoming parent link request

CREATE OR REPLACE FUNCTION notify_parent_link_requested()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url TEXT;
  v_secret TEXT;
BEGIN
  -- Only fire for parent-initiated pending requests (link_source='parent', status='pending').
  -- Teacher-generated codes don't need this notification (separate flow).
  IF NEW.link_source <> 'parent' THEN
    RETURN NEW;
  END IF;

  -- Fetch the function URL from app_config; no-op if not configured yet.
  SELECT value INTO v_url FROM app_config WHERE key = 'parent_link_requested_function_url';
  IF v_url IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_secret FROM app_config WHERE key = 'parent_link_requested_secret';

  -- POST to the edge function with the link details.
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-link-secret', coalesce(v_secret, '')),
    body := jsonb_build_object('student_id', NEW.student_id, 'parent_id', NEW.parent_id, 'link_id', NEW.id)
  );

  RETURN NEW;
END;
$$;

-- Trigger fires on INSERT of parent-initiated pending links.
DROP TRIGGER IF EXISTS parent_link_requested_notify ON parent_links;
CREATE TRIGGER parent_link_requested_notify
AFTER INSERT ON parent_links
FOR EACH ROW
WHEN (NEW.status = 'pending' AND NEW.link_source = 'parent')
EXECUTE FUNCTION notify_parent_link_requested();

-- STEP 2: Modify the existing activation trigger to be link_source-aware.
-- For parent-initiated links, we now want to email the PARENT (whose request was accepted).
-- For teacher-initiated links, keep emailing the STUDENT (unchanged).

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

  -- Include link_source in the payload so the edge function can pick the right recipient and copy.
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-link-secret', coalesce(v_secret, '')),
    body := jsonb_build_object('student_id', NEW.student_id, 'parent_id', NEW.parent_id, 'link_source', NEW.link_source)
  );

  RETURN NEW;
END;
$$;

-- Note: The trigger definition (AFTER UPDATE ... WHEN status flips to 'active') is not changed here,
-- so the existing trigger's condition/timing stays the same; only the function body was updated.

-- ============================================================================
-- Setup instructions for parent-link-requested edge function:
--
-- After applying this migration:
--   supabase functions deploy parent-link-requested --no-verify-jwt
--   supabase secrets set PARENT_LINK_REQUESTED_SECRET=some-random-string
--
-- Then, in the Supabase SQL editor:
--   insert into app_config (key, value) values
--     ('parent_link_requested_function_url', 'https://<project-ref>.functions.supabase.co/parent-link-requested'),
--     ('parent_link_requested_secret', 'some-random-string') -- must match PARENT_LINK_REQUESTED_SECRET above
--   on conflict (key) do update set value = excluded.value;
-- ============================================================================
