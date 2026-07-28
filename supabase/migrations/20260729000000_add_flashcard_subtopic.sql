-- Link flashcards to the curriculum so reviews can feed the Learning Spine.
--
-- Until now a card's only topical metadata was its deck's free-text tags, which
-- cannot be joined to anything. Without a subtopic_id, grading a card moves the
-- SM-2 counters on the card row and nothing else -- the review is invisible to
-- mastery, the planner and the class heatmap.
--
-- `flashcards` predates supabase/migrations (it is created in the legacy
-- queries.sql), so this is the first migration to touch the table.

ALTER TABLE flashcards
  ADD COLUMN IF NOT EXISTS subtopic_id uuid REFERENCES subtopics(id) ON DELETE SET NULL;

-- ON DELETE SET NULL, not CASCADE: reseeding or re-versioning the curriculum
-- must cost a card its curriculum link, never the card itself. A student's deck
-- is their work; the subtopic mapping is our inference about it.
COMMENT ON COLUMN flashcards.subtopic_id IS
  'Curriculum subtopic this card tests. Set at AI generation time; NULL for '
  'manually created cards, which emit no mastery evidence.';

-- Partial: the column is NULL for every manually created card, and the only
-- queries that use it are looking for the cards that do have one.
CREATE INDEX IF NOT EXISTS idx_flashcards_subtopic_id
  ON flashcards(subtopic_id) WHERE subtopic_id IS NOT NULL;

-- No RLS change. The existing flashcards policies are row-level (ownership via
-- deck_id), so they already cover the new column.
