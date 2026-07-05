import { AlertTriangle } from 'lucide-react';

interface VerificationBannerProps {
  verificationStatus: 'pending' | 'approved' | 'rejected';
  schoolStatus?: 'pending' | 'approved' | 'rejected' | null;
}

/** Shown on teacher dashboard pages while the teacher or their school hasn't
 * cleared verification yet. Students can't join classes until then (enforced
 * server-side by join_class_by_invite_code) -- this just explains why. */
export function VerificationBanner({ verificationStatus, schoolStatus }: VerificationBannerProps) {
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
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}
