'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Calculator,
  CheckCircle2,
  ClipboardCheck,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import { MarkdownContent } from '@/components/MarkdownContent';
import { buttonStyles } from '@/components/ui/button';

type Subject =
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

type ExamBoard = 'aqa' | 'edexcel' | 'ocr';
type ExamType = 'gcse' | 'a-level';

type ExamQuestion = {
  questionType: 'open' | 'mcq';
  question: string;
  marks: number;
  commandWord: string;
  isCalculation: boolean;
  options: string[];
  correctOption: '' | 'A' | 'B' | 'C' | 'D';
  markScheme: string[];
  modelAnswer: string;
  skillsAssessed: string[];
  figureUrl?: string;
  sourceTitle: string;
  sourceUrl: string;
};

type MarkedAnswer = {
  questionIndex: number;
  marksAwarded: number;
  maxMarks: number;
  band: string;
  feedback: string;
  strengths: string[];
  improvements: string[];
  weaknessTags: string[];
  exemplarAnswer: string;
};

type MarkingReport = {
  markedAnswers: MarkedAnswer[];
  totalMarksAwarded: number;
  totalAvailableMarks: number;
  percentage: number;
  predictedGrade: string;
  targetGrade: string | null;
  summary: string;
  weaknessAnalysis: string[];
  gradeBoostAdvice: string[];
  gradeBoundaryNote: string;
};

interface AIGenerateForm {
  topic: string;
  subject: Subject;
  examBoard: ExamBoard;
  examType: ExamType;
  specification: string;
  figureUrl: string;
  questionCount: number;
  allowMcq: boolean;
  allowCalculation: boolean;
  useOnlineResources: boolean;
}

type StatusTone = 'info' | 'success' | 'warning' | 'error';
type StatusMessage = { tone: StatusTone; text: string };

const MIN_QUESTIONS = 1;
const MAX_QUESTIONS = 20;
const optionLetters = ['A', 'B', 'C', 'D'] as const;

const subjects: Array<{ value: Subject; label: string }> = [
  { value: 'business', label: 'Business' },
  { value: 'biology', label: 'Biology' },
  { value: 'chemistry', label: 'Chemistry' },
  { value: 'physics', label: 'Physics' },
  { value: 'mathematics', label: 'Mathematics' },
  { value: 'english', label: 'English' },
  { value: 'history', label: 'History' },
  { value: 'geography', label: 'Geography' },
  { value: 'economics', label: 'Economics' },
  { value: 'psychology', label: 'Psychology' },
  { value: 'computer science', label: 'Computer Science' },
];

const defaultForm: AIGenerateForm = {
  topic: '',
  subject: 'biology',
  examBoard: 'aqa',
  examType: 'gcse',
  specification: '',
  figureUrl: '',
  questionCount: 6,
  allowMcq: true,
  allowCalculation: false,
  useOnlineResources: true,
};

const statusStyles: Record<StatusTone, string> = {
  info: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-700/70 dark:bg-blue-950/40 dark:text-blue-200',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700/70 dark:bg-emerald-950/35 dark:text-emerald-200',
  warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700/70 dark:bg-amber-950/35 dark:text-amber-200',
  error: 'border-red-200 bg-red-50 text-red-800 dark:border-red-700/70 dark:bg-red-950/35 dark:text-red-200',
};

const reportTone = (percentage: number) => {
  if (percentage >= 75) return 'text-emerald-700 dark:text-emerald-300';
  if (percentage >= 50) return 'text-blue-700 dark:text-blue-300';
  return 'text-red-700 dark:text-red-300';
};

