'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';

interface VerificationBannerProps {
  verificationStatus: 'pending' | 'approved' | 'rejected';
  schoolStatus?: 'pending' | 'approved' | 'rejected' | null;
}

/** Shown on teacher dashboard pages while the teacher or their school hasn't
 * cleared verification yet. Students can't join classes until then (enforced
 * server-side by join_class_by_invite_code) -- this just explains why. A
 * teacher rejected at the account level can re-request review from here. */
export function VerificationBanner({ verificationStatus, schoolStatus }: VerificationBannerProps) {
  const [resubmitState, setResubmitState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [resubmitError, setResubmitError] = useState('');

  // Only a teacher-level rejection is self-resolvable; a rejected school needs support.
  const canResubmit = verificationStatus === 'rejected' && schoolStatus !== 'rejected';

  const handleResubmit = async () => {
    setResubmitState('loading');
    setResubmitError('');
    const supabase = createClient();
    const { error } = await supabase.rpc('request_teacher_reverification');
    if (error) {
      setResubmitError(error.message || 'Could not resubmit. Please try again.');
      setResubmitState('idle');
      return;
    }
    setResubmitState('done');
  };

  if (resubmitState === 'done') {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 dark:border-emerald-700/40 dark:bg-emerald-950/30 dark:text-emerald-300">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        Resubmitted for review. Your school admin will be notified to approve your account.
      </div>
    );
  }

  let message = '';

  if (schoolStatus === 'pending') {
    message = "Your school registration is awaiting approval. Students won't be able to join your classes until then.";
  } else if (schoolStatus === 'rejected') {
    message = 'Your school registration was not approved. Contact AIDemic support for help.';
  } else if (verificationStatus === 'pending') {
    message = "Your account is awaiting approval from your school admin. Students won't be able to join your classes until then.";
  } else if (verificationStatus === 'rejected') {
    message = 'Your account was not approved by your school admin.';
  }

  if (!message) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-300">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{message}</span>
      </div>
      {canResubmit ? (
        <div className="mt-2 flex flex-wrap items-center gap-3 pl-6">
          <button
            type="button"
            onClick={handleResubmit}
            disabled={resubmitState === 'loading'}
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-60 dark:border-amber-700/50 dark:bg-transparent dark:text-amber-200 dark:hover:bg-amber-900/30"
          >
            {resubmitState === 'loading' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Resubmit for review
          </button>
          {resubmitError ? <span className="text-xs text-red-600 dark:text-red-400">{resubmitError}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
