'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Info, LogOut, MapPin, School as SchoolIcon, Search, ShieldCheck, Zap } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import { nationLabel } from '@/lib/schools/nations';
import type { SchoolSearchResult } from '@/types';

/** "Slough · SL1 3BW · England" -- what tells 25 St Mary's apart from each other. */
function describeSchool(school: SchoolSearchResult): string {
  return [school.town, school.postcode, nationLabel(school.nation)].filter(Boolean).join(' · ');
}

/** Matches the floor inside search_schools(). Below three characters a trigram
 *  index cannot serve the query, so the search would sequentially scan ~30k rows
 *  on a keystroke and the function now returns nothing rather than doing that. */
const MIN_SEARCH_LENGTH = 3;

export default function TeacherOnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const { session, isLoading } = useAuth();

  const [schoolQuery, setSchoolQuery] = useState('');
  // Results carry the query they answered, so "still searching" and "no match"
  // are derived from a stale/fresh comparison rather than kept in their own
  // state and cleared from the effect.
  const [searchResults, setSearchResults] = useState<{ query: string; items: SchoolSearchResult[] }>({
    query: '',
    items: [],
  });
  const [selectedSchool, setSelectedSchool] = useState<SchoolSearchResult | null>(null);
  const [searchFailed, setSearchFailed] = useState(false);
  const [claimSchoolAdmin, setClaimSchoolAdmin] = useState(false);

  const [department, setDepartment] = useState('');
  const [qualificationLevel, setQualificationLevel] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const trimmedQuery = schoolQuery.trim();

  useEffect(() => {
    if (selectedSchool || trimmedQuery.length < MIN_SEARCH_LENGTH) return;
    let cancelled = false;
    const timeout = setTimeout(async () => {
      // search_schools ranks name-prefix hits above trigram similarity and also
      // matches on postcode and town, so "SL1 3" or "Slough" both find a school.
      const { data, error: searchError } = await supabase.rpc('search_schools', {
        p_query: trimmedQuery,
        p_limit: 8,
      });
      if (cancelled) return;
      // Distinguished from "no such school". Discarding this error meant a broken
      // or ungranted RPC rendered "No match. Every school in the UK is listed
      // here" -- telling the user their school does not exist because the backend
      // was down.
      if (searchError) {
        console.error('School search failed:', searchError.message);
        setSearchFailed(true);
        setSearchResults({ query: trimmedQuery, items: [] });
        return;
      }
      setSearchFailed(false);
      setSearchResults({ query: trimmedQuery, items: (data as SchoolSearchResult[]) ?? [] });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [trimmedQuery, selectedSchool, supabase]);

  const handleSave = async () => {
    if (!session?.user?.id || !selectedSchool) return;
    setIsSaving(true);
    setError('');

    // is_school_admin and verification_status are set by the database, not here:
    // a trigger forces every self-created teacher row to unapproved.
    const { error: saveError } = await supabase.from('teachers').upsert(
      {
        user_id: session.user.id,
        school_id: selectedSchool.id,
        department: department.trim() || null,
        qualification_level: qualificationLevel.trim() || null,
      },
      { onConflict: 'user_id' }
    );

    if (saveError) {
      setIsSaving(false);
      console.error('Failed to save teacher profile:', saveError.message);
      // The guard trigger raises a permanent, actionable message for a teacher
      // already attached to a different school. Reporting that as "please try
      // again" left them retrying forever with the real reason only in the
      // console, so anything the database chose to phrase for a human is shown.
      setError(
        /support|school admin|verification status/i.test(saveError.message)
          ? saveError.message
          : 'Could not save your details. Please try again.'
      );
      return;
    }

    if (claimSchoolAdmin) {
      // Two routes. A school with a domain on record is gated on an email-domain
      // match; one without (every DE NI school, most Welsh ones) cannot be, so it
      // records the claim for a platform admin to judge instead of silently
      // dropping it.
      const { error: claimError } = selectedSchool.claimable
        ? await supabase.rpc('claim_school_admin', { p_school_id: selectedSchool.id })
        : await supabase.rpc('request_unverified_school_admin', { p_school_id: selectedSchool.id });
      if (claimError) {
        setIsSaving(false);
        // The domain gate's message names the domain it saw, so it is worth
        // showing verbatim rather than replacing.
        setError(claimError.message || 'Could not submit your headteacher claim.');
        return;
      }
    }

    setIsSaving(false);
    router.push('/onboarding/welcome');
  };

  const resultsAreCurrent = searchResults.query === trimmedQuery;
  const visibleSearchResults =
    selectedSchool || trimmedQuery.length < MIN_SEARCH_LENGTH || !resultsAreCurrent ? [] : searchResults.items;
  const showNoResults =
    !selectedSchool &&
    !searchFailed &&
    trimmedQuery.length >= MIN_SEARCH_LENGTH &&
    resultsAreCurrent &&
    searchResults.items.length === 0;

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas">
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
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-8 sm:px-6">
      <div className="w-full max-w-3xl">
        <section className="overflow-hidden rounded-2xl border border-subtle bg-surface p-8 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/25 dark:animate-glow-pulse">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                  Welcome to AIDemic
                </p>
                <h1 className="text-3xl font-bold text-content dark:text-white">Tell us about your school.</h1>
              </div>
            </div>
            <button type="button" onClick={handleSignOut} className={buttonStyles({ variant: 'secondary', size: 'sm' })}>
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>

          <div className="mt-8 space-y-4">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-content-muted">
                <SchoolIcon className="h-4 w-4 text-accent" />
                School
              </label>

              {selectedSchool ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-subtle bg-surface-sunken px-3 py-2.5 text-sm dark:bg-surface/3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-content">{selectedSchool.name}</p>
                    <p className="truncate text-xs text-content-subtle">{describeSchool(selectedSchool)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSchool(null);
                      setClaimSchoolAdmin(false);
                      setSchoolQuery('');
                    }}
                    className="shrink-0 text-xs font-medium text-accent hover:underline"
                  >
                    Change school
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-subtle" />
                    <input
                      type="text"
                      value={schoolQuery}
                      onChange={(event) => setSchoolQuery(event.target.value)}
                      placeholder="Search by school name, town or postcode"
                      className="w-full rounded-lg border border-subtle bg-surface py-2 pl-9 pr-3 text-sm text-content outline-none focus:border-accent"
                    />
                  </div>

                  {visibleSearchResults.length > 0 && (
                    <div className="space-y-1 rounded-lg border border-subtle p-1.5">
                      {visibleSearchResults.map((school) => (
                        <button
                          key={school.id}
                          type="button"
                          onClick={() => setSelectedSchool(school)}
                          className="flex w-full flex-col items-start gap-0.5 rounded-md px-2.5 py-1.5 text-left text-sm text-content-muted hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-surface/6"
                        >
                          <span className="font-medium text-content">{school.name}</span>
                          <span className="flex items-center gap-1 text-xs text-content-subtle">
                            <MapPin className="h-3 w-3" />
                            {describeSchool(school)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {searchFailed ? (
                    <p className="text-xs text-danger">
                      School search is unavailable right now. Please try again in a moment.
                    </p>
                  ) : null}

                  {showNoResults ? (
                    <p className="text-xs text-content-subtle">
                      No match. Every school in the UK is listed here, so try the town or postcode instead — or
                      the school&apos;s full official name.
                    </p>
                  ) : null}
                </>
              )}
            </div>

            {selectedSchool ? (
              <div className="rounded-lg border border-subtle p-3">
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={claimSchoolAdmin}
                    onChange={(event) => setClaimSchoolAdmin(event.target.checked)}
                    // Not disabled when the school has no domain on record. It used
                    // to be, while the copy said "continue anyway" -- so nothing was
                    // recorded and the teacher reached the platform admin as an
                    // indistinguishable orphan. Per the register's coverage this is
                    // the ONLY route in for Welsh and Northern Irish schools.
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-subtle accent-indigo-600"
                  />
                  <span className="text-sm">
                    <span className="flex items-center gap-1.5 font-semibold text-content">
                      <ShieldCheck className="h-3.5 w-3.5 text-accent" />
                      I&apos;m the headteacher or school administrator
                    </span>
                    <span className="mt-0.5 block text-xs text-content-subtle">
                      {selectedSchool.claimable
                        ? 'You’ll be able to approve the other teachers at your school once AIDemic has verified you. This needs an email address at your school’s official domain.'
                        : 'No official web domain is on record for this school, so we can’t confirm this automatically. Tick it anyway and AIDemic will review your claim by hand.'}
                    </span>
                  </span>
                </label>
              </div>
            ) : null}

            <div className="space-y-2">
              <label htmlFor="department" className="text-sm font-semibold text-content-muted">
                Department
              </label>
              <input
                id="department"
                type="text"
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
                placeholder="e.g. Science"
                className="w-full rounded-lg border border-subtle bg-surface px-3 py-2 text-sm text-content outline-none focus:border-accent"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="qualificationLevel" className="text-sm font-semibold text-content-muted">
                Qualification level you teach
              </label>
              <input
                id="qualificationLevel"
                type="text"
                value={qualificationLevel}
                onChange={(event) => setQualificationLevel(event.target.value)}
                placeholder="e.g. GCSE, A-Level"
                className="w-full rounded-lg border border-subtle bg-surface px-3 py-2 text-sm text-content outline-none focus:border-accent"
              />
            </div>
          </div>

          {error ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}

          <p className="mt-6 flex items-start gap-1.5 text-xs text-content-subtle">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Your account needs approving before students can join your classes — by your school&apos;s
            administrator, or by AIDemic if your school has no verified administrator yet.
          </p>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !selectedSchool}
            className={buttonStyles({ variant: 'primary', size: 'lg', className: 'mt-4 w-full' })}
          >
            {isSaving ? 'Saving...' : 'Continue'}
          </button>
        </section>
      </div>
    </main>
  );
}
