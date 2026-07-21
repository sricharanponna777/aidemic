-- Parent read access for teacher-set assignments.
--
-- Parents already read `assignment_attempts` (migration 20260720100000), but the
-- Assignments tab in the parent dashboard needs the assignment metadata (title,
-- due date, type) which lives in `assignments`, and it needs to know which
-- classes a linked child belongs to so it can list *not-yet-started* work too.
--
-- Both helpers are SECURITY DEFINER (running as the table owner, bypassing RLS)
-- to avoid the referenced tables' policies re-triggering RLS on each other --
-- the same pattern used by is_enrolled_in_class / is_teacher_of_class /
-- is_parent_of_student.

-- STEP 1: a class-scoped parenthood check for the assignments policy.
CREATE OR REPLACE FUNCTION is_parent_of_class_member(p_class_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM class_students cs
    JOIN parent_links pl ON pl.student_id = cs.student_id
    WHERE cs.class_id = p_class_id
      AND cs.status = 'active'
      AND pl.parent_id = auth.uid()
      AND pl.status = 'active'
  );
$$;

-- STEP 2: parents may SELECT assignments for any class a linked child is in.
DROP POLICY IF EXISTS "Parents can view assignments for linked students classes" ON assignments;
CREATE POLICY "Parents can view assignments for linked students classes"
  ON assignments FOR SELECT
  USING (is_parent_of_class_member(class_id));

-- STEP 3: parents may SELECT their linked children's class memberships, so the
-- dashboard can resolve which classes (and therefore which assignments) belong
-- to the selected child. is_parent_of_student is SECURITY DEFINER, so this does
-- not recurse into class_students' own policies.
DROP POLICY IF EXISTS "Parents can view linked students class memberships" ON class_students;
CREATE POLICY "Parents can view linked students class memberships"
  ON class_students FOR SELECT
  USING (is_parent_of_student(student_id));
