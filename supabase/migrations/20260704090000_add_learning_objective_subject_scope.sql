-- Learning objectives so far only attach to a subtopic (specific content, e.g.
-- "understand osmosis"). This adds support for subject-level, cross-cutting
-- skill objectives (e.g. "learn command words") that aren't tied to one
-- subtopic, plus a mode tag so each objective can be scoped to the
-- content-generation forms it's relevant for (notes / flashcards / exam practice).

ALTER TABLE learning_objectives
  ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS applies_to TEXT[] NOT NULL DEFAULT ARRAY['notes', 'flashcards', 'exam_practice'];

ALTER TABLE learning_objectives
  DROP CONSTRAINT IF EXISTS learning_objectives_scope_check;
ALTER TABLE learning_objectives
  ADD CONSTRAINT learning_objectives_scope_check
  CHECK (
    (subtopic_id IS NOT NULL AND subject_id IS NULL) OR
    (subtopic_id IS NULL AND subject_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_learning_objectives_subject_id ON learning_objectives(subject_id);
