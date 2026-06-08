'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Brain, Loader2, MessageCircle, RotateCcw, Send, Sparkles } from 'lucide-react';
import { MarkdownContent } from '@/components/MarkdownContent';
import { SearchSelect } from '@/components/SearchSelect';
import { SubjectSpecSelector, getSelectedSpecLabel } from '@/components/SubjectSpecSelector';
import { TopicInput } from '@/components/TopicInput';
import { buttonStyles } from '@/components/ui/button';
import { useUserSubjects } from '@/hooks/useUserSubjects';
import {
  buildLiteratureCreationOption,
  getPoetryClusterPoems,
  getQualificationTopicError,
  getMajorTopicsForSubject,
  isAllowedQualificationTopic,
  isPoetryCluster,
} from '@/lib/ai/majorTopics';
import {
  getCreationOptionChoices,
  getCreationOptionLabel,
  getExamBoardLabel,
  getExamTypeLabel,
  getSubjectLabel,
  isSubjectSpecComplete,
  type UserSubject,
} from '@/lib/ai/subjectConfig';
import { getTopicRelevanceError } from '@/lib/ai/topicRelevance';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

function StudyChat({
  concept,
  subject,
  examBoard,
  examType,
}: {
  concept: string;
  subject: string;
  examBoard: string;
  examType: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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
      const response = await fetch('/api/ai/study-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept,
          subject,
          examBoard,
          examType,
          mode: 'notes',
          messages: nextMessages,
        }),
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
    <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/6 dark:bg-[#131B2E]">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-indigo-100 p-2 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
          <MessageCircle className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">Study Chat</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Ask for a simpler explanation, example, or quick check.
          </p>
        </div>
      </div>

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
                    ? 'ml-6 bg-linear-to-r from-indigo-600 to-purple-600 text-white'
                    : 'mr-6 bg-slate-100 text-slate-800 dark:bg-white/8 dark:text-slate-100'
                }`}
              >
                <MarkdownContent content={message.content} />
              </div>
            ))}
            {isSending ? (
              <div className="mr-6 inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-600 dark:bg-white/8 dark:text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                Thinking...
              </div>
            ) : null}
          </div>
        )}
      </div>

      {errorMessage ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{errorMessage}</p> : null}

      <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask a follow-up..."
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100"
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
    </aside>
  );
}

export default function NotesPage() {
  const { subjects, isLoading: subjectsLoading, error: subjectsError } = useUserSubjects();
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [specOption, setSpecOption] = useState('');
  const [poemOne, setPoemOne] = useState('');
  const [poemTwo, setPoemTwo] = useState('');
  const [topic, setTopic] = useState('');
  const [activeTopic, setActiveTopic] = useState('');
  const [activeSubject, setActiveSubject] = useState<UserSubject | null>(null);
  const [notes, setNotes] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const effectiveSubjectId = selectedSubjectId || subjects[0]?.id || '';
  const selectedSubject = subjects.find((subject) => subject.id === effectiveSubjectId) ?? null;
  const creationOptions = getCreationOptionChoices(selectedSubject);
  const creationOptionLabel = getCreationOptionLabel(selectedSubject);
  const poetryPoems = getPoetryClusterPoems(specOption);
  const isSelectedPoetryCluster = isPoetryCluster(specOption);
  const effectiveCreationOption = buildLiteratureCreationOption(specOption, poemOne, poemTwo);
  const topicSuggestions = getMajorTopicsForSubject(selectedSubject, specOption, poemOne, poemTwo);
  const topicIsAllowed = !topic.trim() || isAllowedQualificationTopic(topic, topicSuggestions);
  const subjectSpecComplete = isSubjectSpecComplete(selectedSubject);
  const poetrySelectionComplete = !isSelectedPoetryCluster || !!poemOne;
  const canGenerate = topic.trim().length >= 3 && topicIsAllowed && poetrySelectionComplete && !!selectedSubject && subjectSpecComplete && !isGenerating;
  const validationMessage = subjectsError
    || errorMessage
    || (!selectedSubject ? 'Choose one of your saved subjects.' : '')
    || (!subjectSpecComplete ? 'Update this subject on the Subjects page with its specification and tier.' : '')
    || (!poetrySelectionComplete ? 'Choose the first poem for this poetry cluster.' : '')
    || (topic.trim().length < 3 ? 'Add a clear topic to generate notes.' : '')
    || (!topicIsAllowed ? 'Choose one of the suggested topics for this qualification.' : '');

  const generateNotes = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedSubject || topic.trim().length < 3 || !subjectSpecComplete) return;

    if (!poetrySelectionComplete) return;

    const specification = getSelectedSpecLabel(selectedSubject, effectiveCreationOption);
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

    setIsGenerating(true);
    setErrorMessage('');

    try {
      const response = await fetch('/api/ai/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept: topic.trim(),
          subject: selectedSubject.subject,
          examBoard: selectedSubject.exam_board,
          examType: selectedSubject.exam_type,
          specification,
          duration: '120',
          mode: 'notes',
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setErrorMessage(body.error || 'Failed to generate notes.');
        return;
      }
      setActiveTopic(topic.trim());
      setActiveSubject(selectedSubject);
      setNotes(body.script || '');
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
    setErrorMessage('');
  };

  return (
    <main className="space-y-7" aria-labelledby="notes-title">
      <section className="rounded-2xl border border-slate-200 bg-linear-to-br from-indigo-50 to-white p-6 shadow-[0_20px_40px_-36px_rgba(15,23,42,0.8)] dark:border-white/6 dark:from-[#131B2E] dark:to-[#0d1424] dark:shadow-[0_24px_48px_-30px_rgba(2,6,23,0.95)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">Step 2 of 5</p>
            <div className="mt-2 flex items-center gap-3">
              <BookOpen className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
              <h1 id="notes-title" className="text-3xl font-bold text-slate-900 dark:text-white">Learn</h1>
            </div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Generate focused study notes from one of your saved subjects.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/subjects" className={buttonStyles({ variant: 'secondary' })}>
              <ArrowLeft className="h-4 w-4" />
              Back to subjects
            </Link>
            <Link href="/dashboard/flashcards" className={buttonStyles({ variant: 'primary' })}>
              <Brain className="h-4 w-4" />
              Next: Flashcards
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {!activeTopic ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E] dark:shadow-none">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Create study notes</h2>
          <form onSubmit={generateNotes} className="mt-5 space-y-5">
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
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  First poem
                  <select
                    value={poemOne}
                    onChange={(event) => {
                      setPoemOne(event.target.value);
                      setTopic('');
                      if (event.target.value === poemTwo) setPoemTwo('');
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100"
                  >
                    <option value="">Select first poem</option>
                    {poetryPoems.map((poem) => (
                      <option key={poem} value={poem}>{poem}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Second poem <span className="font-normal text-slate-400">(optional)</span>
                  <select
                    value={poemTwo}
                    onChange={(event) => {
                      setPoemTwo(event.target.value);
                      setTopic('');
                    }}
                    disabled={!poemOne}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-indigo-400 disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100 dark:disabled:bg-white/5"
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
              label="Topic / concept"
              value={topic}
              onChange={(value) => {
                setTopic(value);
                setErrorMessage('');
              }}
              suggestions={topicSuggestions}
              isValidSelection={topicIsAllowed}
              placeholder="Start typing a topic from this qualification"
            />

            {validationMessage ? (
              <p className={`text-xs ${errorMessage || subjectsError ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-300'}`}>
                {validationMessage}
              </p>
            ) : null}

            <button type="submit" disabled={!canGenerate} className={buttonStyles({ variant: 'primary', size: 'lg' })}>
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {isGenerating ? 'Generating notes...' : 'Create study notes'}
            </button>
          </form>
        </section>
      ) : (
        <section className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E] dark:shadow-none">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Study notes</p>
                <p className="mt-0.5 text-lg font-semibold text-slate-900 dark:text-slate-100">{activeTopic}</p>
                {activeSubject ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {getSubjectLabel(activeSubject.subject)} - {getExamBoardLabel(activeSubject.exam_board)} {getExamTypeLabel(activeSubject.exam_type)}
                  </p>
                ) : null}
              </div>
              <button type="button" onClick={reset} className={buttonStyles({ variant: 'secondary', size: 'sm', className: 'shrink-0' })}>
                <RotateCcw className="h-3.5 w-3.5" />
                Change topic
              </button>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1fr_0.72fr]">
            <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E] dark:shadow-none">
              {notes ? (
                <MarkdownContent className="prose prose-slate max-w-none dark:prose-invert" content={notes} />
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">No notes were returned.</p>
              )}
            </article>
            {activeSubject ? (
              <StudyChat
                concept={activeTopic}
                subject={activeSubject.subject}
                examBoard={activeSubject.exam_board}
                examType={activeSubject.exam_type}
              />
            ) : null}
          </div>
        </section>
      )}

    </main>
  );
}
