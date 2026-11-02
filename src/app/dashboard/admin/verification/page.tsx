'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, MapPin, Minus, ShieldAlert, ShieldCheck, UserCheck, X } from 'lucide-react';
import { PageHero } from '@/components/ui/feedback';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import { nationLabel } from '@/lib/schools/nations';
import { PageLoader } from '@/components/PageLoader';

/** One row of platform_admin_queue(). */
type QueueRow = {
  teacher_id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  department: string | null;
  qualification_level: string | null;
  requested_at: string | null;
  // Nullable since platform_admin_queue() went to a LEFT JOIN: a pending teacher
  // who never picked a school is precisely the row that join was widened to admit,
  // and typing these as string rendered it as a bare pin icon with nothing beside it.
  school_id: string | null;
  school_name: string | null;
  school_town: string | null;
  school_postcode: string | null;
  school_nation: string | null;
  recorded_head_name: string | null;
  school_domains: string[] | null;
  is_claim: boolean;
  domain_matches: boolean;
  head_name_matches: boolean;
};

/**
 * `ok === null` is "nothing on record", which is a different thing from "checked
 * and failed" and has to look different. No register publishes a headteacher for
 * any Scottish or Northern Irish school, so a plain ✗ there showed the reviewer a
 * failure indicator for a condition that carries no information at all.
 */
