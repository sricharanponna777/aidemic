'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowRight, BookOpen, RefreshCw, Sparkles } from 'lucide-react';
import { MarkdownContent } from '@/components/MarkdownContent';
import { buttonStyles } from '@/components/ui/button';

type CorrectOption = 'A' | 'B' | 'C' | 'D';

type QuizQuestion = {
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: CorrectOption;
  explanation: string;
  figureUrl?: string;
};

interface AIGenerateForm {
  topic: string;
  subject:
    | 'biology'
    | 'chemistry'
    | 'physics'
    | 'mathematics'
    | 'english'
    | 'history'
    | 'geography'
    | 'economics'
    | 'psychology'
    | 'business'
    | 'computer science';
  prompt: string;
  examBoard: 'aqa' | 'edexcel' | 'ocr';
  examType: 'gcse' | 'a-level';
  specification: string;
  figureUrl: string;
  questionCount: number;
}

type StatusTone = 'info' | 'success' | 'warning' | 'error';
type StatusMessage = { tone: StatusTone; text: string };

const MIN_QUESTIONS = 4;
const MAX_QUESTIONS = 40;

const defaultForm: AIGenerateForm = {
  topic: '',
  subject: 'biology',
  prompt:
    'Generate exam-board style multiple choice questions with exactly 4 options (A-D), one correct answer, and concise exam rationale. Keep distractors plausible and topic-specific. For maths, use $...$ with explicit brackets like x^{2}, a_{n+1}, and \\frac{(x^{4}y^{2})}{(xy^{3})}; avoid ambiguous forms like x2 or (x4y^2)/(xy3).',
  examBoard: 'aqa',
  examType: 'gcse',
  specification: '',
  figureUrl: '',
  questionCount: 12,
};

const optionOrder: CorrectOption[] = ['A', 'B', 'C', 'D'];

const optionText = (question: QuizQuestion, option: CorrectOption) => {
  if (option === 'A') return question.optionA;
  if (option === 'B') return question.optionB;
  if (option === 'C') return question.optionC;
  return question.optionD;
};

