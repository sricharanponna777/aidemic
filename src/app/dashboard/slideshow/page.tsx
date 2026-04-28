'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import { SlideshowGenerator } from '@/components/SlideshowGenerator';
import { MarkdownContent } from '@/components/MarkdownContent';
import {
  ArrowRight,
  BookOpen,
  GalleryHorizontal,
  Layers,
  Loader2,
  MessageCircle,
  RotateCcw,
  Send,
} from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';

type ExamBoard = 'aqa' | 'edexcel' | 'ocr' | 'general';
type ExamType = 'gcse' | 'a-level' | 'general';
type StudyMode = 'notes' | 'slideshow';
type ChatMessage = { role: 'user' | 'assistant'; content: string };

const SUGGESTED_SUBJECTS = [
  'Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'Computer Science',
  'History',
  'Economics',
  'Literature',
];

const EXAM_BOARDS: { value: ExamBoard; label: string }[] = [
  { value: 'aqa', label: 'AQA' },
  { value: 'edexcel', label: 'Edexcel' },
  { value: 'ocr', label: 'OCR' },
  { value: 'general', label: 'General' },
];

const EXAM_TYPES: { value: ExamType; label: string }[] = [
  { value: 'gcse', label: 'GCSE' },
  { value: 'a-level', label: 'A-Level' },
  { value: 'general', label: 'General' },
];

const STUDY_MODES: { value: StudyMode; label: string; description: string; icon: typeof BookOpen }[] = [
  { value: 'notes', label: 'Study notes', description: 'Readable notes and checkpoints', icon: BookOpen },
  { value: 'slideshow', label: 'Slideshow', description: 'Step-through visual explanation', icon: GalleryHorizontal },
];

