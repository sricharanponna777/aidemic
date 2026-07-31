'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, LogIn, Plus, Users } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { PageHero } from '@/components/ui/feedback';
import { useAuth } from '@/hooks/useAuth';
import { PageLoader } from '@/components/PageLoader';
import { PARENT_NAV_ITEMS, findNavItem } from '@/lib/nav';
import { ParentChildProvider, useLinkedChildren } from './ParentChildContext';

/** Copy for the hero on each parent route. Titles/icons come from the shared
 *  nav config so the header always matches the sidebar entry. */
const PAGE_DESCRIPTIONS: Record<string, string> = {
  '/dashboard/parent': "A read-only view of your child's progress on AIDemic.",
  '/dashboard/parent/progress': 'Retention, streaks and predicted grades over time.',
  '/dashboard/parent/subjects': 'The qualifications your child is studying and how each is going.',
  '/dashboard/parent/activity': 'What your child has been working on recently.',
  '/dashboard/parent/assignments': 'Assignments set by their teachers, and how they scored.',
};

function ParentShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { profile, isLoading } = useAuth();
  const { students, selectedStudentId, setSelectedStudentId, loading } = useLinkedChildren();

  const [showLinkForm, setShowLinkForm] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [requestSent, setRequestSent] = useState<string | null>(null);
  const { linkChild } = useLinkedChildren();

  useEffect(() => {
    if (isLoading) return;
    if (profile && profile.role !== 'parent') {
      router.replace(profile.role === 'teacher' ? '/dashboard/teacher' : '/dashboard');
    }
  }, [isLoading, profile, router]);

  const handleLink = async () => {
    if (!identifier.trim()) {
      setLinkError("Enter your child's email or username.");
      return;
    }
    setIsLinking(true);
    setLinkError('');
    setRequestSent(null);
    const { error, studentName } = await linkChild(identifier);
    setIsLinking(false);
    if (error) {
      setLinkError(error);
      return;
    }
    setIdentifier('');
    setRequestSent(studentName || 'Your child');
  };

  if (isLoading || loading) {
    return <PageLoader text="Loading your Parent Dashboard..." />;
  }

  const navMatch = findNavItem(pathname, [{ label: null, items: PARENT_NAV_ITEMS }]);
  const isParentHome = pathname === '/dashboard/parent';

  return (
    <div className="space-y-6">
      <PageHero
        icon={navMatch?.item.icon ?? LayoutDashboard}
        title={isParentHome ? 'Parent Dashboard' : navMatch?.item.label ?? 'Parent Dashboard'}
        description={PAGE_DESCRIPTIONS[pathname]}
        actions={
          <button
            type="button"
            onClick={() => setShowLinkForm((v) => !v)}
            className={buttonStyles({ variant: 'secondary', size: 'sm' })}
          >
            <Plus className="h-3.5 w-3.5" />
            {students.length === 0 ? 'Add a child' : 'Add another child'}
          </button>
        }
      />

      {showLinkForm ? (
        <div className="rounded-2xl border border-subtle bg-surface p-6 shadow-sm">
          {requestSent ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-content">Request sent to {requestSent}</p>
              <p className="text-sm text-content-muted">
                They&apos;ll need to approve it from their dashboard before you can see their progress.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRequestSent(null);
                    setIdentifier('');
                    setShowLinkForm(false);
                  }}
                  className={buttonStyles({ variant: 'secondary', size: 'sm' })}
                >
                  Done
                </button>
                <button
                  type="button"
                  onClick={() => setRequestSent(null)}
                  className={buttonStyles({ variant: 'secondary', size: 'sm' })}
                >
                  Add another child
                </button>
              </div>
            </div>
          ) : (
            <>
              <label className="text-sm font-semibold text-content">Link a child</label>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Child's email or username"
                  className="flex-1 rounded-lg border border-subtle px-3 py-2 text-sm outline-none focus:border-accent bg-surface text-content"
                />
                <button type="button" onClick={handleLink} disabled={isLinking} className={buttonStyles({ variant: 'primary' })}>
                  <LogIn className="h-4 w-4" />
                  {isLinking ? 'Sending...' : 'Send request'}
                </button>
              </div>
              {linkError ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{linkError}</p> : null}
            </>
          )}
        </div>
      ) : null}

      {students.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-subtle bg-surface-sunken p-10 text-center dark:border-white/6 dark:bg-surface/3">
          <Users className="mx-auto mb-3 h-10 w-10 text-slate-300 dark:text-content-muted" />
          <p className="font-semibold text-content-muted dark:text-slate-200">No linked children yet</p>
          <p className="mt-1 text-sm text-content-subtle">
            Use <span className="font-semibold">Add a child</span> above to send a request with their email address or
            username. They&apos;ll need to accept it from their dashboard before their progress appears here.
          </p>
        </div>
      ) : (
        <>
          {students.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {students.map((student) => (
                <button
                  key={student.studentId}
                  type="button"
                  onClick={() => setSelectedStudentId(student.studentId)}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                    selectedStudentId === student.studentId
                      ? 'bg-linear-to-r from-indigo-600/90 to-purple-600/90 text-white shadow-md shadow-indigo-500/20'
                      : 'border border-subtle bg-surface text-content-muted hover:bg-surface-sunken dark:border-white/10 dark:bg-surface/5'
                  }`}
                >
                  {student.name}
                </button>
              ))}
            </div>
          ) : (
            <h2 className="text-xl font-bold text-content dark:text-white">{students[0].name}</h2>
          )}

          {children}
        </>
      )}
    </div>
  );
}

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return (
    <ParentChildProvider>
      <ParentShell>{children}</ParentShell>
    </ParentChildProvider>
  );
}
