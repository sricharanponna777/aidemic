-- Corrections to 20260904000000_uk_school_register.sql, which is already applied.
--
-- Written as a follow-up rather than an edit in place because the register is
-- seeded and the functions exist on the live project; every statement here is
-- CREATE OR REPLACE / IF NOT EXISTS so it is safe to re-run.
--
-- Seven things are wrong in the applied version -- six corrections, plus (7) the
-- route Wales and Northern Ireland never had and (8) a column the guard trigger
-- does not yet cover:
--
--   1. request_teacher_reverification() does a plain UPDATE of
--      verification_status, which the new guard_teacher_privileged_columns()
--      trigger refuses for anyone who is not their own school's admin. Rejection
--      was terminal for every teacher. (It is also simply absent from the live
--      project -- 20260724020000 was committed but never applied -- so the
--      "Resubmit for review" button has been erroring on a missing function.)
--
--   2. claim_school_admin() sets aidemic.privileged and then writes school_id
--      unconditionally, walking straight through the trigger's "you cannot move
--      school" guard, and resets verification_status even when it is already
--      'approved' (silently demoting) or 'rejected' (laundering a rejection back
--      into the queue -- the exact transition (1) is supposed to gate).
--
--   3. Its IF NOT FOUND is dead code: PERFORM resets FOUND, and set_config()
--      always returns a row, so the check always passes. A caller with no
--      teachers row got a silent success. Same bug shape in the two platform
--      decision functions, which no-op silently on an unknown id.
--
--   4. The domain gate matches in both directions. `d LIKE '%.' || v_email_domain`
--      lets the SCHOOL's domain be a subdomain of the CLAIMANT's, so any holder of
--      a @glowscotland.org.uk address matches stmarys.glowscotland.org.uk -- i.e.
--      every Scottish teacher can claim any Glow-hosted school. Only the
--      claimant-is-subdomain-of-school direction is safe. Neither side was escaped
--      before being used as a LIKE pattern either.
--
--   5. platform_admin_queue() inner-joins schools, so a pending teacher with no
--      school_id is invisible forever -- and per (1) could not resubmit either.
--      It also orders by updated_at while calling the column requested_at, so
--      editing your department jumped you to the back of the queue.
--
--   6. search_schools() cannot use an index for two of its three OR branches, and
--      LIMIT least(coalesce(p_limit, 8), 25) has no lower bound, so a negative
--      p_limit is a runtime error rather than a clamp.

