'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogIn, Users } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import { PageLoader } from '@/components/PageLoader';

type JoinedClass = {
  class_id: string;
  classes: {
    id: string;
    name: string;
    description: string | null;
    academic_year: string | null;
    specifications: {
      subjects: {
        name: string;
        exam_boards: { name: string; qualifications: { name: string } | null } | null;
      } | null;
    } | null;
  } | null;
};

export default function StudentClassesPage() {
  const router = useRouter();
  const { session, profile, isLoading } = useAuth();
  const supabase = createClient();

  const [classes, setClasses] = useState<JoinedClass[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  const fetchJoinedClasses = async (studentId: string) => {
    const { data, error } = await supabase
      .from('class_students')
      .select(
        'class_id, classes ( id, name, description, academic_year, specifications ( subjects ( name, exam_boards ( name, qualifications ( name ) ) ) ) )'
      )
      .eq('student_id', studentId)
      .eq('status', 'active');

    if (error) {
      console.error('Failed to load classes:', error.message);
      return [];
    }
    return (data as unknown as JoinedClass[]) ?? [];
  };

  useEffect(() => {
    if (isLoading) return;
    if (profile && profile.role === 'teacher') {
      router.replace('/dashboard/teacher');
      return;
    }
    if (profile && profile.role === 'parent') {
      router.replace('/dashboard/parent');
      return;
    }
    if (!session) return;

    let cancelled = false;
    const load = async () => {
      setClassesLoading(true);
      const rows = await fetchJoinedClasses(session.user.id);
      if (!cancelled) {
        setClasses(rows);
        setClassesLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, session, profile, router]);

  const handleJoin = async () => {
    setJoinError('');
    if (!inviteCode.trim()) {
      setJoinError('Enter an invite code.');
      return;
    }
    if (!session) return;

    setIsJoining(true);
    const { error } = await supabase.rpc('join_class_by_invite_code', { p_invite_code: inviteCode.trim() });

    if (error) {
      setIsJoining(false);
      if (error.message.includes('Invalid invite code')) {
        setJoinError('That invite code is not valid.');
      } else if (error.message.includes('not open for joining yet')) {
        setJoinError("This class isn't open for joining yet — the teacher's account is still being verified.");
      } else {
        setJoinError('Could not join that class.');
      }
      return;
    }

    setInviteCode('');
    setClasses(await fetchJoinedClasses(session.user.id));
    setIsJoining(false);
  };

  if (isLoading || classesLoading) {
    return <PageLoader text="Loading your classes..." />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My Classes</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Join a class with an invite code from your teacher.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
        <label className="text-sm font-semibold text-slate-800 dark:text-slate-100">Join a class</label>
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            placeholder="Enter invite code"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono uppercase tracking-widest outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100"
          />
          <button type="button" onClick={handleJoin} disabled={isJoining} className={buttonStyles({ variant: 'primary' })}>
            <LogIn className="h-4 w-4" />
            {isJoining ? 'Joining...' : 'Join'}
          </button>
        </div>
        {joinError ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{joinError}</p> : null}
      </div>

      {classes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600 dark:border-white/6 dark:bg-white/3 dark:text-slate-400">
          You haven&apos;t joined any classes yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((entry) => {
            const cls = entry.classes;
            if (!cls) return null;
            const subjectChain = cls.specifications?.subjects;
            const board = subjectChain?.exam_boards;
            const qualification = board?.qualifications;
            return (
              <Link
                key={cls.id}
                href={`/dashboard/classes/${cls.id}`}
                className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 dark:border-white/6 dark:bg-[#131B2E] dark:hover:border-indigo-500/40"
              >
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-indigo-500" />
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">{cls.name}</h3>
                </div>
                <p className="mt-1.5 flex flex-wrap gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  {qualification ? <span>{qualification.name}</span> : null}
                  {board ? <span>· {board.name}</span> : null}
                  {subjectChain ? <span>· {subjectChain.name}</span> : null}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
