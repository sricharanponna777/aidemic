'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Radar, Users } from 'lucide-react';
import { EmptyState, PageHeader } from '@/components/ui/feedback';
import { Chip, Meter, Panel, PanelHeading, Stat, Workspace, WorkspaceBody } from '@/components/ui/telemetry';
import { useSchoolClasses } from '@/hooks/useSchoolAdmin';
import { completionFraction, FilterTabs, formatPercent, formatRelativeDay, ListSearch, SchoolDataState } from '@/components/school/shared';

type Filter = 'active' | 'archived' | 'all';

/** Read-only: a class belongs to its teacher, who edits it from their own
 *  Teaching workspace. The admin's view is oversight across all of them. */
export default function SchoolClassesPage() {
  const classes = useSchoolClasses();
  const [filter, setFilter] = useState<Filter>('active');
  const [query, setQuery] = useState('');

  const rows = useMemo(() => classes.data ?? [], [classes.data]);
  const active = useMemo(() => rows.filter((c) => c.status === 'active'), [rows]);

  if (!classes.data) return <SchoolDataState isLoading={classes.isLoading} error={classes.error} />;

  const q = query.trim().toLowerCase();
  const visible = rows.filter(
    (c) =>
      (filter === 'all' || c.status === filter) &&
      (!q || [c.name, c.teacher_name, c.subject_name, c.qualification_name].some((v) => v?.toLowerCase().includes(q)))
  );

  const totalStudents = active.reduce((sum, c) => sum + c.student_count, 0);
  const totalCompleted = active.reduce((sum, c) => sum + c.completed_attempts, 0);
  const totalExpected = active.reduce((sum, c) => sum + c.expected_attempts, 0);
  const overall = completionFraction(totalCompleted, totalExpected);

  // Classes that have been set work and are not doing it -- the ones worth a word
  // with the teacher. Classes with nothing set are a different conversation.
  const lagging = active
    .map((c) => ({ c, fraction: completionFraction(c.completed_attempts, c.expected_attempts) }))
    .filter((x): x is { c: typeof x.c; fraction: number } => x.fraction !== null && x.fraction < 0.5)
    .sort((x, y) => x.fraction - y.fraction)
    .slice(0, 5);
  const noWork = active.filter((c) => c.published_assignments === 0 && c.student_count > 0);

  const reportColumn = (
    <>
      <PanelHeading icon={Radar}>Report</PanelHeading>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Active classes" value={active.length} />
        <Stat label="Enrolments" value={totalStudents} />
        <Stat
          label="Completion"
          value={overall === null ? '—' : formatPercent(overall * 100)}
          tone={overall === null ? 'default' : overall >= 0.7 ? 'success' : overall >= 0.4 ? 'warning' : 'danger'}
          className="col-span-2"
          hint={`${totalCompleted} of ${totalExpected} hand-ins`}
        />
      </div>
      <Panel>
        <PanelHeading as="h3" icon={AlertTriangle}>Needs attention</PanelHeading>
        {lagging.length === 0 && noWork.length === 0 ? (
          <p className="mt-3 text-sm text-content-subtle">Every class with work set is over half handed in.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {lagging.map(({ c, fraction }) => (
              <li key={c.class_id} className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-content">{c.name}</span>
                <span className="shrink-0 font-mono text-xs text-warning">{formatPercent(fraction * 100)} done</span>
              </li>
            ))}
            {noWork.map((c) => (
              <li key={c.class_id} className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-content">{c.name}</span>
                <span className="shrink-0 font-mono text-xs text-content-subtle">no work set</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );

  return (
    <Workspace>
      <PageHeader
        className="border-b border-subtle"
        icon={Users}
        eyebrow="School admin / Classes"
        title="Classes"
        description="Every class at your school, who teaches it, and how much of the work set is being handed in."
        actions={<Chip>{active.length} active</Chip>}
      />

      <WorkspaceBody aside={reportColumn}>
        <ListSearch value={query} onChange={setQuery} placeholder="Search class, teacher or subject">
          <FilterTabs
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'active', label: 'Active', count: active.length },
              { value: 'archived', label: 'Archived', count: rows.length - active.length },
              { value: 'all', label: 'All', count: rows.length },
            ]}
          />
        </ListSearch>

        <div className="flex-1 p-5">
          {visible.length === 0 ? (
            <EmptyState
              icon={Users}
              title={q ? 'No classes match that search' : 'No classes yet'}
              description={q ? undefined : 'Classes appear here as soon as a teacher at your school creates one.'}
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-subtle">
              <table className="w-full min-w-[44rem] text-left text-sm">
                <thead className="border-b border-subtle bg-surface-sunken font-mono text-[11px] uppercase tracking-[0.14em] text-content-subtle">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Class</th>
                    <th className="px-4 py-2.5 font-medium">Teacher</th>
                    <th className="px-4 py-2.5 text-right font-medium">Students</th>
                    <th className="px-4 py-2.5 font-medium">Handed in</th>
                    <th className="px-4 py-2.5 text-right font-medium">Average</th>
                    <th className="px-4 py-2.5 font-medium">Last hand-in</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle">
                  {visible.map((c) => {
                    const fraction = completionFraction(c.completed_attempts, c.expected_attempts);
                    return (
                      <tr key={c.class_id} className="align-top">
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-content">{c.name}</span>
                            {c.status === 'archived' && <Chip>Archived</Chip>}
                          </div>
                          <p className="mt-0.5 text-xs text-content-subtle">
                            {[c.qualification_name, c.subject_name, c.academic_year].filter(Boolean).join(' · ') || 'No subject set'}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-content-muted">{c.teacher_name ?? '—'}</td>
                        <td className="px-4 py-3 text-right font-mono text-content">{c.student_count}</td>
                        <td className="w-44 px-4 py-3">
                          {fraction === null ? (
                            <span className="text-xs text-content-subtle">
                              {c.published_assignments === 0 ? 'No work set' : 'No students'}
                            </span>
                          ) : (
                            <>
                              <Meter
                                fraction={fraction}
                                tone={fraction >= 0.7 ? 'success' : fraction >= 0.4 ? 'warning' : 'accent'}
                                label={`${c.name} hand-in rate`}
                              />
                              <p className="mt-1 font-mono text-[11px] text-content-subtle">
                                {c.completed_attempts}/{c.expected_attempts} · {c.published_assignments} set
                              </p>
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-content">{formatPercent(c.average_percentage)}</td>
                        <td className="px-4 py-3 text-xs text-content-subtle">{formatRelativeDay(c.last_activity_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </WorkspaceBody>
    </Workspace>
  );
}
