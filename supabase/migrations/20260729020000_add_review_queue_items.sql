-- Server-adjudicated micro-questions for the Daily Review queue.
--
-- Daily Review generates a quick question against a weak subtopic, but until
-- now nothing about it was persisted, so answering it produced no mastery
-- evidence. It cannot simply be reported by the client either: the browser is
-- legitimately given `correctOption` and `markScheme` so it can render the
-- "show answer" panel, which means any client-reported correctness is forgeable
-- by construction. A signed payload would close tampering but not replay --
-- the same correct answer could be posted repeatedly for repeated events.
--
-- So the server stores the question it asked and marks the answer itself.
-- `answered_at` makes each row single-use, and gives mastery_events.source_id a
-- real referent for this source.

CREATE TABLE IF NOT EXISTS review_queue_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subtopic_id uuid NOT NULL REFERENCES subtopics(id) ON DELETE CASCADE,
  -- The question exactly as asked, including its answer key.
  question    jsonb NOT NULL,
  answered_at timestamptz,
  outcome     numeric CHECK (outcome IS NULL OR outcome BETWEEN 0 AND 1),
  created_at  timestamptz NOT NULL DEFAULT NOW()
);

-- Serves the only hot read: "is this item still unanswered?"
CREATE INDEX IF NOT EXISTS idx_review_queue_items_user_unanswered
  ON review_queue_items(user_id, created_at DESC) WHERE answered_at IS NULL;

-- Deny-all by design: RLS on with no policies at all, the same stance the
-- `questions` table takes. The row holds the answer key, so a student who could
-- SELECT it could cheat, and one who could UPDATE answered_at/outcome could
-- forge mastery evidence. Written and marked by the service role only; the
-- client receives the question text in the API response and never reads here.
ALTER TABLE review_queue_items ENABLE ROW LEVEL SECURITY;
