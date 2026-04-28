'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';

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

const defaultPrompt =
  'Generate concise study flashcards with clear front/back pairs. Make the front a revision prompt or question and the back a short, accurate answer. Keep the cards aligned to the selected exam board and syllabus. For maths, use $...$ with explicit brackets like x^{2}, a_{n+1}, and \\frac{(x^{4}y^{2})}{(xy^{3})}; avoid ambiguous forms like x2 or (x4y^2)/(xy3). Return only JSON with a flashcards array.';

export default function AIFlashcardsPage() {
  const router = useRouter();
  const [deckName, setDeckName] = useState('AI Flashcards');
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState<SupportedSubject>('biology');
  const [examBoard, setExamBoard] = useState<ExamBoard>('aqa');
  const [examType, setExamType] = useState<ExamType>('gcse');
  const [specification, setSpecification] = useState('');
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [cardCount, setCardCount] = useState(12);
  const [status, setStatus] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const clampCardCount = (count: number) => Math.min(Math.max(Math.floor(count), MIN_CARDS), MAX_CARDS);

  const handleGenerate = async () => {
    if (topic.trim().length < 3) {
      setStatus({ tone: 'error', text: 'Please provide a clear topic or subject area.' });
      return;
    }
    if (prompt.trim().length < 20) {
      setStatus({ tone: 'error', text: 'The prompt must be more detailed for good flashcards.' });
      return;
    }

    setIsGenerating(true);
    setStatus({ tone: 'info', text: 'Generating AI flashcards…' });

    try {
      const response = await fetch('/api/ai/generate-flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: deckName.trim() || undefined, // Optional - AI will generate if not provided
          description: description.trim(),
          topic: topic.trim(),
          subject,
          examBoard,
          examType,
          specification: specification.trim(),
          prompt: prompt.trim(),
          cardCount: clampCardCount(cardCount),
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
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-linear-to-br from-white to-slate-100 p-6 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.7)] dark:border-slate-700 dark:from-slate-900 dark:to-slate-800 dark:shadow-[0_24px_48px_-28px_rgba(2,6,23,0.95)]">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300">AI Flashcards</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">Generate Smart Study Decks</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
          Create a new deck of AI-generated flashcards and open it instantly for review.
        </p>
      </section>

      {status ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            status.tone === 'info'
              ? 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-700/70 dark:bg-blue-950/40 dark:text-blue-200'
              : status.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700/70 dark:bg-emerald-950/35 dark:text-emerald-200'
              : 'border-red-200 bg-red-50 text-red-800 dark:border-red-700/70 dark:bg-red-950/35 dark:text-red-200'
          }`}
        >
          {status.text}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="text-sm text-slate-700 dark:text-slate-300">
            Deck name (optional)
            <input
              value={deckName}
              onChange={(event) => setDeckName(event.target.value)}
              placeholder="Leave blank for AI-generated name"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-300">
            Topic
            <input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="e.g. plant respiration"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-300">
            Subject
            <select
              value={subject}
              onChange={(event) => setSubject(event.target.value as SupportedSubject)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            >
              {SUPPORTED_SUBJECTS.map((item) => (
                <option key={item} value={item}>
                  {item.charAt(0).toUpperCase() + item.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-300">
            Exam board
            <select
              value={examBoard}
              onChange={(event) => setExamBoard(event.target.value as ExamBoard)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="aqa">AQA</option>
              <option value="edexcel">Edexcel</option>
              <option value="ocr">OCR</option>
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-300">
            Exam type
            <select
              value={examType}
              onChange={(event) => setExamType(event.target.value as ExamType)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="gcse">GCSE</option>
              <option value="a-level">A-Level</option>
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-300 lg:col-span-2">
            Specification focus (optional)
            <input
              value={specification}
              onChange={(event) => setSpecification(event.target.value)}
              placeholder="e.g. AQA Combined Science Trilogy"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-300 lg:col-span-2">
            Description (optional)
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional deck summary or focus area"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-300 lg:col-span-2">
            AI prompt
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={5}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-300">
            Flashcard count
            <input
              type="number"
              min={MIN_CARDS}
              max={MAX_CARDS}
              value={cardCount}
              onChange={(event) => setCardCount(Number(event.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" />
            Generate deck
          </button>
          <span className="text-sm text-slate-600 dark:text-slate-300">The new deck will be created and opened automatically.</span>
        </div>
      </section>
    </div>
  );
}