export default function AIQuestionsPage() {
  const [form, setForm] = useState<AIGenerateForm>(defaultForm);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isMarking, setIsMarking] = useState(false);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [report, setReport] = useState<MarkingReport | null>(null);

  const isGenerationValid = form.topic.trim().length >= 3;
  const inPractice = questions.length > 0;
  const answeredCount = useMemo(() => answers.filter((answer) => answer.trim().length > 0).length, [answers]);
  const totalAvailableMarks = useMemo(() => questions.reduce((sum, question) => sum + question.marks, 0), [questions]);

  const updateSubject = (subject: Subject) => {
    setForm((prev) => ({ ...prev, subject }));
  };

  const updateExamBoard = (examBoard: ExamBoard) => {
    setForm((prev) => ({ ...prev, examBoard }));
  };

  const handleGenerate = async () => {
    if (!isGenerationValid) {
      setStatus({ tone: 'error', text: 'Add a topic before generating questions.' });
      return;
    }

    const payload = {
      topic: form.topic.trim(),
      subject: form.subject,
      examBoard: form.examBoard,
      examType: form.examType,
      specification: form.specification.trim(),
      figureUrl: form.figureUrl.trim(),
      questionCount: Math.min(Math.max(Math.floor(form.questionCount || 6), MIN_QUESTIONS), MAX_QUESTIONS),
      allowMcq: form.allowMcq,
      allowCalculation: form.allowCalculation,
      useOnlineResources: form.useOnlineResources,
    };

    setIsGenerating(true);
    setReport(null);
    setStatus({ tone: 'info', text: 'Generating exam practice questions...' });

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

      const generatedQuestions: ExamQuestion[] = Array.isArray(body.questions) ? body.questions : [];
      if (generatedQuestions.length === 0) {
        setStatus({ tone: 'error', text: 'No questions were returned.' });
        return;
      }

      const warnings: string[] = Array.isArray(body.warnings)
        ? body.warnings.filter((item: unknown): item is string => typeof item === 'string')
        : [];
      setQuestions(generatedQuestions);
      setAnswers(Array.from({ length: generatedQuestions.length }, () => ''));
      setStatus({
        tone: warnings.length > 0 ? 'warning' : 'success',
        text: `Generated ${generatedQuestions.length} exam-practice questions.${warnings.length > 0 ? ` ${warnings.join(' ')}` : ''}`,
      });
    } catch (err) {
      console.error('Question generation failed', err);
      setStatus({ tone: 'error', text: 'Generation failed due to a network or server error.' });
    } finally {
      setIsGenerating(false);
    }
  };

  const updateAnswer = (index: number, value: string) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleMarkAnswers = async () => {
    if (!inPractice) return;
    if (answeredCount === 0) {
      setStatus({ tone: 'error', text: 'Write at least one answer before marking the attempt.' });
      return;
    }

    setIsMarking(true);
    setReport(null);
    setStatus({ tone: 'info', text: 'Marking responses...' });

    try {
      const response = await fetch('/api/ai/mark-answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: form.topic.trim(),
          subject: form.subject,
          examBoard: form.examBoard,
          examType: form.examType,
          specification: form.specification.trim(),
          questions,
          answers,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setStatus({ tone: 'error', text: body.error || 'Marking failed.' });
        return;
      }

      setReport(body.report as MarkingReport);
      setStatus({ tone: 'success', text: 'Attempt marked with predicted grade and next-step advice.' });
    } catch (err) {
      console.error('Answer marking failed', err);
      setStatus({ tone: 'error', text: 'Marking failed due to a network or server error.' });
    } finally {
      setIsMarking(false);
    }
  };

  const retrySameQuestions = () => {
    setAnswers(Array.from({ length: questions.length }, () => ''));
    setReport(null);
    setStatus({ tone: 'info', text: 'Attempt reset with the same questions.' });
  };

  const resetToGenerator = () => {
    setQuestions([]);
    setAnswers([]);
    setReport(null);
    setStatus(null);
  };

  return (
    <div className="space-y-7">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300">Step 4 of 4</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">Exam Practice</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
              Generate exam-board questions, answer them, then get marks, a predicted grade, and targeted upgrade advice.
            </p>
          </div>
          <Link href="/dashboard/notes" className={buttonStyles({ variant: 'secondary' })}>
            <BookOpen className="h-4 w-4" />
            New topic
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {status ? <div className={`rounded-lg border px-4 py-3 text-sm ${statusStyles[status.tone]}`}>{status.text}</div> : null}

      {!inPractice ? (
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="text-sm text-slate-700 dark:text-slate-300">
              Subject
              <select
                value={form.subject}
                onChange={(event) => updateSubject(event.target.value as Subject)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              >
                {subjects.map((subject) => (
                  <option key={subject.value} value={subject.value}>
                    {subject.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-slate-700 dark:text-slate-300">
              Topic
              <input
                value={form.topic}
                onChange={(event) => setForm((prev) => ({ ...prev, topic: event.target.value }))}
                placeholder="e.g. Sources of finance"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>

            <label className="text-sm text-slate-700 dark:text-slate-300">
              Exam board
              <select
                value={form.examBoard}
                onChange={(event) => updateExamBoard(event.target.value as ExamBoard)}
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
                onChange={(event) => setForm((prev) => ({ ...prev, examType: event.target.value as ExamType }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="gcse">GCSE</option>
                <option value="a-level">A-Level</option>
              </select>
            </label>

            <label className="text-sm text-slate-700 dark:text-slate-300">
              Specification focus
              <input
                value={form.specification}
                onChange={(event) => setForm((prev) => ({ ...prev, specification: event.target.value }))}
                placeholder="e.g. cash-flow forecasts and break-even"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>

            <label className="text-sm text-slate-700 dark:text-slate-300">
              Figure URL
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

          <div className="mt-5">
            <fieldset className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
              <legend className="px-1 text-sm font-semibold text-slate-800 dark:text-slate-200">Question mix</legend>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={form.allowMcq}
                    onChange={(event) => setForm((prev) => ({ ...prev, allowMcq: event.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                  />
                  Allow MCQs
                </label>
                <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={form.allowCalculation}
                    onChange={(event) => setForm((prev) => ({ ...prev, allowCalculation: event.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                  />
                  Allow calculations
                </label>
                <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={form.useOnlineResources}
                    onChange={(event) => setForm((prev) => ({ ...prev, useOnlineResources: event.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                  />
                  Online resources
                </label>
              </div>
            </fieldset>
          </div>

          {!isGenerationValid ? (
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">Provide a clear topic.</p>
          ) : null}

          <div className="mt-5 flex justify-end">
            <button
              className={buttonStyles({ variant: 'primary' })}
              onClick={handleGenerate}
              disabled={isGenerating || !isGenerationValid}
            >
              <Sparkles className="h-4 w-4" />
              {isGenerating ? 'Generating...' : 'Generate exam questions'}
            </button>
          </div>
        </section>
      ) : null}

      {inPractice && !report ? (
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                {questions.length} questions - {totalAvailableMarks} marks
              </p>
              <h2 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">Answer Practice</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={resetToGenerator} className={buttonStyles({ variant: 'secondary' })}>
                New set
              </button>
              <button type="button" onClick={handleMarkAnswers} disabled={isMarking || answeredCount === 0} className={buttonStyles({ variant: 'primary' })}>
                <CheckCircle2 className="h-4 w-4" />
                {isMarking ? 'Marking...' : 'Mark responses'}
              </button>
            </div>
          </div>

          <div className="mt-5 space-y-5">
            {questions.map((question, index) => (
              <article key={`${question.marks}-${index}`} className="rounded-lg border border-slate-200 p-5 dark:border-slate-700">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <span>Question {index + 1}</span>
                  <span className="rounded-full bg-blue-100 px-2.5 py-1 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                    {question.marks} marks
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {question.commandWord}
                  </span>
                  {question.questionType === 'mcq' ? (
                    <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-indigo-700 dark:bg-indigo-950/45 dark:text-indigo-300">
                      MCQ
                    </span>
                  ) : null}
                  {question.isCalculation ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-300">
                      <Calculator className="h-3.5 w-3.5" />
                      Calculation
                    </span>
                  ) : null}
                </div>

                <MarkdownContent className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100" content={question.question} />
                {question.figureUrl ? (
                  <Image
                    src={question.figureUrl}
                    alt="Question figure"
                    width={1200}
                    height={720}
                    className="mt-4 max-h-72 w-full rounded-lg border border-slate-300 object-contain dark:border-slate-700"
                  />
                ) : null}

                {question.skillsAssessed.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {question.skillsAssessed.map((skill) => (
                      <span key={skill} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : null}

                {question.sourceUrl ? (
                  <a
                    href={question.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex text-xs font-semibold text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
                  >
                    Source: {question.sourceTitle || question.sourceUrl}
                  </a>
                ) : null}

                {question.questionType === 'mcq' ? (
                  <div className="mt-4 grid gap-3">
                    {question.options.map((option, optionIndex) => {
                      const letter = optionLetters[optionIndex];
                      const selected = answers[index] === letter;
                      return (
                        <button
                          key={letter}
                          type="button"
                          onClick={() => updateAnswer(index, letter)}
                          className={buttonStyles({
                            variant: 'plain',
                            size: 'none',
                            className: `justify-start rounded-lg border px-4 py-3 text-left text-sm font-medium ${
                              selected
                                ? 'border-blue-600 bg-blue-50 text-blue-900 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-200'
                                : 'border-slate-300 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200'
                            }`,
                          })}
                        >
                          <span className="mr-2 font-bold">{letter}.</span>
                          <MarkdownContent inline content={option} />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <label className="mt-4 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Your answer
                    <textarea
                      value={answers[index] || ''}
                      onChange={(event) => updateAnswer(index, event.target.value)}
                      rows={question.marks >= 9 ? 9 : question.marks >= 6 ? 7 : 5}
                      className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </label>
                )}
              </article>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5 dark:border-slate-700">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {answeredCount} of {questions.length} answered
            </p>
            <button type="button" onClick={handleMarkAnswers} disabled={isMarking || answeredCount === 0} className={buttonStyles({ variant: 'primary', size: 'lg' })}>
              <ClipboardCheck className="h-4 w-4" />
              {isMarking ? 'Marking...' : 'Mark full attempt'}
            </button>
          </div>
        </section>
      ) : null}

      {report ? (
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-950">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300">Predicted Grade</p>
              <p className={`mt-3 text-6xl font-black ${reportTone(report.percentage)}`}>{report.predictedGrade}</p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {report.totalMarksAwarded} / {report.totalAvailableMarks} marks - {report.percentage}%
              </p>
              {report.targetGrade ? (
                <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-200">
                  <TrendingUp className="h-4 w-4" />
                  Target next: {report.targetGrade}
                </p>
              ) : (
                <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1.5 text-sm font-semibold text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
                  <Target className="h-4 w-4" />
                  Top grade secured
                </p>
              )}
              <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">{report.gradeBoundaryNote}</p>
            </div>

            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Marked Attempt</h2>
                <MarkdownContent className="mt-2 text-sm text-slate-700 dark:text-slate-300" content={report.summary} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">Weakness Analysis</h3>
                  <ul className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                    {report.weaknessAnalysis.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">Grade Upgrade Advice</h3>
                  <ul className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                    {report.gradeBoostAdvice.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-5">
            {report.markedAnswers.map((marked) => {
              const question = questions[marked.questionIndex];
              if (!question) return null;
              return (
                <article key={marked.questionIndex} className="rounded-lg border border-slate-200 p-5 dark:border-slate-700">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Question {marked.questionIndex + 1}</span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {question.commandWord}
                      </span>
                      {question.questionType === 'mcq' ? (
                        <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/45 dark:text-indigo-300">
                          MCQ
                        </span>
                      ) : null}
                    </div>
                    <span className={`text-lg font-black ${reportTone(Math.round((marked.marksAwarded / Math.max(marked.maxMarks, 1)) * 100))}`}>
                      {marked.marksAwarded} / {marked.maxMarks}
                    </span>
                  </div>

                  <MarkdownContent className="mt-3 text-slate-900 dark:text-slate-100" content={question.question} />

                  {question.questionType === 'mcq' ? (
                    <div className="mt-3 grid gap-2">
                      {question.options.map((option, optionIndex) => {
                        const letter = optionLetters[optionIndex];
                        const isSelected = answers[marked.questionIndex] === letter;
                        const isCorrect = question.correctOption === letter;
                        return (
                          <div
                            key={letter}
                            className={`rounded-lg border px-3 py-2 text-sm ${
                              isCorrect
                                ? 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/35 dark:text-emerald-200'
                                : isSelected
                                  ? 'border-red-500 bg-red-50 text-red-900 dark:bg-red-950/35 dark:text-red-200'
                                  : 'border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <span className="font-bold">{letter}.</span> <MarkdownContent inline content={option} />
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {question.sourceUrl ? (
                    <a
                      href={question.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex text-xs font-semibold text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
                    >
                      Source: {question.sourceTitle || question.sourceUrl}
                    </a>
                  ) : null}

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Feedback - {marked.band}</p>
                      <MarkdownContent className="mt-2 text-sm text-slate-700 dark:text-slate-300" content={marked.feedback} />
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Exemplar Answer</p>
                      <MarkdownContent className="mt-2 text-sm text-slate-700 dark:text-slate-300" content={marked.exemplarAnswer} />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Strengths</p>
                      <ul className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-300">
                        {(marked.strengths.length > 0 ? marked.strengths : ['No clear credit points were identified.']).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">Improvements</p>
                      <ul className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-300">
                        {(marked.improvements.length > 0 ? marked.improvements : ['Add more precise evidence from the question context.']).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button type="button" onClick={retrySameQuestions} className={buttonStyles({ variant: 'primary', size: 'lg' })}>
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
            <button type="button" onClick={resetToGenerator} className={buttonStyles({ variant: 'secondary', size: 'lg' })}>
              New set
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
