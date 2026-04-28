'use client';

import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, CheckCircle, XCircle, BookOpen, Play, Pause, ChevronLeft, ChevronRight } from 'lucide-react';

type SlideshowDuration = '30' | '60' | '120';

interface SlideshowGeneratorProps {
  concept: string;
  subject: string;
  flashcardId?: string;
  examBoard?: string;
  examType?: string;
}

interface GeneratedContent {
  videoId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  slides?: string[];
  script?: string;
}

const DURATIONS: { value: SlideshowDuration; label: string; description: string }[] = [
  { value: '30',  label: '30 sec',  description: 'Quick overview' },
  { value: '60',  label: '60 sec',  description: 'Standard' },
  { value: '120', label: '2 min',   description: 'In-depth' },
];

const SLIDE_INTERVAL_MS = 5000;

function slideLabel(index: number, total: number): string {
  if (index === 0) return 'Introduction';
  if (index === total - 1) return 'Summary';
  return `Part ${index}`;
}

const BG_COLORS = [
  'from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40',
  'from-violet-50 to-purple-50 dark:from-violet-950/40 dark:to-purple-950/40',
  'from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40',
  'from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40',
  'from-rose-50 to-pink-50 dark:from-rose-950/40 dark:to-pink-950/40',
];

function OptionGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string; description?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-lg border px-3 py-1.5 text-left text-sm font-medium transition ${
              value === opt.value
                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                : 'border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <span>{opt.label}</span>
            {opt.description && (
              <span className="ml-1.5 text-xs opacity-60">{opt.description}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function Slideshow({ slides, concept }: { slides: string[]; concept: string }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);

  const goTo = useCallback((i: number) => {
    setIndex((i + slides.length) % slides.length);
  }, [slides.length]);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => goTo(index + 1), SLIDE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [playing, index, goTo]);

  return (
    <div className="space-y-3">
      {/* Slide area */}
      <div className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700" style={{ minHeight: '220px' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            className={`absolute inset-0 flex flex-col justify-center bg-linear-to-br p-8 ${BG_COLORS[index % BG_COLORS.length]}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.45, ease: 'easeInOut' }}
          >
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              {slideLabel(index, slides.length)}
            </p>
            <p className="text-lg font-medium leading-relaxed text-slate-800 dark:text-slate-100">
              {slides[index]}
            </p>
          </motion.div>
        </AnimatePresence>

        <div className="absolute bottom-3 right-3 rounded-md bg-black/20 px-2 py-0.5 text-xs text-white dark:bg-white/10">
          {index + 1} / {slides.length}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => { goTo(index - 1); setPlaying(false); }}
          className="rounded-lg border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Previous slide"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { goTo(i); setPlaying(false); }}
              aria-label={`Go to slide ${i + 1}`}
              className={`h-2 rounded-full transition-all ${
                i === index
                  ? 'w-5 bg-blue-500'
                  : 'w-2 bg-slate-300 hover:bg-slate-400 dark:bg-slate-600 dark:hover:bg-slate-500'
              }`}
            />
          ))}
        </div>

        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="rounded-lg border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => { goTo(index + 1); setPlaying(false); }}
            className="rounded-lg border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Next slide"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Concept label */}
      <p className="text-center text-xs text-slate-400 dark:text-slate-500">{concept}</p>
    </div>
  );
}

export function SlideshowGenerator({ concept, subject, flashcardId, examBoard, examType }: SlideshowGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [content, setContent] = useState<GeneratedContent | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [duration, setDuration] = useState<SlideshowDuration>('60');

  const generate = async () => {
    setIsGenerating(true);
    setErrorMessage('');
    try {
      const response = await fetch('/api/ai/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concept, subject, flashcardId, duration, examBoard, examType }),
      });

      const data = await response.json();

      if (response.ok) {
        setContent(data);
      } else {
        setErrorMessage(data.error || 'Generation failed. Please try again.');
      }
    } catch {
      setErrorMessage('Network error. Please check your connection and try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const reset = () => { setContent(null); setErrorMessage(''); };

  // ── Completed ──────────────────────────────────────────────────────────────
  if (content?.status === 'completed') {
    const slides = content.slides ?? [];
    return (
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Slideshow ready</span>
        </div>

        {slides.length > 0 && <Slideshow slides={slides} concept={concept} />}

        {content.script && (
          <details>
            <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
              <BookOpen className="h-3.5 w-3.5" />
              Full script
            </summary>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {content.script}
            </p>
          </details>
        )}

        <button
          type="button"
          onClick={reset}
          className="text-xs text-slate-500 underline underline-offset-2 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          Generate again
        </button>
      </div>
    );
  }

  // ── In progress / failed ───────────────────────────────────────────────────
  if (content) {
    return (
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          {content.status === 'failed'
            ? <XCircle className="h-4 w-4 text-red-500" />
            : <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {content.status === 'failed' ? 'Generation failed' : 'Generating slides…'}
          </span>
        </div>

        {content.status === 'failed' && (
          <button type="button" onClick={reset}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
            Try again
          </button>
        )}
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <OptionGroup
        label="Script Length"
        options={DURATIONS}
        value={duration}
        onChange={setDuration}
      />

      <button
        type="button"
        onClick={generate}
        disabled={isGenerating}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {isGenerating ? 'Generating…' : 'Create Slideshow'}
      </button>

      {errorMessage && (
        <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
      )}
    </div>
  );
}
