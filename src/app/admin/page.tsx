'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, Info, Radar, UserCog, UserX, Undo2, X } from 'lucide-react';
import { EmptyState, PageHeader } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Chip, Panel, PanelHeading, Stat, Workspace, WorkspaceBody } from '@/components/ui/telemetry';
import { useToast } from '@/components/ToastProvider';
import { createClient } from '@/lib/supabase-client';
import { useRefreshSchoolAdmin, useSchoolStaff } from '@/hooks/useSchoolAdmin';
import { displayName, FilterTabs, formatRelativeDay, ListSearch, SchoolDataState } from '@/components/school/shared';
import type { SchoolStaffMember } from '@/types';

type Filter = 'pending' | 'approved' | 'rejected' | 'all';

type Action = { status: 'approved' | 'rejected'; label: string; done: string; confirm?: string };

/** What each row may do -- the transitions school_admin_set_teacher_status
 *  allows. School admins are separate accounts appointed by AIDemic, so there
 *  is no promote/demote here and the caller is never in this list. */
function actionsFor(member: SchoolStaffMember): Action[] {
  if (member.verification_status === 'pending') {
    return [
      { status: 'approved', label: 'Approve', done: 'approved' },
      { status: 'rejected', label: 'Reject', done: 'rejected', confirm: 'Reject this teacher?' },
    ];
  }
  if (member.verification_status === 'rejected') {
    return [{ status: 'approved', label: 'Restore access', done: 'restored' }];
  }
  return [{ status: 'rejected', label: 'Revoke access', done: 'revoked', confirm: 'Students will not be able to join their classes. Revoke?' }];
}

const ACTION_ICONS: Record<string, typeof Check> = {
  Approve: Check,
  Reject: X,
  'Restore access': Undo2,
  'Revoke access': UserX,
};

/** Teachers are grouped by the subjects of their active classes. One with no
 *  class yet -- every pending teacher -- lands in this group, sorted last. */
const NO_SUBJECT = 'No classes yet';

/** Subject name -> teachers, alphabetical. A teacher who teaches two subjects
 *  appears under both. */
function groupBySubject(members: SchoolStaffMember[]): [string, SchoolStaffMember[]][] {
  const groups = new Map<string, SchoolStaffMember[]>();
  for (const member of members) {
    const subjects = member.subjects?.length ? member.subjects : [NO_SUBJECT];
    for (const subject of subjects) {
      const list = groups.get(subject);
      if (list) list.push(member);
      else groups.set(subject, [member]);
    }
  }
  return [...groups].sort(([a], [b]) => (a === NO_SUBJECT ? 1 : b === NO_SUBJECT ? -1 : a.localeCompare(b)));
}

function StatusChip({ member }: { member: SchoolStaffMember }) {
  if (member.verification_status === 'pending') return <Chip tone="warning">Pending</Chip>;
  if (member.verification_status === 'rejected') return <Chip tone="danger">No access</Chip>;
  return <Chip tone="success">Approved</Chip>;
}