export default function AIQuestionsPage() {
  const [form, setForm] = useState<AIGenerateForm>(defaultForm);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<CorrectOption | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [answers, setAnswers] = useState<Array<CorrectOption | null>>([]);

  const isGenerationValid = form.topic.trim().length >= 3;
  const inQuiz = questions.length > 0;
  const currentQuestion = inQuiz ? questions[currentIndex] : null;

  const score = useMemo(() => {
    return answers.reduce((acc, selected, index) => {
      if (!selected) return acc;
      return selected === questions[index]?.correctOption ? acc + 1 : acc;
    }, 0);
  }, [answers, questions]);

  const isFinalQuestion = currentIndex === questions.length - 1;
  const hasFinished = inQuiz && answers.filter((answer) => answer !== null).length === questions.length;

  const startQuiz = (nextQuestions: QuizQuestion[]) => {
    setQuestions(nextQuestions);
    setCurrentIndex(0);
    setSelectedOption(null);
    setSubmitted(false);
    setAnswers(Array.from({ length: nextQuestions.length }, () => null));
  };

  const handleGenerate = async () => {
    if (!isGenerationValid) {
      setStatus({ tone: 'error', text: 'Add a clear topic for specific MCQs.' });
      return;
    }

    const payload = {
      topic: form.topic.trim(),
      subject: form.subject,
      prompt: form.prompt.trim(),
      examBoard: form.examBoard,
      examType: form.examType,
      specification: form.specification.trim(),
      figureUrl: form.figureUrl.trim(),
      questionCount: Math.min(Math.max(Math.floor(form.questionCount || 12), MIN_QUESTIONS), MAX_QUESTIONS),
    };

    setIsGenerating(true);
    setStatus({ tone: 'info', text: 'Generating interactive questions...' });

    try {
      const response = await fetch('/api/ai/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        setStatus({ tone: 'error', text: body.error || 'Generation failed.' });
        return;
      }

      const generatedQuestions: QuizQuestion[] = Array.isArray(body.questions) ? body.questions : [];
      if (generatedQuestions.length === 0) {
        setStatus({ tone: 'error', text: 'No questions were returned.' });
        return;
      }

      const warnings: string[] = Array.isArray(body.warnings)
        ? body.warnings.filter((item: unknown): item is string => typeof item === 'string')
        : [];
      setStatus({
        tone: warnings.length > 0 ? 'warning' : 'success',
        text: `Generated ${generatedQuestions.length} interactive questions.${warnings.length > 0 ? ` ${warnings.join(' ')}` : ''}`,
      });

      startQuiz(generatedQuestions);
    } catch (err) {
      console.error('Question generation failed', err);
      setStatus({ tone: 'error', text: 'Generation failed due to a network or server error.' });
    } finally {
      setIsGenerating(false);
    }
  };

  const submitCurrentAnswer = () => {
    if (!currentQuestion || !selectedOption || submitted) return;
    const nextAnswers = [...answers];
    nextAnswers[currentIndex] = selectedOption;
    setAnswers(nextAnswers);
    setSubmitted(true);
  };

  const goNext = () => {
    if (!submitted) return;
    if (isFinalQuestion) return;
    setCurrentIndex((prev) => prev + 1);
    setSelectedOption(null);
    setSubmitted(false);
  };

  const restartWithSameQuestions = () => {
    if (!inQuiz) return;
    startQuiz(questions);
    setStatus({ tone: 'info', text: 'Quiz restarted with the same questions.' });
  };

  const resetToGenerator = () => {
    setQuestions([]);
    setCurrentIndex(0);
    setSelectedOption(null);
    setSubmitted(false);
    setAnswers([]);
  };

  const statusClassName = status
    ? {
        info: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-700/70 dark:bg-blue-950/40 dark:text-blue-200',
        success: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700/70 dark:bg-emerald-950/35 dark:text-emerald-200',
        warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700/70 dark:bg-amber-950/35 dark:text-amber-200',
        error: 'border-red-200 bg-red-50 text-red-800 dark:border-red-700/70 dark:bg-red-950/35 dark:text-red-200',
      }[status.tone]
    : '';

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-linear-to-br from-white to-slate-100 p-6 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.7)] dark:border-slate-700 dark:from-slate-900 dark:to-slate-800 dark:shadow-[0_24px_48px_-28px_rgba(2,6,23,0.95)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300">Step 4 of 4</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">MCQ Exam Practice</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
              Finish the flow with exam-board MCQs after notes, flashcards, and study sessions.
            </p>
          </div>
          <Link
            href="/dashboard/notes"
            className={buttonStyles({ variant: 'secondary' })}
          >
            <BookOpen className="h-4 w-4" />
            New topic
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {status ? <div className={`rounded-xl border px-4 py-3 text-sm ${statusClassName}`}>{status.text}</div> : null}

      {!inQuiz ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="text-sm text-slate-700 dark:text-slate-300">
              Subject
              <select
                value={form.subject}
                onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value as AIGenerateForm['subject'] }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="biology">Biology</option>
                <option value="chemistry">Chemistry</option>
                <option value="physics">Physics</option>
                <option value="mathematics">Mathematics</option>
                <option value="english">English</option>
                <option value="history">History</option>
                <option value="geography">Geography</option>
                <option value="economics">Economics</option>
                <option value="psychology">Psychology</option>
                <option value="business">Business</option>
                <option value="computer science">Computer Science</option>
              </select>
            </label>
            <label className="text-sm text-slate-700 dark:text-slate-300">
              Topic
              <input
                value={form.topic}
                onChange={(event) => setForm((prev) => ({ ...prev, topic: event.target.value }))}
                placeholder="e.g. Cell biology"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <label className="text-sm text-slate-700 dark:text-slate-300">
              Exam board
              <select
                value={form.examBoard}
                onChange={(event) => setForm((prev) => ({ ...prev, examBoard: event.target.value as 'aqa' | 'edexcel' | 'ocr' }))}
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
                value={form.examType}
                onChange={(event) => setForm((prev) => ({ ...prev, examType: event.target.value as 'gcse' | 'a-level' }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="gcse">GCSE</option>
                <option value="a-level">A-Level</option>
              </select>
            </label>
            <label className="text-sm text-slate-700 dark:text-slate-300">
              Specification focus (optional)
              <input
                value={form.specification}
                onChange={(event) => setForm((prev) => ({ ...prev, specification: event.target.value }))}
                placeholder="e.g. Cell differentiation and stem cells"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <label className="text-sm text-slate-700 dark:text-slate-300">
              Figure URL (optional)
              <input
                value={form.figureUrl}
                onChange={(event) => setForm((prev) => ({ ...prev, figureUrl: event.target.value }))}
                placeholder="https://.../figure.png"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <label className="text-sm text-slate-700 dark:text-slate-300">
              Question count
              <input
                type="number"
                min={MIN_QUESTIONS}
                max={MAX_QUESTIONS}
                value={form.questionCount}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (!Number.isFinite(next)) return;
                  setForm((prev) => ({
                    ...prev,
                    questionCount: Math.min(Math.max(Math.floor(next), MIN_QUESTIONS), MAX_QUESTIONS),
                  }));
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
          </div>

          {!isGenerationValid ? (
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">Provide a clear topic to generate MCQs.</p>
          ) : null}

          <div className="mt-5 flex justify-end">
            <button
              className={buttonStyles({ variant: 'primary' })}
              onClick={handleGenerate}
              disabled={isGenerating || !isGenerationValid}
            >
              <Sparkles className="h-4 w-4" />
              {isGenerating ? 'Generating...' : 'Start interactive questions'}
            </button>
          </div>
        </section>
      ) : null}

      {inQuiz && currentQuestion && !hasFinished ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Question {currentIndex + 1} of {questions.length}
            </p>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Score: {score} / {questions.length}
            </p>
          </div>

          <MarkdownContent
            className="text-xl font-semibold text-slate-900 dark:text-slate-100"
            content={currentQuestion.question}
          />
          {currentQuestion.figureUrl ? (
            <Image
              src={currentQuestion.figureUrl}
              alt="Question figure"
              width={1200}
              height={720}
              className="mt-4 max-h-72 w-full rounded-lg border border-slate-300 object-contain dark:border-slate-700"
            />
          ) : null}

          <div className="mt-5 grid grid-cols-1 gap-3">
            {optionOrder.map((option) => {
              const selected = selectedOption === option;
              const correct = currentQuestion.correctOption === option;
              const showCorrect = submitted && correct;
              const showIncorrectSelection = submitted && selected && !correct;
              const style = showCorrect
                ? 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                : showIncorrectSelection
                  ? 'border-red-500 bg-red-50 text-red-900 dark:bg-red-950/35 dark:text-red-200'
                  : selected
                    ? 'border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200'
                    : 'border-slate-300 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200';

              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    if (submitted) return;
                    setSelectedOption(option);
                  }}
                  className={buttonStyles({
                    variant: 'plain',
                    size: 'none',
                    className: `justify-start rounded-lg border px-4 py-3 text-left text-sm font-medium ${style}`,
                  })}
                >
                  <span className="mr-2 font-bold">{option}.</span>
                  <MarkdownContent inline content={optionText(currentQuestion, option)} />
                </button>
              );
            })}
          </div>

          {submitted ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-950">
              <p className="font-semibold text-slate-900 dark:text-slate-100">Correct answer: {currentQuestion.correctOption}</p>
              <MarkdownContent className="mt-1 text-slate-700 dark:text-slate-300" content={currentQuestion.explanation} />
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {!submitted ? (
              <button
                type="button"
                onClick={submitCurrentAnswer}
                disabled={!selectedOption}
                className={buttonStyles({ variant: 'primary' })}
              >
                Submit answer
              </button>
            ) : null}
            {submitted && !isFinalQuestion ? (
              <button type="button" onClick={goNext} className={buttonStyles({ variant: 'primary' })}>
                Next question
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {hasFinished ? (() => {
  const percentage = Math.round((score / Math.max(questions.length, 1)) * 100);

  // --- Determine grading system ---
  const isALevel = form.examType === 'a-level';

  // --- GCSE (9–1) approximate boundaries ---
  const getGCSEGrade = (pct: number, board: string) => {
    // Keep descending order explicit; object numeric keys are reordered ascending by JS.
    const base: Array<[string, number]> = [
      ['9', 85],
      ['8', 78],
      ['7', 70],
      ['6', 60],
      ['5', 50],
      ['4', 40],
      ['3', 30],
      ['2', 20],
      ['1', 10],
    ];

    // small board adjustments
    const adjustment =
      board === 'edexcel' ? -2 :
      board === 'ocr' ? -1 :
      0;

    const adjusted = base.map(([grade, boundary]) => [
      grade,
      boundary + adjustment,
    ] as const);

    for (const [grade, boundary] of adjusted) {
      if (pct >= boundary) return grade;
    }
    return 'U';
  };

  // --- A-Level (A*-E) approximate boundaries ---
  const getALevelGrade = (pct: number, board: string) => {
    const base: Array<[string, number]> = [
      ['A*', 85],
      ['A', 75],
      ['B', 65],
      ['C', 55],
      ['D', 45],
      ['E', 35],
    ];

    const adjustment =
      board === 'edexcel' ? -2 :
      board === 'ocr' ? -1 :
      0;

    const adjusted = base.map(([grade, boundary]) => [
      grade,
      boundary + adjustment,
    ] as const);

    for (const [grade, boundary] of adjusted) {
      if (pct >= boundary) return grade;
    }
    return 'U';
  };

  const grade = isALevel
    ? getALevelGrade(percentage, form.examBoard)
    : getGCSEGrade(percentage, form.examBoard);

  // --- Performance tone ---
  const performanceTone =
    percentage >= 75
      ? 'text-blue-600 dark:text-blue-400'
      : percentage >= 50
      ? 'text-slate-700 dark:text-slate-300'
      : 'text-red-600 dark:text-red-400';

  const performanceLabel =
    percentage >= 85
      ? 'Outstanding performance'
      : percentage >= 70
      ? 'Strong understanding'
      : percentage >= 50
      ? 'Developing well'
      : 'Needs more practice';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 dark:text-blue-400">
          Quiz Completed
        </p>

        <h2 className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">
          Your Results
        </h2>

        {/* --- Grade Display --- */}
        <div className="mt-6">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Estimated Grade
          </p>
          <p className={`mt-2 text-5xl font-black ${performanceTone}`}>
            {grade}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {isALevel ? 'A-Level (A*–E)' : 'GCSE (9–1)'} · {form.examBoard.toUpperCase()}
          </p>
        </div>

        {/* --- Stats --- */}
        <div className="mt-8 grid grid-cols-3 gap-4 md:gap-6">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Score
            </p>
            <p className={`mt-2 text-3xl font-bold ${performanceTone}`}>
              {score}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              out of {questions.length}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Accuracy
            </p>
            <p className={`mt-2 text-3xl font-bold ${performanceTone}`}>
              {percentage}%
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              correct
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Questions
            </p>
            <p className={`mt-2 text-3xl font-bold ${performanceTone}`}>
              {questions.length}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              total
            </p>
          </div>
        </div>

        {/* --- Progress bar --- */}
        <div className="mt-8 mx-auto max-w-xs">
          <div className="mb-2 flex items-end justify-between">
            <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              Performance
            </span>
            <span className={`text-xl font-bold ${performanceTone}`}>
              {percentage}%
            </span>
          </div>

          <div className="h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className="h-full bg-blue-600 transition-all duration-500"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        {/* --- Feedback --- */}
        <p className={`mt-6 text-lg font-semibold ${performanceTone}`}>
          {performanceLabel}
        </p>

        {/* --- Actions --- */}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={restartWithSameQuestions}
            className={buttonStyles({ variant: 'primary', size: 'lg' })}
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>

          <button
            type="button"
            onClick={resetToGenerator}
            className={buttonStyles({ variant: 'secondary', size: 'lg' })}
          >
            New set
          </button>
        </div>
      </div>
    </section>
  );
})() : null}
    </div>
  );
}