-- ============================================================================
-- Shared helper: escape a user-supplied string for use as a LIKE pattern.
-- ============================================================================
CREATE OR REPLACE FUNCTION like_escape(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT replace(replace(replace(coalesce(p_value, ''), '\', '\\'), '%', '\%'), '_', '\_');
$$;

-- Every other function in this file is locked down; without these two lines this
-- one inherits EXECUTE TO PUBLIC, which is the single hole in the file's own rule.
REVOKE EXECUTE ON FUNCTION like_escape(TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION like_escape(TEXT) TO authenticated;

-- ============================================================================
-- When verification was actually requested.
--
-- The queue used teachers.updated_at, which teachers_set_updated_at bumps on
-- every write, so any profile edit reordered the FIFO queue. This column moves
-- only when the teacher actually (re)enters the queue.
-- ============================================================================
-- Added nullable, backfilled, then constrained, so a re-run finds no NULLs and
-- the UPDATE is a no-op rather than resetting everyone's queue position.
ALTER TABLE teachers
  ADD COLUMN IF NOT EXISTS verification_requested_at TIMESTAMPTZ;

UPDATE teachers
SET verification_requested_at = coalesce(created_at, now())
WHERE verification_requested_at IS NULL;

ALTER TABLE teachers ALTER COLUMN verification_requested_at SET DEFAULT now();
ALTER TABLE teachers ALTER COLUMN verification_requested_at SET NOT NULL;

-- ============================================================================
-- 1. Re-verification, through the privileged path.
-- ============================================================================
CREATE OR REPLACE FUNCTION request_teacher_reverification()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- SECURITY DEFINER does not change auth.uid(), so without this the guard
  -- trigger sees an ordinary teacher changing their own verification_status and
  -- raises. The WHERE clause is what keeps the privilege narrow: only the
  -- caller's own row, and only out of 'rejected'.
  PERFORM set_config('aidemic.privileged', 'on', true);
  UPDATE teachers
  SET verification_status = 'pending',
      verification_requested_at = now()
  WHERE user_id = auth.uid()
    AND verification_status = 'rejected';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  PERFORM set_config('aidemic.privileged', 'off', true);

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'No rejected teacher record to resubmit';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION request_teacher_reverification() FROM anon, public;
GRANT EXECUTE ON FUNCTION request_teacher_reverification() TO authenticated;

-- ============================================================================
-- 2-4. Claiming a school as its headteacher.
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
  v_current_school UUID;
  v_status TEXT;
  v_updated INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT lower(btrim(split_part(email, '@', 2))) INTO v_email_domain
  FROM auth.users WHERE id = v_user_id;

  IF coalesce(v_email_domain, '') = '' THEN
    RAISE EXCEPTION 'Your account has no email address on record';
  END IF;

  -- Read the caller's current row up front: the claim must not be able to do
  -- what a direct UPDATE is forbidden from doing.
  SELECT school_id, verification_status INTO v_current_school, v_status
  FROM teachers WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Save your teacher profile before claiming a school';
  END IF;

  -- Mirrors the trigger's guard. Without it, aidemic.privileged below turns
  -- "claim a school" into an unrestricted "move to any school".
  IF v_current_school IS NOT NULL AND v_current_school <> p_school_id THEN
    RAISE EXCEPTION 'Contact AIDemic support to move to a different school';
  END IF;

  SELECT domains INTO v_domains FROM schools WHERE id = p_school_id AND status = 'approved';

  IF v_domains IS NULL THEN
    RAISE EXCEPTION 'That school could not be found';
  END IF;

  IF coalesce(array_length(v_domains, 1), 0) = 0 THEN
    RAISE EXCEPTION 'No official web domain is on record for this school, so it cannot be claimed online. Ask AIDemic support to verify you.';
  END IF;

  -- One direction only. The claimant's address may be at a subdomain of the
  -- school's recorded domain (staff.school.sch.uk for school.sch.uk); the
  -- reverse -- the school's domain being a subdomain of the claimant's -- means
  -- the claimant holds an address at a shared host that the school merely sits
  -- under, which is every Glow / SharePoint / local-authority tenancy.
  IF NOT EXISTS (
    SELECT 1 FROM unnest(v_domains) d
    WHERE v_email_domain = d
       OR v_email_domain LIKE '%.' || like_escape(d) ESCAPE '\'
  ) THEN
    RAISE EXCEPTION 'Claiming this school needs an email address at its official domain. Yours is @%.', v_email_domain;
  END IF;

  PERFORM set_config('aidemic.privileged', 'on', true);
  UPDATE teachers
  SET claimed_school_admin = true,
      school_id = p_school_id,
      -- An approved teacher stays approved: claiming headship is an additional
      -- request, not a reason to revoke access they already have. A rejected one
      -- stays rejected -- request_teacher_reverification() is the only way back.
      verification_status = CASE WHEN v_status = 'pending' THEN 'pending' ELSE v_status END,
      verification_requested_at = CASE WHEN v_status = 'rejected' THEN verification_requested_at ELSE now() END
  WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  PERFORM set_config('aidemic.privileged', 'off', true);

  -- GET DIAGNOSTICS, not IF NOT FOUND: PERFORM above resets FOUND, so the old
  -- check could never fail and a missing teachers row reported success.
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Save your teacher profile before claiming a school';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION claim_school_admin(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION claim_school_admin(UUID) TO authenticated;

-- ============================================================================
-- 3. Platform decisions report whether they actually decided anything.
-- ============================================================================
CREATE OR REPLACE FUNCTION platform_approve_teacher(p_teacher_id UUID, p_as_school_admin BOOLEAN DEFAULT false)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  PERFORM set_config('aidemic.privileged', 'on', true);
  UPDATE teachers
  SET verification_status = 'approved',
      is_school_admin = coalesce(p_as_school_admin, false),
      -- The claim has been decided; leaving the flag set would keep the row in
      -- the queue's claim half forever.
      claimed_school_admin = false
  WHERE id = p_teacher_id
    AND verification_status = 'pending';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  PERFORM set_config('aidemic.privileged', 'off', true);

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'No pending teacher with that id';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION platform_reject_teacher(p_teacher_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  PERFORM set_config('aidemic.privileged', 'on', true);
  UPDATE teachers
  SET verification_status = 'rejected',
      claimed_school_admin = false
  WHERE id = p_teacher_id
    AND verification_status = 'pending';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  PERFORM set_config('aidemic.privileged', 'off', true);

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'No pending teacher with that id';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION platform_approve_teacher(UUID, BOOLEAN) FROM anon, public;
GRANT EXECUTE ON FUNCTION platform_approve_teacher(UUID, BOOLEAN) TO authenticated;
REVOKE EXECUTE ON FUNCTION platform_reject_teacher(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION platform_reject_teacher(UUID) TO authenticated;

-- ============================================================================
-- 5. The queue: no school is not a reason to disappear.
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
    t.verification_requested_at,
    s.id,
    s.name,
    s.town,
    s.postcode,
    s.nation,
    s.head_name,
    coalesce(s.domains, ARRAY[]::TEXT[]),
    t.claimed_school_admin,
    -- Same one-directional rule as claim_school_admin, so the reviewer is shown
    -- the condition that actually gated the claim.
    s.id IS NOT NULL AND EXISTS (
      SELECT 1 FROM unnest(s.domains) d
      WHERE lower(split_part(p.email, '@', 2)) = d
         OR lower(split_part(p.email, '@', 2)) LIKE '%.' || like_escape(d) ESCAPE '\'
    ),
    -- btrim(...) <> '' as well as NOT NULL: for an empty head_name, split_part
    -- returns '' and string_to_array('', ' ') is {''}, so an empty name matched
    -- an empty profile name and showed a green "verified" tick for nothing.
    s.head_name IS NOT NULL
      AND btrim(s.head_name) <> ''
      AND p.full_name IS NOT NULL
      AND btrim(p.full_name) <> ''
      -- Compare on surname: GIAS records "Jane" + "Okafor", the profile may say
      -- "Mrs J Okafor", and neither spelling of the forename is worth trusting.
      AND lower(split_part(btrim(s.head_name), ' ', array_length(string_to_array(btrim(s.head_name), ' '), 1)))
        = lower(split_part(btrim(p.full_name), ' ', array_length(string_to_array(btrim(p.full_name), ' '), 1)))
  FROM teachers t
  -- LEFT, not INNER: a pending teacher who never picked a school (or whose
  -- school row was removed) still needs an approver, and the inner join made
  -- them invisible to the only queue that could approve them.
  LEFT JOIN schools s ON s.id = t.school_id
  LEFT JOIN user_profiles p ON p.id = t.user_id
  WHERE t.verification_status = 'pending'
    AND t.is_school_admin = false
    AND (
      t.claimed_school_admin = true
      -- NULL NOT IN (...) is NULL, which would drop exactly the schoolless rows
      -- the LEFT JOIN was widened to admit.
      OR t.school_id IS NULL
      OR t.school_id NOT IN (SELECT verified.school_id FROM verified)
    )
  ORDER BY t.claimed_school_admin DESC, t.verification_requested_at ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION platform_admin_queue() FROM anon, public;
GRANT EXECUTE ON FUNCTION platform_admin_queue() TO authenticated;

-- ============================================================================
-- 6. Search: escape the pattern, clamp the limit, and index what is searched.
-- ============================================================================

-- The postcode branch is a prefix LIKE. Under the database's default collation a
-- plain btree cannot serve that, so idx_schools_postcode was never used; this is
-- the same expression with the operator class that can. Dropped rather than left
-- beside its replacement: nothing can ever read it, and it is still maintained on
-- every write to all ~30k rows.
DROP INDEX IF EXISTS idx_schools_postcode;

CREATE INDEX IF NOT EXISTS idx_schools_postcode_prefix
  ON schools (upper(replace(postcode, ' ', '')) text_pattern_ops);

-- The town branch had no index at all.
CREATE INDEX IF NOT EXISTS idx_schools_town_trgm
  ON schools USING gin (town extensions.gin_trgm_ops);

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
  WITH q AS (
    SELECT btrim(coalesce(p_query, '')) AS text,
           like_escape(btrim(coalesce(p_query, ''))) AS pattern
  )
  SELECT s.id, s.name, s.town, s.postcode, s.local_authority, s.nation, s.phase,
         coalesce(array_length(s.domains, 1), 0) > 0
  FROM schools s, q
  -- >= 3, not >= 2: a trigram index cannot serve a shorter pattern, so a
  -- two-character query fell back to a sequential scan over ~30k rows on a
  -- keystroke.
  WHERE length(q.text) >= 3
    AND s.status = 'approved'
    AND (
      s.name ILIKE '%' || q.pattern || '%' ESCAPE '\'
      OR upper(replace(s.postcode, ' ', '')) LIKE upper(replace(q.pattern, ' ', '')) || '%' ESCAPE '\'
      OR s.town ILIKE q.pattern || '%' ESCAPE '\'
    )
  ORDER BY
    (s.name ILIKE q.pattern || '%' ESCAPE '\') DESC,
    similarity(s.name, q.text) DESC,
    s.name ASC
  -- greatest(..., 1): a negative p_limit produced `LIMIT -1`, which errors.
  LIMIT greatest(least(coalesce(p_limit, 8), 25), 1);
$$;

REVOKE EXECUTE ON FUNCTION search_schools(TEXT, INT) FROM anon, public;
GRANT EXECUTE ON FUNCTION search_schools(TEXT, INT) TO authenticated;

-- ============================================================================
-- 7. Headship claims for schools that cannot be domain-verified.
--
-- The register publishes no contact domain for any DE NI school and for most
-- Welsh ones, so claim_school_admin() can never pass for them. Onboarding
-- offered a "I'm the headteacher" checkbox anyway, disabled, above copy saying
-- "continue anyway -- AIDemic will verify you directly" -- but nothing recorded
-- the claim, so the teacher arrived in platform_admin_queue() indistinguishable
-- from any other unverified teacher. For Wales and NI that was the only route in.
--
-- This records the claim without asserting it is verified. The reviewer already
-- sees domain_matches and head_name_matches in the queue and decides; the
-- restriction to schools with NO domains on record is what stops this from being
-- a way around the domain gate for schools that do have one.
-- ============================================================================
CREATE OR REPLACE FUNCTION request_unverified_school_admin(p_school_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_domains TEXT[];
  v_current_school UUID;
  v_status TEXT;
  v_updated INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT domains INTO v_domains FROM schools WHERE id = p_school_id AND status = 'approved';

  IF v_domains IS NULL THEN
    RAISE EXCEPTION 'That school could not be found';
  END IF;

  IF coalesce(array_length(v_domains, 1), 0) > 0 THEN
    RAISE EXCEPTION 'This school can be verified by email domain -- use the domain check instead';
  END IF;

  SELECT school_id, verification_status INTO v_current_school, v_status
  FROM teachers WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Save your teacher profile before claiming a school';
  END IF;

  IF v_current_school IS NOT NULL AND v_current_school <> p_school_id THEN
    RAISE EXCEPTION 'Contact AIDemic support to move to a different school';
  END IF;

  PERFORM set_config('aidemic.privileged', 'on', true);
  UPDATE teachers
  SET claimed_school_admin = true,
      school_id = p_school_id,
      verification_status = CASE WHEN v_status = 'pending' THEN 'pending' ELSE v_status END,
      verification_requested_at = CASE WHEN v_status = 'rejected' THEN verification_requested_at ELSE now() END
  WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  PERFORM set_config('aidemic.privileged', 'off', true);

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Save your teacher profile before claiming a school';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION request_unverified_school_admin(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION request_unverified_school_admin(UUID) TO authenticated;

-- ============================================================================
-- 8. The guard trigger has to cover the column the queue is now ordered by.
--
-- verification_requested_at exists specifically so a profile edit cannot reorder
-- the FIFO queue -- but guard_teacher_privileged_columns() was written before the
-- column did, and "Users can update their own teacher profile" is
-- USING (auth.uid() = user_id) with no WITH CHECK and no column restriction. So
-- until this replacement lands, any teacher can
--
--   PATCH /rest/v1/teachers?user_id=eq.<self>  {"verification_requested_at": "2020-01-01"}
--
-- and sit at the head of platform_admin_queue() permanently. Moving the ordering
-- off updated_at closed the accidental reordering and opened a deliberate one.
--
-- Same body as 20260904000000 otherwise. Both privileged paths (this file's
-- claim_school_admin, request_unverified_school_admin and
-- request_teacher_reverification) set aidemic.privileged before writing it, so
-- they return at the first branch and are unaffected.
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
    -- they may not arrive pre-approved, and they may not pick their own place in
    -- the queue by backdating the row they are inserting.
    NEW.is_school_admin := false;
    NEW.claimed_school_admin := false;
    NEW.verification_status := 'pending';
    NEW.verification_requested_at := now();
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

  -- No exception for a school admin here: queue position is AIDemic's to set, and
  -- a school admin approves their own staff directly rather than through the
  -- platform queue, so they have no reason to move it either.
  IF NEW.verification_requested_at IS DISTINCT FROM OLD.verification_requested_at THEN
    RAISE EXCEPTION 'Verification queue position is set by AIDemic, not by update';
  END IF;

  RETURN NEW;
END;
$$;

-- The trigger itself is unchanged from 20260904000000 and still points at this
-- function by name, so it does not need recreating.
