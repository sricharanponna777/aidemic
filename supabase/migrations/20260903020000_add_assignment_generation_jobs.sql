-- ============================================================================
-- Background generation for teacher assignments.
--
-- Creating an assignment ran the whole generation pipeline inside the POST that
-- the teacher's browser was waiting on: ~74 seconds of spec validation, question
-- generation and backfill behind one disabled button. A closed tab, a sleeping
-- laptop or a proxy timeout lost the work outright, and there was nowhere to
-- report progress from.
--
-- The job row is now the unit of work. The request returns as soon as the row
-- exists; generation continues server-side and writes its stage here, which the
-- teacher's browser polls. The assignment itself is still inserted exactly as
-- before -- this table holds only the in-flight state, and a completed job
-- points at the assignment it produced.
-- ============================================================================

CREATE TABLE IF NOT EXISTS assignment_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  -- The user who asked for it. teacher_id is the teachers row; this is the
  -- auth user, and it is what the RLS policy below compares against.
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'validating', 'generating', 'backfilling', 'finalising', 'saving', 'completed', 'failed')),
  -- Everything needed to run generation and then insert the assignment. Written
  -- once by the route that creates the job and never read by the client.
  request JSONB NOT NULL,
  assignment_id UUID REFERENCES assignments(id) ON DELETE SET NULL,
  error TEXT,
  -- Non-fatal notes from generation (e.g. "generated 5 of 6 unique questions").
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assignment_generation_jobs_requested_by
  ON assignment_generation_jobs(requested_by, created_at DESC);

DROP TRIGGER IF EXISTS assignment_generation_jobs_set_updated_at ON assignment_generation_jobs;
CREATE TRIGGER assignment_generation_jobs_set_updated_at
BEFORE UPDATE ON assignment_generation_jobs
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

ALTER TABLE assignment_generation_jobs ENABLE ROW LEVEL SECURITY;

-- Read-only for the teacher who started it: the browser polls this row for the
-- current stage. Every write is made by the route with the service-role key, so
-- there is deliberately no INSERT/UPDATE/DELETE policy -- a client that could
-- write here could point a job at another teacher's class.
DROP POLICY IF EXISTS "Teachers can view their own generation jobs" ON assignment_generation_jobs;
CREATE POLICY "Teachers can view their own generation jobs"
  ON assignment_generation_jobs FOR SELECT
  USING (auth.uid() = requested_by);

-- `request` is server-owned input, not something the browser should be able to
-- read back. A column-level REVOKE alone does nothing here: Supabase's default
-- privileges grant a TABLE-level SELECT, which supersedes it. So drop the table
-- grant first, then grant back every column except `request`.
REVOKE SELECT ON assignment_generation_jobs FROM authenticated, anon;

GRANT SELECT (
  id, teacher_id, class_id, requested_by, status, assignment_id, error, warnings, created_at, updated_at
) ON assignment_generation_jobs TO authenticated;
