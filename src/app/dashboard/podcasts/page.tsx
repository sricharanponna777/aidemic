'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Headphones, Loader2, RotateCcw, Sparkles } from 'lucide-react';
import { SubjectSpecSelector, getSelectedSpecLabel } from '@/components/SubjectSpecSelector';
import { TopicInput } from '@/components/TopicInput';
import { buttonStyles } from '@/components/ui/button';
import { useUserSubjects } from '@/hooks/useUserSubjects';
import { useTopicOptions } from '@/hooks/useTopicOptions';
import {
  getQualificationTopicError,
  isAllowedQualificationTopic,
} from '@/lib/ai/majorTopics';
import { getSubjectLabel, isSubjectSpecComplete } from '@/lib/ai/subjectConfig';
import { getTopicRelevanceError } from '@/lib/ai/topicRelevance';
import { RevisionCycleStepper } from '@/components/RevisionCycleStepper';
import type { GeneratedPodcast } from '@/types';

type PodcastLength = 'short' | 'medium' | 'long';

const LENGTH_OPTIONS: { value: PodcastLength; label: string; hint: string }[] = [
  { value: 'short', label: 'Short', hint: '~1 min' },
  { value: 'medium', label: 'Medium', hint: '~2-3 min' },
  { value: 'long', label: 'Long', hint: '~5 min' },
];

type DialogueTurn = { speaker: 'HOST' | 'GUEST'; text: string };

function parseDialogueTurns(script: string): DialogueTurn[] {
  return script
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(HOST|GUEST):\s*(.+)$/);
      if (!match) return null;
      const [, speaker, text] = match;
      return { speaker: speaker as DialogueTurn['speaker'], text: text.trim() };
    })
    .filter((turn): turn is DialogueTurn => !!turn && turn.text.length > 0);
}

