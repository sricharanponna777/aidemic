ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_username_key
  ON user_profiles (username)
  WHERE username IS NOT NULL;