export default function SchoolStaffPage() {
  const staff = useSchoolStaff();
  const refresh = useRefreshSchoolAdmin();
  const { showToast } = useToast();
  const [filter, setFilter] = useState<Filter | null>(null);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ teacherId: string; label: string } | null>(null);

  const rows = useMemo(() => staff.data ?? [], [staff.data]);
  const counts = useMemo(
    () => ({
      pending: rows.filter((r) => r.verification_status === 'pending').length,
      approved: rows.filter((r) => r.verification_status === 'approved').length,
      rejected: rows.filter((r) => r.verification_status === 'rejected').length,
    }),
    [rows]
  );

  if (!staff.data) return <SchoolDataState isLoading={staff.isLoading} error={staff.error} />;

  // Land on the queue when there is one, otherwise on the staff list.
  const activeFilter: Filter = filter ?? (counts.pending > 0 ? 'pending' : 'approved');
  const q = query.trim().toLowerCase();
  const visible = rows.filter(
    (r) =>
      (activeFilter === 'all' || r.verification_status === activeFilter) &&
      (!q || [r.full_name, r.email, r.department, ...(r.subjects ?? [])].some((v) => v?.toLowerCase().includes(q)))
  );
  const groups = groupBySubject(visible);

  const run = async (member: SchoolStaffMember, action: Action) => {
    if (action.confirm && confirming?.teacherId !== member.teacher_id) {
      setConfirming({ teacherId: member.teacher_id, label: action.label });
      return;
    }
    setConfirming(null);
    setBusyId(member.teacher_id);
    const supabase = createClient();
    const { error } = await supabase.rpc('school_admin_set_teacher_status', {
      p_teacher_id: member.teacher_id,
      p_status: action.status,
    });
    setBusyId(null);
    const name = displayName(member, 'Teacher');
    if (error) {
      console.error('School admin staff action failed:', error.message);
      // The RPC phrases its refusals for a person ("That teacher is not at your
      // school"), so show those; anything else is a transport problem.
      showToast('error', /school|admin|teacher/i.test(error.message) ? error.message : `Could not update ${name}. Please try again.`);
    } else {
      showToast('success', `${name} ${action.done}.`);
    }
    await refresh();
  };

  const reportColumn = (
    <>
      <PanelHeading icon={Radar}>Report</PanelHeading>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Approved" value={counts.approved} tone="success" />
        <Stat label="Pending" value={counts.pending} tone={counts.pending ? 'warning' : 'default'} />
        <Stat label="No access" value={counts.rejected} className="col-span-2" />
      </div>
      <Panel>
        <PanelHeading as="h3" icon={Info}>How access works</PanelHeading>
        <ul className="mt-3 list-disc space-y-2 pl-4 text-[13px] text-content-muted">
          <li>Teachers who pick your school at sign-up wait here until you approve them. Students cannot join their classes until then.</li>
          <li>Revoking access keeps their classes and results, but blocks new students joining. You can restore it at any time.</li>
          <li>School admin accounts are separate from teaching accounts and are set up by AIDemic support. Contact them to add or remove an admin.</li>
        </ul>
      </Panel>
    </>
  );

  return (
    <Workspace>
      <PageHeader
        className="border-b border-subtle"
        icon={UserCog}
        eyebrow="Staff approvals"
        title="Admin Panel"
        description="Approve teachers who join your school, and revoke or restore their access."
        actions={
          <>
            <Chip>{counts.approved} approved</Chip>
            {counts.pending > 0 && <Chip tone="warning">{counts.pending} pending</Chip>}
          </>
        }
      />

      <WorkspaceBody aside={reportColumn}>
        <ListSearch value={query} onChange={setQuery} placeholder="Search name, email, department or subject">
          <FilterTabs
            value={activeFilter}
            onChange={setFilter}
            options={[
              { value: 'pending', label: 'Pending', count: counts.pending },
              { value: 'approved', label: 'Approved', count: counts.approved },
              { value: 'rejected', label: 'No access', count: counts.rejected },
              { value: 'all', label: 'All', count: rows.length },
            ]}
          />
        </ListSearch>

        <div className="flex-1 p-5">
          {visible.length === 0 ? (
            <EmptyState
              icon={UserCog}
              title={q ? 'No staff match that search' : activeFilter === 'pending' ? 'Nobody is waiting' : 'No staff here'}
              description={activeFilter === 'pending' && !q ? 'New teachers who choose your school will appear here for approval.' : undefined}
            />
          ) : (
            <div className="space-y-4">
              {groups.map(([subject, members]) => (
                <details key={subject} open className="group overflow-hidden rounded-xl border border-subtle">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-surface-sunken px-4 py-2.5 [&::-webkit-details-marker]:hidden">
                    <span className="flex items-center gap-2">
                      <ChevronDown className="h-4 w-4 -rotate-90 text-content-subtle transition-transform group-open:rotate-0" />
                      <span className="text-sm font-semibold text-content">{subject}</span>
                    </span>
                    <Chip>{members.length} {members.length === 1 ? 'teacher' : 'teachers'}</Chip>
                  </summary>
                  <ul className="divide-y divide-subtle border-t border-subtle">
                    {members.map((member) => {
                      const actions = actionsFor(member);
                      const isConfirming = confirming?.teacherId === member.teacher_id;
                      const confirmAction = isConfirming ? actions.find((a) => a.label === confirming.label) : undefined;
                      return (
                        <li key={`${subject}:${member.teacher_id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-content">{displayName(member, 'Teacher')}</p>
                              <StatusChip member={member} />
                            </div>
                            <p className="mt-0.5 text-xs text-content-subtle">
                              {[member.email, member.department, member.qualification_level].filter(Boolean).join(' · ')}
                            </p>
                            <p className="mt-0.5 font-mono text-[11px] text-content-subtle">
                              {member.verification_status === 'pending'
                                ? `Waiting since ${formatRelativeDay(member.requested_at).toLowerCase()}`
                                : `${member.class_count} ${member.class_count === 1 ? 'class' : 'classes'} · ${member.student_count} students`}
                            </p>
                          </div>

                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            {confirmAction ? (
                              <>
                                <span className="text-xs text-content-muted">{confirmAction.confirm}</span>
                                <Button size="sm" variant="danger" disabled={busyId === member.teacher_id} onClick={() => run(member, confirmAction)}>
                                  {confirmAction.label}
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              actions.map((action, index) => {
                                const Icon = ACTION_ICONS[action.label] ?? Check;
                                return (
                                  <Button
                                    key={action.label}
                                    size="sm"
                                    variant={index === 0 && !action.confirm ? 'primary' : 'secondary'}
                                    disabled={busyId === member.teacher_id}
                                    onClick={() => run(member, action)}
                                  >
                                    <Icon className="h-3.5 w-3.5" />
                                    {action.label}
                                  </Button>
                                );
                              })
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              ))}
            </div>
          )}
        </div>
      </WorkspaceBody>
    </Workspace>
  );
}
