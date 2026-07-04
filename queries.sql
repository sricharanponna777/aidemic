-- Destructive schema recreation for AIDemic (DROP + CREATE)
-- BACKUP your data before running this script!

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================================
-- DROP TABLES (destructive)
-- ============================================================================
DROP TABLE IF EXISTS flashcard_tag_mapping CASCADE;
DROP TABLE IF EXISTS flashcard_tags CASCADE;
DROP TABLE IF EXISTS flashcards CASCADE;
DROP TABLE IF EXISTS flashcard_decks CASCADE;
DROP TABLE IF EXISTS study_session_results CASCADE;
DROP TABLE IF EXISTS study_sessions CASCADE;
DROP TABLE IF EXISTS study_goals CASCADE;
DROP TABLE IF EXISTS user_statistics CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;
DROP TABLE IF EXISTS generated_videos CASCADE;
DROP TABLE IF EXISTS exam_practice_attempts CASCADE;
DROP TABLE IF EXISTS user_subjects CASCADE;
DROP TABLE IF EXISTS study_plan_progress CASCADE;
DROP TABLE IF EXISTS study_plan_items CASCADE;
DROP TABLE IF EXISTS academic_terms CASCADE;
DROP TABLE IF EXISTS student_analytics CASCADE;
DROP TABLE IF EXISTS topic_performance CASCADE;
DROP TABLE IF EXISTS mock_test_answers CASCADE;
DROP TABLE IF EXISTS mock_test_attempts CASCADE;
DROP TABLE IF EXISTS mock_test_questions CASCADE;
DROP TABLE IF EXISTS mock_tests CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS student_subjects CASCADE;
DROP TABLE IF EXISTS learning_objectives CASCADE;
DROP TABLE IF EXISTS subtopics CASCADE;
DROP TABLE IF EXISTS topics CASCADE;
DROP TABLE IF EXISTS specifications CASCADE;
DROP TABLE IF EXISTS subjects CASCADE;
DROP TABLE IF EXISTS exam_boards CASCADE;
DROP TABLE IF EXISTS qualifications CASCADE;
DROP TABLE IF EXISTS curricula CASCADE;

-- ============================================================================
-- CREATE TABLES
-- ============================================================================

-- USER PROFILES
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  preferred_study_time TEXT, -- e.g., "morning", "afternoon", "evening"
  daily_study_goal_minutes INT DEFAULT 30,
  country TEXT DEFAULT 'uk',
  theme TEXT DEFAULT 'light', -- light or dark
  notifications_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- FLASHCARD DECKS
CREATE TABLE flashcard_decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  difficulty_level TEXT DEFAULT 'medium', -- easy, medium, hard
  card_count INT DEFAULT 0,
  is_public BOOLEAN DEFAULT false,
  ai_generated BOOLEAN DEFAULT false,
  ai_prompt TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT deck_name_per_user UNIQUE (user_id, name)
);

-- FLASHCARD TAGS
CREATE TABLE flashcard_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id UUID NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3b82f6',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT tag_name_per_deck UNIQUE (deck_id, name)
);

-- FLASHCARDS
CREATE TABLE flashcards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id UUID NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  ai_generated BOOLEAN DEFAULT false,
  difficulty_rating INT DEFAULT 3, -- 1-5
  times_studied INT DEFAULT 0,
  times_correct INT DEFAULT 0,
  last_studied_at TIMESTAMP WITH TIME ZONE,
  ease_factor DECIMAL(3, 2) DEFAULT 2.5,
  interval_days INT DEFAULT 0,
  next_review_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  repetition_count INT DEFAULT 0,
  consecutive_correct INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- FLASHCARD_TAG_MAPPING
CREATE TABLE flashcard_tag_mapping (
  flashcard_id UUID NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES flashcard_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (flashcard_id, tag_id)
);

-- STUDY SESSIONS
CREATE TABLE study_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deck_id UUID NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_minutes INT,
  cards_studied INT DEFAULT 0,
  cards_correct INT DEFAULT 0,
  score_percentage INT,
  difficulty_level TEXT,
  ai_recommendations TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- STUDY SESSION RESULTS
CREATE TABLE study_session_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
  flashcard_id UUID NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  was_correct BOOLEAN NOT NULL,
  time_to_answer_seconds INT,
  confidence_level INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- USER STATISTICS
