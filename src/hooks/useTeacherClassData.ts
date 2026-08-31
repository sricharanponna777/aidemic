'use client';

import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';

export type TeacherClass = {
  id: string;
  name: string;
  status: 'active' | 'archived';
  /** Drives the subtopic mastery heatmap's topic list. */
  specification_id: string | null;
  specifications: {
    name: string;
    tier: string | null;
    subjects: {
      id: string;
      name: string;
      exam_boards: { name: string; qualifications: { name: string } | null } | null;
    } | null;
  } | null;
};

export type TeacherAssignment = {
  id: string;
  title: string;
  class_id: string;
  assignment_type: string;
  topic_id: string | null;
  topics: { name: string } | null;
  due_date: string | null;
  created_at: string | null;
};

export type TeacherAttempt = {
  assignment_id: string;
  student_id: string;
  status: string;
  percentage: number | null;
  predicted_grade: string | null;
  completed_at: string | null;
  started_at: string | null;
};

export type TeacherStudent = {
  id: string;
  student_id: string;
  class_id: string;
  joined_at: string | null;
  full_name: string | null;
  email: string | null;
};

export type TeacherClassData = {
  loading: boolean;
  teacherId: string | null;
  verificationStatus: 'pending' | 'approved' | 'rejected';
  schoolStatus: 'pending' | 'approved' | 'rejected' | null;
  classes: TeacherClass[];
  assignments: TeacherAssignment[];
  attempts: TeacherAttempt[];
  students: TeacherStudent[];
};

type TeacherClassSnapshot = Omit<TeacherClassData, 'loading' | 'teacherId'> & { teacherId: string };

const fetchTeacherClassData = async (
  userId: string,
  role: string | undefined,
  redirect: (path: string) => void
): Promise<TeacherClassSnapshot | null> => {
  if (role && role !== 'teacher') {
    redirect('/dashboard');
    return null;
  }

  const supabase = createClient();

  const { data: teacherRow } = await supabase
    .from('teachers')
    .select('id, verification_status, schools ( status )')
    .eq('user_id', userId)
    .maybeSingle();
  if (!teacherRow) {
    redirect('/onboarding/teacher');
    return null;
  }
  const typed = teacherRow as unknown as {
    id: string;
    verification_status: 'pending' | 'approved' | 'rejected';
    schools: { status: 'pending' | 'approved' | 'rejected' } | null;
  };

  const { data: classRows } = await supabase
    .from('classes')
    .select(
      'id, name, status, specification_id, specifications ( name, tier, subjects ( id, name, exam_boards ( name, qualifications ( name ) ) ) )'
    )
    .eq('teacher_id', typed.id)
    .order('created_at', { ascending: false });
  const classList = (classRows as unknown as TeacherClass[]) ?? [];

  const base = { teacherId: typed.id, verificationStatus: typed.verification_status, schoolStatus: typed.schools?.status ?? null, classes: classList };

  const classIds = classList.map((c) => c.id);
  if (classIds.length === 0) {
    return { ...base, assignments: [], attempts: [], students: [] };
  }

  const assignmentsChain = async () => {
    const { data: assignmentRows } = await supabase
      .from('assignments')
      .select('id, title, class_id, assignment_type, topic_id, topics ( name ), due_date, created_at')
      .in('class_id', classIds)
      .order('created_at', { ascending: false });
    const assignmentList = (assignmentRows as unknown as TeacherAssignment[]) ?? [];

    const assignmentIds = assignmentList.map((a) => a.id);
    if (assignmentIds.length === 0) return { assignmentList, attemptList: [] as TeacherAttempt[] };

    const { data: attemptRows } = await supabase
      .from('assignment_attempts')
      .select('assignment_id, student_id, status, percentage, predicted_grade, completed_at, started_at')
      .in('assignment_id', assignmentIds);
    return { assignmentList, attemptList: (attemptRows as TeacherAttempt[]) ?? [] };
  };

  const rosterChain = async () => {
    const { data: rosterRows } = await supabase
      .from('class_students')
      .select('id, student_id, class_id, joined_at')
      .in('class_id', classIds)
      .eq('status', 'active');
    const typedRoster = (rosterRows ?? []) as { id: string; student_id: string; class_id: string; joined_at: string | null }[];
    const studentIds = [...new Set(typedRoster.map((r) => r.student_id))];
    if (studentIds.length === 0) return { typedRoster, profiles: [] as { id: string; full_name: string | null; email: string | null }[] };

    const { data: profileRows } = await supabase.from('user_profiles').select('id, full_name, email').in('id', studentIds);
    return { typedRoster, profiles: (profileRows ?? []) as { id: string; full_name: string | null; email: string | null }[] };
  };

  const [{ assignmentList, attemptList }, { typedRoster, profiles }] = await Promise.all([assignmentsChain(), rosterChain()]);

  const students = typedRoster.map((r) => {
    const p = profiles.find((prof) => prof.id === r.student_id);
    return {
      id: r.id,
      student_id: r.student_id,
      class_id: r.class_id,
      joined_at: r.joined_at,
      full_name: p?.full_name ?? null,
      email: p?.email ?? null,
    };
  });

  return { ...base, assignments: assignmentList, attempts: attemptList, students };
};

/**
 * Shared loader for the teacher analytics surfaces (Dashboard, Reports, AI
 * Insights). Pulls every class a teacher owns plus its assignments, attempts,
 * and roster in one pass so each page can derive its own aggregates without
 * repeating the fetch/guard boilerplate. Redirects non-teachers and
 * un-onboarded users the same way the class pages do.
 */
export function useTeacherClassData(): TeacherClassData {
  const router = useRouter();
  const { session, profile, isLoading: authLoading } = useAuth();
  const ready = !authLoading && !!session;

  const { data, isLoading } = useSWR(
    ready ? ['teacher-class-data', session!.user.id, profile?.role] : null,
    () => fetchTeacherClassData(session!.user.id, profile?.role, (path) => router.replace(path))
  );

  return {
    loading: authLoading || !ready || isLoading || !data,
    teacherId: data?.teacherId ?? null,
    verificationStatus: data?.verificationStatus ?? 'pending',
    schoolStatus: data?.schoolStatus ?? null,
    classes: data?.classes ?? [],
    assignments: data?.assignments ?? [],
    attempts: data?.attempts ?? [],
    students: data?.students ?? [],
  };
}
