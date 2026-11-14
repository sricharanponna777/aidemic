'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Radar, Trophy } from 'lucide-react';
import { PageHeader } from '@/components/ui/feedback';
import { Alert } from '@/components/ui/field';
import { Chip, MonoLabel, Panel, PanelHeading, Stat, StatusBar, Workspace, WorkspaceBody } from '@/components/ui/telemetry';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import { getExamTypeLabel, getSubjectLabel } from '@/lib/ai/subjectConfig';
import { weightedPredictedGrade } from '@/lib/ai/gradeAverages';
import { gcseTierLabelForGrade, gradeBadgeTone } from '@/lib/gradeTone';
import { LineChart } from '@/components/ui/charts';
import { mapStudentSubjectRow, STUDENT_SUBJECT_SELECT, type StudentSubjectRow } from '@/lib/ai/studentSubjects';

type AttemptRow = {
  id: string;
  subject: string;
  exam_board: string;
  exam_type: string;
  topic: string;
  total_marks_awarded: number | null;
  total_available_marks: number | null;
  percentage: number | null;
  predicted_grade: string | null;
  weakness_tags: string[] | null;
  weakness_analysis: string[] | null;
  created_at: string | null;
  attempt_mode: string | null;
};

type SubjectRow = {
  id: string;
  subject: string;
  exam_board: string | null;
  exam_type: string | null;
  spec_tier: string | null;
};

const formatDate = (value: string | null) => {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
};

const formatTieredExamLabel = (examType: string | null, specTier?: string | null, grade?: string | null) => {
  if (!examType) return 'Qualification pending';
  return [
    getExamTypeLabel(examType),
    gcseTierLabelForGrade({ grade, examType, specTier }) ?? '',
  ].filter(Boolean).join(' ');
};

const cleanWeakness = (value: string) =>
  value
    .replace(/^Main pattern to fix:\s*/i, '')
    .replace(/\s+/g, ' ')
    .replace(/\.$/, '')
    .trim();