CREATE TABLE user_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  total_study_minutes INT DEFAULT 0,
  total_sessions INT DEFAULT 0,
  total_cards_studied INT DEFAULT 0,
  average_score DECIMAL(5, 2) DEFAULT 0,
  current_streak_days INT DEFAULT 0,
  longest_streak_days INT DEFAULT 0,
  last_study_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- STUDY GOALS
CREATE TABLE study_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deck_id UUID NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
  goal_type TEXT NOT NULL,
  target_value INT NOT NULL,
  current_progress INT DEFAULT 0,
  deadline DATE,
  is_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- GENERATED VIDEOS
CREATE TABLE generated_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flashcard_id UUID REFERENCES flashcards(id) ON DELETE SET NULL,
  concept TEXT NOT NULL,
  subject TEXT NOT NULL,
  style TEXT NOT NULL,
  duration INT NOT NULL,
  service_used TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  video_url TEXT,
  script_content TEXT,
  external_id TEXT,           -- fal.ai request_id for polling
  estimated_completion TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- USER SUBJECTS
CREATE TABLE user_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  exam_board TEXT NOT NULL,
  exam_type TEXT NOT NULL,
  spec_name TEXT,
  spec_tier TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- EXAM PRACTICE ATTEMPTS
CREATE TABLE exam_practice_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  exam_board TEXT NOT NULL,
  exam_type TEXT NOT NULL,
  topic TEXT NOT NULL,
  total_marks_awarded INT NOT NULL DEFAULT 0,
  total_available_marks INT NOT NULL DEFAULT 0,
  percentage INT NOT NULL DEFAULT 0,
  predicted_grade TEXT NOT NULL,
  weakness_tags TEXT[] NOT NULL DEFAULT '{}',
  weakness_analysis TEXT[] NOT NULL DEFAULT '{}',
  questions_payload JSONB NOT NULL DEFAULT '[]',
  answers_payload JSONB NOT NULL DEFAULT '[]',
  marking_report JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- MASTER CURRICULUM (global reference data)
