'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';

export type TeacherClass = {
  id: string;
  name: string;
  status: 'active' | 'archived';
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

/**
 * Shared loader for the teacher analytics surfaces (Dashboard, Reports, AI
 * Insights). Pulls every class a teacher owns plus its assignments, attempts,
 * and roster in one pass so each page can derive its own aggregates without
 * repeating the fetch/guard boilerplate. Redirects non-teachers and
 * un-onboarded users the same way the class pages do.
 */
export function useTeacherClassData(): TeacherClassData {
  const router = useRouter();
  const { session, profile, isLoading } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [schoolStatus, setSchoolStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null);
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [attempts, setAttempts] = useState<TeacherAttempt[]>([]);
  const [students, setStudents] = useState<TeacherStudent[]>([]);

  useEffect(() => {
    if (isLoading || !session) return;
    if (profile && profile.role !== 'teacher') {
      router.replace('/dashboard');
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);

      const { data: teacherRow } = await supabase
        .from('teachers')
        .select('id, verification_status, schools ( status )')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (cancelled) return;
      if (!teacherRow) {
        router.replace('/onboarding/teacher');
        return;
      }
      const typed = teacherRow as unknown as {
        id: string;
        verification_status: 'pending' | 'approved' | 'rejected';
        schools: { status: 'pending' | 'approved' | 'rejected' } | null;
      };
      setTeacherId(typed.id);
      setVerificationStatus(typed.verification_status);
      setSchoolStatus(typed.schools?.status ?? null);

      const { data: classRows } = await supabase
        .from('classes')
        .select(
          'id, name, status, specifications ( name, tier, subjects ( id, name, exam_boards ( name, qualifications ( name ) ) ) )'
        )
        .eq('teacher_id', typed.id)
        .order('created_at', { ascending: false });
      if (cancelled) return;
      const classList = (classRows as unknown as TeacherClass[]) ?? [];
      setClasses(classList);

      const classIds = classList.map((c) => c.id);
      if (classIds.length === 0) {
        setAssignments([]);
        setAttempts([]);
        setStudents([]);
        setLoading(false);
        return;
      }

      const { data: assignmentRows } = await supabase
        .from('assignments')
        .select('id, title, class_id, assignment_type, topic_id, topics ( name ), due_date, created_at')
        .in('class_id', classIds)
        .order('created_at', { ascending: false });
      if (cancelled) return;
      const assignmentList = (assignmentRows as unknown as TeacherAssignment[]) ?? [];
      setAssignments(assignmentList);

      const assignmentIds = assignmentList.map((a) => a.id);
      if (assignmentIds.length > 0) {
        const { data: attemptRows } = await supabase
          .from('assignment_attempts')
          .select('assignment_id, student_id, status, percentage, predicted_grade, completed_at, started_at')
          .in('assignment_id', assignmentIds);
        if (cancelled) return;
        setAttempts((attemptRows as TeacherAttempt[]) ?? []);
      } else {
        setAttempts([]);
      }

      const { data: rosterRows } = await supabase
        .from('class_students')
        .select('id, student_id, class_id, joined_at')
        .in('class_id', classIds)
        .eq('status', 'active');
      const typedRoster = (rosterRows ?? []) as { id: string; student_id: string; class_id: string; joined_at: string | null }[];
      const studentIds = [...new Set(typedRoster.map((r) => r.student_id))];
      let profiles: { id: string; full_name: string | null; email: string | null }[] = [];
      if (studentIds.length > 0) {
        const { data: profileRows } = await supabase.from('user_profiles').select('id, full_name, email').in('id', studentIds);
        profiles = profileRows ?? [];
      }
      if (cancelled) return;
      setStudents(
        typedRoster.map((r) => {
          const p = profiles.find((prof) => prof.id === r.student_id);
          return {
            id: r.id,
            student_id: r.student_id,
            class_id: r.class_id,
            joined_at: r.joined_at,
            full_name: p?.full_name ?? null,
            email: p?.email ?? null,
          };
        })
      );

      setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isLoading, session, profile, router, supabase]);

  return { loading: isLoading || loading, teacherId, verificationStatus, schoolStatus, classes, assignments, attempts, students };
}
