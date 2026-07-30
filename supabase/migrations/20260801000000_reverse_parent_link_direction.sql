-- Migration: Reverse parent-student link direction
-- Purpose: Flip the flow from student-initiated (student generates code, parent redeems)
-- to parent-initiated (parent enters student email/username, student accepts/declines)

-- STEP 1: Schema changes

-- Make invite_code nullable for parent-initiated rows (which won't have codes)
ALTER TABLE parent_links ALTER COLUMN invite_code DROP NOT NULL;

-- Expand link_source enum to include 'parent'
ALTER TABLE parent_links DROP CONSTRAINT parent_links_link_source_check;
ALTER TABLE parent_links ADD CONSTRAINT parent_links_link_source_check
  CHECK (link_source IN ('student', 'teacher', 'parent'));

-- Race guard: prevent double-submitting a request (check-then-insert vulnerable window).
-- Unique index ensures at most one active or pending row per (student, parent) pair.
CREATE UNIQUE INDEX IF NOT EXISTS parent_links_unique_active_pending_pair
  ON parent_links (student_id, parent_id)
  WHERE status IN ('pending', 'active') AND parent_id IS NOT NULL;

-- STEP 2: RLS changes

-- Drop the old flow: students no longer generate their own invite codes.
DROP POLICY IF EXISTS "Students can create their own pending parent links" ON parent_links;

-- Note: "Students can revoke their own parent links" (scoped to link_source='student')
-- and all other existing SELECT policies remain unchanged — they already expose new
-- link_source='parent' rows correctly with no edits needed.

-- STEP 3: New RPC — parent requests a link by student email/username

CREATE OR REPLACE FUNCTION request_parent_link(p_identifier TEXT)
RETURNS TABLE(link_id UUID, student_id UUID, student_display_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_id UUID := auth.uid();
  v_identifier TEXT := trim(p_identifier);
  v_student RECORD;
  v_existing_status TEXT;
  v_link_id UUID;
BEGIN
  IF v_parent_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF v_identifier = '' THEN
    RAISE EXCEPTION 'No student found with that email or username';
  END IF;

  -- Try username first: it has a global unique partial index (WHERE username IS NOT NULL),
  -- so at most one match. Only fall back to email if no username matches.
  SELECT id, email, full_name, first_name, username INTO v_student
  FROM user_profiles
  WHERE role = 'student' AND lower(username) = lower(v_identifier);

  IF v_student.id IS NULL THEN
    -- Check for email ambiguity before proceeding.
    IF (SELECT count(*) FROM user_profiles WHERE role = 'student' AND lower(email) = lower(v_identifier)) > 1 THEN
      RAISE EXCEPTION 'Multiple accounts match that email — ask your child for their username instead';
    END IF;
    -- Fallback to email match.
    SELECT id, email, full_name, first_name, username INTO v_student
    FROM user_profiles
    WHERE role = 'student' AND lower(email) = lower(v_identifier);
  END IF;

  IF v_student.id IS NULL THEN
    RAISE EXCEPTION 'No student found with that email or username';
  END IF;
  IF v_student.id = v_parent_id THEN
    RAISE EXCEPTION 'You cannot link to your own account';
  END IF;

  -- Check for existing relationship (only the most recent row per this parent+student pair).
  SELECT status INTO v_existing_status FROM parent_links
  WHERE parent_links.student_id = v_student.id AND parent_links.parent_id = v_parent_id
  ORDER BY created_at DESC LIMIT 1;

  IF v_existing_status = 'active' THEN
    RAISE EXCEPTION 'You are already linked to this student';
  ELSIF v_existing_status = 'pending' THEN
    RAISE EXCEPTION 'A request is already pending for this student';
  END IF;
  -- v_existing_status = 'revoked' or NULL: fall through and insert a fresh row.
  -- We deliberately insert rather than reuse/update, to preserve revoked rows as an audit trail.

  BEGIN
    INSERT INTO parent_links (student_id, parent_id, invite_code, status, link_source, created_by)
    VALUES (v_student.id, v_parent_id, NULL, 'pending', 'parent', v_parent_id)
    RETURNING id INTO v_link_id;
  EXCEPTION WHEN unique_violation THEN
    -- Race: another request for this pair was just inserted. Re-raise the pending error.
    RAISE EXCEPTION 'A request is already pending for this student';
  END;

  RETURN QUERY SELECT v_link_id, v_student.id,
    COALESCE(v_student.full_name, v_student.first_name, v_student.username, v_student.email);
END;
$$;

REVOKE EXECUTE ON FUNCTION request_parent_link(TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION request_parent_link(TEXT) TO authenticated;

-- STEP 4: New RPCs — student accepts or declines a pending parent request

CREATE OR REPLACE FUNCTION accept_parent_link_request(p_link_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE parent_links
  SET status = 'active'
  WHERE id = p_link_id AND student_id = auth.uid() AND link_source = 'parent' AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or already handled';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION decline_parent_link_request(p_link_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE parent_links
  SET status = 'revoked'
  WHERE id = p_link_id AND student_id = auth.uid() AND link_source = 'parent' AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or already handled';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION accept_parent_link_request(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION accept_parent_link_request(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION decline_parent_link_request(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION decline_parent_link_request(UUID) TO authenticated;
