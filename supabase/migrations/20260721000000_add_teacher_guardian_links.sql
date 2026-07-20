-- ============================================================================
-- Teacher/school-admin-initiated parent links ("guardian-guaranteed" access).
--
-- The existing parent_links flow (20260720100000) is entirely student-consent
-- driven: the student creates the code and can revoke at will. This adds a
-- second, parallel link_source where a teacher (for their own class roster)
-- or a school-admin teacher (for their whole school) generates the invite
-- code instead, and only a teacher/school-admin can revoke it -- a student
-- can request removal but not unilaterally cut access.
-- ============================================================================

-- STEP 1: Extend parent_links
ALTER TABLE parent_links ADD COLUMN IF NOT EXISTS link_source TEXT NOT NULL DEFAULT 'student' CHECK (link_source IN ('student', 'teacher'));
ALTER TABLE parent_links ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE parent_links ADD COLUMN IF NOT EXISTS revocation_requested_at TIMESTAMP WITH TIME ZONE;

-- STEP 2: Narrow the student revoke policy to student-created links only --
-- teacher-created links get no direct student UPDATE policy; all mutation on
-- them goes through the SECURITY DEFINER RPCs below.
DROP POLICY IF EXISTS "Students can revoke their own parent links" ON parent_links;
CREATE POLICY "Students can revoke their own parent links"
  ON parent_links FOR UPDATE
  USING (auth.uid() = student_id AND link_source = 'student')
  WITH CHECK (auth.uid() = student_id AND link_source = 'student');

-- STEP 3: Helpers -- is this caller a teacher/school-admin authorized over
-- this student, mirroring is_teacher_of_class / is_school_admin_for.
CREATE OR REPLACE FUNCTION is_teacher_of_student(p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM class_students
    JOIN classes ON classes.id = class_students.class_id
    JOIN teachers ON teachers.id = classes.teacher_id
    WHERE class_students.student_id = p_student_id
    AND class_students.status = 'active'
    AND teachers.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION is_school_admin_of_student(p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM class_students
    JOIN classes ON classes.id = class_students.class_id
    JOIN teachers ON teachers.id = classes.teacher_id
    WHERE class_students.student_id = p_student_id
    AND class_students.status = 'active'
    AND teachers.school_id IS NOT NULL
    AND is_school_admin_for(teachers.school_id)
  );
$$;

-- STEP 4: RPCs
CREATE OR REPLACE FUNCTION generate_parent_link_invite_code(p_student_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_attempt INT := 0;
BEGIN
  IF NOT (is_teacher_of_student(p_student_id) OR is_school_admin_of_student(p_student_id)) THEN
    RAISE EXCEPTION 'Not authorized to link a parent for this student';
  END IF;

  LOOP
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM parent_links WHERE invite_code = v_code);
    v_attempt := v_attempt + 1;
    IF v_attempt > 20 THEN
      RAISE EXCEPTION 'Could not generate a unique invite code, please try again';
    END IF;
  END LOOP;

  INSERT INTO parent_links (student_id, invite_code, link_source, created_by, status)
  VALUES (p_student_id, v_code, 'teacher', auth.uid(), 'pending');

  RETURN v_code;
END;
$$;

REVOKE EXECUTE ON FUNCTION generate_parent_link_invite_code(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION generate_parent_link_invite_code(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION request_parent_link_revocation(p_link_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE parent_links
  SET revocation_requested_at = COALESCE(revocation_requested_at, NOW())
  WHERE id = p_link_id
  AND student_id = auth.uid()
  AND link_source = 'teacher'
  AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Link not found or not eligible for a removal request';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION request_parent_link_revocation(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION request_parent_link_revocation(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION revoke_parent_link(p_link_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id UUID;
BEGIN
  SELECT student_id INTO v_student_id FROM parent_links WHERE id = p_link_id;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Link not found';
  END IF;

  IF NOT (is_teacher_of_student(v_student_id) OR is_school_admin_of_student(v_student_id)) THEN
    RAISE EXCEPTION 'Not authorized to revoke this link';
  END IF;

  UPDATE parent_links SET status = 'revoked' WHERE id = p_link_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION revoke_parent_link(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION revoke_parent_link(UUID) TO authenticated;

-- STEP 5: Teachers/school-admins need to see the links they administer.
DROP POLICY IF EXISTS "Teachers can view links they created" ON parent_links;
CREATE POLICY "Teachers can view links they created"
  ON parent_links FOR SELECT
  USING (link_source = 'teacher' AND (is_teacher_of_student(student_id) OR is_school_admin_of_student(student_id)));

-- STEP 6: School-admin teachers need to see the whole school's roster (not
-- just their own classes) so they can link parents for any student at their
-- school. Regular teachers already see their own classes/rosters/profiles
-- via the policies in 20260706100000.
DROP POLICY IF EXISTS "School admins can view classes at their school" ON classes;
CREATE POLICY "School admins can view classes at their school"
  ON classes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM teachers
      WHERE teachers.id = classes.teacher_id
      AND teachers.school_id IS NOT NULL
      AND is_school_admin_for(teachers.school_id)
    )
  );

DROP POLICY IF EXISTS "School admins can view rosters at their school" ON class_students;
CREATE POLICY "School admins can view rosters at their school"
  ON class_students FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM classes
      JOIN teachers ON teachers.id = classes.teacher_id
      WHERE classes.id = class_students.class_id
      AND teachers.school_id IS NOT NULL
      AND is_school_admin_for(teachers.school_id)
    )
  );

DROP POLICY IF EXISTS "School admins can view profiles of students at their school" ON user_profiles;
CREATE POLICY "School admins can view profiles of students at their school"
  ON user_profiles FOR SELECT
  USING (is_school_admin_of_student(id));

-- STEP 7: A teacher/school-admin who created a link must see WHO redeemed it
-- (so the ParentLinksPanel can show the parent's name/email instead of a
-- placeholder). Scoped to teacher-created links only -- a parent the student
-- linked privately stays invisible to the teacher. SECURITY DEFINER so the
-- parent_links lookup bypasses RLS and can't recurse into this policy.
CREATE OR REPLACE FUNCTION is_teacher_linked_parent(p_parent_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM parent_links
    WHERE parent_links.parent_id = p_parent_id
    AND parent_links.link_source = 'teacher'
    AND (is_teacher_of_student(parent_links.student_id) OR is_school_admin_of_student(parent_links.student_id))
  );
$$;

DROP POLICY IF EXISTS "Teachers can view profiles of parents they linked" ON user_profiles;
CREATE POLICY "Teachers can view profiles of parents they linked"
  ON user_profiles FOR SELECT
  USING (is_teacher_linked_parent(id));
