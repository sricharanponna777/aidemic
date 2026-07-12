-- ============================================================================
-- STEP 0: Ensure the shared updated_at trigger helper exists (idempotent;
-- matches queries.sql so this migration is self-contained on a fresh DB).
-- ============================================================================
CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 1: Role on user_profiles
-- ============================================================================
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'student';
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check CHECK (role IN ('student', 'teacher'));

-- ============================================================================
-- STEP 2: Teacher profile
-- ============================================================================
CREATE TABLE IF NOT EXISTS teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  school_name TEXT,
  department TEXT,
  qualification_level TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

DROP TRIGGER IF EXISTS teachers_set_updated_at ON teachers;
CREATE TRIGGER teachers_set_updated_at
BEFORE UPDATE ON teachers
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

-- ============================================================================
-- STEP 3: Classes
-- ============================================================================
CREATE TABLE IF NOT EXISTS classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  specification_id UUID REFERENCES specifications(id),
  academic_year TEXT,
  invite_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

DROP TRIGGER IF EXISTS classes_set_updated_at ON classes;
CREATE TRIGGER classes_set_updated_at
BEFORE UPDATE ON classes
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

-- ============================================================================
-- STEP 4: Class roster
-- ============================================================================
CREATE TABLE IF NOT EXISTS class_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  UNIQUE (class_id, student_id)
);

-- ============================================================================
-- STEP 5: Assignments
-- Question sets are generated once by the teacher (via the existing
-- generate-questions AI route) and stored denormalized as JSONB, matching the
-- exam_practice_attempts.questions_payload pattern -- no dependency on the
-- questions/mock_tests tables, which weren't designed for shared class use.
-- ============================================================================
CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  topic_id UUID REFERENCES topics(id) ON DELETE SET NULL,
  subtopic_id UUID REFERENCES subtopics(id) ON DELETE SET NULL,
  learning_objective_id UUID REFERENCES learning_objectives(id) ON DELETE SET NULL,
  assignment_type TEXT NOT NULL CHECK (assignment_type IN ('mock', 'practice', 'flashcard')),
  due_date TIMESTAMP WITH TIME ZONE,
  questions_payload JSONB NOT NULL DEFAULT '[]',
  source_material TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- STEP 6: Assignment attempts
-- ============================================================================
CREATE TABLE IF NOT EXISTS assignment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  answers_payload JSONB NOT NULL DEFAULT '[]',
  score NUMERIC,
  percentage NUMERIC,
  predicted_grade TEXT,
  ai_feedback JSONB,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  UNIQUE (assignment_id, student_id)
);

-- ============================================================================
-- STEP 7: Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_students_class_id ON class_students(class_id);
CREATE INDEX IF NOT EXISTS idx_class_students_student_id ON class_students(student_id);
CREATE INDEX IF NOT EXISTS idx_assignments_class_id ON assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_assignment_attempts_assignment_id ON assignment_attempts(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_attempts_student_id ON assignment_attempts(student_id);

-- ============================================================================
-- STEP 8: Row Level Security
-- ============================================================================

-- SECURITY DEFINER helpers for the classes <-> class_students cross-checks
-- below. "classes" and "class_students" each need to query the other to
-- decide visibility (a teacher's classes vs. a teacher's rosters); wrapping
-- both lookups as SECURITY DEFINER (which bypasses RLS, running as the table
-- owner) avoids the two tables' policies re-triggering each other, which
-- Postgres would otherwise detect as infinite recursion.
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

ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_attempts ENABLE ROW LEVEL SECURITY;

-- teachers: user-owned
DROP POLICY IF EXISTS "Users can view their own teacher profile" ON teachers;
CREATE POLICY "Users can view their own teacher profile"
  ON teachers FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create their own teacher profile" ON teachers;
CREATE POLICY "Users can create their own teacher profile"
  ON teachers FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own teacher profile" ON teachers;
CREATE POLICY "Users can update their own teacher profile"
  ON teachers FOR UPDATE USING (auth.uid() = user_id);

-- classes: owning teacher has full access; enrolled students can view
DROP POLICY IF EXISTS "Teachers can view their own classes" ON classes;
CREATE POLICY "Teachers can view their own classes"
  ON classes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM teachers
      WHERE teachers.id = classes.teacher_id
      AND teachers.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Students can view classes they belong to" ON classes;
CREATE POLICY "Students can view classes they belong to"
  ON classes FOR SELECT
  USING (is_enrolled_in_class(id));
DROP POLICY IF EXISTS "Teachers can create their own classes" ON classes;
CREATE POLICY "Teachers can create their own classes"
  ON classes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM teachers
      WHERE teachers.id = classes.teacher_id
      AND teachers.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Teachers can update their own classes" ON classes;
CREATE POLICY "Teachers can update their own classes"
  ON classes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM teachers
      WHERE teachers.id = classes.teacher_id
      AND teachers.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Teachers can delete their own classes" ON classes;
CREATE POLICY "Teachers can delete their own classes"
  ON classes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM teachers
      WHERE teachers.id = classes.teacher_id
      AND teachers.user_id = auth.uid()
    )
  );