-- ============================================================================
CREATE TABLE curricula (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE qualifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_id UUID REFERENCES curricula(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  level TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE exam_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qualification_id UUID REFERENCES qualifications(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  website TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_board_id UUID REFERENCES exam_boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- SPECIFICATION / SYLLABUS
CREATE TABLE specifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  code TEXT,
  name TEXT NOT NULL,
  tier TEXT,
  academic_year TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  specification_id UUID REFERENCES specifications(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  order_index INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE subtopics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  order_index INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE learning_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subtopic_id UUID REFERENCES subtopics(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  code TEXT,
  objective TEXT NOT NULL,
  command_word TEXT,
  difficulty TEXT,
  estimated_minutes INT,
  applies_to TEXT[] NOT NULL DEFAULT ARRAY['notes', 'flashcards', 'exam_practice'],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT learning_objectives_scope_check CHECK (
    (subtopic_id IS NOT NULL AND subject_id IS NULL) OR
    (subtopic_id IS NULL AND subject_id IS NOT NULL)
  )
);

-- STUDENT SUBJECTS (extends user_subjects; user_subjects kept for now)
CREATE TABLE student_subjects (
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
-- QUESTION BANK
-- ============================================================================
CREATE TABLE questions (
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
-- MOCK TESTS
-- user_id is nullable to allow system-authored mock tests (created_by =
-- 'system') that are shared across all students, alongside user-authored ones.
-- ============================================================================
CREATE TABLE mock_tests (
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

CREATE TABLE mock_test_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mock_test_id UUID REFERENCES mock_tests(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  marks INT NOT NULL DEFAULT 1,
  order_index INT DEFAULT 0
);

-- MOCK TEST ATTEMPTS
CREATE TABLE mock_test_attempts (
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

CREATE TABLE mock_test_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID REFERENCES mock_test_attempts(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  user_answer TEXT,
  marks_obtained INT DEFAULT 0,
  feedback TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- TERM PLANNER
-- ============================================================================
CREATE TABLE academic_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE study_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id UUID REFERENCES academic_terms(id) ON DELETE CASCADE,
  learning_objective_id UUID REFERENCES learning_objectives(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  planned_date DATE NOT NULL,
  estimated_minutes INT DEFAULT 30,
  status TEXT DEFAULT 'planned',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE study_plan_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_item_id UUID REFERENCES study_plan_items(id) ON DELETE CASCADE,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  time_spent_minutes INT,
  notes TEXT
);

-- ============================================================================
-- ANALYTICS
-- ============================================================================
CREATE TABLE topic_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  attempts INT DEFAULT 0,
  avg_score NUMERIC DEFAULT 0,
  last_attempted TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, topic_id)
);

CREATE TABLE student_analytics (
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
-- INDEXES (recreate)
-- ============================================================================
CREATE INDEX idx_flashcard_decks_user_id ON flashcard_decks(user_id);
CREATE INDEX idx_flashcards_deck_id ON flashcards(deck_id);
CREATE INDEX idx_flashcard_tags_deck_id ON flashcard_tags(deck_id);
CREATE INDEX idx_flashcard_tag_mapping_flashcard ON flashcard_tag_mapping(flashcard_id);
CREATE INDEX idx_flashcard_tag_mapping_tag ON flashcard_tag_mapping(tag_id);
CREATE INDEX idx_study_sessions_user_id ON study_sessions(user_id);
CREATE INDEX idx_study_sessions_deck_id ON study_sessions(deck_id);
CREATE INDEX idx_study_session_results_session_id ON study_session_results(session_id);
CREATE INDEX idx_study_goals_user_id ON study_goals(user_id);
CREATE INDEX idx_generated_videos_user_id ON generated_videos(user_id);
CREATE INDEX idx_exam_practice_attempts_user_id ON exam_practice_attempts(user_id);
CREATE INDEX idx_exam_practice_attempts_created_at ON exam_practice_attempts(created_at DESC);
CREATE INDEX idx_user_subjects_user_id ON user_subjects(user_id);
CREATE UNIQUE INDEX user_subjects_unique_profile ON user_subjects (
  user_id,
  subject,
  exam_board,
  exam_type,
  COALESCE(spec_name, ''),
  COALESCE(spec_tier, '')
);
CREATE INDEX idx_qualifications_curriculum_id ON qualifications(curriculum_id);
CREATE INDEX idx_exam_boards_qualification_id ON exam_boards(qualification_id);
CREATE INDEX idx_subjects_exam_board_id ON subjects(exam_board_id);
CREATE INDEX idx_specifications_subject_id ON specifications(subject_id);
CREATE INDEX idx_topics_specification_id ON topics(specification_id);
CREATE INDEX idx_subtopics_topic_id ON subtopics(topic_id);
CREATE INDEX idx_learning_objectives_subtopic_id ON learning_objectives(subtopic_id);
CREATE INDEX idx_learning_objectives_subject_id ON learning_objectives(subject_id);
CREATE INDEX idx_student_subjects_user_id ON student_subjects(user_id);
CREATE INDEX idx_student_subjects_specification_id ON student_subjects(specification_id);
CREATE INDEX idx_questions_subject_id ON questions(subject_id);
CREATE INDEX idx_questions_learning_objective_id ON questions(learning_objective_id);
CREATE INDEX idx_mock_tests_user_id ON mock_tests(user_id);
CREATE INDEX idx_mock_tests_student_subject_id ON mock_tests(student_subject_id);
CREATE INDEX idx_mock_test_questions_mock_test_id ON mock_test_questions(mock_test_id);
CREATE INDEX idx_mock_test_questions_question_id ON mock_test_questions(question_id);
CREATE INDEX idx_mock_test_attempts_user_id ON mock_test_attempts(user_id);
CREATE INDEX idx_mock_test_attempts_mock_test_id ON mock_test_attempts(mock_test_id);
CREATE INDEX idx_mock_test_answers_attempt_id ON mock_test_answers(attempt_id);
CREATE INDEX idx_mock_test_answers_question_id ON mock_test_answers(question_id);
CREATE INDEX idx_academic_terms_user_id ON academic_terms(user_id);
CREATE INDEX idx_study_plan_items_term_id ON study_plan_items(term_id);
CREATE INDEX idx_study_plan_items_learning_objective_id ON study_plan_items(learning_objective_id);
CREATE INDEX idx_study_plan_progress_plan_item_id ON study_plan_progress(plan_item_id);
CREATE INDEX idx_topic_performance_topic_id ON topic_performance(topic_id);

-- ============================================================================
-- ROW LEVEL SECURITY (enable & policies)
-- ============================================================================
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_tag_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_session_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_practice_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE curricula ENABLE ROW LEVEL SECURITY;
ALTER TABLE qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE specifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtopics ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_objectives ENABLE ROW LEVEL SECURITY;
-- questions holds correct_answer/mark_scheme: RLS is enabled with no SELECT
-- policy for authenticated/anon roles, so answer keys can't be fetched
-- directly via the REST API. Serve questions to students through a
-- server-side route using the service role key instead.
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mock_test_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE mock_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE mock_test_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mock_test_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_plan_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_analytics ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "Users can view their own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can create their own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can view their own subjects"
  ON user_subjects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own subjects"
  ON user_subjects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own subjects"
  ON user_subjects FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own subjects"
  ON user_subjects FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own decks"
  ON flashcard_decks FOR SELECT
  USING (auth.uid() = user_id OR is_public = true);

CREATE POLICY "Users can create decks"
  ON flashcard_decks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own decks"
  ON flashcard_decks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own decks"
  ON flashcard_decks FOR DELETE
  USING (auth.uid() = user_id);

-- Tags inherit permissions from their deck
CREATE POLICY "Users can view tags in accessible decks"
  ON flashcard_tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM flashcard_decks
      WHERE flashcard_decks.id = flashcard_tags.deck_id
      AND (flashcard_decks.user_id = auth.uid() OR flashcard_decks.is_public = true)
    )
  );

CREATE POLICY "Users can create tags in their decks"
  ON flashcard_tags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM flashcard_decks
      WHERE flashcard_decks.id = flashcard_tags.deck_id
      AND flashcard_decks.user_id = auth.uid()
    )
  );

-- Flashcards inherit permissions from their deck
CREATE POLICY "Users can view flashcards in accessible decks"
  ON flashcards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM flashcard_decks
      WHERE flashcard_decks.id = flashcards.deck_id
      AND (flashcard_decks.user_id = auth.uid() OR flashcard_decks.is_public = true)
    )
  );

CREATE POLICY "Users can create flashcards in their decks"
  ON flashcards FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM flashcard_decks
      WHERE flashcard_decks.id = flashcards.deck_id
      AND flashcard_decks.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update flashcards in their decks"
  ON flashcards FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM flashcard_decks
      WHERE flashcard_decks.id = flashcards.deck_id
      AND flashcard_decks.user_id = auth.uid()
    )
  );

