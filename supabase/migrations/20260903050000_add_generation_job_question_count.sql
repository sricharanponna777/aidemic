-- ============================================================================
-- Record how many questions each generation job asked for.
--
-- The progress estimate is the median of the user's recent completed runs, and
-- it was blind to size: after a six-question run it told a one-question run to
-- expect 71 seconds, and after that one-question run it told the next
-- six-question run to expect 15. Exactly inverted, because question count is
-- the first-order driver of output tokens and therefore of how long the model
-- call takes.
--
-- The number is already inside `request`, but that column is unreadable from
-- the browser on the assignment table by design (see 20260903020000), and
-- digging a value out of a JSONB blob to pace a progress bar is not what that
-- column is for. A plain column is readable, indexable and cheap.
--
-- Nullable with no backfill: rows written before this migration have no count,
-- and the estimator skips them rather than guessing a size for them.
-- ============================================================================

ALTER TABLE assignment_generation_jobs ADD COLUMN IF NOT EXISTS question_count INTEGER;
ALTER TABLE question_generation_jobs   ADD COLUMN IF NOT EXISTS question_count INTEGER;

-- `assignment_generation_jobs` has no table-level SELECT grant -- it was
-- revoked so `request` could be withheld -- so a new column is unreadable until
-- it is granted explicitly. `question_generation_jobs` keeps its table grant
-- and needs no equivalent.
GRANT SELECT (question_count) ON assignment_generation_jobs TO authenticated;
