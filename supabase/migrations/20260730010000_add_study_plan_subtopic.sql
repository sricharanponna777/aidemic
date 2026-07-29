-- ============================================================================
-- Point a planned revision session at a curriculum node.
--
-- study_plan_items has carried `learning_objective_id` since 20260702190000,
-- but that column addresses the cross-cutting SKILLS axis (20260704090000
-- re-scoped learning_objectives to subject-wide skills like "apply command
-- words"), not the content a session is actually about. So a generated session
-- has only its free-text title -- which is why clicking one has never been able
-- to do anything.
--
-- With the Learning Spine the planner now schedules against real subtopics, so
-- record which one. That is what lets a plan row hand the student straight to a
-- question on that subtopic instead of leaving them to find it.
--
-- Nullable on purpose: sessions built from the pre-spine weakness_tag fallback
-- have no subtopic to name, and ON DELETE SET NULL keeps a plan intact if a
-- specification is ever re-seeded underneath it.
-- ============================================================================

ALTER TABLE study_plan_items
  ADD COLUMN IF NOT EXISTS subtopic_id uuid REFERENCES subtopics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_study_plan_items_subtopic
  ON study_plan_items(subtopic_id) WHERE subtopic_id IS NOT NULL;
