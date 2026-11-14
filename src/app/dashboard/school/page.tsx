'use client';

import Link from 'next/link';
import { ArrowRight, BarChart3, Radar, School, TrendingDown, UserCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/feedback';
import { buttonStyles } from '@/components/ui/button';
import { BarChart } from '@/components/ui/charts';
import { Chip, Meter, MonoLabel, Panel, PanelHeading, Stat, StatusBar, Workspace, WorkspaceBody } from '@/components/ui/telemetry';
import { nationLabel } from '@/lib/schools/nations';
import { useAdminSchool, useSchoolAnalytics } from '@/hooks/useSchoolAdmin';
import { completionFraction, formatPercent, SchoolDataState } from '@/components/school/shared';

/**
 * Grades come from every qualification taught at the school, so they mix the
 * 9-1 numbers, A*-E letters and the non-UK bands. Numbers first (highest
 * first), then letters in grade order, then anything else alphabetically.
 */
const LETTER_ORDER = ['A*', 'A', 'B', 'C', 'D', 'E', 'U'];
function compareGrades(a: string, b: string) {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return nb - na;
  if (Number.isFinite(na)) return -1;
  if (Number.isFinite(nb)) return 1;
  const la = LETTER_ORDER.indexOf(a);
  const lb = LETTER_ORDER.indexOf(b);
  if (la !== -1 && lb !== -1) return la - lb;
  if (la !== -1) return -1;
  if (lb !== -1) return 1;
  return a.localeCompare(b);
}

export default function SchoolOverviewPage() {
  const school = useAdminSchool();
  const analytics = useSchoolAnalytics();

  if (!school.data || !analytics.data) {
    return (
      <SchoolDataState
        isLoading={school.isLoading || analytics.isLoading}
        error={school.error ?? analytics.error ?? (!school.isLoading && !school.data ? new Error('Not a school admin') : null)}
      />
    );
  }

  const s = school.data;
  const a = analytics.data;
  const completion = completionFraction(a.completed_attempts, a.expected_attempts);
  const grades = [...a.grades].sort((x, y) => compareGrades(x.grade, y.grade));
  const gradeTotal = grades.reduce((sum, g) => sum + g.count, 0);
  const weekly = a.weekly_completions.map((w) => ({
    label: `w/c ${new Date(w.week).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`,
    value: w.count,
  }));

  const reportColumn = (
    <>
      <PanelHeading icon={Radar}>Report</PanelHeading>

      <Panel>
        <PanelHeading as="h3" icon={BarChart3} aside={<Chip>{gradeTotal} marked</Chip>}>
          Predicted grades
        </PanelHeading>
        {grades.length === 0 ? (
          <p className="mt-3 text-sm text-content-subtle">No marked assignments yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {grades.map((g) => (
              <li key={g.grade} className="grid grid-cols-[3rem_1fr_2.5rem] items-center gap-2 text-sm">
                <span className="font-mono font-semibold text-content">{g.grade}</span>
                <Meter fraction={g.count / gradeTotal} label={`Grade ${g.grade}`} />
                <span className="text-right font-mono text-xs text-content-subtle">{g.count}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[13px] text-content-subtle">
          Latest attempt per student per assignment, across every class at the school.
        </p>
      </Panel>

      <Panel>
        <PanelHeading as="h3" icon={UserCheck}>Parents</PanelHeading>
        <p className="mt-2 font-mono text-xl font-semibold text-content">
          {a.students_with_parent}
          <span className="text-sm text-content-subtle"> / {a.students}</span>
        </p>
        <p className="text-[13px] text-content-subtle">students have a parent linked</p>
        <Meter className="mt-2" fraction={a.students ? a.students_with_parent / a.students : 0} tone="success" label="Students with a parent linked" />
        <Link href="/dashboard/school/students" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
          Link parents <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </Panel>
    </>
  );

  return (
    <Workspace>
      <PageHeader
        className="border-b border-subtle"
        icon={School}
        eyebrow="School admin / Overview"
        title={s.name}
        description={[s.town, s.postcode, nationLabel(s.nation)].filter(Boolean).join(' · ')}
        actions={
          <>
            <Chip>{a.teachers_approved} teachers</Chip>
            <Chip>{a.students} students</Chip>
            {a.teachers_pending > 0 && <Chip tone="warning">{a.teachers_pending} pending</Chip>}
          </>
        }
      />

      <WorkspaceBody aside={reportColumn}>
        <StatusBar>
          <span>{a.classes_active} active classes</span>
          <span>{a.assignments_published} assignments set</span>
          <span>{a.admins} school {a.admins === 1 ? 'admin' : 'admins'}</span>
        </StatusBar>

        <div className="flex-1 space-y-5 p-5">
          {a.teachers_pending > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning-muted px-4 py-3 text-sm text-warning">
              <span>
                {a.teachers_pending} {a.teachers_pending === 1 ? 'teacher is' : 'teachers are'} waiting for you to approve them.
                Students cannot join their classes until you do.
              </span>
              <Link href="/dashboard/school/staff" className={buttonStyles({ variant: 'secondary', size: 'sm' })}>
                Review
              </Link>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Stat label="Students" value={a.students} hint={`${a.students_active_7d} active this week`} />
            <Stat
              label="Active this week"
              value={a.students ? formatPercent((a.students_active_7d / a.students) * 100) : '—'}
              tone="accent"
              hint="studied, practised or handed in"
            />
            <Stat label="Teachers" value={a.teachers_approved} hint={a.teachers_pending ? `${a.teachers_pending} awaiting approval` : 'all approved'} />
            <Stat
              label="Completion"
              value={completion === null ? '—' : formatPercent(completion * 100)}
              tone={completion === null ? 'default' : completion >= 0.7 ? 'success' : completion >= 0.4 ? 'warning' : 'danger'}
              hint={`${a.completed_attempts} of ${a.expected_attempts} hand-ins`}
            />
            <Stat label="Average score" value={formatPercent(a.average_percentage)} hint="on marked assignments" />
            <Stat label="Classes" value={a.classes_active} hint="active" />
          </div>

          <Panel>
            <PanelHeading icon={BarChart3} aside={<Chip>last 8 weeks</Chip>}>
              Assignments handed in
            </PanelHeading>
            <div className="mt-3">
              {weekly.some((w) => w.value > 0) ? (
                <BarChart data={weekly} ariaLabel="Assignments handed in per week, last 8 weeks" />
              ) : (
                <p className="text-sm text-content-subtle">Nothing handed in over the last 8 weeks.</p>
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeading icon={TrendingDown}>Weakest topics</PanelHeading>
            {a.weak_topics.length === 0 ? (
              <p className="mt-3 text-sm text-content-subtle">Topics appear here once assignments set on them are marked.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {a.weak_topics.map((t) => (
                  <li key={t.topic}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate font-medium text-content">{t.topic}</span>
                      <span className="shrink-0 font-mono text-xs text-content-subtle">
                        {formatPercent(t.average_percentage)} · {t.attempts} {t.attempts === 1 ? 'hand-in' : 'hand-ins'}
                      </span>
                    </div>
                    <Meter
                      className="mt-1.5"
                      fraction={Number(t.average_percentage) / 100}
                      tone={Number(t.average_percentage) >= 70 ? 'success' : Number(t.average_percentage) >= 40 ? 'warning' : 'accent'}
                      label={`${t.topic} average`}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-subtle p-4">
          <MonoLabel>Manage</MonoLabel>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/school/classes" className={buttonStyles({ variant: 'secondary', size: 'sm' })}>
              Classes
            </Link>
            <Link href="/dashboard/school/students" className={buttonStyles({ variant: 'secondary', size: 'sm' })}>
              Students
            </Link>
            <Link href="/dashboard/school/staff" className={buttonStyles({ variant: 'primary', size: 'sm' })}>
              Staff
            </Link>
          </div>
        </div>
      </WorkspaceBody>
    </Workspace>
  );
}