-- Tag mappings inherit permissions from their flashcard's deck
CREATE POLICY "Users can view tag mappings in accessible decks"
  ON flashcard_tag_mapping FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM flashcards
      JOIN flashcard_decks ON flashcard_decks.id = flashcards.deck_id
      WHERE flashcards.id = flashcard_tag_mapping.flashcard_id
      AND (flashcard_decks.user_id = auth.uid() OR flashcard_decks.is_public = true)
    )
  );

CREATE POLICY "Users can create tag mappings in their decks"
  ON flashcard_tag_mapping FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM flashcards
      JOIN flashcard_decks ON flashcard_decks.id = flashcards.deck_id
      WHERE flashcards.id = flashcard_tag_mapping.flashcard_id
      AND flashcard_decks.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view their own study sessions"
  ON study_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create study sessions"
  ON study_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their session results"
  ON study_session_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM study_sessions
      WHERE study_sessions.id = study_session_results.session_id
      AND study_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view their statistics"
  ON user_statistics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their goals"
  ON study_goals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create goals"
  ON study_goals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own videos"
  ON generated_videos FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create videos"
  ON generated_videos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own videos"
  ON generated_videos FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own videos"
  ON generated_videos FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own exam practice attempts"
  ON exam_practice_attempts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create exam practice attempts"
  ON exam_practice_attempts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own exam practice attempts"
  ON exam_practice_attempts FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own practice attempts"
  ON exam_practice_attempts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update tags in their decks"
  ON flashcard_tags FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM flashcard_decks
      WHERE flashcard_decks.id = flashcard_tags.deck_id
      AND flashcard_decks.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete tags in their decks"
  ON flashcard_tags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM flashcard_decks
      WHERE flashcard_decks.id = flashcard_tags.deck_id
      AND flashcard_decks.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete tag mappings in their decks"
  ON flashcard_tag_mapping FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM flashcards
      JOIN flashcard_decks ON flashcard_decks.id = flashcards.deck_id
      WHERE flashcards.id = flashcard_tag_mapping.flashcard_id
      AND flashcard_decks.user_id = auth.uid()
    )
  );

