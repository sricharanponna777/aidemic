'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  CircleDashed,
  Clock,
  Flame,
  PenLine,
  Radar,
  RotateCcw,
  Sparkles,
  Trophy,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cachedAiFetch } from '@/lib/aiCache';
import { createClient } from '@/lib/supabase-client';
import { useUserSubjects } from '@/hooks/useUserSubjects';
import { useBadges, useGamification } from '@/hooks/useGamification';
import { announceXp, nextBadge } from '@/lib/gamification/client';
import { xpRate } from '@/lib/gamification/rules';
import { highlightTerms } from '@/lib/blurtHighlight';
import { buttonStyles } from '@/components/ui/button';
import { Alert, fieldStyles } from '@/components/ui/field';
import { PageHero, EmptyState } from '@/components/ui/feedback';
import { Chip, Meter, MonoLabel, Panel } from '@/components/ui/telemetry';
import { getExamTypeLabel, getSavedSpecLabel, getSubjectLabel } from '@/lib/ai/subjectConfig';
import { getExamBoardLabel } from '@/lib/ai/qualifications';
import type { XpAward } from '@/types';

type KeyTerm = { term: string; status: 'recalled' | 'wrong' | 'missed' };

type BlurtResult = {
  covered: string[];
  missed: string[];
  misconceptions: string[];
  /** Absent from responses cached before the field existed. */
  keyTerms?: KeyTerm[];
  coverageScore: number;
  summary: string;
};

type Draft = { subjectIndex: number; topic: string; dump: string; minutes: number };

const DURATIONS = [5, 10, 15] as const;
const STRONG = 80;
const SOLID = 55;
const BLURT_XP = xpRate('blurt')?.xp ?? 150;

