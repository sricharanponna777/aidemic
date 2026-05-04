'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle2,
  ClipboardList,
  Layers,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';

const MIN_CARDS = 6;
const MAX_CARDS = 40;

const SUPPORTED_SUBJECTS = [
  'biology',
  'chemistry',
  'physics',
  'mathematics',
  'english',
  'history',
  'geography',
  'economics',
  'psychology',
  'business',
  'computer science',
] as const;

type SupportedSubject = (typeof SUPPORTED_SUBJECTS)[number];
type ExamBoard = 'aqa' | 'edexcel' | 'ocr';
type ExamType = 'gcse' | 'a-level';
type StatusTone = 'success' | 'error' | 'info';
type CardStyle = 'balanced' | 'definitions' | 'exam' | 'mistakes';

const SUBJECT_LABELS: Record<SupportedSubject, string> = {
  biology: 'Biology',
  chemistry: 'Chemistry',
  physics: 'Physics',
  mathematics: 'Mathematics',
  english: 'English',
  history: 'History',
  geography: 'Geography',
  economics: 'Economics',
  psychology: 'Psychology',
  business: 'Business',
  'computer science': 'Computer Science',
};

const CARD_STYLES: Array<{ id: CardStyle; label: string; description: string; prompt: string }> = [
  {
    id: 'balanced',
    label: 'Balanced deck',
    description: 'Definitions, recall, examples, and checks.',
    prompt:
      'Create clear front/back flashcards. Mix definitions, key facts, examples, and short application prompts. Keep each front focused on one idea, and keep each back concise but complete.',
  },
  {
    id: 'definitions',
    label: 'Key terms',
    description: 'Best for vocabulary-heavy topics.',
    prompt:
      'Create flashcards focused on key terms, definitions, formulas, and must-know facts. The front should ask for the term or meaning. The back should give a precise answer plus one short context clue where useful.',
  },
  {
    id: 'exam',
    label: 'Exam recall',
    description: 'Command words and mark-scheme phrasing.',
    prompt:
      'Create exam-style recall flashcards using command words like state, define, explain, compare, and calculate where appropriate. Include concise mark-scheme-style answers and common exam phrasing.',
  },
  {
    id: 'mistakes',
    label: 'Common mistakes',
    description: 'Targets traps and misconceptions.',
    prompt:
      'Create flashcards that target common mistakes, misconceptions, and confusing pairs. The front should test the trap directly. The back should explain the correct idea and why the mistake is wrong.',
  },
];

const defaultPrompt = CARD_STYLES[0].prompt;

const clampCardCount = (count: number) => Math.min(Math.max(Math.floor(count || MIN_CARDS), MIN_CARDS), MAX_CARDS);

const statusClassNames: Record<StatusTone, string> = {
  info: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-700/70 dark:bg-blue-950/40 dark:text-blue-200',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700/70 dark:bg-emerald-950/35 dark:text-emerald-200',
  error: 'border-red-200 bg-red-50 text-red-800 dark:border-red-700/70 dark:bg-red-950/35 dark:text-red-200',
};

