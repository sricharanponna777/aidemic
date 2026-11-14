'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { BookOpen, CheckCircle2, Loader2, MessageCircle, Radar, RotateCcw, Send, Sparkles, Target, XCircle } from 'lucide-react';
import { MarkdownContent } from '@/components/MarkdownContent';
import { SearchSelect } from '@/components/SearchSelect';
import { SubjectSpecSelector, getSelectedSpecLabel } from '@/components/SubjectSpecSelector';
import { TopicInput } from '@/components/TopicInput';
import { buttonStyles } from '@/components/ui/button';
import { useUserSubjects } from '@/hooks/useUserSubjects';
import { useTopicOptions } from '@/hooks/useTopicOptions';
import { useSubtopicOptions } from '@/hooks/useSubtopicOptions';
import { useLearningObjectives } from '@/hooks/useLearningObjectives';
import {
  buildLiteratureCreationOption,
  getPoetryClusterPoems,
  getQualificationTopicError,
  isAllowedQualificationTopic,
  isPoetryCluster,
} from '@/lib/ai/majorTopics';
import {
  getCreationOptionChoices,
  getCreationOptionLabel,
  getExamBoardLabel,
  getExamTypeLabel,
  getPaperOptions,
  getSubjectLabel,
  isSubjectSpecComplete,
  type UserSubject,
} from '@/lib/ai/subjectConfig';
import { getTopicRelevanceError } from '@/lib/ai/topicRelevance';
import { cachedAiFetch } from '@/lib/aiCache';
import { PageHeader } from '@/components/ui/feedback';
import { fieldStyles } from '@/components/ui/field';
import { Chip, MonoLabel, Panel, PanelHeading, StatusBar, Workspace, WorkspaceBody } from '@/components/ui/telemetry';
// GAMIFICATION PAUSED: import { announceXp } from '@/lib/gamification/client';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const SS_TOPIC = 'notes-active-topic';
const SS_SUBJECT = 'notes-active-subject';
const SS_NOTES = 'notes-content';
const SS_CHECKPOINTS = 'notes-checkpoints';
const SS_CHAT = 'notes-chat-messages';

function ssRead<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw !== null ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function ssWrite(key: string, value: unknown) {
  try {
    if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, JSON.stringify(value));
    }
  } catch {}
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

type CheckQuestion = {
  itemId: string;
  subtopicName: string;
  question: string;
  options: string[];
};

type CheckResult = { correct: boolean; correctOption: string; explanation: string };

/**
 * One server-marked question on the topic under discussion.
 *
 * A chat has no ground truth — the tutor is agreeable by construction, so
 * grading mastery from the transcript would be inventing a signal rather than
 * measuring one. Asking a question the server stores and marks itself turns the
 * conversation into real evidence, and reuses the machinery Daily Review already
 * built for exactly that problem (see review_queue_items). The evidence lands as
 * `tutor`, which EVIDENCE_WEIGHTS prices below marked exam practice.
 */
