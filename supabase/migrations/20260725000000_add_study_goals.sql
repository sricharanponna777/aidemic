-- ============================================================================
-- Per-user study goals.
--
-- The dashboard previously hard-coded a daily target of 20 cards
-- (DEFAULT_DAILY_GOAL in src/app/dashboard/page.tsx). This table makes it a
-- user preference, feeding calculateGoalProgress() in src/lib/spacedRepetition.ts.
--
-- Note: a `study_goals` table also appears in the legacy queries.sql, and some
-- databases (including the current project) were seeded from it. That legacy
-- shape is unusable here -- it has a NOT NULL deck_id, so it cannot express a
-- global daily target -- and no application code has ever referenced it.
--
-- The guarded block below therefore replaces the legacy table, but ONLY when it
-- is empty. If a database somewhere has real rows in the old shape, the
-- migration aborts loudly rather than destroying them.
-- ============================================================================

DO $$
DECLARE
  v_is_legacy boolean;
  v_row_count bigint;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'study_goals' AND column_name = 'deck_id'
  ) INTO v_is_legacy;

  IF v_is_legacy THEN
    EXECUTE 'SELECT count(*) FROM public.study_goals' INTO v_row_count;

    IF v_row_count > 0 THEN
      RAISE EXCEPTION
        'Legacy study_goals table has % row(s). Migrate or archive them before applying this migration.',
        v_row_count;
    END IF;

    DROP TABLE public.study_goals CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS study_goals (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_card_target integer NOT NULL DEFAULT 20 CHECK (daily_card_target BETWEEN 1 AND 500),
  weekly_minute_target integer NOT NULL DEFAULT 150 CHECK (weekly_minute_target BETWEEN 5 AND 10000),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

ALTER TABLE study_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own study goals" ON study_goals;
CREATE POLICY "Users can view their own study goals"
  ON study_goals FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own study goals" ON study_goals;
CREATE POLICY "Users can create their own study goals"
  ON study_goals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own study goals" ON study_goals;
CREATE POLICY "Users can update their own study goals"
  ON study_goals FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own study goals" ON study_goals;
CREATE POLICY "Users can delete their own study goals"
  ON study_goals FOR DELETE
  USING (auth.uid() = user_id);

-- Parents can read their linked children's goals so the parent dashboard can
-- show progress against the target. Mirrors the read-only projection used by
-- every other parent-visible table (see 20260720100000).
DROP POLICY IF EXISTS "Parents can view linked student study goals" ON study_goals;
CREATE POLICY "Parents can view linked student study goals"
  ON study_goals FOR SELECT
  USING (is_parent_of_student(user_id));

CREATE OR REPLACE FUNCTION touch_study_goals_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS study_goals_set_updated_at ON study_goals;
CREATE TRIGGER study_goals_set_updated_at
  BEFORE UPDATE ON study_goals
  FOR EACH ROW
  EXECUTE FUNCTION touch_study_goals_updated_at();
