'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ClipboardCheck, Flame, LogIn, Plus, Sparkles, Trophy, Users } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import { PageLoader } from '@/components/PageLoader';
import { calculateRetentionRate, calculateStudyStreak } from '@/lib/spacedRepetition';
import { weightedPredictedGrade } from '@/lib/ai/gradeAverages';
import { getSubjectLabel } from '@/lib/ai/subjectConfig';
import { gradeBadgeTone } from '@/lib/gradeTone';

type LinkedStudent = { studentId: string; name: string };

type AttemptRow = {
  subject: string;
  exam_type?: string | null;
  weakness_tags?: string[] | null;
  weakness_analysis?: string[] | null;
  predicted_grade?: string | null;
  total_marks_awarded?: number | null;
  total_available_marks?: number | null;
};

type SubjectGrade = {
  subject: string;
  examType: string | null;
  grade: string;
  attempts: number;
};

type ChildMetrics = {
  subjectGrades: SubjectGrade[];
  studyStreak: number;
  retentionRate: number;
  assignmentsCompleted: number;
  topWeaknesses: { tag: string; count: number }[];
};

const emptyMetrics: ChildMetrics = {
  subjectGrades: [],
  studyStreak: 0,
  retentionRate: 0,
  assignmentsCompleted: 0,
  topWeaknesses: [],
};

const normalizeInsightLabel = (value: string) =>
  value
    .replace(/^Main pattern to fix:\s*/i, '')
    .replace(/\s+/g, ' ')
    .replace(/\.$/, '')
    .trim()
    .slice(0, 70);

