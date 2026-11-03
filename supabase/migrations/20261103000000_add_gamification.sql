-- ============================================================================
-- Gamification: XP, streaks, weekly leagues, badges, class leaderboards.
--
-- XP is SERVER-AUTHORITATIVE. Every table here has RLS on and no client write
-- policy; the only way XP moves is award_xp(), executable by service_role
-- alone and called from the routes that compute marks (mark-answers,
-- blurt-review, flashcards/review, review-queue/answer). A league table a
-- student can write to is a league table nobody trusts.
--
-- It deliberately does NOT hang off mastery_events. That log only receives
-- evidence once a question resolves onto a curriculum subtopic, and it is
-- written in after() behind a classifier call -- so self-practice on an
-- unresolved topic would silently earn nothing, and the submit response could
-- never say how much was earned.
--
-- Days and weeks are UTC. A league week runs Monday 00:00 -> Monday 00:00 UTC.
-- Level and rank title are NOT stored: they are a pure function of total_xp,
-- computed in src/lib/gamification/levels.ts.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 1: League tiers (space-themed, lowest first)
--
-- promote_count / demote_count are for a full cohort of 30; close-out scales
-- them down for a smaller one, so a three-person cohort does not relegate
-- everyone in it.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS league_tiers (
  tier          smallint PRIMARY KEY CHECK (tier BETWEEN 1 AND 10),
  slug          text NOT NULL UNIQUE,
  name          text NOT NULL,
  promote_count smallint NOT NULL CHECK (promote_count >= 0),
  demote_count  smallint NOT NULL CHECK (demote_count >= 0)
);

INSERT INTO league_tiers (tier, slug, name, promote_count, demote_count) VALUES
  (1,  'launchpad',    'Launchpad',    10, 0),
  (2,  'stratosphere', 'Stratosphere', 10, 5),
  (3,  'orbit',        'Orbit',         7, 5),
  (4,  'lunar',        'Lunar',         7, 5),
  (5,  'martian',      'Martian',       7, 5),
  (6,  'jovian',       'Jovian',        7, 5),
  (7,  'nebula',       'Nebula',        5, 5),
  (8,  'pulsar',       'Pulsar',        5, 5),
  (9,  'quasar',       'Quasar',        5, 5),
  (10, 'singularity',  'Singularity',   0, 5)
ON CONFLICT (tier) DO UPDATE SET
  slug = EXCLUDED.slug, name = EXCLUDED.name,
  promote_count = EXCLUDED.promote_count, demote_count = EXCLUDED.demote_count;

-- ----------------------------------------------------------------------------
-- STEP 2: Per-user state and the append-only ledger
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_xp (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_xp         bigint NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
  -- Stored as of last_active_date; readers must treat it as 0 once a whole
  -- UTC day has been missed (see my_gamification()).
  current_streak   int NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  longest_streak   int NOT NULL DEFAULT 0 CHECK (longest_streak >= 0),
  last_active_date date,
  -- XP earned on last_active_date, for the daily cap.
  daily_xp         int NOT NULL DEFAULT 0 CHECK (daily_xp >= 0),
  -- The tier the student will be placed in the next time they join a week.
  league_tier      smallint NOT NULL DEFAULT 1 REFERENCES league_tiers(tier),
  updated_at       timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS xp_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source          text NOT NULL CHECK (source IN (
                    'exam_practice', 'mock', 'assignment', 'homework_scan',
                    'blurt', 'flashcard', 'cloze', 'review', 'tutor'
                  )),
  -- Idempotency. Set wherever the activity has a natural identity
  -- ('assignment:<id>', 'paper:<id>', 'flashcard:<card>:<utc-day>') so a
  -- replayed request cannot be paid twice. NULL for self-practice and blurts,
  -- which have no row yet when marked; those are bounded by the AI daily rate
  -- limit and the XP daily cap instead.
  award_key       text,
  score           numeric NOT NULL CHECK (score BETWEEN 0 AND 1),
  marks_available numeric,
  base_xp         int NOT NULL CHECK (base_xp >= 0),
  multiplier      numeric NOT NULL CHECK (multiplier >= 1),
  -- After multiplier and daily cap. Zero once the cap is hit -- the row is
  -- still written so the award_key is spent and the streak still counts.
  xp              int NOT NULL CHECK (xp >= 0),
  created_at      timestamptz NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS xp_events_user_award_key
  ON xp_events(user_id, award_key) WHERE award_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_xp_events_user_created
  ON xp_events(user_id, created_at DESC);

-- Counters behind activity/perfect-score badges, so evaluating badges after
-- every award does not re-aggregate the whole ledger.
CREATE TABLE IF NOT EXISTS user_activity_counts (
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source         text NOT NULL,
  activity_count int NOT NULL DEFAULT 0,
  -- Full marks on a marked set. Only counted for marked sources: a flashcard
  -- rated "easy" is a perfect score by definition.
  perfect_count  int NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, source)
);

