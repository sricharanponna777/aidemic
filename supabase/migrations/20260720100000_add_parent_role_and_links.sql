-- ============================================================================
-- Parent role: read-only projection of a linked student's data.
-- A student generates a pending invite code (client-side, mirroring the
-- classes.invite_code pattern); a parent redeems it via redeem_parent_invite_code(),
-- which is the only way parent_id ever gets set on a parent_links row.
-- ============================================================================

-- STEP 1: Extend role enum
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check CHECK (role IN ('student', 'teacher', 'parent'));

-- STEP 2: parent_links
CREATE TABLE IF NOT EXISTS parent_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'revoked')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

DROP TRIGGER IF EXISTS parent_links_set_updated_at ON parent_links;
CREATE TRIGGER parent_links_set_updated_at
BEFORE UPDATE ON parent_links
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE INDEX IF NOT EXISTS idx_parent_links_student_id ON parent_links(student_id);
CREATE INDEX IF NOT EXISTS idx_parent_links_parent_id ON parent_links(parent_id);

ALTER TABLE parent_links ENABLE ROW LEVEL SECURITY;

-- Students manage their own links (create pending codes, view, revoke access).
DROP POLICY IF EXISTS "Students can view their own parent links" ON parent_links;
CREATE POLICY "Students can view their own parent links"
  ON parent_links FOR SELECT USING (auth.uid() = student_id);
DROP POLICY IF EXISTS "Students can create their own pending parent links" ON parent_links;
CREATE POLICY "Students can create their own pending parent links"
  ON parent_links FOR INSERT
  WITH CHECK (auth.uid() = student_id AND parent_id IS NULL AND status = 'pending');
DROP POLICY IF EXISTS "Students can revoke their own parent links" ON parent_links;
CREATE POLICY "Students can revoke their own parent links"
  ON parent_links FOR UPDATE
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

-- Parents can see the links that point at them (but never create/modify one directly).
DROP POLICY IF EXISTS "Parents can view their own links" ON parent_links;
CREATE POLICY "Parents can view their own links"
  ON parent_links FOR SELECT USING (auth.uid() = parent_id);

-- STEP 3: SECURITY DEFINER helper -- reused by every cross-role read policy below.
CREATE OR REPLACE FUNCTION is_parent_of_student(p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM parent_links
    WHERE parent_links.student_id = p_student_id
    AND parent_links.parent_id = auth.uid()
    AND parent_links.status = 'active'
  );
$$;

-- STEP 4: Redeem-by-invite-code RPC (SECURITY DEFINER so a parent can look up
-- a pending link by code without a broad "anyone can view any pending link" policy).
CREATE OR REPLACE FUNCTION redeem_parent_invite_code(p_invite_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_link_id UUID;
  v_student_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT id, student_id INTO v_link_id, v_student_id
  FROM parent_links
  WHERE invite_code = upper(trim(p_invite_code)) AND status = 'pending';

  IF v_link_id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  IF v_student_id = v_user_id THEN
    RAISE EXCEPTION 'You cannot link to your own account';
  END IF;

  UPDATE parent_links SET parent_id = v_user_id, status = 'active' WHERE id = v_link_id;

  RETURN v_student_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION redeem_parent_invite_code(TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION redeem_parent_invite_code(TEXT) TO authenticated;

-- STEP 5: Cross-role read access -- a parent may SELECT the same rows the
-- linked student's own dashboard reads (predicted grades, streak, weak topics,
-- assignments completed). No parent write policy is added anywhere.
DROP POLICY IF EXISTS "Parents can view linked students profiles" ON user_profiles;
CREATE POLICY "Parents can view linked students profiles"
  ON user_profiles FOR SELECT
  USING (is_parent_of_student(id));

DROP POLICY IF EXISTS "Students can view profiles of their linked parents" ON user_profiles;
CREATE POLICY "Students can view profiles of their linked parents"
  ON user_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM parent_links
      WHERE parent_links.parent_id = user_profiles.id
      AND parent_links.student_id = auth.uid()
      AND parent_links.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Parents can view linked students practice attempts" ON exam_practice_attempts;
CREATE POLICY "Parents can view linked students practice attempts"
  ON exam_practice_attempts FOR SELECT
  USING (is_parent_of_student(user_id));

DROP POLICY IF EXISTS "Parents can view linked students subjects" ON student_subjects;
CREATE POLICY "Parents can view linked students subjects"
  ON student_subjects FOR SELECT
  USING (is_parent_of_student(user_id));

DROP POLICY IF EXISTS "Parents can view linked students flashcard decks" ON flashcard_decks;
CREATE POLICY "Parents can view linked students flashcard decks"
  ON flashcard_decks FOR SELECT
  USING (is_parent_of_student(user_id));

DROP POLICY IF EXISTS "Parents can view linked students flashcards" ON flashcards;
CREATE POLICY "Parents can view linked students flashcards"
  ON flashcards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM flashcard_decks
      WHERE flashcard_decks.id = flashcards.deck_id
      AND is_parent_of_student(flashcard_decks.user_id)
    )
  );

DROP POLICY IF EXISTS "Parents can view linked students study sessions" ON study_sessions;
CREATE POLICY "Parents can view linked students study sessions"
  ON study_sessions FOR SELECT
  USING (is_parent_of_student(user_id));

DROP POLICY IF EXISTS "Parents can view linked students assignment attempts" ON assignment_attempts;
CREATE POLICY "Parents can view linked students assignment attempts"
  ON assignment_attempts FOR SELECT
  USING (is_parent_of_student(student_id));

-- ============================================================================
-- STEP 6: Weekly parent digest scaffold. app_config holds the two values the
-- Edge Function needs (set once, manually, after `supabase functions deploy
-- weekly-parent-digest` -- see CLAUDE.md for the exact commands):
--
--   insert into app_config (key, value) values
--     ('weekly_digest_function_url', 'https://<project-ref>.functions.supabase.co/weekly-parent-digest'),
--     ('weekly_digest_cron_secret', '<same value passed to `supabase secrets set CRON_SECRET=...`>')
--   on conflict (key) do update set value = excluded.value;
--
-- Not part of PostgREST's exposed schema for anon/authenticated, so no RLS
-- policies are needed -- only postgres/service_role (and this SECURITY
-- DEFINER function) can read it.
-- ============================================================================
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION trigger_weekly_parent_digest()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url TEXT;
  v_secret TEXT;
BEGIN
  SELECT value INTO v_url FROM app_config WHERE key = 'weekly_digest_function_url';
  IF v_url IS NULL THEN
    RETURN;
  END IF;

  SELECT value INTO v_secret FROM app_config WHERE key = 'weekly_digest_cron_secret';

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', coalesce(v_secret, '')),
    body := '{}'::jsonb
  );
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('weekly-parent-digest');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule('weekly-parent-digest', '0 8 * * 1', 'SELECT trigger_weekly_parent_digest();');
