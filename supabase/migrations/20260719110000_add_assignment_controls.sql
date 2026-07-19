-- ============================================================================
-- Assignment controls: re-attempt policy + teacher mark overrides.
--
-- allow_reattempts lets a teacher opt an assignment out of the default
-- one-shot marking behavior in mark-answers/route.ts.
--
-- ai_feedback_original/teacher_overridden_at/teacher_overridden_by support a
-- teacher-facing per-question mark override on assignment_attempts. Writes to
-- these columns go exclusively through the service-role client (no new RLS
-- write policy is added -- the same server-authoritative model as the rest of
-- assignment_attempts).
-- ============================================================================

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS allow_reattempts BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE assignment_attempts
  ADD COLUMN IF NOT EXISTS ai_feedback_original JSONB,
  ADD COLUMN IF NOT EXISTS teacher_overridden_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS teacher_overridden_by UUID REFERENCES teachers(id) ON DELETE SET NULL;
