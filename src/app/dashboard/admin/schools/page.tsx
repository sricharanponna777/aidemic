'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ShieldAlert, X } from 'lucide-react';
import { PageHero } from '@/components/ui/feedback';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import { PageLoader } from '@/components/PageLoader';

type PendingSchool = {
  id: string;
  name: string;
  created_at: string | null;
  created_by: string | null;
  founderName: string | null;
  founderEmail: string | null;
};

export default function AdminSchoolsPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const supabase = createClient();

  const [schools, setSchools] = useState<PendingSchool[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (isLoading || !session) return;

    let cancelled = false;
    const load = async () => {
      setPageLoading(true);

      const { data: adminRow } = await supabase.from('platform_admins').select('user_id').eq('user_id', session.user.id).maybeSingle();
      if (cancelled) return;
      if (!adminRow) {
        router.replace('/dashboard');
        return;
      }

      const { data: schoolRows } = await supabase
        .from('schools')
        .select('id, name, created_at, created_by')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      const typedSchoolRows = (schoolRows ?? []) as { id: string; name: string; created_at: string | null; created_by: string | null }[];
      const founderIds = typedSchoolRows.map((s) => s.created_by).filter((id): id is string => !!id);
      let profiles: { id: string; full_name: string | null; email: string | null }[] = [];
      if (founderIds.length > 0) {
        const { data: profileRows } = await supabase.from('user_profiles').select('id, full_name, email').in('id', founderIds);
        profiles = profileRows ?? [];
      }

      if (cancelled) return;
      setSchools(
        typedSchoolRows.map((s) => {
          const p = profiles.find((prof) => prof.id === s.created_by);
          return { ...s, founderName: p?.full_name ?? null, founderEmail: p?.email ?? null };
        })
      );
      setPageLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isLoading, session, router, supabase]);

  const handleDecision = async (schoolId: string, decision: 'approve' | 'reject') => {
    setActionError('');
    const { error } = await supabase.rpc(decision === 'approve' ? 'approve_school' : 'reject_school', { p_school_id: schoolId });
    if (error) {
      setActionError('Could not update that school. Please try again.');
      return;
    }
    setSchools((prev) => prev.filter((s) => s.id !== schoolId));
  };

  if (isLoading || pageLoading) {
    return <PageLoader />;
  }

  return (
    <div className="space-y-6">
      <PageHero
        icon={ShieldAlert}
        title="Pending Schools"
        description="Approve new schools before their founding admin can approve other teachers."
      />

      {actionError ? <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p> : null}

      {schools.length === 0 ? (
        <p className="rounded-lg border border-dashed border-subtle bg-surface-sunken p-6 text-center text-sm text-content-muted dark:border-white/6 dark:bg-surface/3 dark:text-content-subtle">
          No pending schools.
        </p>
      ) : (
        <div className="space-y-2">
          {schools.map((school) => (
            <div key={school.id} className="flex items-center justify-between rounded-xl border border-subtle bg-surface px-4 py-3 shadow-sm">
              <div>
                <p className="font-medium text-content">{school.name}</p>
                <p className="text-xs text-content-subtle">Registered by {school.founderName || school.founderEmail || 'unknown'}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDecision(school.id, 'approve')}
                  className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  <Check className="h-3.5 w-3.5" />
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => handleDecision(school.id, 'reject')}
                  className="flex items-center gap-1 rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-content-muted hover:bg-slate-300 dark:bg-surface/10 dark:hover:bg-surface/20"
                >
                  <X className="h-3.5 w-3.5" />
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
