-- generate-notes only ever generated fresh content, even when a student
-- reopened the exact same notes (same concept/board/spec/subtopic/etc.),
-- paying for a fresh AI call every time. generated_videos didn't store enough
-- of the prompt inputs to detect "this is the same request as before" -- only
-- concept/subject/duration were persisted, not exam_board/exam_type/
-- specification/subtopic/learning_objective/paper, which also shape the
-- generated content. Adding them lets the route look up a matching completed
-- row before calling the AI provider again.
--
-- Nullable, defaulting to '' rather than NULL: the match query compares these
-- with plain equality, and NULL never equals NULL in SQL, so two "no board
-- specified" requests would otherwise never match each other.
ALTER TABLE generated_videos
  ADD COLUMN IF NOT EXISTS exam_board TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS exam_type TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS specification TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS subtopic TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS learning_objective TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS paper TEXT NOT NULL DEFAULT '';

-- Narrows the match query (user_id, status, subject, concept, ...) to a small
-- row set before the remaining equality filters are applied in-memory by Postgres.
CREATE INDEX IF NOT EXISTS idx_generated_videos_reuse_lookup
  ON generated_videos (user_id, status, subject, concept);
