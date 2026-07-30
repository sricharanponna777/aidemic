'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Trash2, Users, X } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
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
    setLinks(await fetchLinks(session.user.id));
  };

  const handleRequestRemoval = async (linkId: string) => {
    if (!session) return;
    const { error } = await supabase.rpc('request_parent_link_revocation', { p_link_id: linkId });
    if (error) {
      showToast('error', 'Could not request removal. Please try again.');
      return;
    }
    showToast('success', 'Removal requested. Your teacher needs to approve it.');
    setLinks(await fetchLinks(session.user.id));
  };

  const handleCopy = async (link: LinkRow) => {
    if (!link.invite_code) return;
    await navigator.clipboard.writeText(link.invite_code);
    setCopiedId(link.id);
    window.setTimeout(() => setCopiedId((current) => (current === link.id ? null : current)), 2000);
  };

  if (isLoading || linksLoading) {
    return <PageLoader text="Loading your invite settings..." />;
  }

  const activeLinks = links.filter((link) => link.status === 'active');
  const pendingLinks = links.filter((link) => link.status === 'pending');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-content dark:text-white">Family</h1>
        <p className="mt-1 text-sm text-content-muted">
          Parents can send a link request using your email or username. Review and respond to requests below. They can never edit your data.
        </p>
      </div>

      {/* Requests from parents (parent-initiated) */}
      <div className="rounded-2xl border border-subtle bg-surface p-6 shadow-sm">
        <h2 className="mb-3 text-lg font-bold text-content dark:text-white">Requests from your parents</h2>
        {pendingLinks.filter((link) => link.link_source === 'parent').length === 0 ? (
          <p className="text-sm text-content-muted">No pending requests.</p>
        ) : (
          <div className="space-y-2">
            {pendingLinks
              .filter((link) => link.link_source === 'parent')
              .map((link) => (
                <div
                  key={link.id}
                  className="flex items-center justify-between rounded-lg border border-subtle bg-surface-sunken px-4 py-3 dark:bg-surface/3"
                >
                  <div>
                    <p className="text-sm font-semibold text-content">
                      {link.parent_profile?.full_name || link.parent_profile?.email || 'A parent'}
                    </p>
                    <p className="text-xs text-content-subtle">{link.parent_profile?.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
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
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Pending invite codes (teacher-initiated or legacy) */}
      {pendingLinks.filter((link) => link.link_source !== 'parent').length > 0 ? (
        <div className="rounded-2xl border border-subtle bg-surface p-6 shadow-sm">
          <label className="text-sm font-semibold text-content">Invite codes to share</label>
          <div className="mt-3 space-y-2">
            {pendingLinks
              .filter((link) => link.link_source !== 'parent')
              .map((link) => (
                <div
                  key={link.id}
                  className="flex items-center justify-between rounded-lg border border-subtle bg-surface-sunken px-3 py-2.5 dark:bg-surface/3"
                >
                  <div className="flex flex-col">
                    <span className="font-mono text-sm font-semibold uppercase tracking-widest text-content">
                      {link.invite_code}
                    </span>
                    {link.link_source === 'teacher' ? (
                      <span className="text-xs text-content-subtle">Created by your teacher</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopy(link)}
                      className={buttonStyles({ variant: 'secondary', size: 'sm' })}
                    >
                      {copiedId === link.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedId === link.id ? 'Copied' : 'Copy'}
                    </button>
                    {link.link_source === 'student' ? (
                      <button
                        type="button"
                        onClick={() => handleRevoke(link.id)}
                        className={buttonStyles({ variant: 'danger-ghost', size: 'sm' })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
          </div>
        </div>
      ) : null}

      <div>
        <h2 className="mb-3 text-lg font-bold text-content dark:text-white">Linked parents</h2>
        {activeLinks.length === 0 ? (
          <p className="rounded-lg border border-dashed border-subtle bg-surface-sunken p-6 text-center text-sm text-content-muted dark:border-white/6 dark:bg-surface/3 dark:text-content-subtle">
            No parent has linked to your account yet.
          </p>
        ) : (
          <div className="space-y-2">
            {activeLinks.map((link) => (
              <div
                key={link.id}
                className="flex items-center justify-between rounded-2xl border border-subtle bg-surface p-4 shadow-sm"
              >
                <div className="flex items-center gap-2.5">
                  <Users className="h-4 w-4 text-indigo-500" />
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-content">
                      {link.parent_profile?.full_name || link.parent_profile?.email || 'Linked parent'}
                    </span>
                    {link.link_source === 'teacher' ? (
                      <span className="text-xs text-content-subtle">Linked by your teacher</span>
                    ) : null}
                  </div>
                </div>
                {link.link_source === 'student' ? (
                  <button
                    type="button"
                    onClick={() => handleRevoke(link.id)}
                    className={buttonStyles({ variant: 'danger-ghost', size: 'sm' })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Revoke access
                  </button>
                ) : link.revocation_requested_at ? (
                  <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Removal requested — awaiting teacher approval</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleRequestRemoval(link.id)}
                    className={buttonStyles({ variant: 'danger-ghost', size: 'sm' })}
                  >
                    Request removal
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
