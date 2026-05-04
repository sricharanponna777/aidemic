-- Destructive schema recreation for AIDemic (DROP + CREATE)
-- BACKUP your data before running this script!

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- DROP TABLES (destructive)
-- ============================================================================
DROP TABLE IF EXISTS flashcard_tag_mapping CASCADE;
DROP TABLE IF EXISTS flashcard_tags CASCADE;
DROP TABLE IF EXISTS flashcards CASCADE;
DROP TABLE IF EXISTS flashcard_decks CASCADE;
DROP TABLE IF EXISTS study_session_results CASCADE;
DROP TABLE IF EXISTS study_sessions CASCADE;
DROP TABLE IF EXISTS study_goals CASCADE;
DROP TABLE IF EXISTS user_statistics CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;
DROP TABLE IF EXISTS generated_videos CASCADE;

-- ============================================================================
-- CREATE TABLES
-- ============================================================================

-- USER PROFILES
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  preferred_study_time TEXT, -- e.g., "morning", "afternoon", "evening"
  daily_study_goal_minutes INT DEFAULT 30,
  theme TEXT DEFAULT 'light', -- light or dark
  notifications_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- FLASHCARD DECKS
CREATE TABLE flashcard_decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  difficulty_level TEXT DEFAULT 'medium', -- easy, medium, hard
  card_count INT DEFAULT 0,
  is_public BOOLEAN DEFAULT false,
  ai_generated BOOLEAN DEFAULT false,
  ai_prompt TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT deck_name_per_user UNIQUE (user_id, name)
);

-- FLASHCARD TAGS
CREATE TABLE flashcard_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id UUID NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3b82f6',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT tag_name_per_deck UNIQUE (deck_id, name)
);

-- FLASHCARDS
CREATE TABLE flashcards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id UUID NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  ai_generated BOOLEAN DEFAULT false,
  difficulty_rating INT DEFAULT 3, -- 1-5
  times_studied INT DEFAULT 0,
  times_correct INT DEFAULT 0,
  last_studied_at TIMESTAMP WITH TIME ZONE,
  ease_factor DECIMAL(3, 2) DEFAULT 2.5,
  interval_days INT DEFAULT 0,
  next_review_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  repetition_count INT DEFAULT 0,
  consecutive_correct INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- FLASHCARD_TAG_MAPPING
CREATE TABLE flashcard_tag_mapping (
  flashcard_id UUID NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES flashcard_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (flashcard_id, tag_id)
);

-- STUDY SESSIONS
CREATE TABLE study_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deck_id UUID NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_minutes INT,
  cards_studied INT DEFAULT 0,
  cards_correct INT DEFAULT 0,
  score_percentage INT,
  difficulty_level TEXT,
  ai_recommendations TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- STUDY SESSION RESULTS
CREATE TABLE study_session_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
  flashcard_id UUID NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  was_correct BOOLEAN NOT NULL,
  time_to_answer_seconds INT,
  confidence_level INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- USER STATISTICS
CREATE TABLE user_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  total_study_minutes INT DEFAULT 0,
  total_sessions INT DEFAULT 0,
  total_cards_studied INT DEFAULT 0,
  average_score DECIMAL(5, 2) DEFAULT 0,
  current_streak_days INT DEFAULT 0,
  longest_streak_days INT DEFAULT 0,
  last_study_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- STUDY GOALS
CREATE TABLE study_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deck_id UUID NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
  goal_type TEXT NOT NULL,
  target_value INT NOT NULL,
  current_progress INT DEFAULT 0,
  deadline DATE,
  is_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- GENERATED VIDEOS
CREATE TABLE generated_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flashcard_id UUID REFERENCES flashcards(id) ON DELETE SET NULL,
  concept TEXT NOT NULL,
  subject TEXT NOT NULL,
  style TEXT NOT NULL,
  duration INT NOT NULL,
  service_used TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  video_url TEXT,
  script_content TEXT,
  external_id TEXT,           -- fal.ai request_id for polling
  estimated_completion TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- ============================================================================
