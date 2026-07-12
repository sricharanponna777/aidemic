-- ============================================================================
-- Fix infinite recursion between "classes" and "class_students" RLS policies.
--
-- "Students can view classes they belong to" (on classes) queries
-- class_students, while "Teachers can view their classes rosters" (on
-- class_students) queries classes right back. Evaluating either table's RLS
-- under a non-owner role re-triggers the other, which Postgres detects as
-- infinite recursion -- surfacing on any query that touches either table,
-- including indirectly (e.g. the user_profiles teacher-view policy, which
-- goes through class_students).
--
-- Move both self-referential lookups into SECURITY DEFINER functions, which
-- run as the table owner and therefore bypass RLS internally, breaking the
-- cycle.
-- ============================================================================
CREATE OR REPLACE FUNCTION is_teacher_of_class(p_class_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM classes
    JOIN teachers ON teachers.id = classes.teacher_id
    WHERE classes.id = p_class_id
    AND teachers.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION is_enrolled_in_class(p_class_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM class_students
    WHERE class_id = p_class_id
    AND student_id = auth.uid()
    AND status = 'active'
  );
$$;

DROP POLICY IF EXISTS "Students can view classes they belong to" ON classes;
CREATE POLICY "Students can view classes they belong to"
  ON classes FOR SELECT
  USING (is_enrolled_in_class(id));

DROP POLICY IF EXISTS "Teachers can view their classes rosters" ON class_students;
CREATE POLICY "Teachers can view their classes rosters"
  ON class_students FOR SELECT
  USING (is_teacher_of_class(class_id));
