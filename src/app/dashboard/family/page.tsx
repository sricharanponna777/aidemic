'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Plus, Trash2, Users } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import { PageLoader } from '@/components/PageLoader';
import { useToast } from '@/components/ToastProvider';
import type { ParentLink } from '@/types';

const INVITE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars (0/O, 1/I/L)

function generateInviteCode(length = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => INVITE_CODE_CHARS[b % INVITE_CODE_CHARS.length]).join('');
}

type LinkRow = ParentLink & { parent_profile: { email: string; full_name?: string | null } | null };

export default function FamilyPage() {
  const router = useRouter();
  const { session, profile, isLoading } = useAuth();
  const supabase = createClient();

  const [links, setLinks] = useState<LinkRow[]>([]);
  const [linksLoading, setLinksLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
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

  const handleGenerate = async () => {
    if (!session) return;
    setIsGenerating(true);
    const { error } = await supabase.from('parent_links').insert({
      student_id: session.user.id,
      invite_code: generateInviteCode(),
    });

    if (error) {
      showToast('error', 'Could not create an invite code. Please try again.');
      setIsGenerating(false);
      return;
    }

    setLinks(await fetchLinks(session.user.id));
    setIsGenerating(false);
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
    await navigator.clipboard.writeText(link.invite_code);
    setCopiedId(link.id);
    window.setTimeout(() => setCopiedId((current) => (current === link.id ? null : current)), 2000);
  };

  if (isLoading || linksLoading) {
    return <PageLoader text="Loading your family settings..." />;
  }

  const activeLinks = links.filter((link) => link.status === 'active');
  const pendingLinks = links.filter((link) => link.status === 'pending');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Family</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Share an invite code with a parent or guardian so they can view your progress. They can never edit your data.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-slate-800 dark:text-slate-100">Invite a parent</label>
          <button type="button" onClick={handleGenerate} disabled={isGenerating} className={buttonStyles({ variant: 'primary', size: 'sm' })}>
            <Plus className="h-3.5 w-3.5" />
            {isGenerating ? 'Generating...' : 'New invite code'}
          </button>
        </div>

        {pendingLinks.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No pending invite codes.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {pendingLinks.map((link) => (
              <div
                key={link.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-white/6 dark:bg-white/3"
              >
                <div className="flex flex-col">
                  <span className="font-mono text-sm font-semibold uppercase tracking-widest text-slate-900 dark:text-slate-100">
                    {link.invite_code}
                  </span>
                  {link.link_source === 'teacher' ? (
                    <span className="text-xs text-slate-500 dark:text-slate-400">Created by your teacher</span>
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
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">Linked parents</h2>
        {activeLinks.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600 dark:border-white/6 dark:bg-white/3 dark:text-slate-400">
            No parent has linked to your account yet.
          </p>
        ) : (
          <div className="space-y-2">
            {activeLinks.map((link) => (
              <div
                key={link.id}
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/6 dark:bg-[#131B2E]"
              >
                <div className="flex items-center gap-2.5">
                  <Users className="h-4 w-4 text-indigo-500" />
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {link.parent_profile?.full_name || link.parent_profile?.email || 'Linked parent'}
                    </span>
                    {link.link_source === 'teacher' ? (
                      <span className="text-xs text-slate-500 dark:text-slate-400">Linked by your teacher</span>
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
