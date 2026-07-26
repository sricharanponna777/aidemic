-- ============================================================================
-- Red/Amber/Green self-rated confidence per learning objective.
--
-- RAG rating is a standard UK GCSE/A-Level revision technique: the student
-- marks each spec point red, amber or green, and revision is then directed at
-- the reds first. Here it also feeds the revision planner's weighting
-- (src/lib/revisionPlanner.ts) alongside AI-derived weakness_tags, so
-- self-assessment and measured performance both shape the timetable.
-- ============================================================================

CREATE TABLE IF NOT EXISTS topic_confidence (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  learning_objective_id uuid NOT NULL REFERENCES learning_objectives(id) ON DELETE CASCADE,
  rating text NOT NULL CHECK (rating IN ('red', 'amber', 'green')),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, learning_objective_id)
);

CREATE INDEX IF NOT EXISTS idx_topic_confidence_user
  ON topic_confidence(user_id);

ALTER TABLE topic_confidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own topic confidence" ON topic_confidence;
CREATE POLICY "Users can view their own topic confidence"
  ON topic_confidence FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own topic confidence" ON topic_confidence;
CREATE POLICY "Users can create their own topic confidence"
  ON topic_confidence FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own topic confidence" ON topic_confidence;
CREATE POLICY "Users can update their own topic confidence"
  ON topic_confidence FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own topic confidence" ON topic_confidence;
CREATE POLICY "Users can delete their own topic confidence"
  ON topic_confidence FOR DELETE
  USING (auth.uid() = user_id);

-- Read-only projection for linked parents, consistent with every other
-- parent-visible table (see 20260720100000).
DROP POLICY IF EXISTS "Parents can view linked student topic confidence" ON topic_confidence;
CREATE POLICY "Parents can view linked student topic confidence"
  ON topic_confidence FOR SELECT
  USING (is_parent_of_student(user_id));
