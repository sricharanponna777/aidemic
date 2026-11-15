-- ============================================================================
-- A school admin is its own kind of account, not a teacher.
--
-- 20261114000000 modelled an admin as a teachers row with is_school_admin =
-- true, so every admin also had the teacher dashboard and could hold classes.
-- An admin now:
--
--   * has user_profiles.role = 'school_admin';
--   * is linked to exactly one school by a school_admins row -- the only thing
--     any policy or RPC checks;
--   * has no teachers row, so they cannot hold classes, set work, or appear on
--     the Staff list they manage;
--   * is appointed and removed only by AIDemic, from the SQL editor:
--
--       select grant_school_admin('head@school.sch.uk', '<school uuid>');
--       select revoke_school_admin('head@school.sch.uk');
--
-- Co-admin promotion from the Staff page is gone with it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The role and the link table.
-- ----------------------------------------------------------------------------
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role = ANY (ARRAY['student', 'teacher', 'parent', 'school_admin']));

CREATE TABLE IF NOT EXISTS school_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS school_admins_school_id_idx ON school_admins (school_id);

-- Readable by the admin themselves (the proxy's gate); written only by the
-- service-role functions below, so there is no write policy at all.
ALTER TABLE school_admins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "School admins can view their own row" ON school_admins;
CREATE POLICY "School admins can view their own row" ON school_admins
  FOR SELECT USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 2. 'school_admin' is not a role anyone can give themselves.
--
-- "Users can update their own profile" has no column restriction, so without
-- this a student could PATCH role = 'school_admin' (harmless on its own -- no
-- school_admins row, no data -- but the proxy and shell branch on role), and
-- an admin could PATCH themselves back to 'teacher' and onboard as one.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guard_school_admin_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('aidemic.privileged', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.role = 'school_admin' THEN
    RAISE EXCEPTION 'School admin accounts are set up by AIDemic support';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role
     AND (NEW.role = 'school_admin' OR OLD.role = 'school_admin') THEN
    RAISE EXCEPTION 'School admin accounts are set up by AIDemic support';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_profiles_guard_school_admin_role ON user_profiles;
CREATE TRIGGER user_profiles_guard_school_admin_role
  BEFORE INSERT OR UPDATE OF role ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION guard_school_admin_role();

-- ----------------------------------------------------------------------------
-- 3. Move existing admins off their teachers row.
--
-- Deleting a teachers row cascades to its classes, assignments and every
-- student's attempts, so an admin who still holds classes is refused outright
-- rather than silently losing them. (On the live project there is one admin,
-- with no classes.)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_blocked TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'teachers' AND column_name = 'is_school_admin'
  ) THEN
    RETURN;
  END IF;

  SELECT string_agg(t.id::TEXT, ', ') INTO v_blocked
  FROM teachers t
  WHERE t.is_school_admin AND EXISTS (SELECT 1 FROM classes c WHERE c.teacher_id = t.id);
  IF v_blocked IS NOT NULL THEN
    RAISE EXCEPTION 'School admins still holding classes (teachers.id %): move their classes first', v_blocked;
  END IF;

  PERFORM set_config('aidemic.privileged', 'on', true);

  INSERT INTO school_admins (user_id, school_id)
  SELECT t.user_id, t.school_id FROM teachers t
  WHERE t.is_school_admin AND t.verification_status = 'approved' AND t.school_id IS NOT NULL
  ON CONFLICT (user_id) DO UPDATE SET school_id = EXCLUDED.school_id;

  UPDATE user_profiles p SET role = 'school_admin'
  FROM teachers t
  WHERE t.user_id = p.id AND t.is_school_admin AND t.verification_status = 'approved' AND t.school_id IS NOT NULL;

  -- A flagged-but-rejected admin was not an admin (is_school_admin_for already
  -- required 'approved'); they stay an ordinary rejected teacher.
  DELETE FROM teachers t
  WHERE t.is_school_admin AND t.verification_status = 'approved' AND t.school_id IS NOT NULL;

  PERFORM set_config('aidemic.privileged', 'off', true);
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Everything that read teachers.is_school_admin now reads school_admins.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_school_admin_for(p_school_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM school_admins WHERE user_id = auth.uid() AND school_id = p_school_id
  );
$$;

CREATE OR REPLACE FUNCTION my_admin_school_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT school_id FROM school_admins WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION my_admin_school_id() FROM PUBLIC, anon, authenticated;

-- The guard, without is_school_admin, and refusing a teachers row for an admin:
-- that refusal is what "an admin cannot be a subject teacher" rests on, since
-- every class hangs off a teachers row.
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
    IF EXISTS (SELECT 1 FROM school_admins WHERE user_id = NEW.user_id) THEN
      RAISE EXCEPTION 'A school admin account cannot also be a teacher';
    END IF;
    NEW.verification_status := 'pending';
    NEW.verification_requested_at := now();
    RETURN NEW;
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

-- ----------------------------------------------------------------------------
-- 5. Manual configuration (SQL editor / service role only).
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS grant_school_admin(TEXT, UUID);
CREATE FUNCTION grant_school_admin(p_email TEXT, p_school_id UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_teacher_id UUID;
  v_school_id UUID;
  v_school_name TEXT;
  v_classes INT;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(btrim(p_email)) LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No account with email % -- they must sign up first', p_email;
  END IF;

  SELECT t.id, t.school_id INTO v_teacher_id, v_school_id FROM teachers t WHERE t.user_id = v_user_id;
  v_school_id := coalesce(
    p_school_id,
    (SELECT school_id FROM school_admins WHERE user_id = v_user_id),
    v_school_id
  );
  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'Pass the school: grant_school_admin(''%'', ''<school uuid>'')', p_email;
  END IF;

  SELECT name INTO v_school_name FROM schools WHERE id = v_school_id;
  IF v_school_name IS NULL THEN
    RAISE EXCEPTION 'No school with id %', v_school_id;
  END IF;

  -- An admin cannot teach. Deleting the teachers row would cascade through
  -- their classes into students' results, so refuse instead.
  IF v_teacher_id IS NOT NULL THEN
    SELECT count(*) INTO v_classes FROM classes WHERE teacher_id = v_teacher_id;
    IF v_classes > 0 THEN
      RAISE EXCEPTION '% has % class(es). A school admin cannot also teach, so those classes must be deleted first', p_email, v_classes;
    END IF;
  END IF;

  PERFORM set_config('aidemic.privileged', 'on', true);
  DELETE FROM teachers WHERE user_id = v_user_id;
  INSERT INTO school_admins (user_id, school_id) VALUES (v_user_id, v_school_id)
  ON CONFLICT (user_id) DO UPDATE SET school_id = EXCLUDED.school_id;
  UPDATE user_profiles
  SET role = 'school_admin',
      onboarding_completed_at = coalesce(onboarding_completed_at, now())
  WHERE id = v_user_id;
  PERFORM set_config('aidemic.privileged', 'off', true);

  RETURN format('%s is now school admin of %s', p_email, v_school_name);
END;
$$;

-- The account becomes a teacher with no teacher profile, so the next teacher
-- page they open sends them through teacher onboarding.
DROP FUNCTION IF EXISTS revoke_school_admin(TEXT);
CREATE FUNCTION revoke_school_admin(p_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(btrim(p_email)) LIMIT 1;
  IF v_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM school_admins WHERE user_id = v_user_id) THEN
    RAISE EXCEPTION '% is not a school admin', p_email;
  END IF;

  PERFORM set_config('aidemic.privileged', 'on', true);
  DELETE FROM school_admins WHERE user_id = v_user_id;
  UPDATE user_profiles SET role = 'teacher' WHERE id = v_user_id;
  PERFORM set_config('aidemic.privileged', 'off', true);

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
  SET verification_status = p_status
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
-- 6. Workspace RPCs that knew about admins-as-teachers.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS school_admin_set_admin(UUID, BOOLEAN);

-- Staff are teachers only; the admin is not one of them, so is_school_admin
-- and is_self are gone from the row.
DROP FUNCTION IF EXISTS school_admin_staff();
CREATE FUNCTION school_admin_staff()
RETURNS TABLE (
  teacher_id UUID,
  user_id UUID,
  full_name TEXT,
  email TEXT,
  department TEXT,
  qualification_level TEXT,
  verification_status TEXT,
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

-- Approve, reject, revoke or restore a teacher. No self or co-admin checks:
-- the caller is never a teacher, so can never be the target.
CREATE OR REPLACE FUNCTION school_admin_set_teacher_status(p_teacher_id UUID, p_status TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school UUID := my_admin_school_id();
BEGIN
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'Not a school admin';
  END IF;
  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Status must be approved or rejected';
  END IF;

  PERFORM 1 FROM teachers WHERE id = p_teacher_id AND school_id = v_school FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That teacher is not at your school';
  END IF;

  PERFORM set_config('aidemic.privileged', 'on', true);
  UPDATE teachers SET verification_status = p_status WHERE id = p_teacher_id;
  PERFORM set_config('aidemic.privileged', 'off', true);
END;
$$;

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
    'admins', (SELECT count(*) FROM school_admins WHERE school_id = v_school),
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

REVOKE EXECUTE ON FUNCTION school_admin_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION school_admin_staff() TO authenticated;

-- Nothing reads it any more.
ALTER TABLE teachers DROP COLUMN IF EXISTS is_school_admin;

-- ----------------------------------------------------------------------------
-- 7. A school for testing.
--
-- Searchable like any other school (status 'approved'), so teachers and an
-- admin can be set up against it without touching a real one. Fixed id so the
-- grant below can be copied as-is. The seed script upserts on (source, urn)
-- and never deletes, so a manual row with no urn survives every re-seed.
--
--   select grant_school_admin('you@example.com', 'a1de0000-7e57-4000-8000-000000000001');
-- ----------------------------------------------------------------------------
INSERT INTO schools (id, name, status, source, urn, nation, town, postcode, local_authority, phase, domains)
VALUES (
  'a1de0000-7e57-4000-8000-000000000001',
  'AIDemic Test School',
  'approved',
  'manual',
  NULL,
  'england',
  'Testville',
  'ZZ99 9ZZ',
  'Test Authority',
  'Secondary',
  '{}'
)
ON CONFLICT (id) DO NOTHING;