export default function ParentDashboardPage() {
  const router = useRouter();
  const { session, profile, isLoading } = useAuth();
  const supabase = createClient();

  const [students, setStudents] = useState<LinkedStudent[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<ChildMetrics>(emptyMetrics);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [linkError, setLinkError] = useState('');

  const loadStudents = async (parentId: string) => {
    const { data: linkRows, error } = await supabase
      .from('parent_links')
      .select('student_id')
      .eq('parent_id', parentId)
      .eq('status', 'active');

    if (error || !linkRows || linkRows.length === 0) return [];

    const studentIds: string[] = linkRows.map((row: { student_id: string }) => row.student_id);
    const { data: profileRows } = await supabase
      .from('user_profiles')
      .select('id, full_name, first_name, username, email')
      .in('id', studentIds);

    return studentIds.map((id: string) => {
      const p = (profileRows ?? []).find((row: { id: string }) => row.id === id) as
        | { full_name?: string; first_name?: string; username?: string; email?: string }
        | undefined;
      return { studentId: id, name: p?.full_name || p?.first_name || p?.username || p?.email || 'Student' };
    });
  };

  useEffect(() => {
    if (isLoading) return;
    if (profile && profile.role !== 'parent') {
      router.replace(profile.role === 'teacher' ? '/dashboard/teacher' : '/dashboard');
      return;
    }
    if (!session) return;

    let cancelled = false;
    const load = async () => {
      setStudentsLoading(true);
      const rows = await loadStudents(session.user.id);
      if (cancelled) return;
      setStudents(rows);
      setSelectedStudentId(rows[0]?.studentId ?? null);
      setStudentsLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, session, profile, router]);

  useEffect(() => {
    if (!selectedStudentId) return;

    let cancelled = false;
    const load = async () => {
      setMetricsLoading(true);
      const [attemptsResponse, sessionsResponse, cardsResponse, attemptStatusResponse] = await Promise.all([
        supabase
          .from('exam_practice_attempts')
          .select('subject, exam_type, weakness_tags, weakness_analysis, predicted_grade, total_marks_awarded, total_available_marks')
          .eq('user_id', selectedStudentId)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.from('study_sessions').select('started_at').eq('user_id', selectedStudentId),
        supabase
          .from('flashcard_decks')
          .select('id')
          .eq('user_id', selectedStudentId),
        supabase.from('assignment_attempts').select('status').eq('student_id', selectedStudentId),
      ]);

      if (cancelled) return;

      const attempts = (attemptsResponse.data ?? []) as AttemptRow[];
      const deckIds = ((cardsResponse.data ?? []) as Array<{ id: string }>).map((d) => d.id);
      const cardsRows =
        deckIds.length > 0
          ? await supabase
              .from('flashcards')
              .select('repetition_count, consecutive_correct')
              .in('deck_id', deckIds)
          : { data: [] };

      const subjectGroups = new Map<string, AttemptRow[]>();
      for (const attempt of attempts) {
        const key = `${attempt.subject}|${attempt.exam_type ?? 'unknown'}`;
        subjectGroups.set(key, [...(subjectGroups.get(key) ?? []), attempt]);
      }
      const subjectGrades: SubjectGrade[] = [...subjectGroups.entries()]
        .map(([key, group]) => {
          const [subject, examType] = key.split('|');
          const prediction = weightedPredictedGrade(group, examType === 'unknown' ? null : examType);
          return { subject, examType: examType === 'unknown' ? null : examType, grade: prediction.grade, attempts: group.length };
        })
        .filter((item) => item.grade !== 'N/A')
        .sort((a, b) => a.subject.localeCompare(b.subject));

      const tagMap = new Map<string, number>();
      for (const attempt of attempts) {
        const rawInsights = (attempt.weakness_tags?.length ? attempt.weakness_tags : attempt.weakness_analysis) ?? [];
        for (const tag of rawInsights) {
          const norm = normalizeInsightLabel(tag);
          if (!norm) continue;
          tagMap.set(norm, (tagMap.get(norm) ?? 0) + 1);
        }
      }
      const topWeaknesses = [...tagMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tag, count]) => ({ tag, count }));

      const sessionDates = ((sessionsResponse.data ?? []) as Array<{ started_at: string | null }>)
        .map((s) => (s.started_at ? new Date(s.started_at).getTime() : NaN))
        .filter((t) => Number.isFinite(t));
      const studyStreak = calculateStudyStreak(sessionDates);

      const retentionRate = calculateRetentionRate(
        (cardsRows.data ?? []) as Array<{ repetition_count: number; consecutive_correct: number }>
      );

      const assignmentsCompleted = ((attemptStatusResponse.data ?? []) as Array<{ status: string }>).filter(
        (a) => a.status === 'completed'
      ).length;

      setMetrics({ subjectGrades, studyStreak, retentionRate, assignmentsCompleted, topWeaknesses });
      setMetricsLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedStudentId, supabase]);

  const handleLink = async () => {
    if (!inviteCode.trim() || !session) {
      setLinkError('Enter an invite code.');
      return;
    }
    setIsLinking(true);
    setLinkError('');

    const { error } = await supabase.rpc('redeem_parent_invite_code', { p_invite_code: inviteCode.trim() });

    if (error) {
      setIsLinking(false);
      setLinkError(
        error.message.includes('Invalid invite code')
          ? 'That invite code is not valid.'
          : error.message.includes('own account')
            ? 'You cannot link to your own account.'
            : 'Could not link that account.'
      );
      return;
    }

    setInviteCode('');
    setShowLinkForm(false);
    const rows = await loadStudents(session.user.id);
    setStudents(rows);
    setSelectedStudentId((current) => current ?? rows[0]?.studentId ?? null);
    setIsLinking(false);
  };

  if (isLoading || studentsLoading) {
    return <PageLoader text="Loading your family dashboard..." />;
  }

  if (!session) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Family Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            A read-only view of your child&apos;s progress on AIDemic.
          </p>
        </div>
        <button type="button" onClick={() => setShowLinkForm((v) => !v)} className={buttonStyles({ variant: 'secondary', size: 'sm' })}>
          <Plus className="h-3.5 w-3.5" />
          Add another child
        </button>
      </div>

      {showLinkForm ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
          <label className="text-sm font-semibold text-slate-800 dark:text-slate-100">Link a child</label>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder="Enter invite code"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono uppercase tracking-widest outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100"
            />
            <button type="button" onClick={handleLink} disabled={isLinking} className={buttonStyles({ variant: 'primary' })}>
              <LogIn className="h-4 w-4" />
              {isLinking ? 'Linking...' : 'Link'}
            </button>
          </div>
          {linkError ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{linkError}</p> : null}
        </div>
      ) : null}

      {students.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center dark:border-white/6 dark:bg-white/3">
          <Users className="mx-auto mb-3 h-10 w-10 text-slate-300 dark:text-slate-600" />
          <p className="font-semibold text-slate-800 dark:text-slate-200">No linked children yet</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Ask your child to open Family in their AIDemic dashboard and share their invite code, then add it above.
          </p>
        </div>
      ) : (
        <>
          {students.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {students.map((student) => (
                <button
                  key={student.studentId}
                  type="button"
                  onClick={() => setSelectedStudentId(student.studentId)}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                    selectedStudentId === student.studentId
                      ? 'bg-linear-to-r from-indigo-600/90 to-purple-600/90 text-white shadow-md shadow-indigo-500/20'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300'
                  }`}
                >
                  {student.name}
                </button>
              ))}
            </div>
          ) : (
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{students[0].name}</h2>
          )}

          {metricsLoading ? (
            <PageLoader text="Loading progress..." />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <Flame className="h-3.5 w-3.5 text-orange-500" />
                    Study streak
                  </div>
                  <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{metrics.studyStreak}d</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                    Retention rate
                  </div>
                  <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{Math.round(metrics.retentionRate)}%</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <ClipboardCheck className="h-3.5 w-3.5 text-emerald-500" />
                    Assignments completed
                  </div>
                  <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{metrics.assignmentsCompleted}</p>
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center gap-2.5">
                  <Trophy className="h-5 w-5 text-emerald-500" />
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Predicted grades</h2>
                </div>
                {metrics.subjectGrades.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500 dark:border-white/6 dark:bg-white/3 dark:text-slate-400">
                    No exam practice completed yet.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
                    <div className="divide-y divide-slate-100 dark:divide-white/6">
                      {metrics.subjectGrades.map((item) => (
                        <div key={`${item.subject}-${item.examType ?? 'na'}`} className="flex items-center justify-between px-5 py-3.5">
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">{getSubjectLabel(item.subject)}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{item.attempts} attempts analysed</p>
                          </div>
                          <span
                            className={`inline-flex min-w-14 justify-center rounded-lg px-3 py-1.5 text-sm font-black ${gradeBadgeTone({
                              grade: item.grade,
                              examType: item.examType,
                            })}`}
                          >
                            {item.grade}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <div className="mb-3 flex items-center gap-2.5">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Recurring weak areas</h2>
                </div>
                {metrics.topWeaknesses.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500 dark:border-white/6 dark:bg-white/3 dark:text-slate-400">
                    No recurring weaknesses detected yet.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {metrics.topWeaknesses.map((weakness) => (
                      <span
                        key={weakness.tag}
                        className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300"
                      >
                        {weakness.tag} · {weakness.count}×
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
