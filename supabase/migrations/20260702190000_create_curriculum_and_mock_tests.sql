-- ============================================================================
-- STEP 1: Master curriculum tables
-- ============================================================================
CREATE TABLE IF NOT EXISTS curricula (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qualifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_id UUID REFERENCES curricula(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  level TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exam_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qualification_id UUID REFERENCES qualifications(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  website TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_board_id UUID REFERENCES exam_boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- STEP 2: Specification / syllabus tables
-- ============================================================================
CREATE TABLE IF NOT EXISTS specifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  code TEXT,
  name TEXT NOT NULL,
  tier TEXT,
  academic_year TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  specification_id UUID REFERENCES specifications(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  order_index INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subtopics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  order_index INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS learning_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subtopic_id UUID REFERENCES subtopics(id) ON DELETE CASCADE,
  code TEXT,
  objective TEXT NOT NULL,
  command_word TEXT,
  difficulty TEXT,
  estimated_minutes INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- STEP 3: Replace/extend user_subjects (kept in place; migrate later)
-- ============================================================================
CREATE TABLE IF NOT EXISTS student_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  specification_id UUID REFERENCES specifications(id) ON DELETE CASCADE,
  target_grade TEXT,
  current_grade TEXT,
  exam_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, specification_id)
);

-- ============================================================================
-- STEP 4: Question bank
-- ============================================================================
CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  learning_objective_id UUID REFERENCES learning_objectives(id) ON DELETE SET NULL,
  question_text TEXT NOT NULL,
  question_type TEXT,
  options JSONB DEFAULT '[]',
  correct_answer TEXT,
  mark_scheme JSONB,
  total_marks INT NOT NULL DEFAULT 1,
  difficulty TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- STEP 5: Mock tests
-- user_id is nullable to allow system-authored mock tests (created_by = 'system')
-- that are shared across all students, alongside user-authored ones.
-- ============================================================================
CREATE TABLE IF NOT EXISTS mock_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  student_subject_id UUID REFERENCES student_subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  test_type TEXT NOT NULL,
  duration_minutes INT,
  total_marks INT DEFAULT 0,
  status TEXT DEFAULT 'draft',
  created_by TEXT DEFAULT 'system',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mock_test_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mock_test_id UUID REFERENCES mock_tests(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  marks INT NOT NULL DEFAULT 1,
  order_index INT DEFAULT 0
);

-- ============================================================================
-- STEP 6: Mock test attempts
-- ============================================================================
CREATE TABLE IF NOT EXISTS mock_test_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mock_test_id UUID REFERENCES mock_tests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  marks_obtained INT DEFAULT 0,
  percentage NUMERIC,
  predicted_grade TEXT,
  time_taken_minutes INT,
  is_submitted BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS mock_test_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID REFERENCES mock_test_attempts(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  user_answer TEXT,
  marks_obtained INT DEFAULT 0,
  feedback TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- STEP 7: Term planner
-- ============================================================================
CREATE TABLE IF NOT EXISTS academic_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS study_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id UUID REFERENCES academic_terms(id) ON DELETE CASCADE,
  learning_objective_id UUID REFERENCES learning_objectives(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  planned_date DATE NOT NULL,
  estimated_minutes INT DEFAULT 30,
  status TEXT DEFAULT 'planned',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS study_plan_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_item_id UUID REFERENCES study_plan_items(id) ON DELETE CASCADE,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  time_spent_minutes INT,
  notes TEXT
);

-- ============================================================================
-- STEP 8: Analytics
-- ============================================================================
CREATE TABLE IF NOT EXISTS topic_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  attempts INT DEFAULT 0,
  avg_score NUMERIC DEFAULT 0,
  last_attempted TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, topic_id)
);

CREATE TABLE IF NOT EXISTS student_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  overall_accuracy NUMERIC DEFAULT 0,
  predicted_grade TEXT,
  study_streak INT DEFAULT 0,
  total_study_minutes INT DEFAULT 0,
  exam_readiness NUMERIC DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- STEP 9: Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_qualifications_curriculum_id ON qualifications(curriculum_id);
CREATE INDEX IF NOT EXISTS idx_exam_boards_qualification_id ON exam_boards(qualification_id);
CREATE INDEX IF NOT EXISTS idx_subjects_exam_board_id ON subjects(exam_board_id);
CREATE INDEX IF NOT EXISTS idx_specifications_subject_id ON specifications(subject_id);
CREATE INDEX IF NOT EXISTS idx_topics_specification_id ON topics(specification_id);
CREATE INDEX IF NOT EXISTS idx_subtopics_topic_id ON subtopics(topic_id);
CREATE INDEX IF NOT EXISTS idx_learning_objectives_subtopic_id ON learning_objectives(subtopic_id);
CREATE INDEX IF NOT EXISTS idx_student_subjects_user_id ON student_subjects(user_id);
CREATE INDEX IF NOT EXISTS idx_student_subjects_specification_id ON student_subjects(specification_id);
CREATE INDEX IF NOT EXISTS idx_questions_subject_id ON questions(subject_id);
CREATE INDEX IF NOT EXISTS idx_questions_learning_objective_id ON questions(learning_objective_id);
CREATE INDEX IF NOT EXISTS idx_mock_tests_user_id ON mock_tests(user_id);
CREATE INDEX IF NOT EXISTS idx_mock_tests_student_subject_id ON mock_tests(student_subject_id);
CREATE INDEX IF NOT EXISTS idx_mock_test_questions_mock_test_id ON mock_test_questions(mock_test_id);
CREATE INDEX IF NOT EXISTS idx_mock_test_questions_question_id ON mock_test_questions(question_id);
CREATE INDEX IF NOT EXISTS idx_mock_test_attempts_user_id ON mock_test_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_mock_test_attempts_mock_test_id ON mock_test_attempts(mock_test_id);
CREATE INDEX IF NOT EXISTS idx_mock_test_answers_attempt_id ON mock_test_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_mock_test_answers_question_id ON mock_test_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_academic_terms_user_id ON academic_terms(user_id);
CREATE INDEX IF NOT EXISTS idx_study_plan_items_term_id ON study_plan_items(term_id);
CREATE INDEX IF NOT EXISTS idx_study_plan_items_learning_objective_id ON study_plan_items(learning_objective_id);
CREATE INDEX IF NOT EXISTS idx_study_plan_progress_plan_item_id ON study_plan_progress(plan_item_id);
CREATE INDEX IF NOT EXISTS idx_topic_performance_topic_id ON topic_performance(topic_id);

-- ============================================================================
-- STEP 10: Row Level Security
-- ============================================================================

-- Master curriculum data is global reference data: readable by anyone,
-- writable only via migrations/service role (no write policies for users).
ALTER TABLE curricula ENABLE ROW LEVEL SECURITY;
ALTER TABLE qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE specifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtopics ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_objectives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view curricula" ON curricula;
CREATE POLICY "Anyone can view curricula" ON curricula FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can view qualifications" ON qualifications;
CREATE POLICY "Anyone can view qualifications" ON qualifications FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can view exam boards" ON exam_boards;
CREATE POLICY "Anyone can view exam boards" ON exam_boards FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can view subjects" ON subjects;
CREATE POLICY "Anyone can view subjects" ON subjects FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can view specifications" ON specifications;
CREATE POLICY "Anyone can view specifications" ON specifications FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can view topics" ON topics;
CREATE POLICY "Anyone can view topics" ON topics FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can view subtopics" ON subtopics;
CREATE POLICY "Anyone can view subtopics" ON subtopics FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can view learning objectives" ON learning_objectives;
CREATE POLICY "Anyone can view learning objectives" ON learning_objectives FOR SELECT USING (true);

-- questions holds correct_answer/mark_scheme: intentionally NOT given a public
-- SELECT policy, so students can't fetch answer keys directly via the REST
-- API. Serve questions to students through a server-side route using the
-- service role key instead. RLS is still enabled so the default is deny-all.
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

-- mock_test_questions is readable when its parent mock test is visible
-- (owned by the user, or a system-wide test with no owner).
ALTER TABLE mock_test_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view questions in accessible mock tests" ON mock_test_questions;
CREATE POLICY "Users can view questions in accessible mock tests"
  ON mock_test_questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM mock_tests
      WHERE mock_tests.id = mock_test_questions.mock_test_id
      AND (mock_tests.user_id = auth.uid() OR mock_tests.user_id IS NULL)
    )
  );

