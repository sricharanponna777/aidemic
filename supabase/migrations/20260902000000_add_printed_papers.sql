-- ============================================================================
-- Printed papers: the paper arc of the learning loop.
--
--   generate -> print -> write by hand -> photograph -> transcribe -> mark
--
-- A printed paper is deliberately NOT a row in exam_practice_attempts. Twelve
-- call sites read that table (eleven in src/, one in the weekly-parent-digest
-- edge function) and none of them filter by status, so a paper sitting unmarked
-- on a student's desk for three days would land in every dashboard average, the
-- parent digest and the revision planner as a 0%. The attempt row is still
-- created only when marking completes, exactly as it is for a typed attempt;
-- printed_papers.attempt_id points at it afterwards.
--
-- SECURITY: questions_payload holds the answer key (markScheme, modelAnswer,
-- correctOption). Neither table gets a client policy of any kind -- reads and
-- writes go through the service role, and every student-facing read passes
-- through src/lib/papers/studentSafePaper.ts first. This follows the same
-- decision as 20260718100000_server_authoritative_assignment_marking.sql.
-- ============================================================================

CREATE TABLE IF NOT EXISTS printed_papers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Short human-readable code printed on the sheet, so a student can tell two
  -- printouts apart and label any extra pages they write on.
  paper_code TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  exam_board TEXT NOT NULL,
  exam_type TEXT NOT NULL,
  topic TEXT NOT NULL,
  specification TEXT,
  source_material TEXT,
  questions_payload JSONB NOT NULL DEFAULT '[]',
  -- [{ questionIndex, text, confidence }] from /api/ai/transcribe-scan, after
  -- any corrections the student made before submitting for marking.
  transcript_payload JSONB,
  status TEXT NOT NULL DEFAULT 'printed'
    CHECK (status IN ('printed', 'uploaded', 'transcribed', 'marked')),
  attempt_id UUID REFERENCES exam_practice_attempts(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_printed_papers_user_created
  ON printed_papers(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS printed_paper_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id UUID NOT NULL REFERENCES printed_papers(id) ON DELETE CASCADE,
  page_index INT NOT NULL,
  -- Object path inside the private `paper-scans` bucket. Storage objects are
  -- NOT reached by this cascade; the delete route removes them explicitly.
  storage_path TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (paper_id, page_index)
);

CREATE INDEX IF NOT EXISTS idx_printed_paper_pages_paper
  ON printed_paper_pages(paper_id, page_index);

-- RLS on, no policies: service role only (see SECURITY note above).
ALTER TABLE printed_papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE printed_paper_pages ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- How the attempt was answered. attempt_mode already says practice vs mock;
-- this says typed vs handwritten, which is orthogonal (a mock can be sat on
-- paper). Nothing existing selects this column, so no read site changes.
-- ============================================================================
ALTER TABLE exam_practice_attempts
  ADD COLUMN IF NOT EXISTS answer_medium TEXT NOT NULL DEFAULT 'typed';

ALTER TABLE exam_practice_attempts
  DROP CONSTRAINT IF EXISTS exam_practice_attempts_answer_medium_check;

ALTER TABLE exam_practice_attempts
  ADD CONSTRAINT exam_practice_attempts_answer_medium_check
  CHECK (answer_medium IN ('typed', 'paper'));
