ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'uk';

UPDATE user_profiles
SET country = 'uk'
WHERE country IS NULL;

ALTER TABLE user_profiles
  ALTER COLUMN country SET DEFAULT 'uk';

DROP POLICY IF EXISTS "Users can create their own profile"
  ON user_profiles;
CREATE POLICY "Users can create their own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);
