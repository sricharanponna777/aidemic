-- ============================================================================
-- my_notifications(): the top-bar bell's feed for the signed-in student.
--
-- Read-only and derived -- there is no notifications table. Every item is a
-- row that already exists for another reason:
--   * badge        -- user_badges.earned_at
--   * league       -- a settled week in league_members (closed cohorts only)
--   * parent_link  -- a parent's pending link request, awaiting the student
--
-- SECURITY DEFINER because league_members has no SELECT policy at all (other
-- members' rows must stay private); this returns only the caller's own rows,
-- plus each cohort's size. Wording is composed client-side
-- (src/lib/notifications.ts) so all student-facing copy lives in one place.
--
-- "Read" state is per device (browser storage), deliberately: nothing here is
-- something a student must act on except the parent request, and that stays
-- in the feed for as long as it is pending.
-- ============================================================================

CREATE OR REPLACE FUNCTION my_notifications(p_limit int DEFAULT 20)
RETURNS TABLE (id text, kind text, at timestamptz, data jsonb)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT x.id, x.kind, x.at, x.data FROM (
    SELECT 'badge:' || b.id AS id, 'badge' AS kind, ub.earned_at AS at,
           jsonb_build_object('name', b.name, 'description', b.description, 'icon', b.icon) AS data
    FROM user_badges ub
    JOIN badges b ON b.id = ub.badge_id
    WHERE ub.user_id = auth.uid()

    UNION ALL

    SELECT 'league:' || m.week_start, 'league', c.closed_at,
           jsonb_build_object(
             'result', m.result,
             'rank', m.final_rank,
             'cohort_size', (SELECT count(*) FROM league_members o WHERE o.cohort_id = m.cohort_id),
             'from_tier', t.name,
             'to_tier', COALESCE(nt.name, t.name)
           )
    FROM league_members m
    JOIN league_cohorts c ON c.id = m.cohort_id
    JOIN league_tiers t ON t.tier = m.tier
    LEFT JOIN league_tiers nt ON nt.tier = m.tier + CASE m.result WHEN 'promoted' THEN 1 WHEN 'demoted' THEN -1 ELSE 0 END
    WHERE m.user_id = auth.uid() AND m.result IS NOT NULL AND c.closed_at IS NOT NULL

    UNION ALL

    SELECT 'parent-link:' || l.id, 'parent_link', l.created_at, '{}'::jsonb
    FROM parent_links l
    WHERE l.student_id = auth.uid() AND l.status = 'pending' AND l.link_source = 'parent'
  ) x
  WHERE auth.uid() IS NOT NULL
  ORDER BY x.at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
$$;

REVOKE EXECUTE ON FUNCTION my_notifications(int) FROM public, anon;
GRANT  EXECUTE ON FUNCTION my_notifications(int) TO authenticated;
