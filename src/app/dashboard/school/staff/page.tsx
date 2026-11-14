'use client';

import { useMemo, useState } from 'react';
import { Check, Info, Radar, ShieldCheck, ShieldOff, UserCog, UserX, Undo2, X } from 'lucide-react';
import { EmptyState, PageHeader } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Chip, Panel, PanelHeading, Stat, Workspace, WorkspaceBody } from '@/components/ui/telemetry';
import { useToast } from '@/components/ToastProvider';
import { createClient } from '@/lib/supabase-client';
import { useRefreshSchoolAdmin, useSchoolStaff } from '@/hooks/useSchoolAdmin';
import { displayName, FilterTabs, formatRelativeDay, ListSearch, SchoolDataState } from '@/components/school/shared';
import type { SchoolStaffMember } from '@/types';

type Filter = 'pending' | 'approved' | 'rejected' | 'all';

type Action =
  | { kind: 'status'; status: 'approved' | 'rejected'; label: string; done: string; confirm?: string }
  | { kind: 'admin'; isAdmin: boolean; label: string; done: string; confirm?: string };

/** What each row may do. Mirrors the rules school_admin_set_teacher_status and
 *  school_admin_set_admin enforce, so a button is never offered that the
 *  database would refuse. */
function actionsFor(member: SchoolStaffMember): Action[] {
  if (member.is_self) return [];
  if (member.verification_status === 'pending') {
    return [
      { kind: 'status', status: 'approved', label: 'Approve', done: 'approved' },
      { kind: 'status', status: 'rejected', label: 'Reject', done: 'rejected', confirm: 'Reject this teacher?' },
    ];
  }
  if (member.verification_status === 'rejected') {
    return [{ kind: 'status', status: 'approved', label: 'Restore access', done: 'restored' }];
  }
  if (member.is_school_admin) {
    return [{ kind: 'admin', isAdmin: false, label: 'Remove admin', done: 'is no longer a school admin', confirm: 'Remove their admin rights?' }];
  }
  return [
    { kind: 'admin', isAdmin: true, label: 'Make admin', done: 'is now a school admin', confirm: 'They will be able to approve and remove staff. Continue?' },
    { kind: 'status', status: 'rejected', label: 'Revoke access', done: 'revoked', confirm: 'Students will not be able to join their classes. Revoke?' },
  ];
}

const ACTION_ICONS: Record<string, typeof Check> = {
  Approve: Check,
  Reject: X,
  'Restore access': Undo2,
  'Remove admin': ShieldOff,
  'Make admin': ShieldCheck,
  'Revoke access': UserX,
};

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
      admins: rows.filter((r) => r.is_school_admin && r.verification_status === 'approved').length,
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
      (!q || [r.full_name, r.email, r.department].some((v) => v?.toLowerCase().includes(q)))
  );

  const run = async (member: SchoolStaffMember, action: Action) => {
    if (action.confirm && confirming?.teacherId !== member.teacher_id) {
      setConfirming({ teacherId: member.teacher_id, label: action.label });
      return;
    }
    setConfirming(null);
    setBusyId(member.teacher_id);
    const supabase = createClient();
    const { error } =
      action.kind === 'status'
        ? await supabase.rpc('school_admin_set_teacher_status', { p_teacher_id: member.teacher_id, p_status: action.status })
        : await supabase.rpc('school_admin_set_admin', { p_teacher_id: member.teacher_id, p_is_admin: action.isAdmin });
    setBusyId(null);
    const name = displayName(member, 'Teacher');
    if (error) {
      console.error('School admin staff action failed:', error.message);
      // The RPCs phrase every refusal for a person ("Remove their school admin
      // rights before…"), so show those; anything else is a transport problem.
      showToast('error', /school|admin|approve|access|teacher/i.test(error.message) ? error.message : `Could not update ${name}. Please try again.`);
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
        <Stat label="Admins" value={counts.admins} />
        <Stat label="No access" value={counts.rejected} />
      </div>
      <Panel>
        <PanelHeading as="h3" icon={Info}>How access works</PanelHeading>
        <ul className="mt-3 list-disc space-y-2 pl-4 text-[13px] text-content-muted">
          <li>Teachers who pick your school at sign-up wait here until you approve them. Students cannot join their classes until then.</li>
          <li>Revoking access keeps their classes and results, but blocks new students joining. You can restore it at any time.</li>
          <li>A co-admin has the same rights as you. Remove their admin rights before revoking their access.</li>
          <li>You cannot change your own access. Another admin, or AIDemic support, can.</li>
        </ul>
      </Panel>
    </>
  );

  return (
    <Workspace>
      <PageHeader
        className="border-b border-subtle"
        icon={UserCog}
        eyebrow="School admin / Staff"
        title="Staff"
        description="Approve teachers who join your school, revoke access, and choose who else can run it."
        actions={
          <>
            <Chip>{counts.approved} approved</Chip>
            {counts.pending > 0 && <Chip tone="warning">{counts.pending} pending</Chip>}
          </>
        }
      />

      <WorkspaceBody aside={reportColumn}>
        <ListSearch value={query} onChange={setQuery} placeholder="Search name, email or department">
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
            <ul className="divide-y divide-subtle rounded-xl border border-subtle">
              {visible.map((member) => {
                const actions = actionsFor(member);
                const isConfirming = confirming?.teacherId === member.teacher_id;
                const confirmAction = isConfirming ? actions.find((a) => a.label === confirming.label) : undefined;
                return (
                  <li key={member.teacher_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-content">{displayName(member, 'Teacher')}</p>
                        <StatusChip member={member} />
                        {member.is_school_admin && member.verification_status === 'approved' && <Chip tone="xp">Admin</Chip>}
                        {member.is_self && <Chip tone="inverse">You</Chip>}
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
          )}
        </div>
      </WorkspaceBody>
    </Workspace>
  );
}