-- ----------------------------------------------------------------------------
-- STEP 3: Weekly leagues
--
-- A student is placed in a cohort of up to 30 at their tier the first time
-- they earn XP in a week -- not before, so cohorts are never padded with
-- inactive accounts. Students only: user_profiles.role = 'student', so no
-- adult account is ever ranked alongside minors.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS league_cohorts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL,
  tier       smallint NOT NULL REFERENCES league_tiers(tier),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  closed_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_league_cohorts_week_tier ON league_cohorts(week_start, tier);
CREATE INDEX IF NOT EXISTS idx_league_cohorts_open ON league_cohorts(week_start) WHERE closed_at IS NULL;

CREATE TABLE IF NOT EXISTS league_members (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  cohort_id  uuid NOT NULL REFERENCES league_cohorts(id) ON DELETE CASCADE,
  tier       smallint NOT NULL REFERENCES league_tiers(tier),
  weekly_xp  int NOT NULL DEFAULT 0 CHECK (weekly_xp >= 0),
  joined_at  timestamptz NOT NULL DEFAULT NOW(),
  final_rank int,
  result     text CHECK (result IS NULL OR result IN ('promoted', 'demoted', 'stayed')),
  PRIMARY KEY (user_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_league_members_cohort ON league_members(cohort_id);

-- ----------------------------------------------------------------------------
-- STEP 4: Badges
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS badges (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  description text NOT NULL,
  -- Lucide icon name.
  icon        text NOT NULL,
  criterion   text NOT NULL CHECK (criterion IN (
                'total_xp', 'streak', 'activity_count', 'perfect_count',
                'league_tier', 'league_win'
              )),
  -- activity_count only: which xp_events.source to count. NULL = any.
  source      text,
  threshold   int NOT NULL CHECK (threshold > 0),
  sort_order  int NOT NULL DEFAULT 0
);

INSERT INTO badges (id, name, description, icon, criterion, source, threshold, sort_order) VALUES
  ('first-contact',     'First Contact',     'Earn your first XP.',                                   'radio',         'total_xp',       NULL,            1,     10),
  ('liftoff',           'Liftoff',           'Earn 1,000 XP.',                                        'rocket',        'total_xp',       NULL,            1000,  20),
  ('escape-velocity',   'Escape Velocity',   'Earn 10,000 XP.',                                       'gauge',         'total_xp',       NULL,            10000, 30),
  ('interstellar',      'Interstellar',      'Earn 50,000 XP.',                                       'sparkles',      'total_xp',       NULL,            50000, 40),
  ('ignition',          'Ignition',          'Study 3 days in a row.',                                'flame',         'streak',         NULL,            3,     50),
  ('orbit-locked',      'Orbit Locked',      'Study 7 days in a row.',                                'orbit',         'streak',         NULL,            7,     60),
  ('lunar-cycle',       'Lunar Cycle',       'Study 30 days in a row.',                               'moon',          'streak',         NULL,            30,    70),
  ('deep-space',        'Deep Space',        'Study 100 days in a row.',                              'telescope',     'streak',         NULL,            100,   80),
  ('flight-simulator',  'Flight Simulator',  'Complete 10 practice sets.',                            'target',        'activity_count', 'exam_practice', 10,    90),
  ('mission-ready',     'Mission Ready',     'Sit 5 timed mocks.',                                    'timer',         'activity_count', 'mock',          5,     100),
  ('mission-log',       'Mission Log',       'Complete 10 assignments.',                              'clipboard-check','activity_count','assignment',    10,    110),
  ('ground-control',    'Ground Control',    'Upload 5 handwritten papers for marking.',              'scan-line',     'activity_count', 'homework_scan', 5,     120),
  ('void-blurter',      'Void Blurter',      'Finish 5 blurting sessions.',                           'brain',         'activity_count', 'blurt',         5,     130),
  ('star-charter',      'Star Charter',      'Review 100 flashcards.',                                'layers',        'activity_count', 'flashcard',     100,   140),
  ('telemetry-check',   'Telemetry Check',   'Answer 50 daily review questions.',                     'activity',      'activity_count', 'review',        50,    150),
  ('perfect-docking',   'Perfect Docking',   'Score full marks on a marked set.',                     'circle-check',  'perfect_count',  NULL,            1,     160),
  ('flawless-orbit',    'Flawless Orbit',    'Score full marks on 10 marked sets.',                   'award',         'perfect_count',  NULL,            10,    170),
  ('jovian-ascent',     'Jovian Ascent',     'Reach the Jovian league.',                              'trending-up',   'league_tier',    NULL,            6,     180),
  ('singularity',       'Singularity',       'Reach the Singularity league.',                         'crown',         'league_tier',    NULL,            10,    190),
  ('mission-commander', 'Mission Commander', 'Finish first in a weekly league of 5 or more.',         'trophy',        'league_win',     NULL,            1,     200)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, icon = EXCLUDED.icon,
  criterion = EXCLUDED.criterion, source = EXCLUDED.source,
  threshold = EXCLUDED.threshold, sort_order = EXCLUDED.sort_order;

CREATE TABLE IF NOT EXISTS user_badges (
  user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id  text NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  earned_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, badge_id)
);

-- ----------------------------------------------------------------------------
-- STEP 5: RLS -- reads only, never writes
-- ----------------------------------------------------------------------------
ALTER TABLE league_tiers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_xp              ENABLE ROW LEVEL SECURITY;
ALTER TABLE xp_events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_cohorts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE badges               ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone signed in can view league tiers" ON league_tiers;
CREATE POLICY "Anyone signed in can view league tiers"
  ON league_tiers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone signed in can view badges" ON badges;
CREATE POLICY "Anyone signed in can view badges"
  ON badges FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can view their own xp" ON user_xp;
CREATE POLICY "Users can view their own xp"
  ON user_xp FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Parents can view linked students xp" ON user_xp;
CREATE POLICY "Parents can view linked students xp"
  ON user_xp FOR SELECT USING (is_parent_of_student(user_id));

DROP POLICY IF EXISTS "Users can view their own xp events" ON xp_events;
CREATE POLICY "Users can view their own xp events"
  ON xp_events FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own activity counts" ON user_activity_counts;
CREATE POLICY "Users can view their own activity counts"
  ON user_activity_counts FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own badges" ON user_badges;
CREATE POLICY "Users can view their own badges"
  ON user_badges FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Parents can view linked students badges" ON user_badges;
CREATE POLICY "Parents can view linked students badges"
  ON user_badges FOR SELECT USING (is_parent_of_student(user_id));

-- league_cohorts / league_members: no policies. Standings go through
-- my_league(), which projects other members down to username + weekly XP.

-- ----------------------------------------------------------------------------
-- STEP 6: Internal helpers (not callable by clients)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION xp_streak_multiplier(p_streak int)
RETURNS numeric
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_streak >= 30 THEN 2.0
    WHEN p_streak >= 7  THEN 1.5
    WHEN p_streak >= 3  THEN 1.25
    ELSE 1.0
  END;
$$;

-- Current value of each badge's criterion for one user. Shared by
-- evaluate_badges() (award) and my_badges() (progress bars) so the two cannot
-- disagree about how close a student is.
CREATE OR REPLACE FUNCTION badge_progress(p_user_id uuid)
RETURNS TABLE (badge_id text, value bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id,
    COALESCE(CASE b.criterion
      WHEN 'total_xp'       THEN (SELECT total_xp FROM user_xp WHERE user_id = p_user_id)
      WHEN 'streak'         THEN (SELECT longest_streak FROM user_xp WHERE user_id = p_user_id)
      WHEN 'league_tier'    THEN (SELECT league_tier FROM user_xp WHERE user_id = p_user_id)
      WHEN 'activity_count' THEN (SELECT sum(activity_count) FROM user_activity_counts
                                  WHERE user_id = p_user_id AND (b.source IS NULL OR source = b.source))
      WHEN 'perfect_count'  THEN (SELECT sum(perfect_count) FROM user_activity_counts
                                  WHERE user_id = p_user_id)
      WHEN 'league_win'     THEN (SELECT count(*) FROM league_members m
                                  WHERE m.user_id = p_user_id AND m.final_rank = 1
                                    AND (SELECT count(*) FROM league_members o WHERE o.cohort_id = m.cohort_id) >= 5)
    END, 0)::bigint
  FROM badges b;
$$;

CREATE OR REPLACE FUNCTION evaluate_badges(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
  WITH inserted AS (
    INSERT INTO user_badges (user_id, badge_id)
    SELECT p_user_id, b.id
    FROM badges b
    JOIN badge_progress(p_user_id) p ON p.badge_id = b.id
    WHERE p.value >= b.threshold
    ON CONFLICT DO NOTHING
    RETURNING badge_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'icon', b.icon) ORDER BY b.sort_order), '[]'::jsonb)
  FROM inserted i JOIN badges b ON b.id = i.badge_id;
$$;

-- Add XP to this week's league, placing the student in a cohort on their first
-- XP of the week. The advisory lock serialises placement per (week, tier) so
-- two students joining at once cannot both see 29 members and make it 31.
CREATE OR REPLACE FUNCTION add_league_xp(p_user_id uuid, p_week date, p_tier smallint, p_xp int)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cohort uuid;
BEGIN
  UPDATE league_members SET weekly_xp = weekly_xp + p_xp
  WHERE user_id = p_user_id AND week_start = p_week;
  IF FOUND THEN RETURN; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('league:' || p_week || ':' || p_tier, 0));

  SELECT c.id INTO v_cohort
  FROM league_cohorts c
  WHERE c.week_start = p_week AND c.tier = p_tier AND c.closed_at IS NULL
    AND (SELECT count(*) FROM league_members m WHERE m.cohort_id = c.id) < 30
  ORDER BY c.created_at
  LIMIT 1;

  IF v_cohort IS NULL THEN
    INSERT INTO league_cohorts (week_start, tier) VALUES (p_week, p_tier) RETURNING id INTO v_cohort;
  END IF;

  INSERT INTO league_members (user_id, week_start, cohort_id, tier, weekly_xp)
  VALUES (p_user_id, p_week, v_cohort, p_tier, p_xp);
