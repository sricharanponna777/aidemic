-- The curriculum tables were created with primary keys only, which left every seed
-- non-idempotent: re-running one inserted a second copy of every row rather than
-- conflicting. Now that a second curriculum (India) is being seeded alongside the UK
-- one, name collisions across curricula also become possible, so pin uniqueness at
-- each level of the tree.
--
-- NULLS NOT DISTINCT matters for specifications.tier, which is NULL for every untiered
-- specification. Under the default NULLS DISTINCT, two untiered specifications with the
-- same name under one subject would both be allowed.
--
-- Verified before applying: 0 duplicate groups at every level.

ALTER TABLE qualifications
  ADD CONSTRAINT qualifications_curriculum_name_key UNIQUE (curriculum_id, name);

ALTER TABLE exam_boards
  ADD CONSTRAINT exam_boards_qualification_name_key UNIQUE (qualification_id, name);

ALTER TABLE subjects
  ADD CONSTRAINT subjects_exam_board_name_key UNIQUE (exam_board_id, name);

ALTER TABLE specifications
  ADD CONSTRAINT specifications_subject_name_tier_key UNIQUE NULLS NOT DISTINCT (subject_id, name, tier);

ALTER TABLE topics
  ADD CONSTRAINT topics_specification_name_key UNIQUE (specification_id, name);
