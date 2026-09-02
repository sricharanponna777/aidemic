-- A student must be able to see WHO is asking before accepting a parent link
-- request. The original policy (20260720100000) scoped the student's read of a
-- parent's profile to status = 'active', so a pending request rendered as the
-- anonymous fallback "A parent" on /dashboard/family.
--
-- Widened to pending rows as well. This is safe in both directions:
--   * parent-initiated pending rows carry parent_id and were created by that
--     parent deliberately naming this student, so no identity is disclosed
--     that the parent did not choose to disclose.
--   * teacher/student-initiated pending rows have parent_id = NULL until the
--     invite code is redeemed, so they cannot match this policy at all.
-- Nothing here grants the parent any read of the student -- is_parent_of_student()
-- stays active-only.
DROP POLICY IF EXISTS "Students can view profiles of their linked parents" ON user_profiles;
CREATE POLICY "Students can view profiles of their linked parents"
  ON user_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM parent_links
      WHERE parent_links.parent_id = user_profiles.id
      AND parent_links.student_id = auth.uid()
      AND parent_links.status IN ('active', 'pending')
    )
  );
