-- ============================================================================
-- Timed mock-exam mode.
--
-- Reuses the existing exam_practice_attempts table (JSONB questions/answers
-- payload, same as assignments) rather than the unused mock_tests/questions
-- relational tables from 20260702190000_create_curriculum_and_mock_tests.sql,
-- which were never wired up to any application code. A mock exam is simply a
-- self-practice attempt with a duration and a live countdown before marking.
-- ============================================================================

ALTER TABLE exam_practice_attempts
  ADD COLUMN IF NOT EXISTS attempt_mode TEXT NOT NULL DEFAULT 'practice';

ALTER TABLE exam_practice_attempts
  DROP CONSTRAINT IF EXISTS exam_practice_attempts_attempt_mode_check;

ALTER TABLE exam_practice_attempts
  ADD CONSTRAINT exam_practice_attempts_attempt_mode_check CHECK (attempt_mode IN ('practice', 'mock'));

ALTER TABLE exam_practice_attempts
  ADD COLUMN IF NOT EXISTS duration_minutes INT;

ALTER TABLE exam_practice_attempts
  ADD COLUMN IF NOT EXISTS time_taken_seconds INT;