function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={buttonStyles({
              variant: 'plain',
              size: 'chip',
              className:
                value === opt.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
            })}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function StudyModePicker({ value, onChange }: { value: StudyMode; onChange: (mode: StudyMode) => void }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
        How would you like to study this first?
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {STUDY_MODES.map((mode) => {
          const Icon = mode.icon;
          const selected = value === mode.value;
          return (
            <button
              key={mode.value}
              type="button"
              onClick={() => onChange(mode.value)}
              className={buttonStyles({
                variant: 'plain',
                size: 'none',
                className: `justify-start rounded-lg border p-4 text-left ${
                  selected
                    ? 'border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-950/45 dark:text-blue-100'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800'
                }`,
              })}
            >
              <div className="flex items-center gap-2">
                <Icon className="h-5 w-5" />
                <span className="font-semibold">{mode.label}</span>
              </div>
              <p className="mt-1 text-sm opacity-75">{mode.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StudyChat({
  concept,
  subject,
  examBoard,
  examType,
  mode,
}: {
  concept: string;
  subject: string;
  examBoard: ExamBoard;
  examType: ExamType;
  mode: StudyMode;
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
          mode,
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
    <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-blue-100 p-2 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
          <MessageCircle className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">Study Chat</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Ask for a simpler explanation, example, analogy, or quick check.
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
                className={buttonStyles({
                  variant: 'secondary',
                  size: 'sm',
                  className: 'w-full justify-start text-left font-medium',
                })}
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
                    ? 'ml-6 bg-blue-600 text-white'
                    : 'mr-6 bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100'
                }`}
              >
                <MarkdownContent content={message.content} />
              </div>
            ))}
            {isSending ? (
              <div className="mr-6 inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
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
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
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
  const [conceptInput, setConceptInput] = useState('');
  const [subjectInput, setSubjectInput] = useState('');
  const [examBoard, setExamBoard] = useState<ExamBoard>('aqa');
  const [examType, setExamType] = useState<ExamType>('a-level');
  const [studyMode, setStudyMode] = useState<StudyMode>('notes');

  const [activeConcept, setActiveConcept] = useState('');
  const [activeSubject, setActiveSubject] = useState('');
  const [activeExamBoard, setActiveExamBoard] = useState<ExamBoard>('aqa');
  const [activeExamType, setActiveExamType] = useState<ExamType>('a-level');
  const [activeMode, setActiveMode] = useState<StudyMode>('notes');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!conceptInput.trim()) return;
    setActiveConcept(conceptInput.trim());
    setActiveSubject(subjectInput.trim() || 'General');
    setActiveExamBoard(examBoard);
    setActiveExamType(examType);
    setActiveMode(studyMode);
  };

  const handleReset = () => {
    setActiveConcept('');
    setActiveSubject('');
    setConceptInput('');
    setSubjectInput('');
  };

  const examBoardLabel = EXAM_BOARDS.find((board) => board.value === activeExamBoard)?.label ?? '';
  const examTypeLabel = EXAM_TYPES.find((type) => type.value === activeExamType)?.label ?? '';
  const activeModeLabel = activeMode === 'notes' ? 'Study notes' : 'Slideshow';

  return (
    <main className="space-y-7" aria-labelledby="notes-title">
      <section className="rounded-2xl border border-slate-200 bg-linear-to-br from-white to-slate-100 p-6 shadow-[0_20px_40px_-36px_rgba(15,23,42,0.8)] dark:border-slate-700 dark:from-slate-900 dark:to-slate-800 dark:shadow-[0_24px_48px_-30px_rgba(2,6,23,0.95)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300">Step 1 of 4</p>
            <div className="mt-2 flex items-center gap-3">
              <BookOpen className="h-7 w-7 text-blue-600 dark:text-blue-400" />
              <h1 id="notes-title" className="text-3xl font-bold text-slate-900 dark:text-slate-100">AI Notes</h1>
            </div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Choose study notes or a slideshow, then use Study Chat for follow-up understanding.
            </p>
          </div>
          <Link
            href="/dashboard/flashcards"
            className={buttonStyles({ variant: 'secondary' })}
          >
            <Layers className="h-4 w-4" />
            Next: Flashcards
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {!activeConcept ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">What do you want to learn?</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Enter a concept, pick your subject and exam board, then choose notes or slideshow.
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-5">
            <div>
              <label htmlFor="concept-input" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Topic / Concept
              </label>
              <input
                id="concept-input"
                value={conceptInput}
                onChange={(event) => setConceptInput(event.target.value)}
                placeholder="e.g. Photosynthesis, Bayes' theorem, The French Revolution..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                required
              />
            </div>

            <div>
              <label htmlFor="subject-input" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Subject <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                id="subject-input"
                value={subjectInput}
                onChange={(event) => setSubjectInput(event.target.value)}
                placeholder="e.g. Biology, Mathematics..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {SUGGESTED_SUBJECTS.map((subject) => (
                  <button
                    key={subject}
                    type="button"
                    onClick={() => setSubjectInput(subject)}
                    className={buttonStyles({
                      variant: 'plain',
                      size: 'chip',
                      className:
                        subjectInput === subject
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
                    })}
                  >
                    {subject}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <ChipGroup label="Exam Board" options={EXAM_BOARDS} value={examBoard} onChange={setExamBoard} />
              <ChipGroup label="Level" options={EXAM_TYPES} value={examType} onChange={setExamType} />
            </div>

            <StudyModePicker value={studyMode} onChange={setStudyMode} />

            <button
              type="submit"
              className={buttonStyles({ variant: 'primary', size: 'lg' })}
              disabled={!conceptInput.trim()}
            >
              {studyMode === 'notes' ? <BookOpen className="h-4 w-4" /> : <GalleryHorizontal className="h-4 w-4" />}
              {studyMode === 'notes' ? 'Create Study Notes' : 'Create Slideshow'}
            </button>
          </form>
        </section>
      ) : (
        <section className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {activeModeLabel}
                </p>
                <p className="mt-0.5 text-lg font-semibold text-slate-900 dark:text-slate-100">{activeConcept}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {activeSubject}
                  {activeExamBoard !== 'general' || activeExamType !== 'general'
                    ? ` - ${examBoardLabel} ${examTypeLabel}`.trim()
                    : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={handleReset}
                className={buttonStyles({ variant: 'secondary', size: 'sm', className: 'shrink-0' })}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Change topic
              </button>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1fr_0.72fr]">
            <SlideshowGenerator
              concept={activeConcept}
              subject={activeSubject}
              examBoard={activeExamBoard}
              examType={activeExamType}
              mode={activeMode}
            />
            <StudyChat
              concept={activeConcept}
              subject={activeSubject}
              examBoard={activeExamBoard}
              examType={activeExamType}
              mode={activeMode}
            />
          </div>
        </section>
      )}
    </main>
  );
}
