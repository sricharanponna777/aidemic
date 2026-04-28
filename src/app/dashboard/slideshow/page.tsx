'use client';

import { useState } from 'react';
import { SlideshowGenerator } from '@/components/SlideshowGenerator';
import { GalleryHorizontal, RotateCcw } from 'lucide-react';

type ExamBoard = 'aqa' | 'edexcel' | 'ocr' | 'general';
type ExamType = 'gcse' | 'a-level' | 'general';

const SUGGESTED_SUBJECTS = [
  'Mathematics', 'Physics', 'Chemistry', 'Biology',
  'Computer Science', 'History', 'Economics', 'Literature',
];

const EXAM_BOARDS: { value: ExamBoard; label: string }[] = [
  { value: 'aqa',     label: 'AQA' },
  { value: 'edexcel', label: 'Edexcel' },
  { value: 'ocr',     label: 'OCR' },
  { value: 'general', label: 'General' },
];

const EXAM_TYPES: { value: ExamType; label: string }[] = [
  { value: 'gcse',    label: 'GCSE' },
  { value: 'a-level', label: 'A-Level' },
  { value: 'general', label: 'General' },
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
            className={`rounded-full px-3 py-0.5 text-xs font-medium transition ${
              value === opt.value
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SlideshowPage() {
  const [conceptInput, setConceptInput] = useState('');
  const [subjectInput, setSubjectInput] = useState('');
  const [examBoard, setExamBoard] = useState<ExamBoard>('aqa');
  const [examType, setExamType] = useState<ExamType>('a-level');

  const [activeConcept, setActiveConcept] = useState('');
  const [activeSubject, setActiveSubject] = useState('');
  const [activeExamBoard, setActiveExamBoard] = useState<ExamBoard>('aqa');
  const [activeExamType, setActiveExamType] = useState<ExamType>('a-level');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!conceptInput.trim()) return;
    setActiveConcept(conceptInput.trim());
    setActiveSubject(subjectInput.trim() || 'General');
    setActiveExamBoard(examBoard);
    setActiveExamType(examType);
  };

  const handleReset = () => {
    setActiveConcept('');
    setActiveSubject('');
    setConceptInput('');
    setSubjectInput('');
  };

  const examBoardLabel = EXAM_BOARDS.find((b) => b.value === activeExamBoard)?.label ?? '';
  const examTypeLabel  = EXAM_TYPES.find((t) => t.value === activeExamType)?.label ?? '';

  return (
    <main className="space-y-7" aria-labelledby="slideshow-title">
      <section className="rounded-2xl border border-slate-200 bg-linear-to-br from-white to-slate-100 p-6 shadow-[0_20px_40px_-36px_rgba(15,23,42,0.8)] dark:border-slate-700 dark:from-slate-900 dark:to-slate-800 dark:shadow-[0_24px_48px_-30px_rgba(2,6,23,0.95)]">
        <div className="flex items-center gap-3">
          <GalleryHorizontal className="h-7 w-7 text-blue-600 dark:text-blue-400" />
          <h1 id="slideshow-title" className="text-3xl font-bold text-slate-900 dark:text-slate-100">AI Slideshow</h1>
        </div>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Generate an AI-powered slideshow tailored to your exam board and level.
        </p>
      </section>

      {!activeConcept ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">What do you want to learn?</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Enter a concept, pick your subject and exam board.</p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-5">
            <div>
              <label htmlFor="concept-input" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Topic / Concept
              </label>
              <input
                id="concept-input"
                value={conceptInput}
                onChange={(e) => setConceptInput(e.target.value)}
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
                onChange={(e) => setSubjectInput(e.target.value)}
                placeholder="e.g. Biology, Mathematics..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {SUGGESTED_SUBJECTS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSubjectInput(s)}
                    className={`rounded-full px-3 py-0.5 text-xs font-medium transition ${
                      subjectInput === s
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <ChipGroup label="Exam Board" options={EXAM_BOARDS} value={examBoard} onChange={setExamBoard} />
              <ChipGroup label="Level"      options={EXAM_TYPES}  value={examType}  onChange={setExamType} />
            </div>

            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={!conceptInput.trim()}
            >
              <GalleryHorizontal className="h-4 w-4" />
              Create Slideshow
            </button>
          </form>
        </section>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Learning</p>
              <p className="mt-0.5 text-lg font-semibold text-slate-900 dark:text-slate-100">{activeConcept}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {activeSubject}
                {activeExamBoard !== 'general' || activeExamType !== 'general'
                  ? ` · ${examBoardLabel} ${examTypeLabel}`.trim()
                  : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Change topic
            </button>
          </div>

          <SlideshowGenerator
            concept={activeConcept}
            subject={activeSubject}
            examBoard={activeExamBoard}
            examType={activeExamType}
          />
        </section>
      )}
    </main>
  );
}
