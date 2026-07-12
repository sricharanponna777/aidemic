-- ============================================================================
-- AI Podcasts: generated_podcasts table + storage bucket for synthesized audio
--
-- Mirrors the generated_videos table and generated-videos storage bucket
-- already defined in queries.sql (lines 174-190, 1048-1065).
-- ============================================================================

CREATE TABLE generated_podcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  topic TEXT NOT NULL,
  length TEXT NOT NULL,
  voice TEXT NOT NULL,
  script_content TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  character_count INT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_generated_podcasts_user_id ON generated_podcasts(user_id);

ALTER TABLE generated_podcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own podcasts"
  ON generated_podcasts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create podcasts"
  ON generated_podcasts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own podcasts"
  ON generated_podcasts FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- STORAGE BUCKET FOR GENERATED PODCASTS
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('generated-podcasts', 'generated-podcasts', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload podcast audio"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'generated-podcasts' AND auth.role() = 'authenticated');

CREATE POLICY "Anyone can view generated podcast audio"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'generated-podcasts');

CREATE POLICY "Users can delete their own podcast audio files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'generated-podcasts' AND auth.uid()::text = (storage.foldername(name))[1]);