-- INDEXES (recreate)
-- ============================================================================
CREATE INDEX idx_flashcard_decks_user_id ON flashcard_decks(user_id);
CREATE INDEX idx_flashcards_deck_id ON flashcards(deck_id);
CREATE INDEX idx_flashcard_tags_deck_id ON flashcard_tags(deck_id);
CREATE INDEX idx_flashcard_tag_mapping_flashcard ON flashcard_tag_mapping(flashcard_id);
CREATE INDEX idx_flashcard_tag_mapping_tag ON flashcard_tag_mapping(tag_id);
CREATE INDEX idx_study_sessions_user_id ON study_sessions(user_id);
CREATE INDEX idx_study_sessions_deck_id ON study_sessions(deck_id);
CREATE INDEX idx_study_session_results_session_id ON study_session_results(session_id);
CREATE INDEX idx_study_goals_user_id ON study_goals(user_id);
CREATE INDEX idx_generated_videos_user_id ON generated_videos(user_id);

-- ============================================================================
-- ROW LEVEL SECURITY (enable & policies)
-- ============================================================================
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_tag_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_session_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_videos ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "Users can view their own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can view their own decks"
  ON flashcard_decks FOR SELECT
  USING (auth.uid() = user_id OR is_public = true);

CREATE POLICY "Users can create decks"
  ON flashcard_decks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own decks"
  ON flashcard_decks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own decks"
  ON flashcard_decks FOR DELETE
  USING (auth.uid() = user_id);

-- Tags inherit permissions from their deck
CREATE POLICY "Users can view tags in accessible decks"
  ON flashcard_tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM flashcard_decks
      WHERE flashcard_decks.id = flashcard_tags.deck_id
      AND (flashcard_decks.user_id = auth.uid() OR flashcard_decks.is_public = true)
    )
  );

CREATE POLICY "Users can create tags in their decks"
  ON flashcard_tags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM flashcard_decks
      WHERE flashcard_decks.id = flashcard_tags.deck_id
      AND flashcard_decks.user_id = auth.uid()
    )
  );

-- Flashcards inherit permissions from their deck
CREATE POLICY "Users can view flashcards in accessible decks"
  ON flashcards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM flashcard_decks
      WHERE flashcard_decks.id = flashcards.deck_id
      AND (flashcard_decks.user_id = auth.uid() OR flashcard_decks.is_public = true)
    )
  );

CREATE POLICY "Users can create flashcards in their decks"
  ON flashcards FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM flashcard_decks
      WHERE flashcard_decks.id = flashcards.deck_id
      AND flashcard_decks.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update flashcards in their decks"
  ON flashcards FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM flashcard_decks
      WHERE flashcard_decks.id = flashcards.deck_id
      AND flashcard_decks.user_id = auth.uid()
    )
  );

-- Tag mappings inherit permissions from their flashcard's deck
CREATE POLICY "Users can view tag mappings in accessible decks"
  ON flashcard_tag_mapping FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM flashcards
      JOIN flashcard_decks ON flashcard_decks.id = flashcards.deck_id
      WHERE flashcards.id = flashcard_tag_mapping.flashcard_id
      AND (flashcard_decks.user_id = auth.uid() OR flashcard_decks.is_public = true)
    )
  );

CREATE POLICY "Users can create tag mappings in their decks"
  ON flashcard_tag_mapping FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM flashcards
      JOIN flashcard_decks ON flashcard_decks.id = flashcards.deck_id
      WHERE flashcards.id = flashcard_tag_mapping.flashcard_id
      AND flashcard_decks.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view their own study sessions"
  ON study_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create study sessions"
  ON study_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their session results"
  ON study_session_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM study_sessions
      WHERE study_sessions.id = study_session_results.session_id
      AND study_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view their statistics"
  ON user_statistics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their goals"
  ON study_goals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create goals"
  ON study_goals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own videos"
  ON generated_videos FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create videos"
  ON generated_videos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own videos"
  ON generated_videos FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own videos"
  ON generated_videos FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update tags in their decks"
  ON flashcard_tags FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM flashcard_decks
      WHERE flashcard_decks.id = flashcard_tags.deck_id
      AND flashcard_decks.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete tags in their decks"
  ON flashcard_tags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM flashcard_decks
      WHERE flashcard_decks.id = flashcard_tags.deck_id
      AND flashcard_decks.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete tag mappings in their decks"
  ON flashcard_tag_mapping FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM flashcards
      JOIN flashcard_decks ON flashcard_decks.id = flashcards.deck_id
      WHERE flashcards.id = flashcard_tag_mapping.flashcard_id
      AND flashcard_decks.user_id = auth.uid()
    )
  );

