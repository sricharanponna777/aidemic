'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, GraduationCap, Info, Radar, UserPlus } from 'lucide-react';
import { EmptyState, PageHeader } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Chip, Panel, PanelHeading, Stat, Workspace, WorkspaceBody } from '@/components/ui/telemetry';
import { ParentLinksPanel } from '@/components/teacher/ParentLinksPanel';
import { useRefreshSchoolAdmin, useSchoolStudents } from '@/hooks/useSchoolAdmin';
import { displayName, FilterTabs, formatPercent, formatRelativeDay, ListSearch, SchoolDataState } from '@/components/school/shared';
import type { SchoolStudentSummary } from '@/types';

type Filter = 'all' | 'no-parent' | 'inactive';

const INACTIVE_DAYS = 14;
const isInactive = (s: SchoolStudentSummary) =>
  !s.last_active_at || Date.now() - new Date(s.last_active_at).getTime() > INACTIVE_DAYS * 24 * 60 * 60 * 1000;

function ParentChip({ student }: { student: SchoolStudentSummary }) {
  if (student.active_parent_links > 0) {
    return <Chip tone="success">{student.active_parent_links === 1 ? 'Parent linked' : `${student.active_parent_links} parents`}</Chip>;
  }
  if (student.pending_parent_links > 0) return <Chip tone="warning">Invite pending</Chip>;
  return <Chip>No parent</Chip>;
}

export default function SchoolStudentsPage() {
  const students = useSchoolStudents();
  const refresh = useRefreshSchoolAdmin();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const rows = useMemo(() => students.data ?? [], [students.data]);
  const counts = useMemo(
    () => ({
      noParent: rows.filter((s) => s.active_parent_links === 0).length,
      inactive: rows.filter(isInactive).length,
    }),
    [rows]
  );

  if (!students.data) return <SchoolDataState isLoading={students.isLoading} error={students.error} />;

  const q = query.trim().toLowerCase();
  const visible = rows.filter(
    (s) =>
      (filter === 'all' || (filter === 'no-parent' ? s.active_parent_links === 0 : isInactive(s))) &&
      (!q || [s.full_name, s.email, ...(s.class_names ?? [])].some((v) => v?.toLowerCase().includes(q)))
  );

  const toggle = (studentId: string) => {
    // Closing a panel is when a new invite or a revoke made inside it should
    // show up in the chips and counts.
    if (expandedId === studentId) void refresh();
    setExpandedId(expandedId === studentId ? null : studentId);
  };

  const reportColumn = (
    <>
      <PanelHeading icon={Radar}>Report</PanelHeading>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Students" value={rows.length} />
        <Stat label="Parent linked" value={rows.length - counts.noParent} tone="success" />
        <Stat label="No parent" value={counts.noParent} tone={counts.noParent ? 'warning' : 'default'} />
        <Stat label={`Quiet ${INACTIVE_DAYS}d+`} value={counts.inactive} tone={counts.inactive ? 'warning' : 'default'} />
      </div>
      <Panel>
        <PanelHeading as="h3" icon={Info}>Linking parents</PanelHeading>
        <p className="mt-3 text-[13px] text-content-muted">
          Open a student and create an invite code. Give the code to their parent, who enters it from their own AIDemic
          account. A parent can see their child&apos;s progress, but never changes anything.
        </p>
      </Panel>
    </>
  );

  return (
    <Workspace>
      <PageHeader
        className="border-b border-subtle"
        icon={GraduationCap}
        eyebrow="School admin / Students"
        title="Students"
        description="Everyone enrolled in a class at your school, their results here, and their parent links."
        actions={<Chip>{rows.length} students</Chip>}
      />

      <WorkspaceBody aside={reportColumn}>
        <ListSearch value={query} onChange={setQuery} placeholder="Search name, email or class">
          <FilterTabs
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All', count: rows.length },
              { value: 'no-parent', label: 'No parent', count: counts.noParent },
              { value: 'inactive', label: 'Quiet', count: counts.inactive },
            ]}
          />
        </ListSearch>

        <div className="flex-1 p-5">
          {visible.length === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title={q || filter !== 'all' ? 'No students match' : 'No students yet'}
              description={q || filter !== 'all' ? undefined : 'Students appear here once they join a class at your school.'}
            />
          ) : (
            <ul className="divide-y divide-subtle rounded-xl border border-subtle">
              {visible.map((student) => {
                const expanded = expandedId === student.student_id;
                return (
                  <li key={student.student_id}>
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-content">{displayName(student, 'Student')}</p>
                          <ParentChip student={student} />
                        </div>
                        <p className="mt-0.5 text-xs text-content-subtle">
                          {[student.email, (student.class_names ?? []).join(', ')].filter(Boolean).join(' · ')}
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] text-content-subtle">
                          {student.completed_assignments} handed in · avg {formatPercent(student.average_percentage)} · active{' '}
                          {formatRelativeDay(student.last_active_at).toLowerCase()}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-expanded={expanded}
                        onClick={() => toggle(student.student_id)}
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        Parents
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                      </Button>
                    </div>
                    {expanded && (
                      <div className="border-t border-subtle bg-surface-sunken/60 p-4">
                        <ParentLinksPanel studentId={student.student_id} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </WorkspaceBody>
    </Workspace>
  );
}