function UnderstandingCheck({ topicId }: { topicId: string | null }) {
  const [question, setQuestion] = useState<CheckQuestion | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [selected, setSelected] = useState<string>('');
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!topicId) return null;

  const start = async () => {
    setIsBusy(true);
    setErrorMessage('');
    setQuestion(null);
    setResult(null);
    setSelected('');

    try {
      const response = await fetch('/api/review-queue/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId, source: 'tutor' }),
      });
      const body = await response.json();
      if (!response.ok) {
        setErrorMessage(body.error || 'Could not build a question.');
        return;
      }
      setQuestion({
        itemId: body.itemId,
        subtopicName: body.subtopicName ?? '',
        question: body.question?.question ?? '',
        options: body.question?.options ?? [],
      });
    } catch {
      setErrorMessage('Network error while building your question.');
    } finally {
      setIsBusy(false);
    }
  };

  const answer = async (letter: string) => {
    if (!question || result) return;
    setSelected(letter);
    setIsBusy(true);

    try {
      const response = await fetch('/api/review-queue/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: question.itemId, selectedOption: letter }),
      });
      const body = await response.json();
      if (!response.ok) {
        setSelected('');
        setErrorMessage(body.error || 'Could not mark your answer.');
        return;
      }
      setResult(body as CheckResult);
      // GAMIFICATION PAUSED: announceXp(body.xp);
    } catch {
      setSelected('');
      setErrorMessage('Network error while marking your answer.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="mt-4 border-t border-subtle pt-4">
      {!question ? (
        <>
          <button
            type="button"
            onClick={() => void start()}
            disabled={isBusy}
            className={buttonStyles({ variant: 'secondary', size: 'sm', className: 'w-full justify-center' })}
          >
            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
            {isBusy ? 'Writing a question…' : 'Check my understanding'}
          </button>
          {errorMessage ? <p className="mt-2 text-sm text-danger">{errorMessage}</p> : null}
        </>
      ) : (
        <div className="space-y-3">
          {question.subtopicName ? (
            <MonoLabel>{question.subtopicName}</MonoLabel>
          ) : null}
          <MarkdownContent content={question.question} className="text-sm text-content" />

          <div className="space-y-2">
            {question.options.map((option, index) => {
              const letter = OPTION_LETTERS[index];
              const isChosen = selected === letter;
              const isKey = result?.correctOption === letter;
              const tone = !result
                ? isChosen
                  ? 'border-accent bg-accent-muted'
                  : 'border-subtle bg-surface hover:border-strong'
                : isKey
                  ? 'border-success bg-success-muted'
                  : isChosen
                    ? 'border-danger bg-danger-muted'
                    : 'border-subtle bg-surface opacity-70';

              return (
                <button
                  key={letter}
                  type="button"
                  disabled={isBusy || !!result}
                  onClick={() => void answer(letter)}
                  className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm text-content transition disabled:cursor-default ${tone}`}
                >
                  <span className="font-mono font-semibold">{letter}</span>
                  <MarkdownContent inline className="min-w-0 flex-1" content={option} />
                </button>
              );
            })}
          </div>

          {result ? (
            <div className="space-y-2">
              <p
                className={`inline-flex items-center gap-1.5 text-sm font-semibold ${
                  result.correct ? 'text-success' : 'text-danger'
                }`}
              >
                {result.correct ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {result.correct ? 'Correct' : 'Not quite'}
              </p>
              {result.explanation ? (
                <MarkdownContent content={result.explanation} className="text-sm text-content-muted" />
              ) : null}
              <button
                type="button"
                onClick={() => void start()}
                disabled={isBusy}
                className={buttonStyles({ variant: 'secondary', size: 'sm', className: 'w-full justify-center' })}
              >
                <RotateCcw className="h-4 w-4" />
                Ask me another
              </button>
            </div>
          ) : null}

          {errorMessage ? <p className="text-sm text-danger">{errorMessage}</p> : null}
        </div>
      )}
    </div>
  );
}

function StudyChat({
  concept,
  topicId,
  subject,
  examBoard,
  examType,
  messages,
  setMessages,
}: {
  concept: string;
  /** The curriculum topic these notes came from, when it resolved to one. */
  topicId: string | null;
  subject: string;
  examBoard: string;
  examType: string;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}) {
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const starterPrompts = useMemo(
    () => [
      `Explain ${concept} in simpler terms`,
      'Give me a quick example',
      'What should I memorise?',
    ],
    [concept]
  );

  const sendMessage = async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || isSending) return;

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextMessages);
    setDraft('');
    setIsSending(true);
    setErrorMessage('');

    try {
      const response = await cachedAiFetch('/api/ai/study-chat', {
        concept,
        subject,
        examBoard,
        examType,
        mode: 'notes',
        messages: nextMessages,
      });
      const body = await response.json();
      if (!response.ok) {
        setErrorMessage(body.error || 'Study chat failed.');
        return;
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: body.reply || '' }]);
    } catch {
      setErrorMessage('Network error while contacting the study chat.');
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void sendMessage(draft);
  };

  return (
    <Panel>
      <PanelHeading icon={MessageCircle}>Study chat</PanelHeading>
      <p className="mt-1 text-[13px] text-content-subtle">Ask for a simpler explanation, example, or quick check.</p>

      <div className="mt-4 space-y-3">
        {messages.length === 0 ? (
          <div className="space-y-2">
            {starterPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => void sendMessage(prompt)}
                className={buttonStyles({ variant: 'secondary', size: 'sm', className: 'w-full justify-start text-left font-medium' })}
              >
                {prompt}
              </button>
            ))}
          </div>
        ) : (
          <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`rounded-xl px-3 py-2 text-sm ${
                  message.role === 'user'
                    ? 'ml-6 bg-accent text-accent-fg'
                    : 'mr-6 bg-surface-sunken text-content'
                }`}
              >
                <MarkdownContent content={message.content} />
              </div>
            ))}
            {isSending ? (
              <div className="mr-6 inline-flex items-center gap-2 rounded-xl bg-surface-sunken px-3 py-2 font-mono text-xs text-content-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                Thinking...
              </div>
            ) : null}
          </div>
        )}
      </div>

      {errorMessage ? <p className="mt-3 text-sm text-danger">{errorMessage}</p> : null}

      <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask a follow-up..."
          className={fieldStyles('min-w-0 flex-1')}
        />
        <button
          type="submit"
          disabled={!draft.trim() || isSending}
          className={buttonStyles({ variant: 'primary', size: 'icon' })}
          aria-label="Send message"
        >
          {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>

      <UnderstandingCheck topicId={topicId} />
    </Panel>
  );
}

export default function NotesPage() {
  const { subjects, isLoading: subjectsLoading, error: subjectsError } = useUserSubjects();
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [specOption, setSpecOption] = useState('');
  const [poemOne, setPoemOne] = useState('');
  const [poemTwo, setPoemTwo] = useState('');
  const [topic, setTopic] = useState('');
  const [subtopic, setSubtopic] = useState('');
  const [learningObjective, setLearningObjective] = useState('');
  const [paper, setPaper] = useState('');
  const [activeTopic, setActiveTopic] = useState(() => ssRead(SS_TOPIC, ''));
  const [activeSubject, setActiveSubject] = useState<UserSubject | null>(() => ssRead<UserSubject | null>(SS_SUBJECT, null));
  const [notes, setNotes] = useState(() => ssRead(SS_NOTES, ''));
  const [checkpoints, setCheckpoints] = useState<string[]>(() => ssRead<string[]>(SS_CHECKPOINTS, []));
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => ssRead<ChatMessage[]>(SS_CHAT, []));
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => { ssWrite(SS_TOPIC, activeTopic); }, [activeTopic]);
  useEffect(() => { ssWrite(SS_SUBJECT, activeSubject); }, [activeSubject]);
  useEffect(() => { ssWrite(SS_NOTES, notes); }, [notes]);
  useEffect(() => { ssWrite(SS_CHECKPOINTS, checkpoints); }, [checkpoints]);
  useEffect(() => { ssWrite(SS_CHAT, chatMessages); }, [chatMessages]);

  const effectiveSubjectId = selectedSubjectId || subjects[0]?.id || '';
  const selectedSubject = subjects.find((subject) => subject.id === effectiveSubjectId) ?? null;
  const creationOptions = getCreationOptionChoices(selectedSubject);
  const creationOptionLabel = getCreationOptionLabel(selectedSubject);
  const poetryPoems = getPoetryClusterPoems(specOption);
  const isSelectedPoetryCluster = isPoetryCluster(specOption);
  const effectiveCreationOption = buildLiteratureCreationOption(specOption, poemOne, poemTwo);
  const { topics: topicOptions, isLoading: topicsLoading } = useTopicOptions(selectedSubject, specOption, poemOne, poemTwo);
  const topicSuggestions = topicOptions.map((option) => option.name);
  const selectedTopicOption = topicOptions.find((option) => option.name === topic.trim()) ?? null;
  // Resolved against the notes on screen, not the form field: the two diverge as
  // soon as a student edits the topic without regenerating, and Study Chat must
  // check understanding of what it is actually discussing.
  const activeTopicOption = topicOptions.find((option) => option.name === activeTopic) ?? null;
  const { subtopics: subtopicSuggestions } = useSubtopicOptions(selectedTopicOption?.id ?? null);
  const { objectives: learningObjectiveOptions } = useLearningObjectives(selectedSubject, 'notes');
  const paperOptions = getPaperOptions(selectedSubject);
  const topicIsAllowed = !topic.trim() || topicsLoading || isAllowedQualificationTopic(topic, topicSuggestions);
  const subjectSpecComplete = isSubjectSpecComplete(selectedSubject);
  const poetrySelectionComplete = !isSelectedPoetryCluster || !!poemOne;
  const topicIsReady = topic.trim().length === 0 || topic.trim().length >= 3;
  const canGenerate = topicIsReady && topicIsAllowed && !topicsLoading && poetrySelectionComplete && !!selectedSubject && subjectSpecComplete && !isGenerating;
  const validationMessage = subjectsError
    || errorMessage
    || (!selectedSubject ? 'Choose one of your saved subjects.' : '')
    || (!subjectSpecComplete ? 'Update this subject on the Subjects page with its specification and tier.' : '')
    || (!poetrySelectionComplete ? 'Choose the first poem for this poetry cluster.' : '')
    || (topicsLoading ? 'Loading topics for this qualification...' : '')
    || (!topicIsReady ? 'Topic must be at least 3 characters, or leave it blank to generalise.' : '')
    || (!topicIsAllowed ? 'Choose one of the suggested topics for this qualification.' : '');

  const generateNotes = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedSubject || !topicIsReady || !subjectSpecComplete) return;

    if (!poetrySelectionComplete) return;

    const specification = getSelectedSpecLabel(selectedSubject, effectiveCreationOption);
    if (topic.trim()) {
      const topicError = getQualificationTopicError(topic.trim(), topicSuggestions);
      if (topicError) {
        setErrorMessage('');
        return;
      }
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
      const response = await cachedAiFetch('/api/ai/generate-notes', {
        concept: topic.trim(),
        subtopic: subtopic.trim() || undefined,
        learningObjective: learningObjective || undefined,
        paper: paper || undefined,
        subject: selectedSubject.subject,
        examBoard: selectedSubject.exam_board,
        examType: selectedSubject.exam_type,
        specification,
        duration: '120',
        mode: 'notes',
      });
      const body = await response.json();
      if (!response.ok) {
        setErrorMessage(body.error || 'Failed to generate notes.');
        return;
      }
      setActiveTopic(topic.trim() || 'General revision');
      setActiveSubject(selectedSubject);
      setNotes(body.script || '');
      setCheckpoints(Array.isArray(body.slides) ? body.slides.filter((slide: unknown): slide is string => typeof slide === 'string' && slide.trim().length > 0) : []);
      setChatMessages([]);
    } catch {
      setErrorMessage('Network error while generating notes.');
    } finally {
      setIsGenerating(false);
    }
  };

  const reset = () => {
    setActiveTopic('');
    setActiveSubject(null);
    setNotes('');
    setCheckpoints([]);
    setChatMessages([]);
    setErrorMessage('');
  };

  const reportColumn = activeTopic ? (
    <>
      <PanelHeading icon={Radar}>Study tools</PanelHeading>
      {activeSubject ? (
        <StudyChat
          concept={activeTopic}
          topicId={activeTopicOption?.id ?? null}
          subject={activeSubject.subject}
          examBoard={activeSubject.exam_board}
          examType={activeSubject.exam_type}
          messages={chatMessages}
          setMessages={setChatMessages}
        />
      ) : null}
    </>
  ) : (
    <>
      <PanelHeading icon={Radar}>Study tools</PanelHeading>
      <Panel>
        <p className="text-sm font-semibold text-content">Your notes come with</p>
        <ul className="mt-2 space-y-1.5 text-[13px] text-content-subtle">
          <li>Notes written to your exam board&apos;s specification</li>
          <li>Recall checkpoints to test yourself</li>
          <li>A study chat for follow-up questions</li>
          <li>Quick questions to check you understood</li>
        </ul>
      </Panel>
      <Panel>
        <p className="text-sm font-semibold text-content">Then</p>
        <p className="mt-1 text-[13px] text-content-subtle">
          Turn what you learned into{' '}
          <Link href="/dashboard/flashcards" className="font-semibold text-accent hover:underline">
            flashcards
          </Link>{' '}
          or test it with{' '}
          <Link href="/dashboard/blurt" className="font-semibold text-accent hover:underline">
            blurting
          </Link>
          .
        </p>
      </Panel>
    </>
  );

  return (
    <Workspace>
      <PageHeader
        className="border-b border-subtle"
        icon={BookOpen}
        eyebrow="Learn / Study notes"
        titleId="notes-title"
        title="Learn"
        description="Generate focused study notes from one of your saved subjects."
        actions={
          <>
            <Chip>● Mode: study notes</Chip>
            {activeSubject ? (
              <Chip tone="success">
                {getExamBoardLabel(activeSubject.exam_board)} {getExamTypeLabel(activeSubject.exam_type)}
              </Chip>
            ) : null}
          </>
        }
      />

      <WorkspaceBody aside={reportColumn}>
      {!activeTopic ? (
        <form onSubmit={generateNotes} className="flex flex-1 flex-col">
          <div className="flex-1 space-y-5 p-5">
            <SubjectSpecSelector
              subjects={subjects}
              isLoading={subjectsLoading}
              selectedSubjectId={effectiveSubjectId}
              onSubjectChange={(id) => {
                setSelectedSubjectId(id);
                setSpecOption('');
                setPoemOne('');
                setPoemTwo('');
                setTopic('');
                setSubtopic('');
                setLearningObjective('');
                setPaper('');
              }}
            />

            {creationOptions.length > 0 ? (
              <SearchSelect
                label={creationOptionLabel}
                value={specOption}
                onChange={(value) => {
                    setSpecOption(value);
                    setPoemOne('');
                    setPoemTwo('');
                    setTopic('');
                    setSubtopic('');
                }}
                options={[
                  { value: '', label: `Any ${creationOptionLabel.toLowerCase()}` },
                  ...creationOptions.map((option) => ({ value: option, label: option })),
                ]}
                placeholder={`Search ${creationOptionLabel.toLowerCase()}...`}
              />
            ) : null}

            {isSelectedPoetryCluster ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <MonoLabel className="mb-1">First poem</MonoLabel>
                  <select
                    value={poemOne}
                    onChange={(event) => {
                      setPoemOne(event.target.value);
                      setTopic('');
                      setSubtopic('');
                      if (event.target.value === poemTwo) setPoemTwo('');
                    }}
                    className={fieldStyles()}
                  >
                    <option value="">Select first poem</option>
                    {poetryPoems.map((poem) => (
                      <option key={poem} value={poem}>{poem}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <MonoLabel className="mb-1">Second poem (optional)</MonoLabel>
                  <select
                    value={poemTwo}
                    onChange={(event) => {
                      setPoemTwo(event.target.value);
                      setTopic('');
                      setSubtopic('');
                    }}
                    disabled={!poemOne}
                    className={fieldStyles()}
                  >
                    <option value="">No comparison poem</option>
                    {poetryPoems.filter((poem) => poem !== poemOne).map((poem) => (
                      <option key={poem} value={poem}>{poem}</option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            <TopicInput
              label="Topic / concept (optional)"
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

            {learningObjectiveOptions.length > 0 ? (
              <label className="block">
                <MonoLabel className="mb-1">Learning objective (optional)</MonoLabel>
                <select
                  value={learningObjective}
                  onChange={(event) => setLearningObjective(event.target.value)}
                  className={fieldStyles()}
                >
                  <option value="">No specific focus</option>
                  {learningObjectiveOptions.map((objective) => (
                    <option key={objective} value={objective}>{objective}</option>
                  ))}
                </select>
              </label>
            ) : null}

            {paperOptions.length > 0 ? (
              <label className="block">
                <MonoLabel className="mb-1">Paper (optional)</MonoLabel>
                <select
                  value={paper}
                  onChange={(event) => setPaper(event.target.value)}
                  className={fieldStyles()}
                >
                  <option value="">General (any paper)</option>
                  {paperOptions.map((paperOption) => (
                    <option key={paperOption} value={paperOption}>{paperOption}</option>
                  ))}
                </select>
              </label>
            ) : null}

            {validationMessage ? (
              <p className={`text-xs ${errorMessage || subjectsError ? 'text-danger' : 'text-warning'}`}>
                {validationMessage}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-subtle p-4">
            <div className="flex flex-wrap gap-4 font-mono text-xs text-content-subtle max-sm:hidden">
              <Link href="/dashboard/subjects" className="transition-colors hover:text-content">
                ← Subjects
              </Link>
              <Link href="/dashboard/flashcards" className="transition-colors hover:text-content">
                Flashcards →
              </Link>
            </div>
            <button type="submit" disabled={!canGenerate} className={buttonStyles({ variant: 'primary', className: 'max-sm:w-full' })}>
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {isGenerating ? 'Generating notes...' : 'Create study notes'}
            </button>
          </div>
        </form>
      ) : (
        <>
          <StatusBar className="justify-between">
            <span className="min-w-0 truncate">
              {activeSubject ? `${getSubjectLabel(activeSubject.subject)} · ` : ''}
              <span className="font-semibold text-content">{activeTopic}</span>
            </span>
            <button type="button" onClick={reset} className="flex items-center gap-1.5 transition-colors hover:text-content">
              <RotateCcw className="h-3.5 w-3.5" />
              Change topic
            </button>
          </StatusBar>

          <div className="flex-1 space-y-5 p-5">
            <article>
              <h2 className="sr-only">Study notes: {activeTopic}</h2>
              {notes ? (
                <MarkdownContent className="prose prose-slate max-w-none dark:prose-invert" content={notes} />
              ) : (
                <p className="text-sm text-content-subtle">No notes were returned.</p>
              )}
            </article>
            {checkpoints.length > 0 ? (
              <section className="rounded-lg border border-subtle bg-surface-sunken p-5">
                <PanelHeading icon={Sparkles}>Recall checkpoints</PanelHeading>
                <p className="mt-1 text-xs text-content-subtle">Quick self-test prompts drawn from these notes.</p>
                <ol className="mt-4 space-y-2">
                  {checkpoints.map((checkpoint, index) => (
                    <li key={index} className="flex gap-3 rounded-lg border border-subtle bg-surface p-3">
                      <span className="mt-0.5 w-6 shrink-0 font-mono text-xs text-content-subtle">{String(index + 1).padStart(2, '0')}</span>
                      <MarkdownContent className="prose prose-sm prose-slate max-w-none dark:prose-invert" content={checkpoint} />
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </div>
        </>
      )}
      </WorkspaceBody>
    </Workspace>
  );
}
