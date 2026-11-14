-- ============================================================================
-- School admin workspace; the platform admin is gone.
--
-- Before this migration, AIDemic ran an in-app "platform admin" that reviewed
-- headteacher claims and teachers at schools with no admin. That is removed
-- outright -- table, queue, decision RPCs and the onboarding claim -- and
-- appointing a school's first admin is now a manual, service-role-only step:
--
--   select grant_school_admin('head@school.sch.uk');
--   select grant_school_admin('head@school.sch.uk', '<school uuid>');  -- also sets the school
--   select revoke_school_admin('head@school.sch.uk');
--   select set_teacher_verification('teacher@school.sch.uk', 'approved');
--
-- From there a school admin runs their own school from /dashboard/school,
-- entirely through the school_admin_* RPCs below. Every one of them resolves the
-- caller's school itself (my_admin_school_id), so no parameter can point an
-- admin at another school.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Remove the platform admin.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS platform_admin_queue();
DROP FUNCTION IF EXISTS platform_approve_teacher(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS platform_reject_teacher(UUID);
DROP FUNCTION IF EXISTS grant_platform_admin(TEXT);
-- Removed by 20260904000000 on the live project, but they read platform_admins,
-- so a database that skipped that file would otherwise fail the DROP TABLE.
DROP FUNCTION IF EXISTS approve_school(UUID);
DROP FUNCTION IF EXISTS reject_school(UUID);
DROP TABLE IF EXISTS platform_admins;

-- ----------------------------------------------------------------------------
-- 2. Remove headteacher claims.
--
-- With nobody in the app to review a claim, the flag only ever recorded a wish.
-- A teacher who claimed becomes an ordinary pending teacher: their school admin
-- approves them, or AIDemic appoints them with grant_school_admin().
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS claim_school_admin(UUID);
DROP FUNCTION IF EXISTS request_unverified_school_admin(UUID);

-- ----------------------------------------------------------------------------
-- 3. The guard trigger, without claims and without the client-side approval path.
--
-- Same reasoning as 20260904000000: "Users can update their own teacher
-- profile" has no column restriction, so these columns are read-only to clients
-- and move only through SECURITY DEFINER functions that set aidemic.privileged.
-- verification_status used to be writable directly by a school admin; it is now
-- RPC-only too, so the rules about who may approve, revoke or restore whom live
-- in exactly one place (school_admin_set_teacher_status).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guard_teacher_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('aidemic.privileged', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.is_school_admin := false;
    NEW.verification_status := 'pending';
    NEW.verification_requested_at := now();
    RETURN NEW;
  END IF;

  IF NEW.is_school_admin IS DISTINCT FROM OLD.is_school_admin THEN
    RAISE EXCEPTION 'School admin rights are changed by your school admin or by AIDemic support';
  END IF;

  IF NEW.school_id IS DISTINCT FROM OLD.school_id AND OLD.school_id IS NOT NULL THEN
    RAISE EXCEPTION 'Contact AIDemic support to move to a different school';
  END IF;

  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
    RAISE EXCEPTION 'Only your school admin can change your verification status';
  END IF;

  IF NEW.verification_requested_at IS DISTINCT FROM OLD.verification_requested_at THEN
    RAISE EXCEPTION 'Verification queue position is not set by update';
  END IF;

  RETURN NEW;
END;
$$;

-- The guard no longer mentions the column, so it can go.
ALTER TABLE teachers DROP COLUMN IF EXISTS claimed_school_admin;

-- The only client write this policy existed for was a school admin flipping
-- verification_status, which the guard above now refuses. Left in place it would
-- let any school admin edit a colleague's department and qualification.
DROP POLICY IF EXISTS "School admins can update teachers at their school" ON teachers;

-- ----------------------------------------------------------------------------
-- 4. A revoked admin is not an admin.
--
-- is_school_admin_for() checked the flag alone, so a school admin whose account
-- was later rejected still passed every RLS policy built on it (rosters, student
-- profiles, parent links, mastery).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_school_admin_for(p_school_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM teachers
    WHERE user_id = auth.uid()
      AND school_id = p_school_id
      AND is_school_admin = true
      AND verification_status = 'approved'
  );
$$;

-- ----------------------------------------------------------------------------
-- 5. Manual configuration (SQL editor / service role only).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION grant_school_admin(p_email TEXT, p_school_id UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_school_id UUID;
  v_school_name TEXT;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(btrim(p_email)) LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No account with email %', p_email;
  END IF;

  SELECT coalesce(p_school_id, school_id) INTO v_school_id FROM teachers WHERE user_id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '% has no teacher profile yet -- they must finish teacher onboarding first', p_email;
  END IF;
  IF v_school_id IS NULL THEN
    RAISE EXCEPTION '% has no school -- pass one: grant_school_admin(email, school_id)', p_email;
  END IF;

  SELECT name INTO v_school_name FROM schools WHERE id = v_school_id;
  IF v_school_name IS NULL THEN
    RAISE EXCEPTION 'No school with id %', v_school_id;
  END IF;

  PERFORM set_config('aidemic.privileged', 'on', true);
  UPDATE teachers
  SET school_id = v_school_id,
      is_school_admin = true,
      verification_status = 'approved'
  WHERE user_id = v_user_id;
  PERFORM set_config('aidemic.privileged', 'off', true);

  RETURN format('%s is now school admin of %s', p_email, v_school_name);
END;
$$;

CREATE OR REPLACE FUNCTION revoke_school_admin(p_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT;
BEGIN
  PERFORM set_config('aidemic.privileged', 'on', true);
  UPDATE teachers t
  SET is_school_admin = false
  FROM auth.users u
  WHERE u.id = t.user_id AND lower(u.email) = lower(btrim(p_email));
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  PERFORM set_config('aidemic.privileged', 'off', true);

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'No teacher with email %', p_email;
  END IF;
  -- Still an approved teacher; only the admin rights go.
  RETURN format('%s is no longer a school admin', p_email);
END;
$$;

-- For a teacher at a school that has no admin yet, or any manual correction.
CREATE OR REPLACE FUNCTION set_teacher_verification(p_email TEXT, p_status TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT;
BEGIN
  IF p_status NOT IN ('pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'Status must be pending, approved or rejected';
  END IF;

  PERFORM set_config('aidemic.privileged', 'on', true);
  UPDATE teachers t
  SET verification_status = p_status,
      -- A rejected admin keeping the flag would be an admin again the moment
      -- someone restored them, without anyone deciding that.
      is_school_admin = CASE WHEN p_status = 'approved' THEN t.is_school_admin ELSE false END
  FROM auth.users u
  WHERE u.id = t.user_id AND lower(u.email) = lower(btrim(p_email));
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  PERFORM set_config('aidemic.privileged', 'off', true);

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'No teacher with email %', p_email;
  END IF;
  RETURN format('%s is now %s', p_email, p_status);
END;
$$;

REVOKE ALL ON FUNCTION grant_school_admin(TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION revoke_school_admin(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION set_teacher_verification(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6. The school admin workspace.
-- ----------------------------------------------------------------------------

-- The caller's school, if they are an approved admin of it; NULL otherwise.
-- Internal: only the SECURITY DEFINER functions below call it.
CREATE OR REPLACE FUNCTION my_admin_school_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT school_id FROM teachers
  WHERE user_id = auth.uid()
    AND is_school_admin = true
    AND verification_status = 'approved'
    AND school_id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION my_admin_school_id() FROM PUBLIC, anon, authenticated;

-- Students at a school: active members of any class taught by a teacher there.
-- Same definition is_school_admin_of_student() uses for RLS.
CREATE OR REPLACE FUNCTION school_student_ids(p_school_id UUID)
RETURNS TABLE (student_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT cs.student_id
  FROM class_students cs
  JOIN classes c ON c.id = cs.class_id
  JOIN teachers t ON t.id = c.teacher_id
  WHERE t.school_id = p_school_id AND cs.status = 'active';
$$;

REVOKE ALL ON FUNCTION school_student_ids(UUID) FROM PUBLIC, anon, authenticated;

-- The school the caller administers, for the workspace header.
CREATE OR REPLACE FUNCTION school_admin_school()
RETURNS TABLE (id UUID, name TEXT, town TEXT, postcode TEXT, nation TEXT, local_authority TEXT, phase TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school UUID := my_admin_school_id();
BEGIN
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'Not a school admin';
  END IF;
  RETURN QUERY
  SELECT s.id, s.name, s.town, s.postcode, s.nation, s.local_authority, s.phase
  FROM schools s WHERE s.id = v_school;
END;
$$;

-- Every teacher at the school, whatever their status.
CREATE OR REPLACE FUNCTION school_admin_staff()
RETURNS TABLE (
  teacher_id UUID,
  user_id UUID,
  full_name TEXT,
  email TEXT,
  department TEXT,
  qualification_level TEXT,
  verification_status TEXT,
  is_school_admin BOOLEAN,
  is_self BOOLEAN,
  requested_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ,
  class_count INT,
  student_count INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school UUID := my_admin_school_id();
BEGIN
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'Not a school admin';
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.user_id,
    p.full_name,
    p.email,
    t.department,
    t.qualification_level,
    t.verification_status,
    t.is_school_admin,
    t.user_id = auth.uid(),
    t.verification_requested_at,
    t.created_at,
    (SELECT count(*)::INT FROM classes c WHERE c.teacher_id = t.id AND c.status = 'active'),
    (SELECT count(DISTINCT cs.student_id)::INT
       FROM classes c JOIN class_students cs ON cs.class_id = c.id
      WHERE c.teacher_id = t.id AND cs.status = 'active')
  FROM teachers t
  LEFT JOIN user_profiles p ON p.id = t.user_id
  WHERE t.school_id = v_school
  ORDER BY
    (t.verification_status = 'pending') DESC,
    t.verification_requested_at ASC;
END;
$$;

-- Approve, reject, revoke or restore a colleague.
CREATE OR REPLACE FUNCTION school_admin_set_teacher_status(p_teacher_id UUID, p_status TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school UUID := my_admin_school_id();
  v_target RECORD;
BEGIN
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'Not a school admin';
  END IF;
  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Status must be approved or rejected';
  END IF;

  SELECT t.user_id, t.is_school_admin, t.verification_status INTO v_target
  FROM teachers t WHERE t.id = p_teacher_id AND t.school_id = v_school
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That teacher is not at your school';
  END IF;
  IF v_target.user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own access';
  END IF;
  -- A co-admin must be demoted first, so that removing an admin is always a
  -- deliberate two-step act rather than a side effect of "revoke".
  IF v_target.is_school_admin THEN
    RAISE EXCEPTION 'Remove their school admin rights before changing their access';
  END IF;

  PERFORM set_config('aidemic.privileged', 'on', true);
  UPDATE teachers SET verification_status = p_status WHERE id = p_teacher_id;
  PERFORM set_config('aidemic.privileged', 'off', true);
END;
$$;

-- Promote or demote a co-admin.
CREATE OR REPLACE FUNCTION school_admin_set_admin(p_teacher_id UUID, p_is_admin BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school UUID := my_admin_school_id();
  v_target RECORD;
BEGIN
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'Not a school admin';
  END IF;

  SELECT t.user_id, t.verification_status INTO v_target
  FROM teachers t WHERE t.id = p_teacher_id AND t.school_id = v_school
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That teacher is not at your school';
  END IF;
  -- Stops the last admin locking the school out. Another admin, or AIDemic
  -- support, can still remove you.
  IF v_target.user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own admin rights';
  END IF;
  IF p_is_admin AND v_target.verification_status <> 'approved' THEN
    RAISE EXCEPTION 'Approve this teacher before making them a school admin';
  END IF;

  PERFORM set_config('aidemic.privileged', 'on', true);
  UPDATE teachers SET is_school_admin = coalesce(p_is_admin, false) WHERE id = p_teacher_id;
  PERFORM set_config('aidemic.privileged', 'off', true);
END;
$$;

-- Every class at the school, with its teacher and assignment activity.
CREATE OR REPLACE FUNCTION school_admin_classes()
RETURNS TABLE (
  class_id UUID,
  name TEXT,
  status TEXT,
  academic_year TEXT,
  created_at TIMESTAMPTZ,
  teacher_id UUID,
  teacher_name TEXT,
  subject_name TEXT,
  qualification_name TEXT,
  student_count INT,
  published_assignments INT,
  completed_attempts INT,
  expected_attempts INT,
  average_percentage NUMERIC,
  last_activity_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school UUID := my_admin_school_id();
BEGIN
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'Not a school admin';
  END IF;

  RETURN QUERY
  WITH cls AS (
    SELECT c.*, t.user_id AS teacher_user_id
    FROM classes c JOIN teachers t ON t.id = c.teacher_id
    WHERE t.school_id = v_school
  ),
  roster AS (
    SELECT cs.class_id, count(DISTINCT cs.student_id)::INT AS n
    FROM class_students cs JOIN cls ON cls.id = cs.class_id
    WHERE cs.status = 'active'
    GROUP BY cs.class_id
  ),
  published AS (
    SELECT a.class_id, count(*)::INT AS n
    FROM assignments a JOIN cls ON cls.id = a.class_id
    WHERE a.status = 'published'
    GROUP BY a.class_id
  ),
  done AS (
    -- One completion per student per assignment, from current members only, so
    -- the rate below cannot pass 100% on reattempts or departed students.
    SELECT a.class_id,
           count(DISTINCT (aa.assignment_id, aa.student_id))::INT AS n,
           avg(aa.percentage) AS avg_pct,
           max(aa.completed_at) AS last_at
    FROM assignment_attempts aa
    JOIN assignments a ON a.id = aa.assignment_id
    JOIN cls ON cls.id = a.class_id
    JOIN class_students cs ON cs.class_id = a.class_id AND cs.student_id = aa.student_id AND cs.status = 'active'
    WHERE aa.status = 'completed' AND a.status = 'published'
    GROUP BY a.class_id
  )
  SELECT
    cls.id,
    cls.name,
    cls.status,
    cls.academic_year,
    cls.created_at,
    cls.teacher_id,
    coalesce(nullif(btrim(p.full_name), ''), p.email),
    sub.name,
    q.name,
    coalesce(roster.n, 0),
    coalesce(published.n, 0),
    coalesce(done.n, 0),
    coalesce(roster.n, 0) * coalesce(published.n, 0),
    round(done.avg_pct, 1),
    done.last_at
  FROM cls
  LEFT JOIN user_profiles p ON p.id = cls.teacher_user_id
  LEFT JOIN specifications sp ON sp.id = cls.specification_id
  LEFT JOIN subjects sub ON sub.id = sp.subject_id
  LEFT JOIN exam_boards eb ON eb.id = sub.exam_board_id
  LEFT JOIN qualifications q ON q.id = eb.qualification_id
  LEFT JOIN roster ON roster.class_id = cls.id
  LEFT JOIN published ON published.class_id = cls.id
  LEFT JOIN done ON done.class_id = cls.id
  ORDER BY (cls.status = 'active') DESC, cls.name;
END;
$$;

-- Every student at the school, with their classes, parent links and results.
CREATE OR REPLACE FUNCTION school_admin_students()
RETURNS TABLE (
  student_id UUID,
  full_name TEXT,
  email TEXT,
  class_names TEXT[],
  active_parent_links INT,
  pending_parent_links INT,
  completed_assignments INT,
  average_percentage NUMERIC,
  last_active_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school UUID := my_admin_school_id();
BEGIN
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'Not a school admin';
  END IF;

  RETURN QUERY
  WITH s AS (SELECT ids.student_id FROM school_student_ids(v_school) ids)
  SELECT
    s.student_id,
    p.full_name,
    p.email,
    (SELECT array_agg(DISTINCT c.name ORDER BY c.name)
       FROM class_students cs
       JOIN classes c ON c.id = cs.class_id
       JOIN teachers t ON t.id = c.teacher_id
      WHERE cs.student_id = s.student_id AND cs.status = 'active' AND t.school_id = v_school),
    (SELECT count(*)::INT FROM parent_links pl WHERE pl.student_id = s.student_id AND pl.status = 'active'),
    (SELECT count(*)::INT FROM parent_links pl WHERE pl.student_id = s.student_id AND pl.status = 'pending'),
    att.n,
    att.avg_pct,
    greatest(
      att.last_at,
      (SELECT max(ss.started_at) FROM study_sessions ss WHERE ss.user_id = s.student_id),
      (SELECT max(e.created_at) FROM exam_practice_attempts e WHERE e.user_id = s.student_id)
    )
  FROM s
  LEFT JOIN user_profiles p ON p.id = s.student_id
  LEFT JOIN LATERAL (
    -- Only assignments set at this school: a student's results elsewhere are
    -- not this admin's to see.
    SELECT count(*)::INT AS n, round(avg(aa.percentage), 1) AS avg_pct, max(aa.completed_at) AS last_at
    FROM assignment_attempts aa
    JOIN assignments a ON a.id = aa.assignment_id
    JOIN classes c ON c.id = a.class_id
    JOIN teachers t ON t.id = c.teacher_id
    WHERE aa.student_id = s.student_id AND aa.status = 'completed' AND t.school_id = v_school
  ) att ON true
  ORDER BY lower(coalesce(p.full_name, p.email, ''));
END;
$$;

-- School-wide numbers for the overview page.
CREATE OR REPLACE FUNCTION school_admin_analytics()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school UUID := my_admin_school_id();
  v_result JSONB;
BEGIN
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'Not a school admin';
  END IF;

  WITH students AS (SELECT ids.student_id FROM school_student_ids(v_school) ids),
  cls AS (
    SELECT c.id, c.status FROM classes c JOIN teachers t ON t.id = c.teacher_id
    WHERE t.school_id = v_school
  ),
  pub AS (
    SELECT a.id, a.class_id, a.topic_id FROM assignments a JOIN cls ON cls.id = a.class_id
    WHERE a.status = 'published'
  ),
  -- Latest completed attempt per student per assignment, members only.
  done AS (
    SELECT DISTINCT ON (aa.assignment_id, aa.student_id)
      aa.assignment_id, aa.student_id, aa.percentage, aa.predicted_grade, aa.completed_at, pub.topic_id
    FROM assignment_attempts aa
    JOIN pub ON pub.id = aa.assignment_id
    JOIN class_students cs ON cs.class_id = pub.class_id AND cs.student_id = aa.student_id AND cs.status = 'active'
    WHERE aa.status = 'completed'
    ORDER BY aa.assignment_id, aa.student_id, aa.completed_at DESC NULLS LAST
  ),
  expected AS (
    SELECT count(*)::INT AS n
    FROM pub JOIN class_students cs ON cs.class_id = pub.class_id AND cs.status = 'active'
  ),
  active7 AS (
    SELECT count(*)::INT AS n FROM students s
    WHERE EXISTS (SELECT 1 FROM study_sessions ss WHERE ss.user_id = s.student_id AND ss.started_at > now() - interval '7 days')
       OR EXISTS (SELECT 1 FROM exam_practice_attempts e WHERE e.user_id = s.student_id AND e.created_at > now() - interval '7 days')
       OR EXISTS (SELECT 1 FROM assignment_attempts aa WHERE aa.student_id = s.student_id AND aa.completed_at > now() - interval '7 days')
  )
  SELECT jsonb_build_object(
    'teachers_approved', (SELECT count(*) FROM teachers WHERE school_id = v_school AND verification_status = 'approved'),
    'teachers_pending', (SELECT count(*) FROM teachers WHERE school_id = v_school AND verification_status = 'pending'),
    'admins', (SELECT count(*) FROM teachers WHERE school_id = v_school AND is_school_admin AND verification_status = 'approved'),
    'classes_active', (SELECT count(*) FROM cls WHERE status = 'active'),
    'students', (SELECT count(*) FROM students),
    'students_active_7d', (SELECT n FROM active7),
    'students_with_parent', (SELECT count(*) FROM students s WHERE EXISTS (
        SELECT 1 FROM parent_links pl WHERE pl.student_id = s.student_id AND pl.status = 'active')),
    'assignments_published', (SELECT count(*) FROM pub),
    'completed_attempts', (SELECT count(*) FROM done),
    'expected_attempts', (SELECT n FROM expected),
    'average_percentage', (SELECT round(avg(percentage), 1) FROM done),
    'grades', coalesce((
      SELECT jsonb_agg(jsonb_build_object('grade', g.grade, 'count', g.n) ORDER BY g.n DESC)
      FROM (SELECT predicted_grade AS grade, count(*)::INT AS n FROM done
            WHERE predicted_grade IS NOT NULL AND btrim(predicted_grade) <> ''
            GROUP BY predicted_grade) g
    ), '[]'::jsonb),
    'weak_topics', coalesce((
      SELECT jsonb_agg(jsonb_build_object('topic', w.name, 'attempts', w.n, 'average_percentage', w.avg_pct) ORDER BY w.avg_pct ASC)
      FROM (
        SELECT tp.name, count(*)::INT AS n, round(avg(d.percentage), 1) AS avg_pct
        FROM done d JOIN topics tp ON tp.id = d.topic_id
        WHERE d.percentage IS NOT NULL
        GROUP BY tp.name
        ORDER BY avg(d.percentage) ASC
        LIMIT 6
      ) w
    ), '[]'::jsonb),
    'weekly_completions', coalesce((
      SELECT jsonb_agg(jsonb_build_object('week', to_char(wk.week, 'YYYY-MM-DD'), 'count', coalesce(c.n, 0)) ORDER BY wk.week)
      FROM generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') AS wk(week)
      LEFT JOIN (
        SELECT date_trunc('week', completed_at) AS week, count(*)::INT AS n FROM done
        WHERE completed_at IS NOT NULL GROUP BY 1
      ) c ON c.week = wk.week
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION school_admin_school() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION school_admin_staff() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION school_admin_set_teacher_status(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION school_admin_set_admin(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION school_admin_classes() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION school_admin_students() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION school_admin_analytics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION school_admin_school() TO authenticated;
GRANT EXECUTE ON FUNCTION school_admin_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION school_admin_set_teacher_status(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION school_admin_set_admin(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION school_admin_classes() TO authenticated;
GRANT EXECUTE ON FUNCTION school_admin_students() TO authenticated;
GRANT EXECUTE ON FUNCTION school_admin_analytics() TO authenticated;
