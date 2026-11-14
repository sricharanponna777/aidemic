'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogIn, Radar, Users } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/feedback';
import { fieldStyles } from '@/components/ui/field';
import { Chip, MonoLabel, Panel, PanelHeading, Workspace, WorkspaceBody } from '@/components/ui/telemetry';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import { specChainParts } from '@/lib/specLabel';
import { PageLoader } from '@/components/PageLoader';

type JoinedClass = {
  class_id: string;
  classes: {
    id: string;
    name: string;
    description: string | null;
    academic_year: string | null;
    specifications: {
      tier: string | null;
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
        'class_id, classes ( id, name, description, academic_year, specifications ( tier, subjects ( name, exam_boards ( name, qualifications ( name ) ) ) ) )'
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

  const reportColumn = (
    <>
      <PanelHeading icon={Radar}>Join a class</PanelHeading>
      <Panel>
        <label className="block">
          <MonoLabel className="mb-1">Invite code</MonoLabel>
          <input
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            placeholder="Enter invite code"
            className={fieldStyles('font-mono uppercase tracking-widest')}
          />
        </label>
        <button
          type="button"
          onClick={handleJoin}
          disabled={isJoining}
          className={buttonStyles({ variant: 'primary', className: 'mt-3 w-full justify-center' })}
        >
          <LogIn className="h-4 w-4" />
          {isJoining ? 'Joining...' : 'Join'}
        </button>
        {joinError ? <p className="mt-2 text-sm text-danger">{joinError}</p> : null}
      </Panel>
      <Panel>
        <p className="text-sm font-semibold text-content">Where do I get a code?</p>
        <p className="mt-1 text-[13px] text-content-subtle">
          Your teacher shares it. Once you join, their assignments appear on the class page.
        </p>
      </Panel>
    </>
  );

  return (
    <Workspace>
      <PageHeader
        className="border-b border-subtle"
        icon={Users}
        eyebrow="Configuration / Classes"
        title="My Classes"
        description="Join a class with an invite code from your teacher."
        actions={<Chip>● {classes.length} {classes.length === 1 ? 'class' : 'classes'}</Chip>}
      />

      <WorkspaceBody aside={reportColumn}>
        <div className="flex-1 p-5">
          {classes.length === 0 ? (
            <p className="rounded-lg border border-dashed border-subtle bg-surface-sunken p-6 text-center text-sm text-content-muted">
              You haven&apos;t joined any classes yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {classes.map((entry) => {
                const cls = entry.classes;
                if (!cls) return null;
                const specParts = specChainParts(cls.specifications);
                return (
                  <Link
                    key={cls.id}
                    href={`/dashboard/classes/${cls.id}`}
                    className="block rounded-lg border border-subtle bg-surface p-4 transition-colors hover:border-strong"
                  >
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-content-subtle" />
                      <h2 className="font-semibold text-content">{cls.name}</h2>
                    </div>
                    <p className="mt-1.5 flex flex-wrap gap-1.5 font-mono text-[11px] text-content-subtle">
                      {specParts.map((part, i) => (
                        <span key={i}>
                          {i > 0 ? '· ' : ''}
                          {part}
                        </span>
                      ))}
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </WorkspaceBody>
    </Workspace>
  );
}
