-- ============================================================================
-- school_admin_staff() also returns the subjects each teacher teaches, so the
-- admin page can group staff by subject.
--
-- Taken from the teacher's active classes (class -> specification -> subject),
-- de-duplicated by name: subjects are per exam board, so AQA and Edexcel
-- Mathematics are two rows that should read as one subject. A teacher with no
-- active class -- every pending teacher -- gets an empty array.
-- ============================================================================

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
  student_count INT,
  subjects TEXT[]
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
      WHERE c.teacher_id = t.id AND cs.status = 'active'),
    coalesce((
      SELECT array_agg(DISTINCT sub.name ORDER BY sub.name)
      FROM classes c
      JOIN specifications sp ON sp.id = c.specification_id
      JOIN subjects sub ON sub.id = sp.subject_id
      WHERE c.teacher_id = t.id AND c.status = 'active'
    ), '{}'::TEXT[])
  FROM teachers t
  LEFT JOIN user_profiles p ON p.id = t.user_id
  WHERE t.school_id = v_school
  ORDER BY
    (t.verification_status = 'pending') DESC,
    t.verification_requested_at ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION school_admin_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION school_admin_staff() TO authenticated;