export default function PodcastsPage() {
  const { subjects, isLoading: subjectsLoading, error: subjectsError } = useUserSubjects();
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [topic, setTopic] = useState('');
  const [length, setLength] = useState<PodcastLength>('medium');
  const [activePodcast, setActivePodcast] = useState<GeneratedPodcast | null>(null);
  const [history, setHistory] = useState<GeneratedPodcast[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const effectiveSubjectId = selectedSubjectId || subjects[0]?.id || '';
  const selectedSubject = subjects.find((subject) => subject.id === effectiveSubjectId) ?? null;
  const { topics: topicOptions, isLoading: topicsLoading } = useTopicOptions(selectedSubject, '', '', '');
  const topicSuggestions = topicOptions.map((option) => option.name);
  const topicIsAllowed = !topic.trim() || topicsLoading || isAllowedQualificationTopic(topic, topicSuggestions);
  const subjectSpecComplete = isSubjectSpecComplete(selectedSubject);
  const canGenerate = topicIsAllowed && !topicsLoading && !!selectedSubject && subjectSpecComplete && !isGenerating;

  const validationMessage = subjectsError
    || errorMessage
    || (!selectedSubject ? 'Choose one of your saved subjects.' : '')
    || (!subjectSpecComplete ? 'Update this subject on the Subjects page with its specification and tier.' : '')
    || (topicsLoading ? 'Loading topics for this qualification...' : '')
    || (!topicIsAllowed ? 'Choose one of the suggested topics for this qualification.' : '');

  useEffect(() => {
    let cancelled = false;
    const loadHistory = async () => {
      try {
        const response = await fetch('/api/ai/generate-podcast');
        const body = await response.json();
        if (!cancelled && response.ok) setHistory(body.podcasts || []);
      } catch {
        // history is a nice-to-have; ignore failures silently
      }
    };
    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, []);

  const generatePodcast = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedSubject || !subjectSpecComplete) return;

    const specification = getSelectedSpecLabel(selectedSubject);
    if (topic.trim()) {
      const topicError = getQualificationTopicError(topic.trim(), topicSuggestions);
      if (topicError) return;
      const relevanceError = getTopicRelevanceError({
        topic: topic.trim(),
        subject: selectedSubject.subject,
        examBoard: selectedSubject.exam_board,
        examType: selectedSubject.exam_type,
        specification,
      });
      if (relevanceError) {
        setErrorMessage(relevanceError);
        return;
      }
    }

    setIsGenerating(true);
    setErrorMessage('');

    try {
      const response = await fetch('/api/ai/generate-podcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: selectedSubject.subject,
          topic: topic.trim() || undefined,
          examBoard: selectedSubject.exam_board,
          examType: selectedSubject.exam_type,
          specification,
          length,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setErrorMessage(body.error || 'Failed to generate podcast.');
        return;
      }
      setActivePodcast(body.podcast);
      setHistory((prev) => [body.podcast, ...prev]);
    } catch {
      setErrorMessage('Network error while generating the podcast.');
    } finally {
      setIsGenerating(false);
    }
  };

  const reset = () => {
    setActivePodcast(null);
    setErrorMessage('');
  };

  return (
    <main className="space-y-7" aria-labelledby="podcasts-title">
      <RevisionCycleStepper current="learn" />

      <section className="rounded-2xl border border-slate-200 bg-linear-to-br from-indigo-50 to-white p-6 shadow-[0_20px_40px_-36px_rgba(15,23,42,0.8)] dark:border-white/6 dark:from-[#131B2E] dark:to-[#0d1424] dark:shadow-[0_24px_48px_-30px_rgba(2,6,23,0.95)]">
        <div className="flex items-center gap-3">
          <Headphones className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
          <h1 id="podcasts-title" className="text-3xl font-bold text-slate-900 dark:text-white">Podcasts</h1>
        </div>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Generate a short AI-narrated audio episode for any of your saved subjects.
        </p>
      </section>

      {!activePodcast ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E] dark:shadow-none">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Create a podcast</h2>
          <form onSubmit={generatePodcast} className="mt-5 space-y-5">
            <SubjectSpecSelector
              subjects={subjects}
              isLoading={subjectsLoading}
              selectedSubjectId={effectiveSubjectId}
              onSubjectChange={(id) => {
                setSelectedSubjectId(id);
                setTopic('');
              }}
            />

            <TopicInput
              label="Topic (optional)"
              value={topic}
              onChange={(value) => {
                setTopic(value);
                setErrorMessage('');
              }}
              suggestions={topicSuggestions}
              isValidSelection={topicIsAllowed}
              placeholder="Start typing a topic, or leave blank to generalise"
            />

            <div>
              <p className="block text-sm font-medium text-slate-700 dark:text-slate-300">Length</p>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {LENGTH_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setLength(option.value)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                      length === option.value
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-500/15 dark:text-indigo-300'
                        : 'border-slate-300 text-slate-600 hover:border-indigo-300 dark:border-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {option.label}
                    <span className="block text-xs font-normal opacity-70">{option.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            {validationMessage ? (
              <p className={`text-xs ${errorMessage || subjectsError ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-300'}`}>
                {validationMessage}
              </p>
            ) : null}

            <button type="submit" disabled={!canGenerate} className={buttonStyles({ variant: 'primary', size: 'lg' })}>
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {isGenerating ? 'Generating podcast...' : 'Create podcast'}
            </button>
          </form>
        </section>
      ) : (
        <section className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E] dark:shadow-none">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Podcast</p>
                <p className="mt-0.5 text-lg font-semibold text-slate-900 dark:text-slate-100">{activePodcast.topic}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{getSubjectLabel(activePodcast.subject)}</p>
              </div>
              <button type="button" onClick={reset} className={buttonStyles({ variant: 'secondary', size: 'sm', className: 'shrink-0' })}>
                <RotateCcw className="h-3.5 w-3.5" />
                New podcast
              </button>
            </div>
            <audio controls src={activePodcast.audio_url} className="mt-4 w-full" />
          </div>

          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E] dark:shadow-none">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Transcript</h2>
            <div className="mt-4 space-y-3">
              {parseDialogueTurns(activePodcast.script_content).map((turn, index) => (
                <div
                  key={index}
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                    turn.speaker === 'HOST'
                      ? 'bg-linear-to-r from-indigo-600/90 to-purple-600/90 text-white'
                      : 'ml-auto bg-slate-100 text-slate-800 dark:bg-white/8 dark:text-slate-100'
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
                    {turn.speaker === 'HOST' ? 'Host' : 'Guest'}
                  </p>
                  <p className="mt-0.5">{turn.text}</p>
                </div>
              ))}
            </div>
          </article>
        </section>
      )}

      {history.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E] dark:shadow-none">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">History</h2>
          <ul className="mt-4 divide-y divide-slate-100 dark:divide-white/6">
            {history.map((podcast) => (
              <li key={podcast.id}>
                <button
                  type="button"
                  onClick={() => setActivePodcast(podcast)}
                  className="flex w-full items-center justify-between gap-3 py-3 text-left text-sm hover:text-indigo-600 dark:hover:text-indigo-400"
                >
                  <span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">{podcast.topic}</span>
                    <span className="ml-2 text-slate-500 dark:text-slate-400">{getSubjectLabel(podcast.subject)}</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                    {new Date(podcast.created_at).toLocaleDateString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
