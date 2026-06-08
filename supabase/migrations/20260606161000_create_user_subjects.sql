CREATE TABLE IF NOT EXISTS user_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  exam_board TEXT NOT NULL,
  exam_type TEXT NOT NULL,
  spec_name TEXT,
  spec_tier TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_subjects_user_id
  ON user_subjects(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS user_subjects_unique_profile
  ON user_subjects (
    user_id,
    subject,
    exam_board,
    exam_type,
    COALESCE(spec_name, ''),
    COALESCE(spec_tier, '')
  );

ALTER TABLE user_subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own subjects"
  ON user_subjects;
CREATE POLICY "Users can view their own subjects"
  ON user_subjects FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own subjects"
  ON user_subjects;
CREATE POLICY "Users can create their own subjects"
  ON user_subjects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own subjects"
  ON user_subjects;
CREATE POLICY "Users can delete their own subjects"
  ON user_subjects FOR DELETE
  USING (auth.uid() = user_id);
