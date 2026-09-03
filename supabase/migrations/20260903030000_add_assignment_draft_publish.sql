-- ============================================================================
-- Draft -> published lifecycle for assignments.
--
-- A generated assignment is now a DRAFT. The teacher reads the questions and
-- mark scheme, edits whatever the model got wrong, and publishes when ready.
-- Publishing is one-way and freezes the row: students may already have answered
-- it, and editing a question after the fact would silently change what they
-- were marked against. Their attempt would still be scored against the old
-- mark scheme stored in ai_feedback, so the two would disagree forever.
--
-- The freeze is a trigger rather than an RLS WITH CHECK because WITH CHECK only
-- sees the NEW row: it cannot tell an edit of an already-published assignment
-- from a legitimate draft -> published transition, which is the one UPDATE that
-- must still be allowed.
-- ============================================================================

-- Added with DEFAULT 'published' so every row that already existed -- all of
-- which are live with students -- stays visible, then flipped to 'draft' for
-- new inserts. Doing it in this order keeps the migration re-runnable: on a
-- second run ADD COLUMN IF NOT EXISTS is a no-op and nothing is republished.
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published';

ALTER TABLE assignments
  ALTER COLUMN status SET DEFAULT 'draft';

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMP WITH TIME ZONE;

UPDATE assignments
  SET published_at = created_at
  WHERE status = 'published' AND published_at IS NULL;

ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_status_check;
ALTER TABLE assignments
  ADD CONSTRAINT assignments_status_check CHECK (status IN ('draft', 'published'));

CREATE INDEX IF NOT EXISTS idx_assignments_class_status ON assignments(class_id, status);

-- ── Drafts are invisible to everyone but their teacher ──────────────────────
-- The teacher SELECT policy is deliberately left alone: they must see drafts.
DROP POLICY IF EXISTS "Students can view assignments for their classes" ON assignments;
CREATE POLICY "Students can view assignments for their classes"
  ON assignments FOR SELECT
  USING (
    status = 'published'
    AND EXISTS (
      SELECT 1 FROM class_students
      WHERE class_students.class_id = assignments.class_id
        AND class_students.student_id = auth.uid()
        AND class_students.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Parents can view assignments for linked students classes" ON assignments;
CREATE POLICY "Parents can view assignments for linked students classes"
  ON assignments FOR SELECT
  USING (status = 'published' AND is_parent_of_class_member(class_id));

-- ── Publishing is one-way, and a published assignment is frozen ─────────────
CREATE OR REPLACE FUNCTION freeze_published_assignments()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'published' THEN
    RAISE EXCEPTION 'Assignment % is published and can no longer be edited.', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at := NOW();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS freeze_published_assignments_trigger ON assignments;
CREATE TRIGGER freeze_published_assignments_trigger
  BEFORE UPDATE ON assignments
  FOR EACH ROW EXECUTE FUNCTION freeze_published_assignments();