-- ============================================================================
-- TRIGGERS AND HELPERS
-- ============================================================================
CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_profiles_set_updated_at
BEFORE UPDATE ON user_profiles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TRIGGER flashcard_decks_set_updated_at
BEFORE UPDATE ON flashcard_decks
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TRIGGER flashcards_set_updated_at
BEFORE UPDATE ON flashcards
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TRIGGER user_statistics_set_updated_at
BEFORE UPDATE ON user_statistics
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE OR REPLACE FUNCTION refresh_deck_card_count(p_deck_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE flashcard_decks
  SET card_count = (
    SELECT COUNT(*)::INT
    FROM flashcards
    WHERE flashcards.deck_id = p_deck_id
  )
  WHERE id = p_deck_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION flashcards_sync_deck_count_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM refresh_deck_card_count(NEW.deck_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM refresh_deck_card_count(OLD.deck_id);
    RETURN OLD;
  ELSE
    IF NEW.deck_id <> OLD.deck_id THEN
      PERFORM refresh_deck_card_count(OLD.deck_id);
      PERFORM refresh_deck_card_count(NEW.deck_id);
    ELSE
      PERFORM refresh_deck_card_count(NEW.deck_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER flashcards_sync_deck_count
AFTER INSERT OR UPDATE OR DELETE ON flashcards
FOR EACH ROW
EXECUTE FUNCTION flashcards_sync_deck_count_trigger();

-- Optional helper RPC for server-side AI generation workflows.
-- Payload shape:
-- {
--   "name":"Deck name",
--   "description":"...",
--   "difficulty":"medium",
--   "ai_prompt":"...",
--   "cards":[{"front":"...", "back":"...", "tags":["a","b"]}]
-- }
CREATE OR REPLACE FUNCTION create_ai_flashcard_deck(p_payload JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_deck_id UUID;
  v_card JSONB;
  v_card_id UUID;
  v_tag_name TEXT;
  v_tag_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  INSERT INTO flashcard_decks (user_id, name, description, difficulty_level, ai_generated, ai_prompt)
  VALUES (
    v_user_id,
    COALESCE(NULLIF(TRIM(p_payload->>'name'), ''), 'AI Deck'),
    p_payload->>'description',
    COALESCE(NULLIF(TRIM(p_payload->>'difficulty'), ''), 'medium'),
    TRUE,
    p_payload->>'ai_prompt'
  )
  RETURNING id INTO v_deck_id;

  FOR v_card IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'cards', '[]'::jsonb))
  LOOP
    IF COALESCE(NULLIF(TRIM(v_card->>'front'), ''), '') = '' OR COALESCE(NULLIF(TRIM(v_card->>'back'), ''), '') = '' THEN
      CONTINUE;
    END IF;

    INSERT INTO flashcards (deck_id, front, back, ai_generated)
    VALUES (v_deck_id, v_card->>'front', v_card->>'back', TRUE)
    RETURNING id INTO v_card_id;

    FOR v_tag_name IN SELECT jsonb_array_elements_text(COALESCE(v_card->'tags', '[]'::jsonb))
    LOOP
      INSERT INTO flashcard_tags (deck_id, name)
      VALUES (v_deck_id, v_tag_name)
      ON CONFLICT (deck_id, name) DO UPDATE
      SET name = EXCLUDED.name
      RETURNING id INTO v_tag_id;

      INSERT INTO flashcard_tag_mapping (flashcard_id, tag_id)
      VALUES (v_card_id, v_tag_id)
      ON CONFLICT (flashcard_id, tag_id) DO NOTHING;
    END LOOP;
  END LOOP;

  PERFORM refresh_deck_card_count(v_deck_id);
  RETURN v_deck_id;
END;
$$;

-- ============================================================================
-- STORAGE BUCKET FOR GENERATED VIDEOS
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('generated-videos', 'generated-videos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload videos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'generated-videos' AND auth.role() = 'authenticated');

CREATE POLICY "Anyone can view generated videos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'generated-videos');

CREATE POLICY "Users can delete their own video files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'generated-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================================
-- NOTES
-- ============================================================================
-- 1) This script is destructive. It drops tables and recreates them.
-- 2) If you need triggers to update 'updated_at' on row update, add them after schema creation.
-- 3) If you plan to use pgvector for embeddings, run:
--      CREATE EXTENSION IF NOT EXISTS vector;
--    then add an embedding column (vector) to flashcards or a separate table.
-- 4) Confirm gen_random_uuid() is available via pgcrypto (enabled above).
