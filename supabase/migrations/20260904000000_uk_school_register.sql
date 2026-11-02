-- ============================================================================
-- UK school register + headteacher verification
--
-- Before this migration a teacher typed their school's name and the platform
-- admin approved the *school*. Schools are now seeded from the official
-- registers (see scripts/seed-uk-schools.ts), so a school needs no approval --
-- what needs approving is the person claiming to run one.
--
--   seeded school  -> status 'approved' on arrival, instantly selectable
--   headteacher    -> claims a school, gated on an email-domain match,
--                     then approved by a platform admin
--   other teachers -> approved by their school's verified admin, as before
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ============================================================================
-- STEP 1: Register columns on schools
--
-- `domains` holds already-normalised lowercase hostnames (school website host,
-- official contact-email host). Normalising in the seed script rather than in
-- SQL keeps the URL-parsing mess out of the database: the only thing SQL has to
-- parse is the right-hand side of a teacher's email address.
-- ============================================================================
ALTER TABLE schools ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE schools DROP CONSTRAINT IF EXISTS schools_source_check;
ALTER TABLE schools ADD CONSTRAINT schools_source_check
  CHECK (source IN ('gias', 'scotgov', 'deni', 'manual'));

ALTER TABLE schools ADD COLUMN IF NOT EXISTS urn TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS nation TEXT;
ALTER TABLE schools DROP CONSTRAINT IF EXISTS schools_nation_check;
ALTER TABLE schools ADD CONSTRAINT schools_nation_check
  CHECK (nation IS NULL OR nation IN ('england', 'wales', 'scotland', 'northern-ireland'));

ALTER TABLE schools ADD COLUMN IF NOT EXISTS town TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS postcode TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS local_authority TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS phase TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS domains TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS head_name TEXT;

-- One row per official reference. Manually created schools carry no urn, so the
-- index is partial rather than blocking every legacy row on a shared NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_schools_source_urn ON schools (source, urn) WHERE urn IS NOT NULL;

-- The old unique index on lower(name) cannot survive a real register: there are
-- 25 schools called "St Mary's Catholic Primary School". Town and postcode are
-- what tell them apart in the browser, and (source, urn) is what keeps the seed
-- idempotent.
DROP INDEX IF EXISTS idx_schools_name_lower;

