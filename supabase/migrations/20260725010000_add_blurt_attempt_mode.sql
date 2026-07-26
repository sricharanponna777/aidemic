-- ============================================================================
-- Allow 'blurt' as an exam_practice_attempts.attempt_mode.
--
-- Blurting (free recall: brain-dump a topic, then have the AI compare the dump
-- against the specification's learning objectives) records its results as a
-- normal practice attempt. Reusing this table means blurt sessions feed the
-- existing weakness_tags pipeline, the dashboard, and the weekly parent digest
-- with no extra plumbing.
--
-- Predicted grades deliberately exclude this mode -- see the attempt_mode
-- filtering in src/lib/ai/gradeAverages.ts -- because a free-recall dump is not
-- marked out of a comparable total.
-- ============================================================================

ALTER TABLE exam_practice_attempts
  DROP CONSTRAINT IF EXISTS exam_practice_attempts_attempt_mode_check;

ALTER TABLE exam_practice_attempts
  ADD CONSTRAINT exam_practice_attempts_attempt_mode_check
  CHECK (attempt_mode IN ('practice', 'mock', 'blurt'));
