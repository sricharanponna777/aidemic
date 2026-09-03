-- ============================================================================
-- Background generation for student practice questions.
--
-- The Smart Practice generator ran the whole ~74-second pipeline inside the POST
-- the student's browser was waiting on, behind a single indeterminate bar that
-- could say nothing about what was happening or how long was left. The job row
-- is now the unit of work: the request returns as soon as the row exists,
-- generation continues server-side and writes its stage here, and the browser
-- polls it.
--
-- Deliberately a separate table from `assignment_generation_jobs` rather than a
-- generalisation of it. That table's teacher_id/class_id/assignment_id columns
-- are all NOT NULL and all meaningless here; widening them to NULL to fit a
-- second flow would drop the constraints that make the teacher path correct.
--
-- The difference that matters is `result`. A teacher's job ends by inserting an
-- assignment row and hands the browser only its id; a student's questions are
-- answered on screen, so the payload has to travel back. It is parked here and
-- read back by the poller.
-- ============================================================================

CREATE TABLE IF NOT EXISTS question_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'validating', 'generating', 'backfilling', 'finalising', 'saving', 'completed', 'failed')),
  -- Everything generation needs. Written once by the route that creates the job.
  -- Unlike the teacher table there is no column-level REVOKE on this one: the
  -- request is the student's own generator form, so reading it back tells them
  -- nothing they did not just type.
  request JSONB NOT NULL,
  -- The finished question set, exactly as the synchronous route used to return
  -- it. NULL until the job completes.
  result JSONB,
  error TEXT,
  -- Non-fatal notes from generation (e.g. "generated 5 of 6 unique questions").
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Serves both reads the browser makes: resuming the newest in-flight job on
-- mount, and taking the median of recent completed runs to pace the bar.
CREATE INDEX IF NOT EXISTS idx_question_generation_jobs_user
  ON question_generation_jobs(user_id, created_at DESC);

DROP TRIGGER IF EXISTS question_generation_jobs_set_updated_at ON question_generation_jobs;
CREATE TRIGGER question_generation_jobs_set_updated_at
BEFORE UPDATE ON question_generation_jobs
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

ALTER TABLE question_generation_jobs ENABLE ROW LEVEL SECURITY;

-- Read-only for the student who started it. Every write is made by the route
-- with the service-role key, so there is deliberately no INSERT/UPDATE/DELETE
-- policy -- a client that could write here could park an arbitrary question
-- payload (mark schemes included) into its own completed job.
DROP POLICY IF EXISTS "Users can view their own question generation jobs" ON question_generation_jobs;
CREATE POLICY "Users can view their own question generation jobs"
  ON question_generation_jobs FOR SELECT
  USING (auth.uid() = user_id);
