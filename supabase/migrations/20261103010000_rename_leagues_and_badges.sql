-- ============================================================================
-- Rename league tiers and badges so a Year 10 can read them cold.
--
-- The original tiers (Stratosphere, Jovian, Pulsar, Quasar, Singularity...)
-- assumed an astronomy vocabulary most students do not have, so their order
-- was invisible. Leagues are now a SIZE ladder -- each is a bigger object
-- than the last -- and level titles (src/lib/gamification/levels.ts) are a
-- separate TECHNOLOGY ladder, so the two never share a word.
--
-- Badge names become plain statements of what earned them. Badge ids are
-- unchanged: user_badges references them without ON UPDATE CASCADE, and an id
-- is never shown to a student.
--
-- Tier numbers, promote/demote counts and every threshold are unchanged, so
-- this moves nobody.
-- ============================================================================

UPDATE league_tiers t SET slug = v.slug, name = v.name
FROM (VALUES
  (1,  'rock',         'Rock'),
  (2,  'asteroid',     'Asteroid'),
  (3,  'moon',         'Moon'),
  (4,  'planet',       'Planet'),
  (5,  'giant-planet', 'Giant Planet'),
  (6,  'star',         'Star'),
  (7,  'giant-star',   'Giant Star'),
  (8,  'star-cluster', 'Star Cluster'),
  (9,  'galaxy',       'Galaxy'),
  (10, 'universe',     'Universe')
) AS v(tier, slug, name)
WHERE t.tier = v.tier;

UPDATE badges b SET name = v.name, description = v.description
FROM (VALUES
  ('first-contact',     'First XP',            'Earn your first XP.'),
  ('liftoff',           '1,000 XP',            'Earn 1,000 XP in total.'),
  ('escape-velocity',   '10,000 XP',           'Earn 10,000 XP in total.'),
  ('interstellar',      '50,000 XP',           'Earn 50,000 XP in total.'),
  ('ignition',          '3-Day Streak',        'Study 3 days in a row.'),
  ('orbit-locked',      '7-Day Streak',        'Study 7 days in a row.'),
  ('lunar-cycle',       '30-Day Streak',       'Study 30 days in a row.'),
  ('deep-space',        '100-Day Streak',      'Study 100 days in a row.'),
  ('flight-simulator',  '10 Practice Sets',    'Complete 10 practice sets.'),
  ('mission-ready',     '5 Mock Exams',        'Sit 5 timed mock exams.'),
  ('mission-log',       '10 Assignments',      'Complete 10 assignments.'),
  ('ground-control',    '5 Paper Uploads',     'Upload 5 handwritten papers for marking.'),
  ('void-blurter',      '5 Blurts',            'Finish 5 blurting sessions.'),
  ('star-charter',      '100 Flashcards',      'Review 100 flashcards.'),
  ('telemetry-check',   '50 Review Questions', 'Answer 50 daily review questions.'),
  ('perfect-docking',   'Full Marks',          'Score full marks on a marked set.'),
  ('flawless-orbit',    'Full Marks x10',      'Score full marks on 10 marked sets.'),
  ('jovian-ascent',     'Star League',         'Reach the Star league.'),
  ('singularity',       'Universe League',     'Reach the Universe league, the top one.'),
  ('mission-commander', 'League Winner',       'Finish first in a weekly league of 5 or more.')
) AS v(id, name, description)
WHERE b.id = v.id;

-- my_league(): unchanged except the anonymous callsign. "Cadet" was a level
-- title; a student with no username must not appear to hold a rank they
-- do not.
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
           COALESCE(NULLIF(p.username, ''), 'Explorer-' || upper(left(md5(m.user_id::text), 4))) AS display_name,
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

REVOKE EXECUTE ON FUNCTION my_league() FROM public, anon;
GRANT  EXECUTE ON FUNCTION my_league() TO authenticated;
