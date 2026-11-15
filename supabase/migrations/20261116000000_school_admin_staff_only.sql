-- ============================================================================
-- The school admin console is one page: staff approvals.
--
-- The Overview (analytics), Classes and Students pages are gone, so the RPCs
-- that fed them go too. What the console still calls: school_admin_school()
-- (the school name in the sidebar), school_admin_staff() and
-- school_admin_set_teacher_status().
-- ============================================================================

DROP FUNCTION IF EXISTS school_admin_classes();
DROP FUNCTION IF EXISTS school_admin_students();
DROP FUNCTION IF EXISTS school_admin_analytics();
-- Internal helper used only by the two above.
DROP FUNCTION IF EXISTS school_student_ids(UUID);
