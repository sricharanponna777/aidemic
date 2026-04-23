'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';

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
    'Generate exam-board style multiple choice questions with exactly 4 options (A-D), one correct answer, and concise exam rationale. Keep distractors plausible and topic-specific.',
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

  const isGenerationValid = form.topic.trim().length >= 3 && form.prompt.trim().length >= 12;
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
      setStatus({ tone: 'error', text: 'Add a clear topic and prompt details for specific MCQs.' });
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
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300">AI Questions</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">Interactive Exam Questions</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
          Generate and answer interactive MCQs for AQA, Edexcel, or OCR at GCSE and A-Level.
        </p>
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
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">Provide both a clear topic and prompt details (at least 12 chars).</p>
          ) : null}

          <label className="mt-4 block text-sm text-slate-700 dark:text-slate-300">
            Prompt details (required)
            <textarea
              value={form.prompt}
              onChange={(event) => setForm((prev) => ({ ...prev, prompt: event.target.value }))}
              placeholder="Include chapter scope, command words, common mistakes, and desired MCQ style."
              className="mt-1 h-24 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>

          <div className="mt-5 flex justify-end">
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-blue-300 dark:disabled:bg-blue-900"
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

          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{currentQuestion.question}</h2>
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
                  className={`rounded-lg border px-4 py-3 text-left text-sm font-medium transition ${style}`}
                >
                  <span className="mr-2 font-bold">{option}.</span>
                  {optionText(currentQuestion, option)}
                </button>
              );
            })}
          </div>

          {submitted ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-950">
              <p className="font-semibold text-slate-900 dark:text-slate-100">Correct answer: {currentQuestion.correctOption}</p>
              <p className="mt-1 text-slate-700 dark:text-slate-300">{currentQuestion.explanation}</p>
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {!submitted ? (
              <button
                type="button"
                onClick={submitCurrentAnswer}
                disabled={!selectedOption}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-blue-300 dark:disabled:bg-blue-900"
              >
                Submit answer
              </button>
            ) : null}
            {submitted && !isFinalQuestion ? (
              <button type="button" onClick={goNext} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-blue-600">
                Next question
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {hasFinished ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Results</h2>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
            You scored <strong>{score}</strong> out of <strong>{questions.length}</strong> (
            {Math.round((score / Math.max(questions.length, 1)) * 100)}%).
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={restartWithSameQuestions}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
            >
              <RefreshCw className="h-4 w-4" />
              Retry same questions
            </button>
            <button type="button" onClick={resetToGenerator} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
              Generate new set
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
