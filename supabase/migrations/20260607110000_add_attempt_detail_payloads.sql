ALTER TABLE exam_practice_attempts
  ADD COLUMN IF NOT EXISTS questions_payload JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS answers_payload JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS marking_report JSONB;
