'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Radar, Trash2, UserPlus, Users, X } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/feedback';
import { Chip, Panel, PanelHeading, Stat, Workspace, WorkspaceBody } from '@/components/ui/telemetry';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import { PageLoader } from '@/components/PageLoader';
import { useToast } from '@/components/ToastProvider';
import type { ParentLink } from '@/types';


type LinkRow = ParentLink & { parent_profile: { email: string; full_name?: string | null } | null };

export default function FamilyPage() {
  const router = useRouter();
  const { session, profile, isLoading } = useAuth();
  const supabase = createClient();

  const [links, setLinks] = useState<LinkRow[]>([]);
  const [linksLoading, setLinksLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [handlingRequestId, setHandlingRequestId] = useState<string | null>(null);
  const { showToast } = useToast();

  const fetchLinks = async (studentId: string) => {
    const { data, error } = await supabase
      .from('parent_links')
      .select('id, student_id, parent_id, invite_code, status, link_source, created_by, revocation_requested_at, created_at')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to load family links:', error.message);
      return [];
    }
    const rows = (data as ParentLink[]) ?? [];

    const parentIds = rows.map((row) => row.parent_id).filter((id): id is string => !!id);
    const profileById = new Map<string, { email: string; full_name?: string | null }>();
    if (parentIds.length > 0) {
      const { data: profileRows } = await supabase
        .from('user_profiles')
        .select('id, email, full_name')
        .in('id', parentIds);
      for (const row of (profileRows ?? []) as Array<{ id: string; email: string; full_name?: string | null }>) {
        profileById.set(row.id, { email: row.email, full_name: row.full_name });
      }
    }

    return rows.map((row) => ({ ...row, parent_profile: row.parent_id ? profileById.get(row.parent_id) ?? null : null }));
  };

  useEffect(() => {
    if (isLoading) return;
    if (profile && profile.role !== 'student') {
      router.replace(profile.role === 'teacher' ? '/dashboard/teacher' : '/dashboard/parent');
      return;
    }
    if (!session) return;

    let cancelled = false;
    const load = async () => {
      setLinksLoading(true);
      const rows = await fetchLinks(session.user.id);
      if (!cancelled) {
        setLinks(rows);
        setLinksLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, session, profile, router]);

  const handleAccept = async (linkId: string) => {
    if (!session) return;
    setHandlingRequestId(linkId);
    const { error } = await supabase.rpc('accept_parent_link_request', { p_link_id: linkId });
    setHandlingRequestId(null);

    if (error) {
      showToast('error', 'Could not accept request. Please try again.');
      return;
    }

    showToast('success', 'Request accepted.');
    setLinks(await fetchLinks(session.user.id));
  };

  const handleDecline = async (linkId: string) => {
    if (!session) return;
    setHandlingRequestId(linkId);
    const { error } = await supabase.rpc('decline_parent_link_request', { p_link_id: linkId });
    setHandlingRequestId(null);

    if (error) {
      showToast('error', 'Could not decline request. Please try again.');
      return;
    }

    showToast('success', 'Request declined.');
    setLinks(await fetchLinks(session.user.id));
  };

  const handleRevoke = async (linkId: string) => {
    if (!session) return;
    const { error } = await supabase.from('parent_links').update({ status: 'revoked' }).eq('id', linkId);
    if (error) {
      showToast('error', 'Could not revoke access. Please try again.');
      return;
    }
    showToast('success', 'Access revoked.');
    setLinks(await fetchLinks(session.user.id));
  };

  const handleCopy = async (link: LinkRow) => {
    if (!link.invite_code) return;
    await navigator.clipboard.writeText(link.invite_code);
    setCopiedId(link.id);
    window.setTimeout(() => setCopiedId((current) => (current === link.id ? null : current)), 2000);
  };

  if (isLoading || linksLoading) {
    return <PageLoader text="Loading your family settings..." />;
  }

  const activeLinks = links.filter((link) => link.status === 'active');
  const pendingLinks = links.filter((link) => link.status === 'pending');

  const parentRequests = pendingLinks.filter((link) => link.link_source === 'parent');
  const inviteLinks = pendingLinks.filter((link) => link.link_source !== 'parent');

  const reportColumn = (
    <>
      <PanelHeading icon={Radar}>Sharing</PanelHeading>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Linked" value={activeLinks.length} tone={activeLinks.length > 0 ? 'success' : 'default'} />
        <Stat label="Requests" value={parentRequests.length} tone={parentRequests.length > 0 ? 'warning' : 'default'} />
      </div>

      {/* Pending invite codes (teacher-initiated or legacy) */}
      {inviteLinks.length > 0 ? (
        <Panel>
          <PanelHeading as="h3">Invite codes to share</PanelHeading>
          <div className="mt-3 space-y-2">
            {inviteLinks.map((link) => (
              <div key={link.id} className="flex items-center justify-between gap-2 rounded-lg border border-subtle bg-surface-sunken px-3 py-2.5">
                <div className="flex min-w-0 flex-col">
                  <span className="font-mono text-sm font-semibold uppercase tracking-widest text-content">{link.invite_code}</span>
                  {link.link_source === 'teacher' ? (
                    <span className="font-mono text-[11px] text-content-subtle">Created by your teacher</span>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button type="button" onClick={() => handleCopy(link)} className={buttonStyles({ variant: 'secondary', size: 'sm' })}>
                    {copiedId === link.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedId === link.id ? 'Copied' : 'Copy'}
                  </button>
                  {link.link_source === 'student' ? (
                    <button
                      type="button"
                      onClick={() => handleRevoke(link.id)}
                      className={buttonStyles({ variant: 'danger-ghost', size: 'sm' })}
                      aria-label="Revoke invite code"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      <Panel>
        <p className="text-sm font-semibold text-content">What a parent can see</p>
        <p className="mt-1 text-[13px] text-content-subtle">
          A linked parent can see your progress, but they can never edit your data.
        </p>
      </Panel>
    </>
  );

  return (
    <Workspace>
      <PageHeader
        className="border-b border-subtle"
        icon={UserPlus}
        eyebrow="Configuration / Family"
        title="Family"
        description="Parents can send a link request using your email or username. Review and respond to requests below. They can never edit your data."
        actions={
          <>
            <Chip>● {activeLinks.length} linked</Chip>
            {parentRequests.length > 0 ? <Chip tone="warning">{parentRequests.length} waiting</Chip> : null}
          </>
        }
      />

      <WorkspaceBody aside={reportColumn}>
        {/* Requests from parents (parent-initiated) */}
        <section className="border-b border-subtle p-5">
          <PanelHeading className="mb-3">Requests from your parents</PanelHeading>
          {parentRequests.length === 0 ? (
            <p className="text-sm text-content-muted">No pending requests.</p>
          ) : (
            <div className="space-y-2">
              {parentRequests.map((link) => (
                <div key={link.id} className="flex items-center justify-between gap-3 rounded-lg border border-subtle bg-surface-sunken px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-content">
                      {link.parent_profile?.full_name || link.parent_profile?.email || 'A parent'}
                    </p>
                    <p className="truncate font-mono text-[11px] text-content-subtle">{link.parent_profile?.email}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleAccept(link.id)}
                      disabled={handlingRequestId === link.id}
                      className={buttonStyles({ variant: 'primary', size: 'sm' })}
                    >
                      {handlingRequestId === link.id ? 'Accepting...' : 'Accept'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDecline(link.id)}
                      disabled={handlingRequestId === link.id}
                      className={buttonStyles({ variant: 'danger-ghost', size: 'sm' })}
                      aria-label="Decline request"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="flex-1 p-5">
          <PanelHeading className="mb-3">Linked parents</PanelHeading>
          {activeLinks.length === 0 ? (
            <p className="rounded-lg border border-dashed border-subtle bg-surface-sunken p-6 text-center text-sm text-content-muted">
              No parent has linked to your account yet.
            </p>
          ) : (
            <div className="space-y-2">
              {activeLinks.map((link) => (
                <div key={link.id} className="flex items-center gap-2.5 rounded-lg border border-subtle bg-surface p-4">
                  <Users className="h-4 w-4 shrink-0 text-content-subtle" />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold text-content">
                      {link.parent_profile?.full_name || link.parent_profile?.email || 'Linked parent'}
                    </span>
                    {link.link_source === 'teacher' ? (
                      <span className="font-mono text-[11px] text-content-subtle">Linked by your teacher</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </WorkspaceBody>
    </Workspace>
  );
}