END;
$$;

-- Rank and settle every cohort from a finished week, oldest week first, then
-- move each member's league_tier. Idempotent: closed cohorts are skipped.
--
-- Runs from pg_cron at Monday 00:00 UTC, and lazily from award_xp() whenever an
-- unclosed past week still exists -- so a student earning XP in the first
-- seconds of a new week is placed at their post-promotion tier, not last
-- week's. Weeks are settled one at a time because a member's new tier depends
-- on the tier they played the week at.
CREATE OR REPLACE FUNCTION close_finished_league_weeks()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_week date := date_trunc('week', NOW() AT TIME ZONE 'UTC')::date;
  v_top_tier smallint := (SELECT max(tier) FROM league_tiers);
  v_week date;
  v_closed int := 0;
  v_user uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('league:close', 0));

  FOR v_week IN
    SELECT DISTINCT week_start FROM league_cohorts
    WHERE closed_at IS NULL AND week_start < v_current_week
    ORDER BY week_start
  LOOP
    WITH ranked AS (
      SELECT m.user_id, m.week_start, m.tier, t.promote_count, t.demote_count,
             row_number() OVER (PARTITION BY m.cohort_id ORDER BY m.weekly_xp DESC, m.joined_at) AS rnk,
             count(*)     OVER (PARTITION BY m.cohort_id) AS n
      FROM league_members m
      JOIN league_cohorts c ON c.id = m.cohort_id
      JOIN league_tiers t ON t.tier = m.tier
      WHERE c.week_start = v_week AND c.closed_at IS NULL
    ),
    decided AS (
      SELECT r.*,
        CASE
          -- Scaled to cohort size; at least one promotion so a lone student
          -- in a quiet week can still climb.
          WHEN r.tier < v_top_tier
               AND r.rnk <= GREATEST(1, round(r.n * r.promote_count / 30.0)) THEN 'promoted'
          WHEN r.tier > 1
               AND r.rnk > r.n - floor(r.n * r.demote_count / 30.0) THEN 'demoted'
          ELSE 'stayed'
        END AS outcome
      FROM ranked r
    ),
    settled AS (
      UPDATE league_members m
      SET final_rank = d.rnk, result = d.outcome
      FROM decided d
      WHERE m.user_id = d.user_id AND m.week_start = d.week_start
      RETURNING m.user_id, m.tier, m.result
    )
    UPDATE user_xp u
    SET league_tier = s.tier + CASE s.result WHEN 'promoted' THEN 1 WHEN 'demoted' THEN -1 ELSE 0 END,
        updated_at = NOW()
    FROM settled s
    WHERE u.user_id = s.user_id;

    UPDATE league_cohorts SET closed_at = NOW()
    WHERE week_start = v_week AND closed_at IS NULL;
    v_closed := v_closed + 1;

    FOR v_user IN SELECT user_id FROM league_members WHERE week_start = v_week LOOP
      PERFORM evaluate_badges(v_user);
    END LOOP;
  END LOOP;

  RETURN v_closed;