-- student_subjects: user-owned
ALTER TABLE student_subjects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own student subjects" ON student_subjects;
CREATE POLICY "Users can view their own student subjects"
  ON student_subjects FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create their own student subjects" ON student_subjects;
CREATE POLICY "Users can create their own student subjects"
  ON student_subjects FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own student subjects" ON student_subjects;
CREATE POLICY "Users can update their own student subjects"
  ON student_subjects FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own student subjects" ON student_subjects;
CREATE POLICY "Users can delete their own student subjects"
  ON student_subjects FOR DELETE USING (auth.uid() = user_id);

-- mock_tests: visible if owned by the user, or system-wide (user_id IS NULL)
ALTER TABLE mock_tests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view accessible mock tests" ON mock_tests;
CREATE POLICY "Users can view accessible mock tests"
  ON mock_tests FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
DROP POLICY IF EXISTS "Users can create their own mock tests" ON mock_tests;
CREATE POLICY "Users can create their own mock tests"
  ON mock_tests FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own mock tests" ON mock_tests;
CREATE POLICY "Users can update their own mock tests"
  ON mock_tests FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own mock tests" ON mock_tests;
CREATE POLICY "Users can delete their own mock tests"
  ON mock_tests FOR DELETE USING (auth.uid() = user_id);

-- mock_test_attempts: user-owned
ALTER TABLE mock_test_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own mock test attempts" ON mock_test_attempts;
CREATE POLICY "Users can view their own mock test attempts"
  ON mock_test_attempts FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create their own mock test attempts" ON mock_test_attempts;
