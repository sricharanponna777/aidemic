'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Plus, Trash2 } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { createClient } from '@/lib/supabase-client';
import { useToast } from '@/components/ToastProvider';
import type { ParentLink } from '@/types';

type LinkRow = ParentLink & { parent_profile: { email: string; full_name: string | null } | null };

export function ParentLinksPanel({ studentId }: { studentId: string }) {
  const supabase = createClient();
  const { showToast } = useToast();
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchLinks = async () => {
    const { data } = await supabase
      .from('parent_links')
      .select('id, student_id, parent_id, invite_code, status, link_source, created_by, revocation_requested_at, created_at')
      .eq('student_id', studentId)
      .eq('link_source', 'teacher')
      .order('created_at', { ascending: false });
    const rows = (data as ParentLink[]) ?? [];

    const parentIds = rows.map((r) => r.parent_id).filter((id): id is string => !!id);
    const profileById = new Map<string, { email: string; full_name: string | null }>();
    if (parentIds.length > 0) {
      const { data: profileRows } = await supabase.from('user_profiles').select('id, email, full_name').in('id', parentIds);
      for (const row of (profileRows ?? []) as Array<{ id: string; email: string; full_name: string | null }>) {
        profileById.set(row.id, { email: row.email, full_name: row.full_name });
      }
    }
    return rows.map((r) => ({ ...r, parent_profile: r.parent_id ? profileById.get(r.parent_id) ?? null : null }));
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const rows = await fetchLinks();
      if (!cancelled) {
        setLinks(rows);
        setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const handleGenerate = async () => {
    setGenerating(true);
    const { error } = await supabase.rpc('generate_parent_link_invite_code', { p_student_id: studentId });
    if (error) {
      showToast('error', 'Could not generate an invite code. Please try again.');
      setGenerating(false);
      return;
    }
    setLinks(await fetchLinks());
    setGenerating(false);
  };

  const handleRevoke = async (linkId: string) => {
    const { error } = await supabase.rpc('revoke_parent_link', { p_link_id: linkId });
    if (error) {
      showToast('error', 'Could not revoke this link. Please try again.');
      return;
    }
    setLinks(await fetchLinks());
  };

  const handleCopy = async (link: LinkRow) => {
    await navigator.clipboard.writeText(link.invite_code);
    setCopiedId(link.id);
    window.setTimeout(() => setCopiedId((current) => (current === link.id ? null : current)), 2000);
  };

  const activeOrPending = links.filter((l) => l.status !== 'revoked');

  if (loading) {
    return <p className="text-xs text-slate-500 dark:text-slate-400">Loading parent links...</p>;
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/6 dark:bg-white/3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Parent links</p>
        <button type="button" onClick={() => void handleGenerate()} disabled={generating} className={buttonStyles({ variant: 'secondary', size: 'sm' })}>
          <Plus className="h-3.5 w-3.5" />
          {generating ? 'Generating...' : 'New invite code'}
        </button>
      </div>

      {activeOrPending.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">No parent linked by a teacher for this student yet.</p>
      ) : (
        <div className="space-y-1.5">
          {activeOrPending.map((link) => (
            <div key={link.id} className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-white/6 dark:bg-[#131B2E]">
              <div className="flex flex-col">
                {link.status === 'pending' ? (
                  <span className="font-mono font-semibold uppercase tracking-widest text-slate-900 dark:text-slate-100">{link.invite_code}</span>
                ) : (
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {link.parent_profile?.full_name || link.parent_profile?.email || 'Linked parent'}
                  </span>
                )}
                {link.revocation_requested_at ? (
                  <span className="text-amber-600 dark:text-amber-400">Student requested removal</span>
                ) : null}
              </div>
              <div className="flex items-center gap-1.5">
                {link.status === 'pending' ? (
                  <button type="button" onClick={() => void handleCopy(link)} className={buttonStyles({ variant: 'secondary', size: 'sm' })}>
                    {copiedId === link.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copiedId === link.id ? 'Copied' : 'Copy'}
                  </button>
                ) : null}
                <button type="button" onClick={() => void handleRevoke(link.id)} className={buttonStyles({ variant: 'danger-ghost', size: 'sm' })}>
                  <Trash2 className="h-3 w-3" />
                  Revoke
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