END;
$$;

-- ----------------------------------------------------------------------------
-- STEP 7: award_xp() -- the only write path
--
-- XP = base(source, marks) x quality x streak multiplier, then clipped to the
-- daily cap.
--   * Marked sets pay per mark available (capped at 100), so a 40-mark mock is
--     worth more than a 6-mark quick-fire set: 10/mark practice, 12/mark
--     assignment, 15/mark mock or scanned paper -- the paper loop is the
--     product, so it pays the most.
--   * quality = 0.2 + 0.8 x score. A wrong answer still earns a fifth: the
--     attempt is the behaviour being rewarded, the marks are the bonus.
--   * Streak multiplier 1x / 1.25x (3d) / 1.5x (7d) / 2x (30d).
--   * Daily cap 3000 XP, so the leagues measure consistency, not one
--     all-nighter of re-submitted practice sets.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION award_xp(
  p_user_id uuid,
  p_source text,
  p_score numeric,
  p_marks_available numeric DEFAULT NULL,
  p_award_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_daily_cap constant int := 3000;
  v_today date := (NOW() AT TIME ZONE 'UTC')::date;
  v_week  date := date_trunc('week', NOW() AT TIME ZONE 'UTC')::date;
  v_score numeric := LEAST(1, GREATEST(0, COALESCE(p_score, 0)));
  v_marks numeric := LEAST(100, GREATEST(1, COALESCE(p_marks_available, 1)));
  v_state user_xp%ROWTYPE;
  v_streak int;
  v_daily int;
  v_base int;
  v_mult numeric;
  v_xp int;
  v_badges jsonb;
BEGIN
  IF p_source NOT IN ('exam_practice', 'mock', 'assignment', 'homework_scan',
                      'blurt', 'flashcard', 'cloze', 'review', 'tutor') THEN
    RAISE EXCEPTION 'award_xp: unknown source %', p_source;
  END IF;

  -- Before taking the user lock: close_finished_league_weeks() locks other
  -- users' rows, and must never wait behind a transaction that is itself
  -- waiting on it.
  IF EXISTS (SELECT 1 FROM league_cohorts WHERE closed_at IS NULL AND week_start < v_week) THEN
    PERFORM close_finished_league_weeks();
  END IF;

  INSERT INTO user_xp (user_id) VALUES (p_user_id) ON CONFLICT DO NOTHING;
  -- Serialises awards per user: streak, daily cap and award_key checks are
  -- all read-modify-write.
  SELECT * INTO v_state FROM user_xp WHERE user_id = p_user_id FOR UPDATE;

  IF p_award_key IS NOT NULL AND EXISTS (
    SELECT 1 FROM xp_events WHERE user_id = p_user_id AND award_key = p_award_key
  ) THEN
    RETURN jsonb_build_object(
      'xp_awarded', 0, 'duplicate', true, 'capped', false,
      'base_xp', 0, 'multiplier', 1,
      'total_xp', v_state.total_xp, 'current_streak', v_state.current_streak,
      'new_badges', '[]'::jsonb
    );
  END IF;

  v_streak := CASE
    WHEN v_state.last_active_date = v_today     THEN v_state.current_streak
    WHEN v_state.last_active_date = v_today - 1 THEN v_state.current_streak + 1
    ELSE 1
  END;
  v_daily := CASE WHEN v_state.last_active_date = v_today THEN v_state.daily_xp ELSE 0 END;

  v_base := round(
    CASE p_source
      WHEN 'exam_practice' THEN 10 * v_marks
      WHEN 'assignment'    THEN 12 * v_marks
      WHEN 'mock'          THEN 15 * v_marks
      WHEN 'homework_scan' THEN 15 * v_marks
      WHEN 'blurt'         THEN 150
      WHEN 'review'        THEN 10
      ELSE 5  -- flashcard, cloze, tutor
    END * (0.2 + 0.8 * v_score)
  );
  v_mult := xp_streak_multiplier(v_streak);
  v_xp := GREATEST(0, LEAST(round(v_base * v_mult)::int, c_daily_cap - v_daily));

  INSERT INTO xp_events (user_id, source, award_key, score, marks_available, base_xp, multiplier, xp)
  VALUES (p_user_id, p_source, p_award_key, v_score, p_marks_available, v_base, v_mult, v_xp);

  UPDATE user_xp SET
    total_xp         = total_xp + v_xp,
    daily_xp         = v_daily + v_xp,
    current_streak   = v_streak,
    longest_streak   = GREATEST(longest_streak, v_streak),
    last_active_date = v_today,
    updated_at       = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO user_activity_counts (user_id, source, activity_count, perfect_count)
  VALUES (
    p_user_id, p_source, 1,
    CASE WHEN v_score >= 1 AND p_source IN ('exam_practice', 'mock', 'assignment', 'homework_scan') THEN 1 ELSE 0 END
  )
  ON CONFLICT (user_id, source) DO UPDATE SET
    activity_count = user_activity_counts.activity_count + 1,
    perfect_count  = user_activity_counts.perfect_count + EXCLUDED.perfect_count;

  IF v_xp > 0 AND EXISTS (SELECT 1 FROM user_profiles WHERE id = p_user_id AND role = 'student') THEN
    PERFORM add_league_xp(p_user_id, v_week, v_state.league_tier, v_xp);
  END IF;

  v_badges := evaluate_badges(p_user_id);

  RETURN jsonb_build_object(
    'xp_awarded', v_xp,
    'duplicate', false,
    'capped', v_xp < round(v_base * v_mult),
    'base_xp', v_base,
    'multiplier', v_mult,
    'total_xp', v_state.total_xp + v_xp,
    'current_streak', v_streak,
    'new_badges', v_badges
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- STEP 8: Read RPCs for the signed-in user
-- ----------------------------------------------------------------------------

-- The rank panel: XP, effective streak, today's XP, the multiplier the next
-- award will get, and this week's league position.
CREATE OR REPLACE FUNCTION my_gamification()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (NOW() AT TIME ZONE 'UTC')::date;
  v_week date := date_trunc('week', NOW() AT TIME ZONE 'UTC')::date;
  v_state user_xp%ROWTYPE;
  v_streak int;
  v_next_streak int;
  v_member league_members%ROWTYPE;
  v_rank int;
  v_size int;
  v_tier league_tiers%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT * INTO v_state FROM user_xp WHERE user_id = v_uid;

  -- The stored streak is as of last_active_date; a missed whole day ends it.
  v_streak := CASE WHEN v_state.last_active_date >= v_today - 1 THEN v_state.current_streak ELSE 0 END;
  v_next_streak := CASE
    WHEN v_state.last_active_date = v_today     THEN v_state.current_streak
    WHEN v_state.last_active_date = v_today - 1 THEN v_state.current_streak + 1
    ELSE 1
  END;

  SELECT * INTO v_member FROM league_members WHERE user_id = v_uid AND week_start = v_week;
  IF FOUND THEN
    SELECT count(*) FILTER (WHERE weekly_xp > v_member.weekly_xp
                              OR (weekly_xp = v_member.weekly_xp AND joined_at < v_member.joined_at)) + 1,
           count(*)
    INTO v_rank, v_size
    FROM league_members WHERE cohort_id = v_member.cohort_id;
  END IF;

  SELECT * INTO v_tier FROM league_tiers WHERE tier = COALESCE(v_member.tier, v_state.league_tier, 1);

  RETURN jsonb_build_object(
    'total_xp', COALESCE(v_state.total_xp, 0),
    'current_streak', COALESCE(v_streak, 0),
    'longest_streak', COALESCE(v_state.longest_streak, 0),
    'today_xp', CASE WHEN v_state.last_active_date = v_today THEN v_state.daily_xp ELSE 0 END,
    'daily_cap', 3000,
    'next_multiplier', xp_streak_multiplier(v_next_streak),
    'league', jsonb_build_object(
      'tier', v_tier.tier,
      'slug', v_tier.slug,
      'name', v_tier.name,
      'placed', v_member.user_id IS NOT NULL,
      'weekly_xp', COALESCE(v_member.weekly_xp, 0),
      'rank', v_rank,
      'cohort_size', v_size,
      'week_ends_at', ((v_week + 7)::timestamp AT TIME ZONE 'UTC')
    )
  );
END;
$$;

-- Every badge with the caller's progress toward it.
CREATE OR REPLACE FUNCTION my_badges()
RETURNS TABLE (
  id text, name text, description text, icon text, criterion text,
  threshold int, progress bigint, earned_at timestamptz, sort_order int
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id, b.name, b.description, b.icon, b.criterion, b.threshold,
         LEAST(p.value, b.threshold), ub.earned_at, b.sort_order
  FROM badges b
  JOIN badge_progress(auth.uid()) p ON p.badge_id = b.id
  LEFT JOIN user_badges ub ON ub.badge_id = b.id AND ub.user_id = auth.uid()
  WHERE auth.uid() IS NOT NULL
  ORDER BY b.sort_order;
$$;

-- This week's cohort standings. Other members are shown by USERNAME only --
-- leagues mix students from different schools, so no real name or email ever
-- leaves this function. A student with no username shows as a stable
-- anonymous callsign.
CREATE OR REPLACE FUNCTION my_league()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_week date := date_trunc('week', NOW() AT TIME ZONE 'UTC')::date;
  v_member league_members%ROWTYPE;
  v_tier league_tiers%ROWTYPE;
  v_size int;
  v_promote int;
  v_demote int;
  v_members jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT * INTO v_member FROM league_members WHERE user_id = v_uid AND week_start = v_week;
  IF NOT FOUND THEN
    SELECT t.* INTO v_tier FROM league_tiers t
    WHERE t.tier = COALESCE((SELECT league_tier FROM user_xp WHERE user_id = v_uid), 1);
    RETURN jsonb_build_object(
      'placed', false,
      'tier', v_tier.tier, 'slug', v_tier.slug, 'name', v_tier.name,
      'week_start', v_week,
      'week_ends_at', ((v_week + 7)::timestamp AT TIME ZONE 'UTC'),
      'members', '[]'::jsonb
    );
  END IF;

  SELECT * INTO v_tier FROM league_tiers WHERE tier = v_member.tier;
  SELECT count(*) INTO v_size FROM league_members WHERE cohort_id = v_member.cohort_id;
  -- Same scaling as close_finished_league_weeks(), so the zones drawn on the
  -- table are the zones that will actually be applied.
  v_promote := CASE WHEN v_tier.tier < (SELECT max(tier) FROM league_tiers)
                    THEN GREATEST(1, round(v_size * v_tier.promote_count / 30.0)) ELSE 0 END;
  v_demote  := CASE WHEN v_tier.tier > 1 THEN floor(v_size * v_tier.demote_count / 30.0) ELSE 0 END;

  SELECT jsonb_agg(jsonb_build_object(
           'rank', r.rnk,
           'display_name', r.display_name,
           'weekly_xp', r.weekly_xp,
           'is_me', r.user_id = v_uid,
           'zone', CASE WHEN r.rnk <= v_promote THEN 'promote'
                        WHEN r.rnk > v_size - v_demote THEN 'demote'
                        ELSE 'safe' END
         ) ORDER BY r.rnk)
  INTO v_members
  FROM (
    SELECT m.user_id, m.weekly_xp,
           COALESCE(NULLIF(p.username, ''), 'Cadet-' || upper(left(md5(m.user_id::text), 4))) AS display_name,
           row_number() OVER (ORDER BY m.weekly_xp DESC, m.joined_at) AS rnk
    FROM league_members m
    LEFT JOIN user_profiles p ON p.id = m.user_id
    WHERE m.cohort_id = v_member.cohort_id
  ) r;

  RETURN jsonb_build_object(
    'placed', true,
    'tier', v_tier.tier, 'slug', v_tier.slug, 'name', v_tier.name,
    'week_start', v_week,
    'week_ends_at', ((v_week + 7)::timestamp AT TIME ZONE 'UTC'),
    'promote_count', v_promote,
    'demote_count', v_demote,
    'members', COALESCE(v_members, '[]'::jsonb)
  );
END;
$$;

-- Class leaderboard with REAL names: classmates already know each other, and
-- the class's own teacher sees it too. Callable by an active member of the
-- class or its teacher; anyone else gets no rows.
CREATE OR REPLACE FUNCTION class_leaderboard(p_class_id uuid, p_period text DEFAULT 'week')
RETURNS TABLE (rank bigint, student_id uuid, display_name text, xp bigint, total_xp bigint, is_me boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_week_start timestamptz := (date_trunc('week', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
BEGIN
  IF p_period NOT IN ('week', 'all_time') THEN
    RAISE EXCEPTION 'class_leaderboard: period must be week or all_time';
  END IF;

  IF NOT (
    -- Qualified throughout: student_id is also an OUT column of this function.
    EXISTS (SELECT 1 FROM class_students m
            WHERE m.class_id = p_class_id AND m.student_id = v_uid AND m.status = 'active')
    OR EXISTS (SELECT 1 FROM classes c JOIN teachers t ON t.id = c.teacher_id
               WHERE c.id = p_class_id AND t.user_id = v_uid)
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT row_number() OVER (ORDER BY s.xp DESC, s.name) AS rank,
         s.student_id, s.name, s.xp, s.total_xp, s.student_id = v_uid
  FROM (
    SELECT cs.student_id,
           COALESCE(NULLIF(trim(p.full_name), ''),
                    NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
                    p.username, 'Student') AS name,
           CASE WHEN p_period = 'all_time' THEN COALESCE(x.total_xp, 0)
                ELSE COALESCE((SELECT sum(e.xp) FROM xp_events e
                               WHERE e.user_id = cs.student_id AND e.created_at >= v_week_start), 0)
           END::bigint AS xp,
           COALESCE(x.total_xp, 0)::bigint AS total_xp
    FROM class_students cs
    LEFT JOIN user_profiles p ON p.id = cs.student_id
    LEFT JOIN user_xp x ON x.user_id = cs.student_id
    WHERE cs.class_id = p_class_id AND cs.status = 'active'
  ) s;
END;
$$;

-- ----------------------------------------------------------------------------
-- STEP 9: Grants
--
-- Supabase's default privileges grant EXECUTE on new public functions to anon
-- and authenticated explicitly, so revoking from PUBLIC alone is not enough.
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION award_xp(uuid, text, numeric, numeric, text) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION award_xp(uuid, text, numeric, numeric, text) TO service_role;

REVOKE EXECUTE ON FUNCTION add_league_xp(uuid, date, smallint, int) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION close_finished_league_weeks()            FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION evaluate_badges(uuid)                    FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION badge_progress(uuid)                     FROM public, anon, authenticated;

REVOKE EXECUTE ON FUNCTION my_gamification()               FROM public, anon;
REVOKE EXECUTE ON FUNCTION my_badges()                     FROM public, anon;
REVOKE EXECUTE ON FUNCTION my_league()                     FROM public, anon;
REVOKE EXECUTE ON FUNCTION class_leaderboard(uuid, text)   FROM public, anon;
GRANT  EXECUTE ON FUNCTION my_gamification()               TO authenticated;
GRANT  EXECUTE ON FUNCTION my_badges()                     TO authenticated;
GRANT  EXECUTE ON FUNCTION my_league()                     TO authenticated;
GRANT  EXECUTE ON FUNCTION class_leaderboard(uuid, text)   TO authenticated;

-- ----------------------------------------------------------------------------
-- STEP 10: Weekly close-out. award_xp() also closes lazily; this is what
-- settles the week for students who earn nothing on Monday.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM cron.unschedule('close-league-weeks');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule('close-league-weeks', '0 0 * * 1', 'SELECT close_finished_league_weeks();');