-- class_students: students see their own membership; teachers see their
-- classes' rosters. No INSERT policy -- joining only happens through the
-- join_class_by_invite_code() SECURITY DEFINER function below, which bypasses
-- RLS, so a bare "anyone can view classes by invite code" policy is unneeded.
DROP POLICY IF EXISTS "Students can view their own class membership" ON class_students;
CREATE POLICY "Students can view their own class membership"
  ON class_students FOR SELECT USING (auth.uid() = student_id);
DROP POLICY IF EXISTS "Teachers can view their classes rosters" ON class_students;
CREATE POLICY "Teachers can view their classes rosters"
  ON class_students FOR SELECT
  USING (is_teacher_of_class(class_id));

-- assignments: owning teacher has full access; enrolled students can view
DROP POLICY IF EXISTS "Teachers can view their own assignments" ON assignments;
CREATE POLICY "Teachers can view their own assignments"
  ON assignments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM teachers
      WHERE teachers.id = assignments.teacher_id
      AND teachers.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Students can view assignments for their classes" ON assignments;
CREATE POLICY "Students can view assignments for their classes"
  ON assignments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM class_students
      WHERE class_students.class_id = assignments.class_id
      AND class_students.student_id = auth.uid()
      AND class_students.status = 'active'
    )
  );
DROP POLICY IF EXISTS "Teachers can create assignments for their classes" ON assignments;
CREATE POLICY "Teachers can create assignments for their classes"
  ON assignments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM teachers
      WHERE teachers.id = assignments.teacher_id
      AND teachers.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Teachers can update their own assignments" ON assignments;
CREATE POLICY "Teachers can update their own assignments"
  ON assignments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM teachers
      WHERE teachers.id = assignments.teacher_id
      AND teachers.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Teachers can delete their own assignments" ON assignments;
CREATE POLICY "Teachers can delete their own assignments"
  ON assignments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM teachers
      WHERE teachers.id = assignments.teacher_id
      AND teachers.user_id = auth.uid()
    )
  );

-- assignment_attempts: student owns their attempt (only for classes they've
-- joined); teacher can view attempts for their own classes' assignments.
DROP POLICY IF EXISTS "Students can view their own attempts" ON assignment_attempts;
CREATE POLICY "Students can view their own attempts"
  ON assignment_attempts FOR SELECT USING (auth.uid() = student_id);
DROP POLICY IF EXISTS "Students can create their own attempts" ON assignment_attempts;
CREATE POLICY "Students can create their own attempts"
  ON assignment_attempts FOR INSERT
  WITH CHECK (
    auth.uid() = student_id
    AND EXISTS (
      SELECT 1 FROM assignments
      JOIN class_students ON class_students.class_id = assignments.class_id
      WHERE assignments.id = assignment_attempts.assignment_id
      AND class_students.student_id = auth.uid()
      AND class_students.status = 'active'
    )
  );
DROP POLICY IF EXISTS "Students can update their own attempts" ON assignment_attempts;
CREATE POLICY "Students can update their own attempts"
  ON assignment_attempts FOR UPDATE USING (auth.uid() = student_id);
DROP POLICY IF EXISTS "Teachers can view attempts for their classes" ON assignment_attempts;
CREATE POLICY "Teachers can view attempts for their classes"
  ON assignment_attempts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM assignments
      JOIN classes ON classes.id = assignments.class_id
      JOIN teachers ON teachers.id = classes.teacher_id
      WHERE assignments.id = assignment_attempts.assignment_id
      AND teachers.user_id = auth.uid()
    )
  );

-- ============================================================================
-- STEP 9: Teachers need to read the display name/email of students enrolled
-- in their own classes for the roster view. user_profiles previously only
-- allowed a user to view their own row.
-- ============================================================================
DROP POLICY IF EXISTS "Teachers can view profiles of their students" ON user_profiles;
CREATE POLICY "Teachers can view profiles of their students"
  ON user_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM class_students
      JOIN classes ON classes.id = class_students.class_id
      JOIN teachers ON teachers.id = classes.teacher_id
      WHERE class_students.student_id = user_profiles.id
      AND teachers.user_id = auth.uid()
      AND class_students.status = 'active'
    )
  );

-- ============================================================================
-- STEP 10: Join-by-invite-code RPC
-- SECURITY DEFINER so a student can look up a class by its invite code without
-- needing a broad "anyone can view any class" SELECT policy on classes.
-- ============================================================================
CREATE OR REPLACE FUNCTION join_class_by_invite_code(p_invite_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_class_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT id INTO v_class_id FROM classes WHERE invite_code = upper(trim(p_invite_code));
  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  INSERT INTO class_students (class_id, student_id, status)
  VALUES (v_class_id, v_user_id, 'active')
  ON CONFLICT (class_id, student_id) DO UPDATE SET status = 'active';

  RETURN v_class_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION join_class_by_invite_code(TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION join_class_by_invite_code(TEXT) TO authenticated;