-- ~30k rows, searched by substring on every keystroke.
CREATE INDEX IF NOT EXISTS idx_schools_name_trgm ON schools USING gin (name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_schools_postcode ON schools (upper(replace(postcode, ' ', '')));

-- ============================================================================
-- STEP 2: The claim flag on teachers
-- ============================================================================
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS claimed_school_admin BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- STEP 3: Self-service school registration is gone
--
-- Every UK school is already in the table, so the only thing this policy can
-- still do is let someone mint a school row and become its admin.
-- ============================================================================
DROP POLICY IF EXISTS "Users can register a new school" ON schools;

DROP FUNCTION IF EXISTS approve_school(UUID);
DROP FUNCTION IF EXISTS reject_school(UUID);

-- ============================================================================
-- STEP 4: Close the self-promotion hole on teachers
--
-- "Users can update their own teacher profile" is USING (auth.uid() = user_id)
-- with no column restriction, so a teacher could set is_school_admin = true and
-- verification_status = 'approved' on themselves with one PATCH -- which would
-- make every check below decorative. Narrowing the policy is not enough (RLS
-- cannot express "these columns are read-only to you"), so the privileged
-- columns are guarded by a trigger and move only through the SECURITY DEFINER
-- functions in step 6, which set aidemic.privileged for the transaction.
--
-- Same shape as freeze_published_assignments(): a trigger, because the rule
-- depends on OLD as well as NEW.
-- ============================================================================
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
    -- A teacher creates their own row at onboarding. They may choose a school;
    -- they may not arrive pre-approved.
    NEW.is_school_admin := false;
    NEW.claimed_school_admin := false;
    NEW.verification_status := 'pending';
    RETURN NEW;
  END IF;

  IF NEW.is_school_admin IS DISTINCT FROM OLD.is_school_admin THEN
    RAISE EXCEPTION 'School admin rights are granted by AIDemic, not by update';
  END IF;

  IF NEW.claimed_school_admin IS DISTINCT FROM OLD.claimed_school_admin THEN
    RAISE EXCEPTION 'Use claim_school_admin() to claim a school';
  END IF;

  IF NEW.school_id IS DISTINCT FROM OLD.school_id AND OLD.school_id IS NOT NULL THEN
    RAISE EXCEPTION 'Contact AIDemic support to move to a different school';
  END IF;

  -- A verified school admin approving one of their own staff is the one
  -- legitimate way this column moves from the client.
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
     AND NOT is_school_admin_for(OLD.school_id) THEN
    RAISE EXCEPTION 'Only your school admin can change your verification status';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS teachers_guard_privileged_columns ON teachers;
CREATE TRIGGER teachers_guard_privileged_columns
BEFORE INSERT OR UPDATE ON teachers
FOR EACH ROW
EXECUTE FUNCTION guard_teacher_privileged_columns();

-- ============================================================================
-- STEP 5: School browser
--
-- SECURITY INVOKER, so the schools SELECT policy still applies. Exact prefix
-- matches rank above trigram similarity: typing "Herschel" should not put
-- "Hersham" first.
-- ============================================================================
CREATE OR REPLACE FUNCTION search_schools(p_query TEXT, p_limit INT DEFAULT 8)
RETURNS TABLE (
  id UUID,
  name TEXT,
  town TEXT,
  postcode TEXT,
  local_authority TEXT,
  nation TEXT,
  phase TEXT,
  claimable BOOLEAN
)
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  WITH q AS (SELECT btrim(coalesce(p_query, '')) AS text)
  SELECT s.id, s.name, s.town, s.postcode, s.local_authority, s.nation, s.phase,
         coalesce(array_length(s.domains, 1), 0) > 0
  FROM schools s, q
  WHERE length(q.text) >= 2
    AND s.status = 'approved'
    AND (
      s.name ILIKE '%' || q.text || '%'
      OR upper(replace(s.postcode, ' ', '')) LIKE upper(replace(q.text, ' ', '')) || '%'
      OR s.town ILIKE q.text || '%'
    )
  ORDER BY
    (s.name ILIKE q.text || '%') DESC,
    similarity(s.name, q.text) DESC,
    s.name ASC
  LIMIT least(coalesce(p_limit, 8), 25);
$$;

REVOKE EXECUTE ON FUNCTION search_schools(TEXT, INT) FROM anon, public;
GRANT EXECUTE ON FUNCTION search_schools(TEXT, INT) TO authenticated;

-- ============================================================================
-- STEP 6: Claiming a school as its headteacher / school admin
--
-- The gate is an email-domain match against the school's officially recorded
-- domains. `domains` is already normalised, so all this has to do is take the
-- right-hand side of the caller's address and compare, allowing either side to
-- be a subdomain of the other (school.sch.uk vs staff.school.sch.uk).
--
-- Schools with no domain on record -- every DE NI school, and English schools
-- with no website in GIAS -- cannot be claimed this way. Their teachers surface
-- to the platform admin through platform_admin_queue() below instead, where
-- school admin can be granted directly.
-- ============================================================================
CREATE OR REPLACE FUNCTION claim_school_admin(p_school_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_email_domain TEXT;
  v_domains TEXT[];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT lower(btrim(split_part(email, '@', 2))) INTO v_email_domain
  FROM auth.users WHERE id = v_user_id;

  IF coalesce(v_email_domain, '') = '' THEN
    RAISE EXCEPTION 'Your account has no email address on record';
  END IF;

  SELECT domains INTO v_domains FROM schools WHERE id = p_school_id AND status = 'approved';

  IF v_domains IS NULL THEN
    RAISE EXCEPTION 'That school could not be found';
  END IF;

  IF coalesce(array_length(v_domains, 1), 0) = 0 THEN
    RAISE EXCEPTION 'No official web domain is on record for this school, so it cannot be claimed online. Ask AIDemic support to verify you.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM unnest(v_domains) d
    WHERE v_email_domain = d
       OR v_email_domain LIKE '%.' || d
       OR d LIKE '%.' || v_email_domain
  ) THEN
    RAISE EXCEPTION 'Claiming this school needs an email address at its official domain. Yours is @%.', v_email_domain;
  END IF;

  PERFORM set_config('aidemic.privileged', 'on', true);
  UPDATE teachers
  SET claimed_school_admin = true,
      school_id = p_school_id,
      verification_status = 'pending'
  WHERE user_id = v_user_id;
  PERFORM set_config('aidemic.privileged', 'off', true);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Save your teacher profile before claiming a school';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION claim_school_admin(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION claim_school_admin(UUID) TO authenticated;

-- ============================================================================
-- STEP 7: The platform admin queue
--
-- Two kinds of row, both needing a decision from AIDemic itself:
--   * headteacher claims, which passed the domain gate
--   * teachers at a school that has no verified admin yet, who would otherwise
--     wait forever for an approver who does not exist
--
-- SECURITY DEFINER with an explicit membership check, so platform admins need
-- no broad SELECT policy on teachers or user_profiles.
-- ============================================================================
CREATE OR REPLACE FUNCTION platform_admin_queue()
RETURNS TABLE (
  teacher_id UUID,
  user_id UUID,
  full_name TEXT,
  email TEXT,
  department TEXT,
  qualification_level TEXT,
  requested_at TIMESTAMPTZ,
  school_id UUID,
  school_name TEXT,
  school_town TEXT,
  school_postcode TEXT,
  school_nation TEXT,
  recorded_head_name TEXT,
  school_domains TEXT[],
  is_claim BOOLEAN,
  domain_matches BOOLEAN,
  head_name_matches BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  WITH verified AS (
    SELECT DISTINCT t.school_id
    FROM teachers t
    WHERE t.is_school_admin = true AND t.verification_status = 'approved' AND t.school_id IS NOT NULL
  )
  SELECT
    t.id,
    t.user_id,
    p.full_name,
    p.email,
    t.department,
    t.qualification_level,
    t.updated_at,
    s.id,
    s.name,
    s.town,
    s.postcode,
    s.nation,
    s.head_name,
    s.domains,
    t.claimed_school_admin,
    EXISTS (
      SELECT 1 FROM unnest(s.domains) d
      WHERE lower(split_part(p.email, '@', 2)) = d
         OR lower(split_part(p.email, '@', 2)) LIKE '%.' || d
         OR d LIKE '%.' || lower(split_part(p.email, '@', 2))
    ),
    s.head_name IS NOT NULL
      AND p.full_name IS NOT NULL
      -- Compare on surname: GIAS records "Jane" + "Okafor", the profile may say
      -- "Mrs J Okafor", and neither spelling of the forename is worth trusting.
      AND lower(split_part(btrim(s.head_name), ' ', array_length(string_to_array(btrim(s.head_name), ' '), 1)))
        = lower(split_part(btrim(p.full_name), ' ', array_length(string_to_array(btrim(p.full_name), ' '), 1)))
  FROM teachers t
  JOIN schools s ON s.id = t.school_id
  LEFT JOIN user_profiles p ON p.id = t.user_id
  WHERE t.verification_status = 'pending'
    AND t.is_school_admin = false
    AND (t.claimed_school_admin = true OR t.school_id NOT IN (SELECT verified.school_id FROM verified))
  ORDER BY t.claimed_school_admin DESC, t.updated_at ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION platform_admin_queue() FROM anon, public;
GRANT EXECUTE ON FUNCTION platform_admin_queue() TO authenticated;

-- ============================================================================
-- STEP 8: Platform admin decisions
--
-- p_as_school_admin is what covers the schools that cannot be claimed online:
-- the admin grants school admin directly from the orphan-teacher queue.
-- ============================================================================
CREATE OR REPLACE FUNCTION platform_approve_teacher(p_teacher_id UUID, p_as_school_admin BOOLEAN DEFAULT false)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  PERFORM set_config('aidemic.privileged', 'on', true);
  UPDATE teachers
  SET verification_status = 'approved',
      is_school_admin = coalesce(p_as_school_admin, false)
  WHERE id = p_teacher_id;
  PERFORM set_config('aidemic.privileged', 'off', true);
END;
$$;

CREATE OR REPLACE FUNCTION platform_reject_teacher(p_teacher_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  PERFORM set_config('aidemic.privileged', 'on', true);
  UPDATE teachers
  SET verification_status = 'rejected',
      claimed_school_admin = false
  WHERE id = p_teacher_id;
  PERFORM set_config('aidemic.privileged', 'off', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION platform_approve_teacher(UUID, BOOLEAN) FROM anon, public;
GRANT EXECUTE ON FUNCTION platform_approve_teacher(UUID, BOOLEAN) TO authenticated;
REVOKE EXECUTE ON FUNCTION platform_reject_teacher(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION platform_reject_teacher(UUID) TO authenticated;
