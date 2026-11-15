-- ============================================================================
-- Redeeming a class invite code checks the student's email domain.
--
-- A school with domains on record (schools.domains) only admits students whose
-- sign-in address is at one of them, or at a subdomain of one
-- (student.school.sch.uk for school.sch.uk). The reverse -- the school's domain
-- being a subdomain of the student's -- is not a match: that is a shared host
-- the school merely sits under (Glow, SharePoint, a council). A school with no
-- domains on record stays open, as before.
--
-- The address is read from auth.users, not the JWT, so it is the one Supabase
-- Auth holds for the account.
-- ============================================================================

UPDATE schools
SET domains = ARRAY['aidemic.co.uk']
WHERE id = 'a1de0000-7e57-4000-8000-000000000001';

CREATE OR REPLACE FUNCTION join_class_by_invite_code(p_invite_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_class_id UUID;
  v_teacher_verified BOOLEAN;
  v_school_approved BOOLEAN;
  v_domains TEXT[];
  v_email_domain TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT c.id, (t.verification_status = 'approved'), (s.status = 'approved'), coalesce(s.domains, '{}')
  INTO v_class_id, v_teacher_verified, v_school_approved, v_domains
  FROM classes c
  JOIN teachers t ON t.id = c.teacher_id
  LEFT JOIN schools s ON s.id = t.school_id
  WHERE c.invite_code = upper(trim(p_invite_code));

  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  IF NOT COALESCE(v_teacher_verified, false) OR NOT COALESCE(v_school_approved, false) THEN
    RAISE EXCEPTION 'This class is not open for joining yet';
  END IF;

  IF coalesce(array_length(v_domains, 1), 0) > 0 THEN
    SELECT lower(split_part(u.email, '@', 2)) INTO v_email_domain
    FROM auth.users u WHERE u.id = v_user_id;

    IF coalesce(v_email_domain, '') = '' OR NOT EXISTS (
      SELECT 1 FROM unnest(v_domains) d
      WHERE v_email_domain = d
         OR v_email_domain LIKE '%.' || like_escape(d) ESCAPE '\'
    ) THEN
      RAISE EXCEPTION 'School email required: this class only admits students with an address at %',
        (SELECT string_agg('@' || d, ' or ') FROM unnest(v_domains) d);
    END IF;
  END IF;

  INSERT INTO class_students (class_id, student_id, status)
  VALUES (v_class_id, v_user_id, 'active')
  ON CONFLICT (class_id, student_id) DO UPDATE SET status = 'active';

  RETURN v_class_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION join_class_by_invite_code(TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION join_class_by_invite_code(TEXT) TO authenticated;
