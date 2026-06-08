CREATE TABLE IF NOT EXISTS exam_practice_attempts (
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

CREATE INDEX IF NOT EXISTS idx_exam_practice_attempts_user_id
  ON exam_practice_attempts(user_id);

CREATE INDEX IF NOT EXISTS idx_exam_practice_attempts_created_at
  ON exam_practice_attempts(created_at DESC);

ALTER TABLE exam_practice_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own exam practice attempts"
  ON exam_practice_attempts;
CREATE POLICY "Users can view their own exam practice attempts"
  ON exam_practice_attempts FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create exam practice attempts"
  ON exam_practice_attempts;
CREATE POLICY "Users can create exam practice attempts"
  ON exam_practice_attempts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own exam practice attempts"
  ON exam_practice_attempts;
CREATE POLICY "Users can delete their own exam practice attempts"
  ON exam_practice_attempts FOR DELETE
  USING (auth.uid() = user_id);
