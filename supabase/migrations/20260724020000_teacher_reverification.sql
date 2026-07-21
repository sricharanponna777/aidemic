-- ============================================================================
-- Let a rejected teacher re-request verification.
--
-- When a school admin rejects a teacher, verification_status flips to
-- 'rejected' and the teacher has no way forward. This RPC flips their own
-- record from 'rejected' back to 'pending' so a school admin can review again.
--
-- Scoped to the caller's own teacher row and only the rejected -> pending
-- transition, so it can't be used to self-approve or touch anyone else.
-- ============================================================================
CREATE OR REPLACE FUNCTION request_teacher_reverification()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE teachers
  SET verification_status = 'pending'
  WHERE user_id = auth.uid()
    AND verification_status = 'rejected';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'No rejected teacher record to resubmit';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION request_teacher_reverification() FROM anon, public;
GRANT EXECUTE ON FUNCTION request_teacher_reverification() TO authenticated;
