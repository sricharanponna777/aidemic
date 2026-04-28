'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BookOpen,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pause,
  Play,
  XCircle,
} from 'lucide-react';
import { MarkdownContent } from '@/components/MarkdownContent';
import { buttonStyles } from '@/components/ui/button';

type SlideshowDuration = '30' | '60' | '120';
type StudyContentMode = 'notes' | 'slideshow';

interface SlideshowGeneratorProps {
  concept: string;
  subject: string;
  flashcardId?: string;
  examBoard?: string;
  examType?: string;
  mode?: StudyContentMode;
}

interface GeneratedContent {
  videoId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  slides?: string[];
  script?: string;
}

const DURATIONS: { value: SlideshowDuration; label: string; description: string }[] = [
  { value: '30', label: '30 sec', description: 'Quick overview' },
  { value: '60', label: '60 sec', description: 'Standard' },
  { value: '120', label: '2 min', description: 'In-depth' },
];

const SLIDE_INTERVAL_MS = 5000;

const BG_COLORS = [
  'from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40',
  'from-violet-50 to-purple-50 dark:from-violet-950/40 dark:to-purple-950/40',
  'from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40',
  'from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40',
  'from-rose-50 to-pink-50 dark:from-rose-950/40 dark:to-pink-950/40',
];

function slideLabel(index: number, total: number): string {
  if (index === 0) return 'Introduction';
  if (index === total - 1) return 'Summary';
  return `Part ${index}`;
}

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
            className={buttonStyles({
              variant: 'plain',
              size: 'none',
              className: `justify-start rounded-lg border px-3 py-1.5 text-left text-sm font-medium ${
                value === opt.value
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800'
              }`,
            })}
          >
            <span>{opt.label}</span>
            {opt.description ? <span className="ml-1.5 text-xs opacity-60">{opt.description}</span> : null}
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
      <div className="relative min-h-[220px] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
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
            <MarkdownContent
              className="text-lg font-medium leading-relaxed text-slate-800 dark:text-slate-100"
              content={slides[index]}
            />
          </motion.div>
        </AnimatePresence>

        <div className="absolute bottom-3 right-3 rounded-md bg-black/20 px-2 py-0.5 text-xs text-white dark:bg-white/10">
          {index + 1} / {slides.length}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            goTo(index - 1);
            setPlaying(false);
          }}
          className={buttonStyles({ variant: 'secondary', size: 'icon', className: 'h-8 w-8' })}
          aria-label="Previous slide"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                goTo(i);
                setPlaying(false);
              }}
              aria-label={`Go to slide ${i + 1}`}
              className={buttonStyles({
                variant: 'plain',
                size: 'none',
                className: `h-2 rounded-full ${
                  i === index
                    ? 'w-5 bg-blue-500'
                    : 'w-2 bg-slate-300 hover:bg-slate-400 dark:bg-slate-600 dark:hover:bg-slate-500'
                }`,
              })}
            />
          ))}
        </div>

        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className={buttonStyles({ variant: 'secondary', size: 'icon', className: 'h-8 w-8' })}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => {
              goTo(index + 1);
              setPlaying(false);
            }}
            className={buttonStyles({ variant: 'secondary', size: 'icon', className: 'h-8 w-8' })}
            aria-label="Next slide"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <p className="text-center text-xs text-slate-400 dark:text-slate-500">{concept}</p>
    </div>
  );
}

function StudyNotes({ script, slides, concept }: { script?: string; slides: string[]; concept: string }) {
  const keyIdeas = slides.filter(Boolean).slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-950/70">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Study notes</p>
        {script ? (
          <MarkdownContent
            className="mt-3 text-sm leading-7 text-slate-800 dark:text-slate-200"
            content={script}
          />
        ) : (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">No notes were returned.</p>
        )}
      </div>

      {keyIdeas.length > 0 ? (
        <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Key checkpoints</p>
          <ol className="mt-3 space-y-2">
            {keyIdeas.map((idea, index) => (
              <li key={`${idea}-${index}`} className="flex gap-3 text-sm text-slate-700 dark:text-slate-300">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                  {index + 1}
                </span>
                <MarkdownContent content={idea} />
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <p className="text-center text-xs text-slate-400 dark:text-slate-500">{concept}</p>
    </div>
  );
}

export function SlideshowGenerator({
  concept,
  subject,
  flashcardId,
  examBoard,
  examType,
  mode = 'slideshow',
}: SlideshowGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [content, setContent] = useState<GeneratedContent | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [duration, setDuration] = useState<SlideshowDuration>('60');
  const isNotesMode = mode === 'notes';

  const generate = async () => {
    setIsGenerating(true);
    setErrorMessage('');
    try {
      const response = await fetch('/api/ai/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concept, subject, flashcardId, duration, examBoard, examType, mode }),
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

  const reset = () => {
    setContent(null);
    setErrorMessage('');
  };
  const actionLabel = isNotesMode ? 'Create Study Notes' : 'Create Slideshow';
  const loadingLabel = isNotesMode ? 'Generating notes...' : 'Generating slides...';

  if (content?.status === 'completed') {
    const slides = content.slides ?? [];
    return (
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {isNotesMode ? 'Study notes ready' : 'Slideshow ready'}
          </span>
        </div>

        {isNotesMode ? (
          <StudyNotes script={content.script} slides={slides} concept={concept} />
        ) : (
          <>
            {slides.length > 0 ? <Slideshow slides={slides} concept={concept} /> : null}

            {content.script ? (
              <details>
                <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
                  <BookOpen className="h-3.5 w-3.5" />
                  Full script
                </summary>
                <MarkdownContent
                  className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300"
                  content={content.script}
                />
              </details>
            ) : null}
          </>
        )}

        <button
          type="button"
          onClick={reset}
          className={buttonStyles({ variant: 'ghost', size: 'sm', className: 'text-xs' })}
        >
          Generate again
        </button>
      </div>
    );
  }

  if (content) {
    return (
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          {content.status === 'failed' ? (
            <XCircle className="h-4 w-4 text-red-500" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          )}
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {content.status === 'failed' ? 'Generation failed' : loadingLabel}
          </span>
        </div>

        {content.status === 'failed' ? (
          <button
            type="button"
            onClick={reset}
            className={buttonStyles({ variant: 'secondary' })}
          >
            Try again
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <OptionGroup
        label={isNotesMode ? 'Notes depth' : 'Script length'}
        options={DURATIONS}
        value={duration}
        onChange={setDuration}
      />

      <button
        type="button"
        onClick={generate}
        disabled={isGenerating}
        className={buttonStyles({ variant: 'primary' })}
      >
        {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {isGenerating ? loadingLabel : actionLabel}
      </button>

      {errorMessage ? <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p> : null}
    </div>
  );
}
