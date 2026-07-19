-- ============================================================================
-- Server-authoritative assignment marking.
--
-- Assignment attempts are now written exclusively by the mark-answers route
-- using the service-role key (which bypasses RLS). Students keep read access
-- to their own attempts; direct INSERT/UPDATE from clients is revoked so
-- score/percentage/predicted_grade/ai_feedback can no longer be forged via
-- the Supabase REST API.
--
-- Deploy order: ship the application code first, then apply this migration.
-- (Applying this first would break submissions from the old client, which
-- upserted attempts directly.)
-- ============================================================================

DROP POLICY IF EXISTS "Students can create their own attempts" ON assignment_attempts;
DROP POLICY IF EXISTS "Students can update their own attempts" ON assignment_attempts;

-- Kept unchanged:
--   "Students can view their own attempts"      (take page reads answers_payload/ai_feedback/status;
--                                                class page reads status/percentage)
--   "Teachers can view attempts for their classes"
-- No new write policy is needed: the service role bypasses RLS.