function Signal({ ok, children }: { ok: boolean | null; children: React.ReactNode }) {
  const tone =
    ok === true
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
      : ok === false
      ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
      : 'bg-slate-100 text-content-subtle dark:bg-surface/8';

  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${tone}`}>
      {ok === true ? <Check className="h-3 w-3" /> : ok === false ? <X className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {children}
    </span>
  );
}

export default function AdminVerificationPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const supabase = createClient();

  const [rows, setRows] = useState<QueueRow[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [actionError, setActionError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [busyTeacherId, setBusyTeacherId] = useState<string | null>(null);
  // Approving a school admin can empty the orphan half of the queue for that
  // school, so a decision refetches rather than dropping just the one row.
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (isLoading || !session) return;

    let cancelled = false;
    const load = async () => {
      // platform_admin_queue() checks membership itself and raises 'Not
      // authorized' otherwise, so that specific message is how a non-admin gets
      // bounced. Every OTHER error -- a network blip, a transient 5xx, a
      // migration mid-apply -- used to bounce a genuine admin to /dashboard with
      // no explanation, which looks exactly like having lost admin rights.
      const { data, error } = await supabase.rpc('platform_admin_queue');
      if (cancelled) return;
      if (error) {
        if (/not authorized/i.test(error.message)) {
          router.replace('/dashboard');
          return;
        }
        console.error('Failed to load the verification queue:', error.message);
        setLoadError('Could not load the verification queue. Refresh to try again.');
        setPageLoading(false);
        return;
      }
      setLoadError('');
      setRows((data as QueueRow[]) ?? []);
      setPageLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isLoading, session, refreshToken, router, supabase]);

  const decide = async (row: QueueRow, decision: 'approve' | 'approve-as-admin' | 'reject') => {
    setActionError('');
    setBusyTeacherId(row.teacher_id);

    const { error } =
      decision === 'reject'
        ? await supabase.rpc('platform_reject_teacher', { p_teacher_id: row.teacher_id })
        : await supabase.rpc('platform_approve_teacher', {
            p_teacher_id: row.teacher_id,
            p_as_school_admin: decision === 'approve-as-admin',
          });

    setBusyTeacherId(null);
    if (error) {
      console.error('Verification decision failed:', error.message);
      // "No pending teacher with that id" means someone else already decided this
      // row -- a refetch fixes it and retrying never will, so the distinction is
      // worth passing through rather than flattening to "please try again".
      setActionError(
        /no pending teacher/i.test(error.message)
          ? 'That teacher has already been decided by someone else. Refreshing the queue.'
          : 'Could not update that teacher. Please try again.'
      );
      if (/no pending teacher/i.test(error.message)) setRefreshToken((token) => token + 1);
      return;
    }
    setRefreshToken((token) => token + 1);
  };

  // `session &&`: the effect below never runs without a session, so gating on
  // pageLoading alone left the page showing <PageLoader /> forever instead of
  // resolving. Derived rather than a setState in the effect, which the
  // react-hooks/set-state-in-effect rule forbids. The proxy redirects an
  // unauthenticated visitor long before this, which is why it went unnoticed.
  if (isLoading || (session && pageLoading)) {
    return <PageLoader />;
  }

  const claims = rows.filter((row) => row.is_claim);
  const orphans = rows.filter((row) => !row.is_claim);

  const renderRow = (row: QueueRow) => (
    <div key={row.teacher_id} className="rounded-xl border border-subtle bg-surface px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <p className="font-medium text-content">{row.full_name || row.email || 'Teacher'}</p>
          <p className="text-xs text-content-subtle">
            {row.email}
            {row.department ? ` · ${row.department}` : ''}
            {row.qualification_level ? ` · ${row.qualification_level}` : ''}
            {row.requested_at ? ` · waiting since ${new Date(row.requested_at).toLocaleDateString()}` : ''}
          </p>

          <p className="flex items-center gap-1 text-xs text-content-muted">
            <MapPin className="h-3 w-3 shrink-0" />
            {row.school_name ? (
              <>
                <span className="font-medium text-content">{row.school_name}</span>
                {[row.school_town, row.school_postcode, nationLabel(row.school_nation)]
                  .filter(Boolean)
                  .join(' · ')}
              </>
            ) : (
              <span className="italic">No school on their profile</span>
            )}
          </p>

          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <Signal ok={row.school_domains?.length ? row.domain_matches : null}>
              {row.school_domains?.length
                ? `email domain ${row.domain_matches ? 'matches' : 'differs from'} ${row.school_domains.join(', ')}`
                : 'no domain on record'}
            </Signal>
            <Signal ok={row.recorded_head_name ? row.head_name_matches : null}>
              {row.recorded_head_name
                ? `recorded head: ${row.recorded_head_name}${row.head_name_matches ? '' : ' — name differs'}`
                : 'no headteacher on record'}
            </Signal>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {row.is_claim ? (
            <>
              <button
                type="button"
                disabled={busyTeacherId === row.teacher_id}
                onClick={() => decide(row, 'approve-as-admin')}
                className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Make school admin
              </button>
              {/* Not every claim is a true one, and since claims against a school
                  with no domain on record reach this list unchecked, the reviewer
                  needs a middle option. Without it an over-claim had to be
                  rejected outright, and the teacher then had to find "Resubmit for
                  review" to come back as an ordinary orphan. */}
              <button
                type="button"
                disabled={busyTeacherId === row.teacher_id}
                onClick={() => decide(row, 'approve')}
                className="flex items-center gap-1 rounded-lg border border-subtle px-3 py-1.5 text-xs font-semibold text-content-muted hover:bg-slate-100 disabled:opacity-60 dark:hover:bg-surface/8"
              >
                <Check className="h-3.5 w-3.5" />
                Approve as teacher only
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={busyTeacherId === row.teacher_id}
                onClick={() => decide(row, 'approve')}
                className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                <Check className="h-3.5 w-3.5" />
                Approve
              </button>
              <button
                type="button"
                disabled={busyTeacherId === row.teacher_id}
                onClick={() => decide(row, 'approve-as-admin')}
                className="flex items-center gap-1 rounded-lg border border-subtle px-3 py-1.5 text-xs font-semibold text-content-muted hover:bg-slate-100 disabled:opacity-60 dark:hover:bg-surface/8"
              >
                <UserCheck className="h-3.5 w-3.5" />
                Approve as school admin
              </button>
            </>
          )}
          <button
            type="button"
            disabled={busyTeacherId === row.teacher_id}
            onClick={() => decide(row, 'reject')}
            className="flex items-center gap-1 rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-content-muted hover:bg-slate-300 disabled:opacity-60 dark:bg-surface/10 dark:hover:bg-surface/20"
          >
            <X className="h-3.5 w-3.5" />
            Reject
          </button>
        </div>
      </div>
    </div>
  );

  const emptyState = (message: string) => (
    <p className="rounded-lg border border-dashed border-subtle bg-surface-sunken p-6 text-center text-sm text-content-muted dark:border-white/6 dark:bg-surface/3 dark:text-content-subtle">
      {message}
    </p>
  );

  return (
    <div className="space-y-8">
      <PageHero
        icon={ShieldAlert}
        title="Verification"
        description="Approve the headteacher of a school, then they approve their own staff."
      />

      {loadError ? <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p> : null}
      {actionError ? <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p> : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-content dark:text-white">Headteacher claims</h2>
          <p className="text-sm text-content-muted">
            Someone claiming to run their school. A claim against a school with an official domain
            on record had to pass that email check to get here; a school with no domain — every
            Northern Irish school and most Welsh ones — cannot be checked at all, so for those the
            signals below are all you have to go on.
          </p>
        </div>
        {claims.length === 0 ? emptyState('No pending claims.') : <div className="space-y-2">{claims.map(renderRow)}</div>}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-content dark:text-white">Teachers with no school admin</h2>
          <p className="text-sm text-content-muted">
            Nobody at their school is verified yet, so there is no colleague who could approve them.
            Approving one of them as a school admin clears the rest of that school from this list.
          </p>
        </div>
        {orphans.length === 0 ? emptyState('No teachers waiting.') : <div className="space-y-2">{orphans.map(renderRow)}</div>}
      </section>
    </div>
  );
}
