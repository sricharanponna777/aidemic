-- Add optional subtopic column to generated_podcasts, mirroring the
-- topic/subtopic split already used by notes and flashcards generation.
ALTER TABLE generated_podcasts ADD COLUMN subtopic TEXT;
