-- Migration: let students revoke the parent-initiated links they accepted
--
-- 20260801000000 introduced link_source='parent' rows, but left the student
-- UPDATE policy from 20260721000000 scoped to link_source='student'. That left
-- an accepted parent link permanently unremovable by the student:
--   * no UPDATE policy matched, so the direct revoke was denied by RLS, and
--   * request_parent_link_revocation() only matches link_source='teacher',
--     so the fallback "request removal" path raised every time.
-- Teacher-initiated links keep their guarantee (removal still needs teacher
-- approval); consent the student gave themselves is theirs to withdraw.

DROP POLICY IF EXISTS "Students can revoke their own parent links" ON parent_links;
CREATE POLICY "Students can revoke their own parent links"
  ON parent_links FOR UPDATE
  USING (auth.uid() = student_id AND link_source IN ('student', 'parent'))
  WITH CHECK (auth.uid() = student_id AND link_source IN ('student', 'parent'));