CREATE POLICY "Users can create their own mock test attempts"
  ON mock_test_attempts FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own mock test attempts" ON mock_test_attempts;
CREATE POLICY "Users can update their own mock test attempts"
  ON mock_test_attempts FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own mock test attempts" ON mock_test_attempts;
CREATE POLICY "Users can delete their own mock test attempts"
  ON mock_test_attempts FOR DELETE USING (auth.uid() = user_id);

-- mock_test_answers: scoped through the owning attempt
ALTER TABLE mock_test_answers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view answers for their own attempts" ON mock_test_answers;
CREATE POLICY "Users can view answers for their own attempts"
  ON mock_test_answers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM mock_test_attempts
      WHERE mock_test_attempts.id = mock_test_answers.attempt_id
      AND mock_test_attempts.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Users can create answers for their own attempts" ON mock_test_answers;
CREATE POLICY "Users can create answers for their own attempts"
  ON mock_test_answers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM mock_test_attempts
      WHERE mock_test_attempts.id = mock_test_answers.attempt_id
      AND mock_test_attempts.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Users can update answers for their own attempts" ON mock_test_answers;
CREATE POLICY "Users can update answers for their own attempts"
  ON mock_test_answers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM mock_test_attempts
      WHERE mock_test_attempts.id = mock_test_answers.attempt_id
      AND mock_test_attempts.user_id = auth.uid()
    )
  );

-- academic_terms: user-owned
ALTER TABLE academic_terms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own academic terms" ON academic_terms;
CREATE POLICY "Users can view their own academic terms"
  ON academic_terms FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create their own academic terms" ON academic_terms;
CREATE POLICY "Users can create their own academic terms"
  ON academic_terms FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own academic terms" ON academic_terms;
CREATE POLICY "Users can update their own academic terms"
  ON academic_terms FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own academic terms" ON academic_terms;
CREATE POLICY "Users can delete their own academic terms"
  ON academic_terms FOR DELETE USING (auth.uid() = user_id);

-- study_plan_items: scoped through the owning term
ALTER TABLE study_plan_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own study plan items" ON study_plan_items;
CREATE POLICY "Users can view their own study plan items"
  ON study_plan_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM academic_terms
      WHERE academic_terms.id = study_plan_items.term_id
      AND academic_terms.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Users can create their own study plan items" ON study_plan_items;
CREATE POLICY "Users can create their own study plan items"
  ON study_plan_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM academic_terms
      WHERE academic_terms.id = study_plan_items.term_id
      AND academic_terms.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Users can update their own study plan items" ON study_plan_items;
CREATE POLICY "Users can update their own study plan items"
  ON study_plan_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM academic_terms
      WHERE academic_terms.id = study_plan_items.term_id
      AND academic_terms.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Users can delete their own study plan items" ON study_plan_items;
CREATE POLICY "Users can delete their own study plan items"
  ON study_plan_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM academic_terms
      WHERE academic_terms.id = study_plan_items.term_id
      AND academic_terms.user_id = auth.uid()
    )
  );

-- study_plan_progress: scoped through the owning plan item -> term
ALTER TABLE study_plan_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own study plan progress" ON study_plan_progress;
CREATE POLICY "Users can view their own study plan progress"
  ON study_plan_progress FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM study_plan_items
      JOIN academic_terms ON academic_terms.id = study_plan_items.term_id
      WHERE study_plan_items.id = study_plan_progress.plan_item_id
      AND academic_terms.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Users can create their own study plan progress" ON study_plan_progress;
CREATE POLICY "Users can create their own study plan progress"
  ON study_plan_progress FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM study_plan_items
      JOIN academic_terms ON academic_terms.id = study_plan_items.term_id
      WHERE study_plan_items.id = study_plan_progress.plan_item_id
      AND academic_terms.user_id = auth.uid()
    )
  );

-- topic_performance: user-owned
ALTER TABLE topic_performance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own topic performance" ON topic_performance;
CREATE POLICY "Users can view their own topic performance"
  ON topic_performance FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create their own topic performance" ON topic_performance;
CREATE POLICY "Users can create their own topic performance"
  ON topic_performance FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own topic performance" ON topic_performance;
CREATE POLICY "Users can update their own topic performance"
  ON topic_performance FOR UPDATE USING (auth.uid() = user_id);

-- student_analytics: user-owned
ALTER TABLE student_analytics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own analytics" ON student_analytics;
CREATE POLICY "Users can view their own analytics"
  ON student_analytics FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create their own analytics" ON student_analytics;
CREATE POLICY "Users can create their own analytics"
  ON student_analytics FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own analytics" ON student_analytics;
CREATE POLICY "Users can update their own analytics"
  ON student_analytics FOR UPDATE USING (auth.uid() = user_id);
