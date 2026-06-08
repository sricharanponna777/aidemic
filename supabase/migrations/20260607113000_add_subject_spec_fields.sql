ALTER TABLE user_subjects
  ADD COLUMN IF NOT EXISTS spec_name TEXT,
  ADD COLUMN IF NOT EXISTS spec_tier TEXT;

ALTER TABLE user_subjects
  DROP CONSTRAINT IF EXISTS user_subjects_unique;

CREATE UNIQUE INDEX IF NOT EXISTS user_subjects_unique_profile
  ON user_subjects (
    user_id,
    subject,
    exam_board,
    exam_type,
    COALESCE(spec_name, ''),
    COALESCE(spec_tier, '')
  );