-- Master curriculum data: readable by anyone, writable only via
-- migrations/service role (no write policies for regular users).
CREATE POLICY "Anyone can view curricula" ON curricula FOR SELECT USING (true);
CREATE POLICY "Anyone can view qualifications" ON qualifications FOR SELECT USING (true);
CREATE POLICY "Anyone can view exam boards" ON exam_boards FOR SELECT USING (true);
CREATE POLICY "Anyone can view subjects" ON subjects FOR SELECT USING (true);
CREATE POLICY "Anyone can view specifications" ON specifications FOR SELECT USING (true);
CREATE POLICY "Anyone can view topics" ON topics FOR SELECT USING (true);
CREATE POLICY "Anyone can view subtopics" ON subtopics FOR SELECT USING (true);
CREATE POLICY "Anyone can view learning objectives" ON learning_objectives FOR SELECT USING (true);

-- mock_test_questions is readable when its parent mock test is visible
-- (owned by the user, or a system-wide test with no owner).
CREATE POLICY "Users can view questions in accessible mock tests"
  ON mock_test_questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM mock_tests
      WHERE mock_tests.id = mock_test_questions.mock_test_id
      AND (mock_tests.user_id = auth.uid() OR mock_tests.user_id IS NULL)
    )
  );

CREATE POLICY "Users can view their own student subjects"
  ON student_subjects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own student subjects"
  ON student_subjects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own student subjects"
  ON student_subjects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own student subjects"
  ON student_subjects FOR DELETE USING (auth.uid() = user_id);

-- mock_tests: visible if owned by the user, or system-wide (user_id IS NULL)
CREATE POLICY "Users can view accessible mock tests"
  ON mock_tests FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "Users can create their own mock tests"
  ON mock_tests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own mock tests"
  ON mock_tests FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own mock tests"
  ON mock_tests FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own mock test attempts"
  ON mock_test_attempts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own mock test attempts"
  ON mock_test_attempts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own mock test attempts"
  ON mock_test_attempts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own mock test attempts"
  ON mock_test_attempts FOR DELETE USING (auth.uid() = user_id);

-- mock_test_answers: scoped through the owning attempt
CREATE POLICY "Users can view answers for their own attempts"
  ON mock_test_answers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM mock_test_attempts
      WHERE mock_test_attempts.id = mock_test_answers.attempt_id
      AND mock_test_attempts.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can create answers for their own attempts"
  ON mock_test_answers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM mock_test_attempts
      WHERE mock_test_attempts.id = mock_test_answers.attempt_id
      AND mock_test_attempts.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can update answers for their own attempts"
  ON mock_test_answers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM mock_test_attempts
      WHERE mock_test_attempts.id = mock_test_answers.attempt_id
      AND mock_test_attempts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view their own academic terms"
  ON academic_terms FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own academic terms"
  ON academic_terms FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own academic terms"
  ON academic_terms FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own academic terms"
  ON academic_terms FOR DELETE USING (auth.uid() = user_id);

-- study_plan_items: scoped through the owning term
CREATE POLICY "Users can view their own study plan items"
  ON study_plan_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM academic_terms
      WHERE academic_terms.id = study_plan_items.term_id
      AND academic_terms.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can create their own study plan items"
  ON study_plan_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM academic_terms
      WHERE academic_terms.id = study_plan_items.term_id
      AND academic_terms.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can update their own study plan items"
  ON study_plan_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM academic_terms
      WHERE academic_terms.id = study_plan_items.term_id
      AND academic_terms.user_id = auth.uid()
    )
  );
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

CREATE POLICY "Users can view their own topic performance"
  ON topic_performance FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own topic performance"
  ON topic_performance FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own topic performance"
  ON topic_performance FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own analytics"
  ON student_analytics FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own analytics"
  ON student_analytics FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own analytics"
  ON student_analytics FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================================
