-- ============================================================================
-- Make review_queue_items serve more than the Daily Review queue.
--
-- 20260729020000 built this table to solve one problem: the client is
-- legitimately handed the answer key so it can render the reveal panel, so only
-- the server can honestly say whether an answer was right. That property is not
-- specific to Daily Review -- it is what ANY surface needs before a question it
-- asks can become mastery evidence.
--
-- Study Chat is the second such surface. A chat transcript has no ground truth,
-- so grading mastery from what the tutor *said* would be inventing a signal;
-- asking one marked question at the end of the conversation measures one
-- instead. `mastery_events.source` already distinguishes 'tutor' (weight 0.6)
-- from 'exam_practice' (1.2), so the only missing piece is remembering which
-- surface asked, from /next until /answer records the event.
--
-- Existing rows all came from Daily Review, which is what the default backfills.
-- ============================================================================

ALTER TABLE review_queue_items
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'exam_practice';

DO $$
BEGIN
  ALTER TABLE review_queue_items
    ADD CONSTRAINT review_queue_items_source_check
    CHECK (source IN ('exam_practice', 'tutor'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
