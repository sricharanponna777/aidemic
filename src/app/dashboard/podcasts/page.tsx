'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Headphones, Loader2, Radar, RotateCcw, Sparkles } from 'lucide-react';
import { SubjectSpecSelector, getSelectedSpecLabel } from '@/components/SubjectSpecSelector';
import { TopicInput } from '@/components/TopicInput';
import { buttonStyles } from '@/components/ui/button';
import { useUserSubjects } from '@/hooks/useUserSubjects';
import { useTopicOptions } from '@/hooks/useTopicOptions';
import { useSubtopicOptions } from '@/hooks/useSubtopicOptions';
import {
  getQualificationTopicError,
  isAllowedQualificationTopic,
} from '@/lib/ai/majorTopics';
import { getSubjectLabel, isSubjectSpecComplete } from '@/lib/ai/subjectConfig';
import { getTopicRelevanceError } from '@/lib/ai/topicRelevance';
import { PageHeader } from '@/components/ui/feedback';
import { Chip, MonoLabel, Panel, PanelHeading, StatusBar, Workspace, WorkspaceBody } from '@/components/ui/telemetry';
import type { GeneratedPodcast } from '@/types';

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
  const [subtopic, setSubtopic] = useState('');
  const [activePodcast, setActivePodcast] = useState<GeneratedPodcast | null>(null);
  const [history, setHistory] = useState<GeneratedPodcast[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const effectiveSubjectId = selectedSubjectId || subjects[0]?.id || '';
  const selectedSubject = subjects.find((subject) => subject.id === effectiveSubjectId) ?? null;
  const { topics: topicOptions, isLoading: topicsLoading } = useTopicOptions(selectedSubject, '', '', '');
  const topicSuggestions = topicOptions.map((option) => option.name);
  const selectedTopicOption = topicOptions.find((option) => option.name === topic.trim()) ?? null;
  const { subtopics: subtopicSuggestions } = useSubtopicOptions(selectedTopicOption?.id ?? null);
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
          subtopic: subtopic.trim() || undefined,
          examBoard: selectedSubject.exam_board,
          examType: selectedSubject.exam_type,
          specification,
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

  const reportColumn = (
    <>
      <PanelHeading icon={Radar} aside={history.length > 0 ? <Chip>{history.length} episodes</Chip> : null}>
        Episode history
      </PanelHeading>
      {history.length > 0 ? (
        <Panel className="p-0">
          <ul className="max-h-[32rem] divide-y divide-subtle overflow-y-auto">
            {history.map((podcast) => (
              <li key={podcast.id}>
                <button
                  type="button"
                  onClick={() => setActivePodcast(podcast)}
                  aria-current={activePodcast?.id === podcast.id ? 'true' : undefined}
                  className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-sunken ${
                    activePodcast?.id === podcast.id ? 'bg-accent-muted' : ''
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-content">
                      {podcast.topic}
                      {podcast.subtopic ? <span className="font-normal text-content-subtle"> · {podcast.subtopic}</span> : null}
                    </span>
                    <span className="mt-0.5 block font-mono text-[11px] text-content-subtle">{getSubjectLabel(podcast.subject)}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-content-subtle">
                    {new Date(podcast.created_at).toLocaleDateString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : (
        <Panel>
          <p className="text-sm font-semibold text-content">No episodes yet</p>
          <p className="mt-1 text-[13px] text-content-subtle">
            Each episode is a short conversation between a host and a guest about one topic, with a transcript.
          </p>
        </Panel>
      )}
    </>
  );

  return (
    <Workspace>
      <PageHeader
        className="border-b border-subtle"
        icon={Headphones}
        eyebrow="Learn / Audio"
        titleId="podcasts-title"
        title="Podcasts"
        description="Generate a short AI-narrated audio episode for any of your saved subjects."
        actions={
          <>
            <Chip>● Mode: audio episode</Chip>
            {activePodcast ? <Chip tone="success">{getSubjectLabel(activePodcast.subject)}</Chip> : null}
          </>
        }
      />

      <WorkspaceBody aside={reportColumn}>
        {!activePodcast ? (
          <form onSubmit={generatePodcast} className="flex flex-1 flex-col">
            <div className="flex-1 space-y-5 p-5">
              <SubjectSpecSelector
                subjects={subjects}
                isLoading={subjectsLoading}
                selectedSubjectId={effectiveSubjectId}
                onSubjectChange={(id) => {
                  setSelectedSubjectId(id);
                  setTopic('');
                  setSubtopic('');
                }}
              />

              <TopicInput
                label="Topic (optional)"
                value={topic}
                onChange={(value) => {
                  setTopic(value);
                  setSubtopic('');
                  setErrorMessage('');
                }}
                suggestions={topicSuggestions}
                isValidSelection={topicIsAllowed}
                placeholder="Start typing a topic, or leave blank to generalise"
              />

              {selectedTopicOption?.id && subtopicSuggestions.length > 0 ? (
                <TopicInput
                  label="Subtopic (optional)"
                  value={subtopic}
                  onChange={setSubtopic}
                  suggestions={subtopicSuggestions}
                  placeholder="Narrow the focus within this topic"
                />
              ) : null}

              {validationMessage ? (
                <p className={`text-xs ${errorMessage || subjectsError ? 'text-danger' : 'text-warning'}`}>{validationMessage}</p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-subtle p-4">
              <p className="font-mono text-xs text-content-subtle max-sm:hidden">A few minutes long, with a transcript</p>
              <button type="submit" disabled={!canGenerate} className={buttonStyles({ variant: 'primary', className: 'max-sm:w-full' })}>
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {isGenerating ? 'Generating podcast...' : 'Create podcast'}
              </button>
            </div>
          </form>
        ) : (
          <>
            <StatusBar className="justify-between">
              <span className="min-w-0 truncate">
                {getSubjectLabel(activePodcast.subject)} ·{' '}
                <span className="font-semibold text-content">
                  {activePodcast.topic}
                  {activePodcast.subtopic ? ` · ${activePodcast.subtopic}` : ''}
                </span>
              </span>
              <button type="button" onClick={reset} className="flex items-center gap-1.5 transition-colors hover:text-content">
                <RotateCcw className="h-3.5 w-3.5" />
                New podcast
              </button>
            </StatusBar>

            <div className="border-b border-subtle p-5">
              <MonoLabel className="mb-2">Episode</MonoLabel>
              <audio controls src={activePodcast.audio_url} className="w-full" />
            </div>

            <article className="flex-1 p-5">
              <PanelHeading>Transcript</PanelHeading>
              <div className="mt-4 space-y-3">
                {parseDialogueTurns(activePodcast.script_content).map((turn, index) => (
                  <div
                    key={index}
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                      turn.speaker === 'HOST' ? 'bg-accent text-accent-fg' : 'ml-auto bg-surface-sunken text-content'
                    }`}
                  >
                    <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] opacity-70">
                      {turn.speaker === 'HOST' ? 'Host' : 'Guest'}
                    </p>
                    <p className="mt-0.5">{turn.text}</p>
                  </div>
                ))}
              </div>
            </article>
          </>
        )}
      </WorkspaceBody>
    </Workspace>
  );
}