-- TRIGGERS AND HELPERS
-- ============================================================================
CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_profiles_set_updated_at
BEFORE UPDATE ON user_profiles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TRIGGER flashcard_decks_set_updated_at
BEFORE UPDATE ON flashcard_decks
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TRIGGER flashcards_set_updated_at
BEFORE UPDATE ON flashcards
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TRIGGER user_statistics_set_updated_at
BEFORE UPDATE ON user_statistics
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE OR REPLACE FUNCTION refresh_deck_card_count(p_deck_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE flashcard_decks
  SET card_count = (
    SELECT COUNT(*)::INT
    FROM flashcards
    WHERE flashcards.deck_id = p_deck_id
  )
  WHERE id = p_deck_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION flashcards_sync_deck_count_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM refresh_deck_card_count(NEW.deck_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM refresh_deck_card_count(OLD.deck_id);
    RETURN OLD;
  ELSE
    IF NEW.deck_id <> OLD.deck_id THEN
      PERFORM refresh_deck_card_count(OLD.deck_id);
      PERFORM refresh_deck_card_count(NEW.deck_id);
    ELSE
      PERFORM refresh_deck_card_count(NEW.deck_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER flashcards_sync_deck_count
AFTER INSERT OR UPDATE OR DELETE ON flashcards
FOR EACH ROW
EXECUTE FUNCTION flashcards_sync_deck_count_trigger();

-- Optional helper RPC for server-side AI generation workflows.
-- Payload shape:
-- {
--   "name":"Deck name",
--   "description":"...",
--   "difficulty":"medium",
--   "ai_prompt":"...",
--   "cards":[{"front":"...", "back":"...", "tags":["a","b"]}]
-- }
CREATE OR REPLACE FUNCTION create_ai_flashcard_deck(p_payload JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_deck_id UUID;
  v_card JSONB;
  v_card_id UUID;
  v_tag_name TEXT;
  v_tag_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  INSERT INTO flashcard_decks (user_id, name, description, difficulty_level, ai_generated, ai_prompt)
  VALUES (
    v_user_id,
    COALESCE(NULLIF(TRIM(p_payload->>'name'), ''), 'AI Deck'),
    p_payload->>'description',
    COALESCE(NULLIF(TRIM(p_payload->>'difficulty'), ''), 'medium'),
    TRUE,
    p_payload->>'ai_prompt'
  )
  RETURNING id INTO v_deck_id;

  FOR v_card IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'cards', '[]'::jsonb))
  LOOP
    IF COALESCE(NULLIF(TRIM(v_card->>'front'), ''), '') = '' OR COALESCE(NULLIF(TRIM(v_card->>'back'), ''), '') = '' THEN
      CONTINUE;
    END IF;

    INSERT INTO flashcards (deck_id, front, back, ai_generated)
    VALUES (v_deck_id, v_card->>'front', v_card->>'back', TRUE)
    RETURNING id INTO v_card_id;

    FOR v_tag_name IN SELECT jsonb_array_elements_text(COALESCE(v_card->'tags', '[]'::jsonb))
    LOOP
      INSERT INTO flashcard_tags (deck_id, name)
      VALUES (v_deck_id, v_tag_name)
      ON CONFLICT (deck_id, name) DO UPDATE
      SET name = EXCLUDED.name
      RETURNING id INTO v_tag_id;

      INSERT INTO flashcard_tag_mapping (flashcard_id, tag_id)
      VALUES (v_card_id, v_tag_id)
      ON CONFLICT (flashcard_id, tag_id) DO NOTHING;
    END LOOP;
  END LOOP;

  PERFORM refresh_deck_card_count(v_deck_id);
  RETURN v_deck_id;
END;
$$;

-- ============================================================================
-- STORAGE BUCKET FOR GENERATED VIDEOS
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('generated-videos', 'generated-videos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload videos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'generated-videos' AND auth.role() = 'authenticated');

CREATE POLICY "Anyone can view generated videos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'generated-videos');

CREATE POLICY "Users can delete their own video files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'generated-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================================
-- NOTES
-- ============================================================================
-- 1) This script is destructive. It drops tables and recreates them.
-- 2) If you need triggers to update 'updated_at' on row update, add them after schema creation.
-- 3) If you plan to use pgvector for embeddings, run:
--      CREATE EXTENSION IF NOT EXISTS vector;
--    then add an embedding column (vector) to flashcards or a separate table.
-- 4) Confirm gen_random_uuid() is available via pgcrypto (enabled above).