export default function SmartPracticeStatsPage() {
  const { session } = useAuth();
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!session?.user?.id) return;

    const loadAttempts = async () => {
      setIsLoading(true);
      setErrorMessage('');
      const supabase = createClient();
      const [attemptsResponse, subjectsResponse] = await Promise.all([
        supabase
          .from('exam_practice_attempts')
          .select('id, subject, exam_board, exam_type, topic, total_marks_awarded, total_available_marks, percentage, predicted_grade, weakness_tags, weakness_analysis, created_at, attempt_mode')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('student_subjects')
          .select(STUDENT_SUBJECT_SELECT)
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: true }),
      ]);

      if (attemptsResponse.error) {
        console.error('Failed to load practice statistics', attemptsResponse.error);
        setErrorMessage('Could not load Smart Practice statistics.');
        setAttempts([]);
      } else {
        setAttempts((attemptsResponse.data as AttemptRow[]) ?? []);
      }
      if (subjectsResponse.error) {
        console.error('Failed to load saved subjects for practice statistics', subjectsResponse.error);
        setSubjects([]);
      } else {
        setSubjects(
          ((subjectsResponse.data ?? []) as unknown as StudentSubjectRow[]).map(mapStudentSubjectRow) as SubjectRow[]
        );
      }
      setIsLoading(false);
    };

    void loadAttempts();
  }, [session?.user?.id]);

  // Score trend, oldest → newest, for the line chart. Excludes blurt attempts
  // (free recall has no comparable percentage) and any attempt without a score.
  const scoreTrend = useMemo(
    () =>
      [...attempts]
        .filter((a) => a.attempt_mode !== 'blurt' && typeof a.percentage === 'number')
        .reverse()
        .map((a) => ({
          label: formatDate(a.created_at),
          value: Math.round(a.percentage as number),
        })),
    [attempts]
  );

  const stats = useMemo(() => {
    const weaknessMap = new Map<string, number>();
    const subjectMap = new Map<string, AttemptRow[]>();
    for (const attempt of attempts) {
      const key = `${attempt.subject}|${attempt.exam_type}`;
      subjectMap.set(key, [...(subjectMap.get(key) ?? []), attempt]);

      const raw = attempt.weakness_tags?.length ? attempt.weakness_tags : attempt.weakness_analysis ?? [];
      for (const item of raw) {
        const label = cleanWeakness(item);
        if (!label) continue;
        weaknessMap.set(label, (weaknessMap.get(label) ?? 0) + 1);
      }
    }
    const subjectKeys = new Map<string, SubjectRow>();
    for (const group of subjectMap.values()) {
      const first = group[0];
      const key = `${first.subject}|${first.exam_type ?? 'unknown'}`;
      const savedSubject = (
        subjects.find((subject) =>
          subject.subject === first.subject &&
          subject.exam_type === first.exam_type &&
          (!first.exam_board || subject.exam_board === first.exam_board)
        ) ??
        subjects.find((subject) => subject.subject === first.subject && subject.exam_type === first.exam_type)
      );
      subjectKeys.set(key, {
        id: savedSubject?.id ?? key,
        subject: first.subject,
        exam_board: savedSubject?.exam_board ?? null,
        exam_type: first.exam_type,
        spec_tier: savedSubject?.spec_tier ?? null,
      });
    }

    return {
      subjectPredictions: [...subjectKeys.values()]
        .map((subject) => {
          const group = subjectMap.get(`${subject.subject}|${subject.exam_type ?? 'unknown'}`) ?? [];
          const average = weightedPredictedGrade(group, subject.exam_type, subject.spec_tier, subject.exam_board);
          return {
            subject: subject.subject,
            examType: subject.exam_type,
            grade: average.grade,
            specTier: subject.spec_tier,
            totalMarksAwarded: average.totalMarksAwarded,
            totalAvailableMarks: average.totalAvailableMarks,
            totalPercentage: average.percentage,
            attempts: group.length,
            analysableAttempts: average.analysableCount,
          };
        })
        .filter((item) => item.analysableAttempts > 0)
        .sort((a, b) => a.subject.localeCompare(b.subject) || (a.examType ?? '').localeCompare(b.examType ?? '')),
      weaknesses: [...weaknessMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12),
    };
  }, [attempts, subjects]);

  const reportColumn = (
    <>
      <PanelHeading icon={Radar}>Report card</PanelHeading>
      <Stat label="Practice attempts" value={isLoading ? '…' : attempts.length} />

      <Panel>
        <PanelHeading icon={Trophy} as="h3">
          Predicted grades
        </PanelHeading>
        <div className="mt-3 space-y-2">
          {isLoading ? (
            [1, 2].map((item) => <div key={item} className="h-12 animate-pulse rounded-lg bg-surface-sunken" />)
          ) : stats.subjectPredictions.length === 0 ? (
            <p className="text-[13px] text-content-subtle">Complete exam practice to build your report card.</p>
          ) : (
            stats.subjectPredictions.map((item) => (
              <div key={`${item.subject}-${item.examType}`} className="rounded-lg border border-subtle px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-semibold text-content">{getSubjectLabel(item.subject)}</p>
                  <span
                    className={`rounded-md px-2 py-0.5 font-mono text-xs font-bold ${gradeBadgeTone({
                      grade: item.grade,
                      examType: item.examType,
                      specTier: item.specTier,
                    })}`}
                  >
                    {item.grade}
                  </span>
                </div>
                <p className="font-mono text-[11px] text-content-subtle">
                  {formatTieredExamLabel(item.examType, item.specTier, item.grade)} ·{' '}
                  {item.analysableAttempts === 0 ? 'no analysable grades' : `${item.analysableAttempts}/${item.attempts} attempts`}
                </p>
                <p className="mt-1 font-mono text-[11px] font-semibold text-content-muted">
                  Total score:{' '}
                  {item.totalMarksAwarded === null || item.totalAvailableMarks === null
                    ? '--'
                    : `${item.totalMarksAwarded}/${item.totalAvailableMarks}${item.totalPercentage === null ? '' : ` (${item.totalPercentage}%)`}`}
                </p>
              </div>
            ))
          )}
        </div>
      </Panel>

      <Panel>
        <PanelHeading as="h3">Recurring weak areas</PanelHeading>
        <div className="mt-3 space-y-2">
          {isLoading ? (
            [1, 2, 3].map((item) => <div key={item} className="h-10 animate-pulse rounded-lg bg-surface-sunken" />)
          ) : stats.weaknesses.length === 0 ? (
            <p className="text-[13px] text-content-subtle">No weak areas recorded yet.</p>
          ) : (
            stats.weaknesses.map(([label, count]) => (
              <div key={label} className="flex items-center justify-between gap-3 rounded-lg border border-subtle px-3 py-2">
                <span className="min-w-0 truncate text-sm text-content">{label}</span>
                <Chip tone="danger">{count}</Chip>
              </div>
            ))
          )}
        </div>
      </Panel>
    </>
  );

  return (
    <Workspace>
      <PageHeader
        className="border-b border-subtle"
        icon={BarChart3}
        eyebrow="Practice / Statistics"
        titleId="practice-stats-title"
        title="Practice Statistics"
        description="Review all marked practice attempts, grades, scores, and recurring weak areas."
        backHref="/dashboard/ai-questions"
        backLabel="Smart Practice"
        actions={
          <>
            <Chip>● {isLoading ? '…' : attempts.length} attempts</Chip>
            {stats.subjectPredictions.length > 0 ? (
              <Chip tone="success">{stats.subjectPredictions.length} subjects graded</Chip>
            ) : null}
          </>
        }
      />

      <WorkspaceBody aside={reportColumn}>
        {errorMessage ? (
          <div className="border-b border-subtle p-4">
            <Alert>{errorMessage}</Alert>
          </div>
        ) : null}

        {scoreTrend.length >= 2 && (
          <div className="border-b border-subtle p-5">
            <MonoLabel className="mb-2">Score trend</MonoLabel>
            <LineChart data={scoreTrend} suffix="%" ariaLabel="Practice score percentage over time" />
          </div>
        )}

        <StatusBar>
          <h2 className="font-semibold text-content">All attempts</h2>
          <span>Newest first</span>
        </StatusBar>

        <div className="flex-1">
          {isLoading ? (
            <div className="space-y-2 p-5">
              {[1, 2, 3, 4, 5].map((item) => (
                <div key={item} className="h-14 animate-pulse rounded-lg bg-surface-sunken" />
              ))}
            </div>
          ) : attempts.length === 0 ? (
            <div className="p-8 text-center text-sm text-content-subtle">No marked attempts yet.</div>
          ) : (
            <div className="divide-y divide-subtle">
              {attempts.map((attempt) => (
                <Link
                  key={attempt.id}
                  href={`/dashboard/ai-questions/stats/${attempt.id}`}
                  className="grid gap-3 px-5 py-4 transition-colors hover:bg-surface-sunken sm:grid-cols-[1fr_auto_auto_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm font-semibold text-content">
                      {attempt.topic}
                      {attempt.attempt_mode === 'mock' ? <Chip tone="xp">Mock</Chip> : null}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-content-subtle">
                      {getSubjectLabel(attempt.subject)} · {attempt.exam_board.toUpperCase()}{' '}
                      {formatTieredExamLabel(
                        attempt.exam_type,
                        subjects.find(
                          (subject) =>
                            subject.subject === attempt.subject &&
                            subject.exam_type === attempt.exam_type &&
                            subject.exam_board === attempt.exam_board
                        )?.spec_tier ??
                          subjects.find((subject) => subject.subject === attempt.subject && subject.exam_type === attempt.exam_type)
                            ?.spec_tier ??
                          null,
                        attempt.predicted_grade
                      )}{' '}
                      · {formatDate(attempt.created_at)}
                    </p>
                  </div>
                  <span className="font-mono text-sm font-bold text-content">{attempt.percentage ?? '--'}%</span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-center font-mono text-xs font-bold ${gradeBadgeTone({
                      grade: attempt.predicted_grade,
                      examType: attempt.exam_type,
                      specTier:
                        subjects.find((subject) => subject.subject === attempt.subject && subject.exam_type === attempt.exam_type)?.spec_tier ??
                        null,
                    })}`}
                  >
                    {attempt.predicted_grade || 'N/A'}
                  </span>
                  <span className="font-mono text-xs text-content-subtle">
                    {attempt.total_marks_awarded ?? '--'} / {attempt.total_available_marks ?? '--'} marks
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-subtle p-4 font-mono text-xs text-content-subtle">
          <Link href="/dashboard" className="transition-colors hover:text-content">
            ← Dashboard
          </Link>
          <Link href="/dashboard/exam-coach" className="transition-colors hover:text-content">
            Exam Coach →
          </Link>
        </div>
      </WorkspaceBody>
    </Workspace>
  );
}
