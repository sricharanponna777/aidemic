'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check, UserPlus, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import { PageLoader } from '@/components/PageLoader';
import { buttonStyles } from '@/components/ui/button';
import { ParentLinksPanel } from '@/components/teacher/ParentLinksPanel';

type PendingTeacher = {
  id: string;
  user_id: string;
  department: string | null;
  qualification_level: string | null;
  full_name: string | null;
  email: string | null;
};

type SchoolStudent = {
  student_id: string;
  full_name: string | null;
  email: string | null;
  class_name: string;
};

export default function SchoolAdminPage() {
  const router = useRouter();
  const { session, profile, isLoading } = useAuth();
  const supabase = createClient();

  const [schoolName, setSchoolName] = useState('');
  const [pendingTeachers, setPendingTeachers] = useState<PendingTeacher[]>([]);
  const [students, setStudents] = useState<SchoolStudent[]>([]);
  const [expandedParentStudentId, setExpandedParentStudentId] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (isLoading || !session) return;
    if (profile && profile.role !== 'teacher') {
      router.replace('/dashboard');
      return;
    }

    let cancelled = false;
    const load = async () => {
      setPageLoading(true);

      const { data: teacherRow } = await supabase
        .from('teachers')
        .select('school_id, is_school_admin, schools ( name )')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (cancelled) return;
      const typedTeacherRow = teacherRow as unknown as {
        school_id: string | null;
        is_school_admin: boolean;
        schools: { name: string } | null;
      } | null;

      if (!typedTeacherRow?.is_school_admin || !typedTeacherRow.school_id) {
        router.replace('/dashboard/teacher');
        return;
      }
      setSchoolName(typedTeacherRow.schools?.name ?? '');

      const { data: teacherRows } = await supabase
        .from('teachers')
        .select('id, user_id, department, qualification_level')
        .eq('school_id', typedTeacherRow.school_id)
        .eq('verification_status', 'pending')
        .neq('user_id', session.user.id);

      const typedTeacherRows = (teacherRows ?? []) as { id: string; user_id: string; department: string | null; qualification_level: string | null }[];
      const userIds = typedTeacherRows.map((t) => t.user_id);
      let profiles: { id: string; full_name: string | null; email: string | null }[] = [];
      if (userIds.length > 0) {
        const { data: profileRows } = await supabase.from('user_profiles').select('id, full_name, email').in('id', userIds);
        profiles = profileRows ?? [];
      }

      if (cancelled) return;
      setPendingTeachers(
        typedTeacherRows.map((t) => {
          const p = profiles.find((prof) => prof.id === t.user_id);
          return { ...t, full_name: p?.full_name ?? null, email: p?.email ?? null };
        })
      );

      const { data: classRows } = await supabase
        .from('classes')
        .select('id, name, teachers!inner(school_id)')
        .eq('teachers.school_id', typedTeacherRow.school_id);
      const typedClassRows = (classRows ?? []) as unknown as { id: string; name: string }[];
      const classNameById = new Map(typedClassRows.map((c) => [c.id, c.name]));
      const classIds = typedClassRows.map((c) => c.id);

      if (classIds.length > 0) {
        const { data: rosterRows } = await supabase
          .from('class_students')
          .select('student_id, class_id')
          .in('class_id', classIds)
          .eq('status', 'active');
        const typedRosterRows = (rosterRows ?? []) as { student_id: string; class_id: string }[];
        const studentUserIds = [...new Set(typedRosterRows.map((r) => r.student_id))];
        let studentProfiles: { id: string; full_name: string | null; email: string | null }[] = [];
        if (studentUserIds.length > 0) {
          const { data: studentProfileRows } = await supabase.from('user_profiles').select('id, full_name, email').in('id', studentUserIds);
          studentProfiles = studentProfileRows ?? [];
        }
        if (!cancelled) {
          // Dedupe by student: a student enrolled in several classes at the
          // school must appear once, with their classes combined (otherwise
          // duplicate React keys and the parent expander opens every copy).
          const byStudent = new Map<string, SchoolStudent>();
          for (const r of typedRosterRows) {
            const className = classNameById.get(r.class_id) ?? '';
            const existing = byStudent.get(r.student_id);
            if (existing) {
              if (className && !existing.class_name.split(', ').includes(className)) {
                existing.class_name = existing.class_name ? `${existing.class_name}, ${className}` : className;
              }
              continue;
            }
            const p = studentProfiles.find((prof) => prof.id === r.student_id);
            byStudent.set(r.student_id, {
              student_id: r.student_id,
              full_name: p?.full_name ?? null,
              email: p?.email ?? null,
              class_name: className,
            });
          }
          setStudents([...byStudent.values()]);
        }
      }

      setPageLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isLoading, session, profile, router, supabase]);

  const handleDecision = async (teacherId: string, decision: 'approved' | 'rejected') => {
    setActionError('');
    const { error } = await supabase.from('teachers').update({ verification_status: decision }).eq('id', teacherId);
    if (error) {
      setActionError('Could not update that teacher. Please try again.');
      return;
    }
    setPendingTeachers((prev) => prev.filter((t) => t.id !== teacherId));
  };

  if (isLoading || pageLoading) {
    return <PageLoader />;
  }

  return (
    <div className="space-y-6">
      <Link href="/dashboard/teacher/classes" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100">
        <ArrowLeft className="h-3.5 w-3.5" />
        My Classes
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{schoolName}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Approve teachers requesting to join your school.</p>
      </div>

      {actionError ? <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p> : null}

      {pendingTeachers.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600 dark:border-white/6 dark:bg-white/3 dark:text-slate-400">
          No pending teachers.
        </p>
      ) : (
        <div className="space-y-2">
          {pendingTeachers.map((teacher) => (
            <div key={teacher.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
              <div>
                <p className="font-medium text-slate-900 dark:text-slate-100">{teacher.full_name || teacher.email || 'Teacher'}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {teacher.email}
                  {teacher.department ? ` · ${teacher.department}` : ''}
                  {teacher.qualification_level ? ` · ${teacher.qualification_level}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDecision(teacher.id, 'approved')}
                  className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  <Check className="h-3.5 w-3.5" />
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => handleDecision(teacher.id, 'rejected')}
                  className="flex items-center gap-1 rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-300 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/20"
                >
                  <X className="h-3.5 w-3.5" />
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">School roster</h2>
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">Link a parent to any student at your school.</p>
        {students.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600 dark:border-white/6 dark:bg-white/3 dark:text-slate-400">
            No students enrolled yet.
          </p>
        ) : (
          <div className="space-y-2">
            {students.map((student) => {
              const isExpanded = expandedParentStudentId === student.student_id;
              return (
                <div key={student.student_id} className="rounded-lg border border-slate-200 dark:border-white/6">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                    <div>
                      <span className="font-medium text-slate-900 dark:text-slate-100">{student.full_name || student.email || 'Student'}</span>
                      <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">{student.class_name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpandedParentStudentId(isExpanded ? null : student.student_id)}
                      className={buttonStyles({ variant: 'secondary', size: 'sm' })}
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Parent
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="border-t border-slate-200 p-3 dark:border-white/6">
                      <ParentLinksPanel studentId={student.student_id} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
