-- ============================================================================
-- Archive support for classes
-- ============================================================================
ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived'));

-- ============================================================================
-- Teachers need to update their own class rosters (e.g. removing a student by
-- setting status = 'inactive') -- only SELECT policies existed on
-- class_students before this.
-- ============================================================================
DROP POLICY IF EXISTS "Teachers can update their class rosters" ON class_students;
CREATE POLICY "Teachers can update their class rosters"
  ON class_students FOR UPDATE
  USING (is_teacher_of_class(class_id))
  WITH CHECK (is_teacher_of_class(class_id));
