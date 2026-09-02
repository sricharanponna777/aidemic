-- Onboarding tour + get-started checklist state.
--
-- Both are per-account rather than per-device: a student who finished the tour
-- on a school desktop should not be shown it again on their phone, and a
-- dismissed checklist that came back on the next device would read as a bug.
-- Nullable timestamps rather than booleans so "when" is answerable later.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_checklist_dismissed_at TIMESTAMPTZ;

COMMENT ON COLUMN user_profiles.onboarding_completed_at IS
  'Set when the user finishes or skips the welcome tour. NULL means the tour is still owed.';
COMMENT ON COLUMN user_profiles.onboarding_checklist_dismissed_at IS
  'Set when the user closes the dashboard get-started checklist. NULL means show it until every step is done.';