const formatClock = (seconds: number) => {
  const s = Math.max(0, seconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

const band = (score: number) => (score >= STRONG ? 'Strong recall' : score >= SOLID ? 'Solid start' : 'Keep building');

/** Per-viewer draft, so a refresh or a closed tab does not lose ten minutes of
 *  writing. Browser storage only: a draft is a convenience, not a record. */
const draftKey = (userId: string) => `aidemic-blurt-draft:${userId}`;
const readDraft = (userId: string): Draft | null => {
  try {
    const raw = window.localStorage.getItem(draftKey(userId));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
};
const writeDraft = (userId: string, draft: Draft | null) => {
  try {
    if (draft) window.localStorage.setItem(draftKey(userId), JSON.stringify(draft));
    else window.localStorage.removeItem(draftKey(userId));
  } catch {
    // Storage unavailable: the page still works, it just cannot restore.
  }
};

export default function BlurtPage() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const { subjects, isLoading: subjectsLoading } = useUserSubjects();
  const { data: gamification } = useGamification();
  const { data: badges } = useBadges();

  // Read in the initialisers: the shell renders children only once the
  // session has loaded, so this page never renders on the server and the
  // draft is available on the very first render.
  const [initialDraft] = useState(() => (userId ? readDraft(userId) : null));
  const [subjectIndex, setSubjectIndex] = useState(initialDraft?.subjectIndex ?? 0);
  const [topic, setTopic] = useState(initialDraft?.topic ?? '');
  const [dump, setDump] = useState(initialDraft?.dump ?? '');
  const [minutes, setMinutes] = useState<number>(
    DURATIONS.find((d) => d === initialDraft?.minutes) ?? DURATIONS[0]
  );
  const [phase, setPhase] = useState<'writing' | 'reviewing' | 'result'>('writing');
  const [result, setResult] = useState<BlurtResult | null>(null);
  const [award, setAward] = useState<XpAward | null>(null);
  const [error, setError] = useState('');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [savedSnapshot, setSavedSnapshot] = useState('');

  // A restored index can point past a subject that has since been removed.
  const selectedSubject = subjects[subjectIndex] ?? subjects[0] ?? null;

  const snapshot = JSON.stringify({ subjectIndex, topic, dump, minutes });
  const savedDraft = Boolean(topic || dump) && savedSnapshot === snapshot;

  useEffect(() => {
    if (!userId || phase !== 'writing') return;
    const id = setTimeout(() => {
      writeDraft(userId, topic || dump ? { subjectIndex, topic, dump, minutes } : null);
      setSavedSnapshot(snapshot);
    }, 600);
    return () => clearTimeout(id);
  }, [userId, subjectIndex, topic, dump, minutes, phase, snapshot]);

  // The clock starts on the first keystroke of the recall, not on page load.
  useEffect(() => {
    if (phase !== 'writing' || startedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase, startedAt]);

  const remaining = startedAt === null ? minutes * 60 : minutes * 60 - Math.floor((now - startedAt) / 1000);
  const timeUp = startedAt !== null && remaining <= 0;
  const wordCount = useMemo(() => dump.trim().split(/\s+/).filter(Boolean).length, [dump]);
  const lines = useMemo(() => dump.split('\n'), [dump]);
  const keyTerms = result?.keyTerms ?? [];
  const usedTerms = keyTerms.filter((k) => k.status === 'recalled').length;
  const maxXp = Math.round(BLURT_XP * (gamification?.nextMultiplier ?? 1));
  const blurtBadge = badges ? nextBadge(badges, (b) => b.id === 'void-blurter') ?? nextBadge(badges) : null;

  const courseLine = selectedSubject
    ? `${getExamBoardLabel(selectedSubject.exam_board)} ${getExamTypeLabel(selectedSubject.exam_type)} ${getSubjectLabel(selectedSubject.subject)}`
    : '';

  const handleSubmit = async () => {
    if (!selectedSubject || !topic.trim() || dump.trim().length < 20) {
      setError('Pick a subject, enter a topic, and write at least a sentence or two.');
      return;
    }
    setError('');
    setPhase('reviewing');

    try {
      const response = await cachedAiFetch('/api/ai/blurt-review', {
        subject: getSubjectLabel(selectedSubject.subject),
        topic: topic.trim(),
        brainDump: dump.trim(),
        examBoard: selectedSubject.exam_board,
        examType: selectedSubject.exam_type,
        specification: getSavedSpecLabel(selectedSubject),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Could not review your recall.');
        setPhase('writing');
        return;
      }
      setResult(data as BlurtResult);
      setAward(data.xp ?? null);
      announceXp(data.xp);
      setPhase('result');
      if (userId) writeDraft(userId, null);

      // Persist as a practice attempt so blurting feeds the weakness pipeline,
      // dashboard, and parent digest. attempt_mode 'blurt' excludes it from
      // predicted grades (see gradeAverages.ts).
      if (userId) {
        const supabase = createClient();
        const weaknessTags = [...(data.missed ?? []), ...(data.misconceptions ?? [])].slice(0, 12);
        await supabase.from('exam_practice_attempts').insert({
          user_id: userId,
          subject: selectedSubject.subject,
          exam_board: selectedSubject.exam_board,
          exam_type: selectedSubject.exam_type,
          topic: topic.trim(),
          percentage: data.coverageScore ?? null,
          weakness_tags: weaknessTags,
          weakness_analysis: data.missed ?? [],
          attempt_mode: 'blurt',
        });
      }
    } catch {
      setError('Network error while reviewing your recall.');
      setPhase('writing');
    }
  };

  const reset = () => {
    setPhase('writing');
    setResult(null);
    setAward(null);
    setDump('');
    setStartedAt(null);
    setError('');
  };

  if (!subjectsLoading && subjects.length === 0) {
    return (
      <div className="space-y-6">
        <PageHero
          icon={PenLine}
          title="Blurting"
          description="Free-recall practice: write everything you know, then see what you missed."
        />
        <EmptyState
          icon={Brain}
          title="Add a subject first"
          description="Blurting works against your saved subjects so the AI can grade against the right specification."
          action={
            <Link href="/dashboard/subjects" className={buttonStyles({ variant: 'primary' })}>
              Add subjects
            </Link>
          }
        />
      </div>
    );
  }

  const writing = phase === 'writing';

  return (
    <div className="overflow-hidden rounded-card border border-subtle bg-surface">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-5 border-b border-subtle p-6">
        <div className="min-w-0 max-w-xl">
          <MonoLabel>Practice / Active recall</MonoLabel>
          <h1 className="mt-1.5 text-display text-content">Blurting</h1>
          <p className="mt-2 text-body text-content-muted">
            Write down everything you can remember about one topic without looking anything up. Then see what you got, what you
            missed and what to fix, checked against your exam board&apos;s specification.
          </p>
        </div>
        <div className="flex max-w-sm flex-wrap justify-end gap-2">
          <Chip>● Mode: free recall</Chip>
          {selectedSubject && (
            <Chip tone="success">
              <Trophy className="h-3 w-3" /> {getExamBoardLabel(selectedSubject.exam_board)} {getExamTypeLabel(selectedSubject.exam_type)}
            </Chip>
          )}
          <Chip tone="xp">
            <Zap className="h-3 w-3" /> Up to +{maxXp} XP
          </Chip>
          <Chip tone="danger">
            <Clock className="h-3 w-3" /> Timer: {formatClock(minutes * 60)}
          </Chip>
        </div>
      </header>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Writing column */}
        <div className="flex min-w-0 flex-col lg:border-r lg:border-subtle">
          <div className="space-y-3 border-b border-subtle p-5">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <label className="block">
                <MonoLabel className="mb-1">Subject</MonoLabel>
                <select
                  value={subjectIndex}
                  onChange={(e) => setSubjectIndex(Number(e.target.value))}
                  className={fieldStyles()}
                  disabled={!writing}
                >
                  {subjects.map((s, i) => (
                    <option key={`${s.subject}-${i}`} value={i}>
                      {getSubjectLabel(s.subject)} · {getExamTypeLabel(s.exam_type)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <MonoLabel className="mb-1">Topic</MonoLabel>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. The heart, The Cold War, Trigonometry"
                  className={fieldStyles()}
                  disabled={!writing}
                />
              </label>
              <label className="block">
                <MonoLabel className="mb-1">Time</MonoLabel>
                <select
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                  className={fieldStyles()}
                  disabled={!writing || startedAt !== null}
                >
                  {DURATIONS.map((d) => (
                    <option key={d} value={d}>
                      {d} min
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {courseLine && (
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-mono text-[11px] text-content-muted">
                  {courseLine}
                  {topic.trim() ? ` · ${topic.trim()}` : ''}
                </p>
                {writing && startedAt !== null && <Chip tone="success">● Live session</Chip>}
                {phase === 'result' && <Chip>Marked</Chip>}
              </div>
            )}
          </div>

          <div className="p-5 pb-0">
            <div className="flex gap-3 rounded-lg border border-subtle bg-surface-sunken p-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-subtle bg-surface text-content-subtle">
                <Brain className="h-4 w-4" />
              </span>
              <div>
                <MonoLabel>Your prompt</MonoLabel>
                <p className="mt-1 text-body text-content">
                  Write down everything you know about <span className="font-semibold">{topic.trim() || 'your topic'}</span>: key
                  words, definitions, processes and examples. Don&apos;t look anything up. Getting it wrong is how you find the gaps.
                </p>
              </div>
            </div>
          </div>

          {/* Status bar */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-subtle px-5 py-3 font-mono text-[11px]">
            <span className={`flex items-center gap-1.5 font-semibold ${startedAt !== null ? 'text-danger' : 'text-content-subtle'}`}>
              <Clock className="h-3.5 w-3.5" />
              {timeUp ? "Time's up: finish your sentence and submit" : `${formatClock(remaining)} remaining`}
            </span>
            <span className="text-content-subtle">
              Words: <span className="font-semibold text-content">{wordCount}</span>
            </span>
            {writing && savedDraft && (
              <span className="flex items-center gap-1.5 text-content-subtle">
                <span className="h-1.5 w-1.5 rounded-full bg-success" /> Draft saved
              </span>
            )}
          </div>

          {/* Editor: a mirror of the text draws the line numbers and, once
              marked, the highlights; the textarea sits exactly on top of it
              while writing, so both wrap identically. */}
          <div className="relative grid min-h-[22rem] flex-1">
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-12 border-r border-subtle bg-surface-sunken" />
            <div
              aria-hidden={writing}
              className={`[grid-area:1/1] whitespace-pre-wrap break-words py-4 pl-16 pr-5 text-[15px] leading-7 ${
                writing ? 'text-transparent' : 'text-content'
              }`}
            >
              {lines.map((line, i) => (
                <div key={i} className="relative">
                  <span className="absolute -left-14 w-8 select-none text-right font-mono text-[11px] leading-7 text-content-subtle">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {writing
                    ? line || '​'
                    : highlightTerms(line, keyTerms).map((seg, j) =>
                        seg.tone ? (
                          <mark
                            key={j}
                            className={`rounded px-0.5 ${
                              seg.tone === 'wrong'
                                ? 'bg-warning-muted text-warning ring-1 ring-inset ring-warning/30'
                                : 'bg-xp-muted text-xp ring-1 ring-inset ring-xp/30'
                            }`}
                          >
                            {seg.text}
                          </mark>
                        ) : (
                          <Fragment key={j}>{seg.text}</Fragment>
                        )
                      )}
                  {!writing && !line && '​'}
                </div>
              ))}
            </div>
            {writing && (
              <textarea
                aria-label="Write everything you can remember"
                value={dump}
                onChange={(e) => {
                  if (startedAt === null && e.target.value.trim()) {
                    setStartedAt(Date.now());
                    setNow(Date.now());
                  }
                  setDump(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    void handleSubmit();
                  }
                }}
                spellCheck={false}
                placeholder="Start typing. The timer starts with your first word…"
                className="[grid-area:1/1] resize-none overflow-hidden bg-transparent py-4 pl-16 pr-5 text-[15px] leading-7 text-content caret-content outline-none placeholder:text-content-subtle"
              />
            )}
          </div>

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-subtle p-4">
            {error ? <Alert className="w-full">{error}</Alert> : null}
            {phase === 'result' ? (
              <button type="button" onClick={reset} className={buttonStyles({ variant: 'primary' })}>
                <RotateCcw className="h-4 w-4" /> Blurt another topic
              </button>
            ) : (
              <>
                <p className="font-mono text-[11px] text-content-subtle max-sm:hidden">Press Ctrl + Enter to submit</p>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={phase === 'reviewing'}
                  className={buttonStyles({ variant: 'primary', className: 'max-sm:w-full' })}
                >
                  <Sparkles className="h-4 w-4" />
                  {phase === 'reviewing' ? 'Checking your recall…' : `Check my recall (up to +${maxXp} XP)`}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Report column */}
        <aside className="space-y-4 border-t border-subtle bg-surface-sunken/60 p-5 lg:border-t-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Radar className="h-4 w-4 text-content-subtle" />
              <MonoLabel className="text-content">Mission report</MonoLabel>
            </div>
            {result && <Chip tone="success">{result.coverageScore}% covered</Chip>}
          </div>

          {phase === 'reviewing' && (
            <Panel className="space-y-2">
              <p className="text-sm font-semibold text-content">Checking against {courseLine || 'your course'}…</p>
              <div className="h-2 w-2/3 animate-pulse rounded bg-surface-sunken" />
              <div className="h-2 w-1/2 animate-pulse rounded bg-surface-sunken" />
            </Panel>
          )}

          {phase === 'writing' && (
            <Panel>
              <p className="text-sm font-semibold text-content">Your report appears here</p>
              <ul className="mt-2 space-y-1.5 text-caption text-content-subtle">
                <li>How much of the topic you covered</li>
                <li>Each point you got right</li>
                <li>Anything to correct</li>
                <li>Key words you used and missed</li>
              </ul>
            </Panel>
          )}

          {result && (
            <>
              <Panel>
                <div className="flex items-center justify-between">
                  <MonoLabel>Coverage</MonoLabel>
                  <span className="font-mono text-[11px] text-content-subtle">{band(result.coverageScore)}</span>
                </div>
                <p className="mt-2 font-mono text-4xl font-semibold text-content">
                  {result.coverageScore}
                  <span className="text-lg text-content-subtle">%</span>
                </p>
                <div className="relative mt-3">
                  <Meter fraction={result.coverageScore / 100} label="Coverage" />
                  {[SOLID, STRONG].map((mark) => (
                    <span key={mark} className="absolute -top-0.5 h-2.5 w-px bg-content-subtle" style={{ left: `${mark}%` }} aria-hidden="true" />
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-3 font-mono text-[10px] text-content-subtle">
                  <span>Keep building</span>
                  <span className="text-center">Solid {SOLID}%+</span>
                  <span className="text-right">Strong {STRONG}%+</span>
                </div>
                <p className="mt-3 text-caption text-content-muted">{result.summary}</p>
              </Panel>

              {(result.covered.length > 0 || result.misconceptions.length > 0) && (
                <Panel>
                  <MonoLabel>What you wrote</MonoLabel>
                  <ul className="mt-3 space-y-2">
                    {result.covered.map((item, i) => (
                      <li key={`c${i}`} className="flex gap-2.5 rounded-lg border border-subtle bg-surface p-2.5 text-caption text-content-muted">
                        <CheckCircle2 className="mt-px h-4 w-4 shrink-0 text-success" aria-label="Correct" />
                        {item}
                      </li>
                    ))}
                    {result.misconceptions.map((item, i) => (
                      <li
                        key={`m${i}`}
                        className="flex gap-2.5 rounded-lg border border-warning/30 bg-warning-muted p-2.5 text-caption text-warning"
                      >
                        <AlertTriangle className="mt-px h-4 w-4 shrink-0" aria-label="Needs correcting" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}

              {result.missed.length > 0 && (
                <Panel>
                  <MonoLabel>You missed</MonoLabel>
                  <ul className="mt-3 space-y-2">
                    {result.missed.map((item, i) => (
                      <li key={i} className="flex gap-2.5 text-caption text-content-muted">
                        <CircleDashed className="mt-px h-4 w-4 shrink-0 text-content-subtle" aria-hidden="true" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}

              {keyTerms.length > 0 && (
                <Panel>
                  <div className="flex items-center justify-between">
                    <MonoLabel>Key words</MonoLabel>
                    <span className="font-mono text-[11px] text-content-subtle">
                      {usedTerms} / {keyTerms.length} used
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {keyTerms.map((k) => (
                      <Chip
                        key={k.term}
                        mono={false}
                        tone={k.status === 'recalled' ? 'neutral' : k.status === 'wrong' ? 'warning' : 'neutral'}
                        className={k.status === 'missed' ? 'border-dashed bg-transparent text-content-subtle' : ''}
                      >
                        {k.term}
                        {k.status === 'recalled' && <span className="text-success">✓</span>}
                        {k.status === 'wrong' && <AlertTriangle className="h-3 w-3" aria-label="used wrongly" />}
                        {k.status === 'missed' && <span className="sr-only">(missed)</span>}
                      </Chip>
                    ))}
                  </div>
                </Panel>
              )}
            </>
          )}

          {gamification && (
            <Panel>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-xp" />
                  <p className="text-sm font-semibold text-content">Streak bonus</p>
                </div>
                {gamification.nextMultiplier > 1 && <Chip tone="xp">{gamification.nextMultiplier}x active</Chip>}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-subtle p-3">
                  <MonoLabel>This blurt</MonoLabel>
                  <p className="mt-1 font-mono text-xl font-semibold text-content">
                    {award ? `+${award.xpAwarded} XP` : '—'}
                  </p>
                </div>
                <div className="rounded-lg border border-subtle p-3">
                  <MonoLabel>Streak</MonoLabel>
                  <p className="mt-1 flex items-center gap-1 text-xl font-semibold text-xp">
                    <Flame className="h-4 w-4" />
                    {gamification.currentStreak} {gamification.currentStreak === 1 ? 'day' : 'days'}
                  </p>
                </div>
              </div>
              {blurtBadge && (
                <div className="mt-3 border-t border-subtle pt-3">
                  <div className="flex items-center justify-between gap-2 text-caption">
                    <span className="flex items-center gap-1.5 text-content-muted">
                      <Trophy className="h-3.5 w-3.5 text-warning" /> Next badge: <span className="font-semibold text-content">{blurtBadge.name}</span>
                    </span>
                    <span className="font-mono text-[11px] text-content-subtle">
                      {blurtBadge.progress} / {blurtBadge.threshold}
                    </span>
                  </div>
                  <Meter fraction={blurtBadge.progress / blurtBadge.threshold} tone="xp" className="mt-2" label="Badge progress" />
                </div>
              )}
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}