export default function AIFlashcardsPage() {
  const router = useRouter();
  const [deckName, setDeckName] = useState('');
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState<SupportedSubject>('biology');
  const [examBoard, setExamBoard] = useState<ExamBoard>('aqa');
  const [examType, setExamType] = useState<ExamType>('gcse');
  const [specification, setSpecification] = useState('');
  const [cardStyle, setCardStyle] = useState<CardStyle>('balanced');
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [cardCount, setCardCount] = useState(12);
  const [status, setStatus] = useState<{ tone: StatusTone; text: string } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const safeCardCount = clampCardCount(cardCount);
  const topicIsReady = topic.trim().length >= 3;
  const canGenerate = topicIsReady && !isGenerating;

  const summaryRows = useMemo(
    () => [
      { label: 'Deck', value: deckName.trim() || 'AI-generated name' },
      { label: 'Topic', value: topic.trim() || 'Add a topic' },
      { label: 'Subject', value: SUBJECT_LABELS[subject] },
      { label: 'Level', value: `${examBoard.toUpperCase()} ${examType === 'gcse' ? 'GCSE' : 'A-Level'}` },
      { label: 'Cards', value: `${safeCardCount}` },
      { label: 'Style', value: CARD_STYLES.find((style) => style.id === cardStyle)?.label || 'Balanced deck' },
    ],
    [cardStyle, deckName, examBoard, examType, safeCardCount, subject, topic]
  );

  const applyCardStyle = (styleId: CardStyle) => {
    const style = CARD_STYLES.find((item) => item.id === styleId);
    if (!style) return;
    setCardStyle(style.id);
    setPrompt(style.prompt);
  };

  const handleGenerate = async (event: FormEvent) => {
    event.preventDefault();

    if (!topicIsReady) {
      setStatus({ tone: 'error', text: 'Add a topic with at least 3 characters.' });
      return;
    }
    setIsGenerating(true);
    setStatus({ tone: 'info', text: 'Generating the deck...' });

    try {
      const response = await fetch('/api/ai/generate-flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: deckName.trim() || undefined,
          description: description.trim(),
          topic: topic.trim(),
          subject,
          examBoard,
          examType,
          specification: specification.trim(),
          prompt: prompt.trim(),
          cardCount: safeCardCount,
        }),
      });

      const body = await response.json();
      if (!response.ok) {
        setStatus({ tone: 'error', text: body.error || 'Failed to generate AI flashcards.' });
        return;
      }

      if (!body.success || !body.deckId) {
        setStatus({ tone: 'error', text: body.error || 'AI flashcard generation failed.' });
        return;
      }

      router.push(`/dashboard/flashcards/${body.deckId}`);
    } catch (error) {
      console.error('AI flashcards generation error', error);
      setStatus({ tone: 'error', text: 'Network error while generating flashcards.' });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <main className="space-y-7" aria-labelledby="ai-flashcards-title">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-linear-to-br from-white to-slate-100 p-6 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.7)] dark:border-slate-700 dark:from-slate-900 dark:to-slate-800 dark:shadow-[0_24px_48px_-28px_rgba(2,6,23,0.95)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300">Step 2 of 4</p>
            <div className="mt-2 flex items-center gap-3">
              <Sparkles className="h-7 w-7 text-blue-600 dark:text-blue-400" />
              <h1 id="ai-flashcards-title" className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                AI Flashcard Builder
              </h1>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
              Turn a topic from notes into a saved deck with focused front/back cards.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/flashcards"
              className={buttonStyles({ variant: 'secondary' })}
            >
              <ArrowLeft className="h-4 w-4" />
              Decks
            </Link>
            <Link
              href="/dashboard/study-sessions"
              className={buttonStyles({ variant: 'primary' })}
            >
              <Brain className="h-4 w-4" />
              Next: Flashcard reviews
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {status ? <div className={`rounded-xl border px-4 py-3 text-sm ${statusClassNames[status.tone]}`}>{status.text}</div> : null}

      <form onSubmit={handleGenerate} className="grid gap-5 xl:grid-cols-[1fr_0.58fr]">
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Deck setup</h2>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Deck name <span className="font-normal text-slate-400">(optional)</span>
                <input
                  value={deckName}
                  onChange={(event) => setDeckName(event.target.value)}
                  placeholder="e.g. Cell Biology Recall"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Topic
                <input
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  placeholder="e.g. Plant respiration"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 lg:col-span-2">
                Deck focus <span className="font-normal text-slate-400">(optional)</span>
                <input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="e.g. Core definitions and calculation traps"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-5 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Exam focus</h2>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Subject
                <select
                  value={subject}
                  onChange={(event) => setSubject(event.target.value as SupportedSubject)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                >
                  {SUPPORTED_SUBJECTS.map((item) => (
                    <option key={item} value={item}>
                      {SUBJECT_LABELS[item]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Exam board
                <select
                  value={examBoard}
                  onChange={(event) => setExamBoard(event.target.value as ExamBoard)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="aqa">AQA</option>
                  <option value="edexcel">Edexcel</option>
                  <option value="ocr">OCR</option>
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Level
                <select
                  value={examType}
                  onChange={(event) => setExamType(event.target.value as ExamType)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="gcse">GCSE</option>
                  <option value="a-level">A-Level</option>
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 lg:col-span-3">
                Specification focus <span className="font-normal text-slate-400">(optional)</span>
                <input
                  value={specification}
                  onChange={(event) => setSpecification(event.target.value)}
                  placeholder="e.g. AQA Combined Science Trilogy, Paper 1"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-5 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Card style</h2>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {CARD_STYLES.map((style) => {
                const selected = cardStyle === style.id;
                return (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => applyCardStyle(style.id)}
                    className={buttonStyles({
                      variant: 'plain',
                      size: 'none',
                      className: `justify-start rounded-lg border p-4 text-left ${
                        selected
                          ? 'border-blue-500 bg-blue-50 text-blue-950 dark:bg-blue-950/45 dark:text-blue-100'
                          : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
                      }`,
                    })}
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      {selected ? <CheckCircle2 className="h-4 w-4" /> : null}
                      {style.label}
                    </span>
                    <span className="mt-1 block text-sm opacity-75">{style.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-slate-200 pt-5 dark:border-slate-700">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Flashcard count
                <input
                  type="range"
                  min={MIN_CARDS}
                  max={MAX_CARDS}
                  value={safeCardCount}
                  onChange={(event) => setCardCount(Number(event.target.value))}
                  className="mt-3 w-full accent-blue-600"
                />
              </label>
              <input
                aria-label="Flashcard count"
                type="number"
                min={MIN_CARDS}
                max={MAX_CARDS}
                value={safeCardCount}
                onChange={(event) => setCardCount(Number(event.target.value))}
                className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          </div>
        </section>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h2 className="font-semibold text-slate-900 dark:text-slate-100">Generation summary</h2>
            </div>
            <dl className="mt-4 space-y-3">
              {summaryRows.map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 last:border-0 dark:border-slate-800">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{row.label}</dt>
                  <dd className="text-right text-sm font-medium text-slate-800 dark:text-slate-100">{row.value}</dd>
                </div>
              ))}
            </dl>
            <button
              type="submit"
              disabled={!canGenerate}
              className={buttonStyles({ variant: 'primary', size: 'lg', className: 'mt-5 w-full' })}
            >
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {isGenerating ? 'Generating deck...' : 'Generate deck'}
            </button>
            {!topicIsReady ? (
              <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">Add a topic to generate.</p>
            ) : null}
          </section>
        </aside>
      </form>
    </main>
  );
}
