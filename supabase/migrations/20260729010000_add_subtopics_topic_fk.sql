-- Add the missing subtopics.topic_id -> topics.id foreign key.
--
-- Every other hop in the curriculum tree is a real FK (topics -> specifications
-- -> subjects -> exam_boards -> qualifications), but subtopics.topic_id was
-- only ever a bare uuid column. Two consequences:
--
--   1. Nothing stopped a subtopic pointing at a deleted topic.
--   2. PostgREST refuses to embed across a relationship it cannot see, so
--      `subtopics!inner(topics!inner(...))` fails with "Could not find a
--      relationship between 'subtopics' and 'topics' in the schema cache".
--
-- (2) is what blocks the Learning Spine read layer, which walks from
-- student_subtopic_mastery up to the exam board in one query.
--
-- Verified clean before adding: 5,524 subtopics, 0 orphans, 0 nulls.

ALTER TABLE subtopics
  ALTER COLUMN topic_id SET NOT NULL;

ALTER TABLE subtopics
  ADD CONSTRAINT subtopics_topic_id_fkey
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE;

-- Matches the topics -> specifications behaviour: a subtopic has no meaning
-- outside its topic, so removing the topic removes it.

CREATE INDEX IF NOT EXISTS idx_subtopics_topic_id ON subtopics(topic_id);
