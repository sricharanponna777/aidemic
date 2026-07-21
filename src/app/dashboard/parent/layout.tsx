'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn, Plus, Users } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { PageLoader } from '@/components/PageLoader';
import { ParentChildProvider, useLinkedChildren } from './ParentChildContext';

function ParentShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { profile, isLoading } = useAuth();
  const { students, selectedStudentId, setSelectedStudentId, loading } = useLinkedChildren();

  const [showLinkForm, setShowLinkForm] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [linkError, setLinkError] = useState('');
  const { linkChild } = useLinkedChildren();

  useEffect(() => {
    if (isLoading) return;
    if (profile && profile.role !== 'parent') {
      router.replace(profile.role === 'teacher' ? '/dashboard/teacher' : '/dashboard');
    }
  }, [isLoading, profile, router]);

  const handleLink = async () => {
    if (!inviteCode.trim()) {
      setLinkError('Enter an invite code.');
      return;
    }
    setIsLinking(true);
    setLinkError('');
    const { error } = await linkChild(inviteCode);
    setIsLinking(false);
    if (error) {
      setLinkError(error);
      return;
    }
    setInviteCode('');
    setShowLinkForm(false);
  };

  if (isLoading || loading) {
    return <PageLoader text="Loading your family dashboard..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Family Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            A read-only view of your child&apos;s progress on AIDemic.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowLinkForm((v) => !v)}
          className={buttonStyles({ variant: 'secondary', size: 'sm' })}
        >
          <Plus className="h-3.5 w-3.5" />
          Add another child
        </button>
      </div>

      {showLinkForm ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
          <label className="text-sm font-semibold text-slate-800 dark:text-slate-100">Link a child</label>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder="Enter invite code"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono uppercase tracking-widest outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100"
            />
            <button type="button" onClick={handleLink} disabled={isLinking} className={buttonStyles({ variant: 'primary' })}>
              <LogIn className="h-4 w-4" />
              {isLinking ? 'Linking...' : 'Link'}
            </button>
          </div>
          {linkError ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{linkError}</p> : null}
        </div>
      ) : null}

      {students.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center dark:border-white/6 dark:bg-white/3">
          <Users className="mx-auto mb-3 h-10 w-10 text-slate-300 dark:text-slate-600" />
          <p className="font-semibold text-slate-800 dark:text-slate-200">No linked children yet</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Ask your child to open Family in their AIDemic dashboard and share their invite code, then add it above.
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
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300'
                  }`}
                >
                  {student.name}
                </button>
              ))}
            </div>
          ) : (
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{students[0].name}</h2>
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
