'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, School as SchoolIcon, Search, Zap } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import type { School } from '@/types';

export default function TeacherOnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const { session, isLoading } = useAuth();

  const [schoolQuery, setSchoolQuery] = useState('');
  const [searchResults, setSearchResults] = useState<School[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  const [department, setDepartment] = useState('');
  const [qualificationLevel, setQualificationLevel] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  useEffect(() => {
    if (selectedSchool || schoolQuery.trim().length < 2) return;
    let cancelled = false;
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from('schools')
        .select('id, name, status, created_by')
        .ilike('name', `%${schoolQuery.trim()}%`)
        .limit(8);
      if (!cancelled) setSearchResults((data as School[]) ?? []);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [schoolQuery, selectedSchool, supabase]);

  const handleRegisterSchool = async () => {
    if (!session?.user?.id || !newSchoolName.trim()) return;
    setIsRegistering(true);
    setError('');

    const { data, error: registerError } = await supabase
      .from('schools')
      .insert({ name: newSchoolName.trim(), created_by: session.user.id })
      .select('id, name, status, created_by')
      .single();

    setIsRegistering(false);
    if (registerError) {
      setError(
        registerError.code === '23505'
          ? 'That school is already registered — search for it instead.'
          : 'Could not register that school. Please try again.'
      );
      return;
    }

    setSelectedSchool(data as School);
    setShowRegisterForm(false);
    setNewSchoolName('');
  };

  const handleSave = async () => {
    if (!session?.user?.id || !selectedSchool) return;
    setIsSaving(true);
    setError('');

    const { error: saveError } = await supabase
      .from('teachers')
      .upsert(
        {
          user_id: session.user.id,
          school_id: selectedSchool.id,
          is_school_admin: selectedSchool.created_by === session.user.id,
          department: department.trim() || null,
          qualification_level: qualificationLevel.trim() || null,
        },
        { onConflict: 'user_id' }
      );

    setIsSaving(false);
    if (saveError) {
      console.error('Failed to save teacher profile:', saveError.message);
      setError('Could not save your details. Please try again.');
      return;
    }

    router.push('/dashboard');
  };

  const visibleSearchResults = selectedSchool || schoolQuery.trim().length < 2 ? [] : searchResults;

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eef2fb] dark:bg-[#0A0F1E]">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 animate-bounce rounded-full bg-indigo-500" />
          <div className="h-2 w-2 animate-bounce rounded-full bg-purple-500 [animation-delay:0.15s]" />
          <div className="h-2 w-2 animate-bounce rounded-full bg-indigo-500 [animation-delay:0.3s]" />
        </div>
      </main>
    );
  }

  if (!session) return null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef2fb] px-4 py-8 dark:bg-[#0A0F1E] sm:px-6">
      <div className="w-full max-w-3xl">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/25 dark:animate-glow-pulse">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400">
                  Welcome to AIDemic
                </p>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Tell us about your school.</h1>
              </div>
            </div>
            <button type="button" onClick={handleSignOut} className={buttonStyles({ variant: 'secondary', size: 'sm' })}>
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>

          <div className="mt-8 space-y-4">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                <SchoolIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                School
              </label>

              {selectedSchool ? (
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-white/6 dark:bg-white/3">
                  <span className="font-medium text-slate-900 dark:text-slate-100">{selectedSchool.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSchool(null);
                      setSchoolQuery('');
                    }}
                    className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    Change school
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={schoolQuery}
                      onChange={(event) => setSchoolQuery(event.target.value)}
                      placeholder="Search for your school"
                      className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100"
                    />
                  </div>

                  {visibleSearchResults.length > 0 && (
                    <div className="space-y-1 rounded-lg border border-slate-200 p-1.5 dark:border-white/6">
                      {visibleSearchResults.map((school) => (
                        <button
                          key={school.id}
                          type="button"
                          onClick={() => setSelectedSchool(school)}
                          className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/6"
                        >
                          {school.name}
                          {school.status === 'pending' ? (
                            <span className="text-xs text-amber-600 dark:text-amber-400">pending approval</span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  )}

                  {!showRegisterForm ? (
                    <button
                      type="button"
                      onClick={() => setShowRegisterForm(true)}
                      className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      Can&apos;t find your school? Register it
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newSchoolName}
                        onChange={(event) => setNewSchoolName(event.target.value)}
                        placeholder="School name"
                        className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={handleRegisterSchool}
                        disabled={isRegistering || !newSchoolName.trim()}
                        className={buttonStyles({ variant: 'secondary' })}
                      >
                        {isRegistering ? 'Registering...' : 'Register'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="department" className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Department
              </label>
              <input
                id="department"
                type="text"
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
                placeholder="e.g. Science"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="qualificationLevel" className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Qualification level you teach
              </label>
              <input
                id="qualificationLevel"
                type="text"
                value={qualificationLevel}
                onChange={(event) => setQualificationLevel(event.target.value)}
                placeholder="e.g. GCSE, A-Level"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100"
              />
            </div>
          </div>

          {error ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !selectedSchool}
            className={buttonStyles({ variant: 'primary', size: 'lg', className: 'mt-8 w-full' })}
          >
            {isSaving ? 'Saving...' : 'Continue'}
          </button>
        </section>
      </div>
    </main>
  );
}
