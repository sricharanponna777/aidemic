'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Loader2,
  Printer,
  ScanLine,
  Trash2,
} from 'lucide-react';
import { MarkdownContent } from '@/components/MarkdownContent';
import { buttonStyles } from '@/components/ui/button';
import { createClient } from '@/lib/supabase-client';
import { useAuth } from '@/hooks/useAuth';
import { downscaleToJpeg } from '@/lib/papers/downscale';
import { isPdf, pdfToJpegPages } from '@/lib/papers/pdfPages';
import { MAX_PAPER_PAGES, PAPER_SCANS_BUCKET } from '@/lib/papers/constants';
import { LOW_CONFIDENCE } from '@/lib/papers/transcript';
import type { PaperTranscriptEntry, StudentSafePaper } from '@/types';

/**
 * One printed paper, through its whole life: print it, photograph what you
 * wrote, check what the AI read, then mark it.
 *
 * All three live on one page because they are one task separated by however
 * many days the paper spends on a desk -- and because keeping them together is
 * what lets `window.print()` work with no separate print route: everything that
 * is not the sheet itself is `print:hidden`.
 */

const LETTERS = ['A', 'B', 'C', 'D'];

type Tone = 'info' | 'success' | 'error';

const toneStyles: Record<Tone, string> = {
  info: 'border-info/30 bg-info-muted text-info',
  success: 'border-success/30 bg-success-muted text-success',
  error: 'border-danger/30 bg-danger-muted text-danger',
};

