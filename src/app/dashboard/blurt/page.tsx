'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Brain, CheckCircle2, CircleAlert, Lightbulb, RotateCcw, Timer } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import { useUserSubjects } from '@/hooks/useUserSubjects';
import { buttonStyles } from '@/components/ui/button';
import { Alert, Label, fieldStyles } from '@/components/ui/field';
import { PageHeader, EmptyState } from '@/components/ui/feedback';
import { getSubjectLabel } from '@/lib/ai/subjectConfig';
import { scoreBadgeTone } from '@/lib/scoreTone';
import Link from 'next/link';

type BlurtResult = {
  covered: string[];
  missed: string[];
  misconceptions: string[];
  coverageScore: number;
  summary: string;
};

const formatClock = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export default function BlurtPage() {
  const { session } = useAuth();
  const { subjects, isLoading: subjectsLoading } = useUserSubjects();

  const [subjectIndex, setSubjectIndex] = useState(0);
  const [topic, setTopic] = useState('');
  const [dump, setDump] = useState('');
  const [phase, setPhase] = useState<'writing' | 'reviewing' | 'result'>('writing');
  const [result, setResult] = useState<BlurtResult | null>(null);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedSubject = subjects[subjectIndex] ?? null;

  useEffect(() => {
    if (phase !== 'writing') {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase]);

  const wordCount = useMemo(() => dump.trim().split(/\s+/).filter(Boolean).length, [dump]);

  const handleSubmit = async () => {
    if (!selectedSubject || !topic.trim() || dump.trim().length < 20) {
      setError('Pick a subject, enter a topic, and write at least a sentence or two.');
      return;
    }
    setError('');
    setPhase('reviewing');

    try {
      const response = await fetch('/api/ai/blurt-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: getSubjectLabel(selectedSubject.subject),
          topic: topic.trim(),
          brainDump: dump.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Could not review your recall.');
        setPhase('writing');
        return;
      }
      setResult(data as BlurtResult);
      setPhase('result');

      // Persist as a practice attempt so blurting feeds the weakness pipeline,
      // dashboard, and parent digest. attempt_mode 'blurt' excludes it from
      // predicted grades (see gradeAverages.ts).
      if (session?.user?.id) {
        const supabase = createClient();
        const weaknessTags = [...(data.missed ?? []), ...(data.misconceptions ?? [])].slice(0, 12);
        await supabase.from('exam_practice_attempts').insert({
          user_id: session.user.id,
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
    setDump('');
    setElapsed(0);
    setError('');
  };

  if (!subjectsLoading && subjects.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Blurting" description="Free-recall practice: write everything you know, then see what you missed." />
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Blurting"
        description="Brain-dump everything you know about a topic, then get an AI breakdown of what you nailed and what you missed."
      />

      {phase === 'result' && result ? (
        <div className="space-y-5">
          <section className="rounded-card border border-subtle bg-surface p-6 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-caption font-semibold uppercase tracking-[0.15em] text-content-subtle">Recall coverage</p>
                <p className="mt-1 text-3xl font-black text-content">{result.coverageScore}%</p>
              </div>
              <span className={`rounded-xl px-4 py-2 text-sm font-bold ${scoreBadgeTone(result.coverageScore)}`}>
                {result.coverageScore >= 80 ? 'Strong recall' : result.coverageScore >= 55 ? 'Solid start' : 'Keep building'}
              </span>
            </div>
            <p className="mt-3 text-body text-content-muted">{result.summary}</p>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-card border border-subtle bg-surface p-5 shadow-card">
              <h2 className="flex items-center gap-2 font-semibold text-content">
                <CheckCircle2 className="h-4 w-4 text-success" /> You recalled
              </h2>
              <ul className="mt-3 space-y-2">
                {result.covered.map((item, i) => (
                  <li key={i} className="flex gap-2 text-body text-content-muted">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-card border border-subtle bg-surface p-5 shadow-card">
              <h2 className="flex items-center gap-2 font-semibold text-content">
                <CircleAlert className="h-4 w-4 text-warning" /> You missed
              </h2>
              <ul className="mt-3 space-y-2">
                {result.missed.map((item, i) => (
                  <li key={i} className="flex gap-2 text-body text-content-muted">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {result.misconceptions.length > 0 && (
            <section className="rounded-card border border-subtle bg-danger-muted p-5">
              <h2 className="flex items-center gap-2 font-semibold text-danger">
                <Lightbulb className="h-4 w-4" /> Corrections
              </h2>
              <ul className="mt-3 space-y-2">
                {result.misconceptions.map((item, i) => (
                  <li key={i} className="text-body text-content-muted">{item}</li>
                ))}
              </ul>
            </section>
          )}

          <button type="button" onClick={reset} className={buttonStyles({ variant: 'primary' })}>
            <RotateCcw className="h-4 w-4" /> Blurt another topic
          </button>
        </div>
      ) : (
        <section className="space-y-4 rounded-card border border-subtle bg-surface p-6 shadow-card">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="blurt-subject">Subject</Label>
              <select
                id="blurt-subject"
                value={subjectIndex}
                onChange={(e) => setSubjectIndex(Number(e.target.value))}
                className={fieldStyles()}
                disabled={phase === 'reviewing'}
              >
                {subjects.map((s, i) => (
                  <option key={`${s.subject}-${i}`} value={i}>
                    {getSubjectLabel(s.subject)} · {s.exam_type === 'a-level' ? 'A-Level' : 'GCSE'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="blurt-topic">Topic</Label>
              <input
                id="blurt-topic"
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Enzymes, The Cold War, Trigonometry"
                className={fieldStyles()}
                disabled={phase === 'reviewing'}
              />
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <Label htmlFor="blurt-dump" className="mb-0">Write everything you can remember</Label>
              <span className="flex items-center gap-3 text-caption text-content-subtle">
                <span className="flex items-center gap-1">
                  <Timer className="h-3.5 w-3.5" /> {formatClock(elapsed)}
                </span>
                <span>{wordCount} words</span>
              </span>
            </div>
            <textarea
              id="blurt-dump"
              value={dump}
              onChange={(e) => setDump(e.target.value)}
              rows={12}
              placeholder="Don't look anything up. Dump every fact, definition, process, and example you can recall about this topic…"
              className={fieldStyles('resize-y font-normal leading-relaxed')}
              disabled={phase === 'reviewing'}
            />
          </div>

          {error && <Alert>{error}</Alert>}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={phase === 'reviewing'}
            className={buttonStyles({ variant: 'primary' })}
          >
            <Brain className="h-4 w-4" />
            {phase === 'reviewing' ? 'Reviewing your recall…' : 'Check my recall'}
          </button>
        </section>
      )}
    </div>
  );
}
