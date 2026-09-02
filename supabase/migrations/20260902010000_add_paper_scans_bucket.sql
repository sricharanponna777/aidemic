-- ============================================================================
-- Storage for photographed handwriting.
--
-- PRIVATE, unlike `generated-podcasts`. These objects are photographs of a
-- student's own handwriting -- often a child's, frequently with their name at
-- the top of the sheet -- so there is no version of this bucket that is safe to
-- serve publicly. Reads go out as short-lived signed URLs minted server-side
-- (src/lib/papers/loadPaper.ts), and the transcription route downloads the
-- object with the service role rather than handing any URL to the AI provider.
--
-- The client uploads directly (a 12-page paper would not survive a serverless
-- request body limit), so the object policies below are the real boundary:
-- each user may only touch objects under their own uid folder.
--
-- Path layout: <user_id>/<paper_id>/<page_index>.jpg
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'paper-scans',
  'paper-scans',
  false,
  5242880, -- 5 MB; the client downscales to ~300 KB before uploading
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users can upload their own paper scans" ON storage.objects;
CREATE POLICY "Users can upload their own paper scans"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'paper-scans' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can view their own paper scans" ON storage.objects;
CREATE POLICY "Users can view their own paper scans"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'paper-scans' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can replace their own paper scans" ON storage.objects;
CREATE POLICY "Users can replace their own paper scans"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'paper-scans' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can delete their own paper scans" ON storage.objects;
CREATE POLICY "Users can delete their own paper scans"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'paper-scans' AND auth.uid()::text = (storage.foldername(name))[1]);