export default function PaperPage() {
  const params = useParams<{ paperId: string }>();
  const paperId = params?.paperId ?? '';
  const router = useRouter();
  const { session } = useAuth();

  const [paper, setPaper] = useState<StudentSafePaper | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<{ tone: Tone; text: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isMarking, setIsMarking] = useState(false);
  const [transcript, setTranscript] = useState<PaperTranscriptEntry[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetches without touching state, so both the mount effect and the mutation
  // handlers can apply the result themselves.
  const fetchPaper = useCallback(async (): Promise<StudentSafePaper | null> => {
    if (!paperId) return null;
    const response = await fetch(`/api/papers/${paperId}`);
    if (!response.ok) return null;
    const body = await response.json();
    return (body.paper as StudentSafePaper) ?? null;
  }, [paperId]);

  const reload = useCallback(async () => {
    const next = await fetchPaper();
    if (next) setPaper(next);
    return next;
  }, [fetchPaper]);

  useEffect(() => {
    let cancelled = false;
    fetchPaper()
      .then((next) => {
        if (cancelled) return;
        if (next) {
          setPaper(next);
          if (Array.isArray(next.transcript)) setTranscript(next.transcript);
        } else {
          setStatus({ tone: 'error', text: 'Could not load this paper.' });
        }
        setIsLoading(false);
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPaper]);

  const totalMarks = useMemo(
    () => (paper?.questions ?? []).reduce((sum, question) => sum + question.marks, 0),
    [paper]
  );

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !paper || !session?.user?.id) return;

    // Index from the highest one already used, not from the count: deleting a
    // page from the middle leaves a gap, and counting would upsert straight
    // over a page the student still has.
    const nextIndex = paper.pages.reduce((highest, page) => Math.max(highest, page.pageIndex + 1), 0);
    const room = Math.min(MAX_PAPER_PAGES - paper.pages.length, MAX_PAPER_PAGES - nextIndex);
    if (room <= 0) {
      setStatus({ tone: 'error', text: `A paper can hold at most ${MAX_PAPER_PAGES} pages.` });
      return;
    }

    setIsUploading(true);
    setStatus({ tone: 'info', text: 'Preparing your pages...' });
    const supabase = createClient();

    try {
      // Expanded before anything is uploaded: one selected file is one page
      // only when it is a photo, and a PDF's page count is not knowable until
      // it has been opened. Doing it up front also means a PDF that overruns
      // the limit is refused before half of it is in the bucket.
      const blobs: Blob[] = [];
      const blankPages: number[] = [];
      for (const file of Array.from(files)) {
        if (!isPdf(file)) {
          blobs.push(await downscaleToJpeg(file));
          continue;
        }
        const rendered = await pdfToJpegPages(file, room - blobs.length);
        // Renumbered onto the paper: the student is told "page 3 is blank",
        // and page 3 of the paper is not page 3 of their second PDF.
        for (const pageNumber of rendered.blankPageNumbers) {
          blankPages.push(nextIndex + blobs.length + pageNumber);
        }
        blobs.push(...rendered.pages);
      }
      if (blobs.length > room) {
        throw new Error(`A paper can hold at most ${MAX_PAPER_PAGES} pages.`);
      }

      setStatus({ tone: 'info', text: 'Uploading your pages...' });
      for (let offset = 0; offset < blobs.length; offset += 1) {
        const blob = blobs[offset];
        const pageIndex = nextIndex + offset;
        const storagePath = `${session.user.id}/${paper.id}/${pageIndex}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from(PAPER_SCANS_BUCKET)
          .upload(storagePath, blob, { contentType: 'image/jpeg', upsert: true });
        if (uploadError) throw new Error(uploadError.message);

        const response = await fetch(`/api/papers/${paper.id}/pages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storagePath, pageIndex }),
        });
        if (!response.ok) {
          const body = await response.json();
          throw new Error(body.error || 'Could not attach the page.');
        }
      }

      setTranscript([]);
      await reload();
      setStatus(
        blankPages.length > 0
          ? {
              tone: 'error',
              text: `${blankPages.length === 1 ? 'Page' : 'Pages'} ${blankPages.join(', ')} came out blank. If ${
                blankPages.length === 1 ? 'it has' : 'they have'
              } writing on ${blankPages.length === 1 ? 'it' : 'them'}, delete and photograph instead.`,
            }
          : { tone: 'success', text: 'Pages uploaded. Read them next.' }
      );
    } catch (err) {
      setStatus({ tone: 'error', text: err instanceof Error ? err.message : 'Upload failed.' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemovePage = async (pageId: string) => {
    if (!paper) return;
    const response = await fetch(`/api/papers/${paper.id}/pages?pageId=${pageId}`, { method: 'DELETE' });
    if (!response.ok) {
      const body = await response.json();
      setStatus({ tone: 'error', text: body.error || 'Could not remove the page.' });
      return;
    }
    setTranscript([]);
    await reload();
  };

  const handleTranscribe = async () => {
    if (!paper) return;
    setIsTranscribing(true);
    setStatus({ tone: 'info', text: 'Reading your handwriting...' });

    try {
      const response = await fetch('/api/ai/transcribe-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paperId: paper.id }),
      });
      const body = await response.json();
      if (!response.ok) {
        setStatus({ tone: 'error', text: body.error || 'Could not read your pages.' });
        return;
      }
      setTranscript(body.transcript as PaperTranscriptEntry[]);
      await reload();
      setStatus({ tone: 'success', text: 'Check what was read, fix anything wrong, then mark it.' });
    } catch {
      setStatus({ tone: 'error', text: 'Could not read your pages.' });
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleMark = async () => {
    if (!paper) return;
    setIsMarking(true);
    setStatus({ tone: 'info', text: 'Marking your paper...' });

    try {
      const response = await fetch('/api/ai/mark-answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paperId: paper.id, transcript }),
      });
      const body = await response.json();
      if (!response.ok) {
        setStatus({ tone: 'error', text: body.error || 'Marking failed.' });
        return;
      }
      // The marked attempt is a normal practice attempt from here on, so the
      // existing attempt view renders it -- there is no separate paper report.
      if (typeof body.attemptId === 'string' && body.attemptId) {
        router.push(`/dashboard/ai-questions/stats/${body.attemptId}`);
      } else {
        router.push('/dashboard/ai-questions/stats');
      }
    } catch {
      setStatus({ tone: 'error', text: 'Marking failed.' });
    } finally {
      setIsMarking(false);
    }
  };

  const handleDelete = async () => {
    if (!paper) return;
    if (!window.confirm('Delete this paper and the pages you uploaded? This cannot be undone.')) return;
    const response = await fetch(`/api/papers/${paper.id}`, { method: 'DELETE' });
    if (response.ok) router.push('/dashboard/ai-questions');
    else setStatus({ tone: 'error', text: 'Could not delete the paper.' });
  };

  const updateTranscript = (questionIndex: number, text: string) => {
    setTranscript((prev) =>
      prev.map((entry) => (entry.questionIndex === questionIndex ? { ...entry, text, confidence: 1 } : entry))
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-content-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading paper...
      </div>
    );
  }

  if (!paper) {
    return (
      <div className="space-y-4">
        <p className="text-content-muted">This paper could not be found.</p>
        <Link href="/dashboard/ai-questions" className={buttonStyles({ variant: 'secondary' })}>
          <ArrowLeft className="h-4 w-4" />
          Back to Smart Practice
        </Link>
      </div>
    );
  }

  const isMarked = paper.status === 'marked';

  return (
    <div className="space-y-6">
      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <section className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <Link
            href="/dashboard/ai-questions"
            className="inline-flex items-center gap-1.5 text-caption font-semibold text-content-subtle hover:text-content"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Smart Practice
          </Link>
          <h1 className="mt-1 text-display text-content">{paper.topic}</h1>
          <p className="text-caption text-content-subtle">
            Paper {paper.paperCode} · {paper.questions.length} questions · {totalMarks} marks
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => window.print()} className={buttonStyles({ variant: 'primary' })}>
            <Printer className="h-4 w-4" />
            Print / Save as PDF
          </button>
          <button type="button" onClick={handleDelete} className={buttonStyles({ variant: 'danger-ghost' })}>
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </section>

      {status ? (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-xl border px-4 py-3 text-sm print:hidden ${toneStyles[status.tone]}`}
        >
          {status.text}
        </div>
      ) : null}

      {isMarked ? (
        <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success-muted px-4 py-3 text-sm text-success print:hidden">
          <CheckCircle2 className="h-4 w-4" />
          This paper has been marked.
          {paper.attemptId ? (
            <Link href={`/dashboard/ai-questions/stats/${paper.attemptId}`} className="font-semibold underline">
              See the marks
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* ── The printable sheet ──────────────────────────────────────────── */}
      <article className="rounded-2xl border border-subtle bg-surface p-6 shadow-card print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="border-b border-strong pb-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-title text-content">{paper.topic}</h2>
            <span className="text-caption font-semibold text-content-muted">Paper {paper.paperCode}</span>
          </div>
          <p className="mt-1 text-caption text-content-muted">
            {paper.subject}
            {paper.specification ? ` · ${paper.specification}` : ''} · {totalMarks} marks
          </p>
          <p className="mt-3 text-caption text-content-subtle">
            Answer in the space under each question. If you need more room, carry on
            on a separate sheet and write <strong>{paper.paperCode}</strong> at the top of it.
            Photograph every page, in order, and upload them here.
          </p>
        </header>

        {paper.sourceMaterial ? (
          <section className="mt-5 border-b border-subtle pb-5">
            <h3 className="text-caption font-bold uppercase tracking-wide text-content-subtle">Source material</h3>
            <MarkdownContent className="mt-2 text-sm leading-7 text-content" content={paper.sourceMaterial} />
          </section>
        ) : null}

        <ol className="mt-5 space-y-6">
          {paper.questions.map((question, index) => (
            <li key={index} data-print-question className="border-b border-subtle pb-5 last:border-0">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <span className="text-caption font-bold text-content-subtle">Question {index + 1}</span>
                  <MarkdownContent className="mt-1 text-content" content={question.question} />
                </div>
                <span className="shrink-0 text-caption font-semibold text-content-muted">
                  [{question.marks} {question.marks === 1 ? 'mark' : 'marks'}]
                </span>
              </div>

              {question.questionType === 'mcq' ? (
                <ul className="mt-3 space-y-2">
                  {question.options.map((option, optionIndex) => (
                    <li key={optionIndex} className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-strong text-caption font-bold text-content-muted">
                        {LETTERS[optionIndex]}
                      </span>
                      <MarkdownContent inline className="text-content" content={option} />
                    </li>
                  ))}
                </ul>
              ) : (
                <div
                  data-print-lines
                  className="mt-3 rounded border border-subtle"
                  style={{ height: `${Math.max(24, question.marks * 8)}mm` }}
                />
              )}
            </li>
          ))}
        </ol>
      </article>

      {/* ── Upload ───────────────────────────────────────────────────────── */}
      {!isMarked ? (
        <section className="rounded-2xl border border-subtle bg-surface p-6 shadow-card print:hidden">
          <h2 className="flex items-center gap-2 text-title text-content">
            <Camera className="h-5 w-5 text-accent" />
            Your written pages
          </h2>
          <p className="mt-1 text-caption text-content-subtle">
            Photograph each page in order, in good light, with the whole sheet in frame — or upload a PDF
            straight from a scanner app.
          </p>

          {paper.pages.length > 0 ? (
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {/* Labelled by position, not by pageIndex: deleting a page leaves a
                  gap in the indices, and the student counts their pages 1, 2, 3. */}
              {paper.pages.map((page, position) => (
                <li key={page.id} className="relative overflow-hidden rounded-card border border-subtle">
                  <Image
                    src={page.signedUrl}
                    alt={`Page ${position + 1}`}
                    width={300}
                    height={400}
                    unoptimized
                    className="h-40 w-full object-cover"
                  />
                  <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-caption font-semibold text-white">
                    {position + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemovePage(page.id)}
                    aria-label={`Remove page ${position + 1}`}
                    className="absolute right-2 top-2 rounded bg-black/60 p-1 text-white hover:bg-black/80"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {/* No `capture`: it opens the camera directly on Android rather
                than a picker, which would leave a scanner app's PDF -- the
                whole point of accepting one -- unreachable on a phone. The
                picker still offers the camera as a source. */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              disabled={isUploading}
              onChange={(event) => handleUpload(event.target.files)}
              className="text-sm text-content-muted file:mr-3 file:rounded-control file:border-0 file:bg-accent file:px-4 file:py-2 file:text-sm file:font-semibold file:text-accent-fg"
            />
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin text-content-subtle" /> : null}
          </div>

          {paper.pages.length > 0 ? (
            <button
              type="button"
              onClick={handleTranscribe}
              disabled={isTranscribing}
              className={`mt-4 ${buttonStyles({ variant: 'primary' })}`}
            >
              {isTranscribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
              {transcript.length > 0 ? 'Read the pages again' : 'Read my answers'}
            </button>
          ) : null}
        </section>
      ) : null}

      {/* ── Transcript review ────────────────────────────────────────────── */}
      {!isMarked && transcript.length > 0 ? (
        <section className="rounded-2xl border border-subtle bg-surface p-6 shadow-card print:hidden">
          <h2 className="text-title text-content">Check what was read</h2>
          <p className="mt-1 text-caption text-content-subtle">
            This is what the AI read from your handwriting, not a mark. Fix anything it got
            wrong before marking — you are marked on the text below.
          </p>

          <ol className="mt-4 space-y-4">
            {transcript.map((entry) => {
              const question = paper.questions[entry.questionIndex];
              if (!question) return null;
              const uncertain = entry.confidence < LOW_CONFIDENCE;

              return (
                <li key={entry.questionIndex}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-caption font-bold text-content-subtle">
                      Question {entry.questionIndex + 1}
                    </span>
                    {uncertain ? (
                      <span className="inline-flex items-center gap-1 text-caption font-semibold text-warning">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {entry.text ? 'Hard to read — check this' : 'Nothing found for this question'}
                      </span>
                    ) : null}
                  </div>
                  <MarkdownContent className="mt-1 text-sm text-content-muted" content={question.question} />
                  <textarea
                    value={entry.text}
                    onChange={(event) => updateTranscript(entry.questionIndex, event.target.value)}
                    rows={question.questionType === 'mcq' ? 1 : 4}
                    placeholder="Nothing was read for this question"
                    className={`mt-2 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-accent bg-surface text-content ${
                      uncertain ? 'border-warning' : 'border-subtle'
                    }`}
                  />
                </li>
              );
            })}
          </ol>

          <button
            type="button"
            onClick={handleMark}
            disabled={isMarking}
            className={`mt-5 ${buttonStyles({ variant: 'primary' })}`}
          >
            {isMarking ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            This is right — mark my paper
          </button>
        </section>
      ) : null}
    </div>
  );
}
