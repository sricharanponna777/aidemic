'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Calculator,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  LayoutDashboard,
  RefreshCw,
  Rocket,
  Sigma,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import { MarkdownContent } from '@/components/MarkdownContent';
import { SearchSelect } from '@/components/SearchSelect';
import { SubjectSpecSelector, getSelectedSpecLabel } from '@/components/SubjectSpecSelector';
import { TopicInput } from '@/components/TopicInput';
import { buttonStyles } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useUserSubjects } from '@/hooks/useUserSubjects';
import {
  buildLiteratureCreationOption,
  getPoetryClusterPoems,
  getQualificationTopicError,
  getMajorTopicsForSubject,
  isAllowedQualificationTopic,
  isPoetryCluster,
} from '@/lib/ai/majorTopics';
import { createClient } from '@/lib/supabase-client';
import { getCreationOptionChoices, getCreationOptionLabel, isSubjectSpecComplete } from '@/lib/ai/subjectConfig';
import { getTopicRelevanceError } from '@/lib/ai/topicRelevance';


type Subject =
  | 'biology'
  | 'chemistry'
  | 'physics'
  | 'mathematics'
  | 'english language'
  | 'english literature'
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
  sourceMaterial?: string;
};

interface AIGenerateForm {
  topic: string;
  subject: Subject;
  examBoard: ExamBoard;
  examType: ExamType;
  specOption: string;
  poemOne: string;
  poemTwo: string;
  englishLanguagePaper: 'paper1' | 'paper2';
  figureUrl: string;
  questionCount: number;
  allowMcq: boolean;
  allowCalculation: boolean;
}

type StatusTone = 'info' | 'success' | 'warning' | 'error';
type StatusMessage = { tone: StatusTone; text: string };


const MIN_QUESTIONS = 1;
const MAX_QUESTIONS = 20;
const optionLetters = ['A', 'B', 'C', 'D'] as const;



const defaultForm: AIGenerateForm = {
  topic: '',
  subject: 'biology',
  examBoard: 'aqa',
  examType: 'gcse',
  specOption: '',
  poemOne: '',
  poemTwo: '',
  englishLanguagePaper: 'paper1',
  figureUrl: '',
  questionCount: 6,
  allowMcq: true,
  allowCalculation: false,
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

const getEnglishLanguagePaperLabel = (paper: 'paper1' | 'paper2') =>
  paper === 'paper1' ? 'Paper 1: Explorations in Creative Reading and Writing' : 'Paper 2: Writers Viewpoints and Perspectives';

const splitEnglishSourceFromQuestion = (questionText: string) => {
  if (!/\bSource\s+A\b/i.test(questionText)) {
    return { source: '', question: questionText };
  }

  const markerMatch = questionText.match(/\n\s*(?:Question\s*1|Q1)\s*[:.-]\s*/i);
  if (!markerMatch || markerMatch.index === undefined || markerMatch.index < 150) {
    return { source: '', question: questionText };
  }

  return {
    source: questionText.slice(0, markerMatch.index).trim(),
    question: questionText.slice(markerMatch.index + markerMatch[0].length).trim() || 'Answer the multiple-choice question.',
  };
};

function CalculationAnswerEditor({
  value,
  onChange,
  rows,
}: {
  value: string;
  onChange: (value: string) => void;
  rows: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertSnippet = (snippet: string, cursorOffset = snippet.length) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const next = `${value.slice(0, start)}${snippet}${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      textarea?.focus();
      const nextCursor = start + cursorOffset;
      textarea?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const renderedAnswer = value.trim() || ' ';

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Your answer</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            title="Inline math"
            onClick={() => insertSnippet('\\(x\\)', 3)}
            className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-white/10 dark:bg-[#0A0F1E] dark:text-slate-200 dark:hover:bg-white/10"
          >
            <Sigma className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Power"
            onClick={() => insertSnippet('\\(x^{2}\\)', 3)}
            className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-white/10 dark:bg-[#0A0F1E] dark:text-slate-200 dark:hover:bg-white/10"
          >
            x²
          </button>
          <button
            type="button"
            title="Fraction"
            onClick={() => insertSnippet('\\(\\frac{a}{b}\\)', 8)}
            className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-white/10 dark:bg-[#0A0F1E] dark:text-slate-200 dark:hover:bg-white/10"
          >
            a/b
          </button>
          <button
            type="button"
            title="Square root"
            onClick={() => insertSnippet('\\(\\sqrt{x}\\)', 8)}
            className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-white/10 dark:bg-[#0A0F1E] dark:text-slate-200 dark:hover:bg-white/10"
          >
            √
          </button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={rows}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100"
        />
        <div className="min-h-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:border-white/6 dark:bg-[#0A0F1E] dark:text-slate-100">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <Eye className="h-3.5 w-3.5" />
            Rendered
          </div>
          <MarkdownContent className="text-sm" content={renderedAnswer} />
        </div>
      </div>
    </div>
  );
}

export default function AIQuestionsPage() {
  const { session } = useAuth();
  const supabase = createClient();

  const [form, setForm] = useState<AIGenerateForm>(defaultForm);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isMarking, setIsMarking] = useState(false);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [sourceMaterial, setSourceMaterial] = useState('');
  const [report, setReport] = useState<MarkingReport | null>(null);
  const { subjects: userSubjects, isLoading: subjectsLoading, error: subjectsError } = useUserSubjects();
  const [selectedSubjectId, setSelectedSubjectId] = useState('');

  const effectiveSubjectId = selectedSubjectId || userSubjects[0]?.id || '';
  const selectedSubject = userSubjects.find((subject) => subject.id === effectiveSubjectId) ?? null;
  const creationOptions = getCreationOptionChoices(selectedSubject);
  const creationOptionLabel = getCreationOptionLabel(selectedSubject);
  const poetryPoems = getPoetryClusterPoems(form.specOption);
  const isSelectedPoetryCluster = isPoetryCluster(form.specOption);
  const effectiveCreationOption = buildLiteratureCreationOption(form.specOption, form.poemOne, form.poemTwo);
  const topicSuggestions = getMajorTopicsForSubject(selectedSubject, form.specOption, form.poemOne, form.poemTwo);
  const subjectSpecComplete = isSubjectSpecComplete(selectedSubject);
  const topicIsAllowed = !form.topic.trim() || isAllowedQualificationTopic(form.topic, topicSuggestions);
  const poetrySelectionComplete = !isSelectedPoetryCluster || !!form.poemOne;
  const isEnglishLanguagePractice =
    selectedSubject?.subject === 'english language' &&
    selectedSubject.exam_board === 'aqa' &&
    selectedSubject.exam_type === 'gcse';
  const fixedQuestionCount = isEnglishLanguagePractice
    ? form.englishLanguagePaper === 'paper1'
      ? 8
      : 5
    : Math.min(Math.max(Math.floor(form.questionCount || 6), MIN_QUESTIONS), MAX_QUESTIONS);

  const isGenerationValid = isEnglishLanguagePractice || (form.topic.trim().length >= 3 && topicIsAllowed && poetrySelectionComplete);
  const inPractice = questions.length > 0;
  const answeredCount = useMemo(() => answers.filter((answer) => answer.trim().length > 0).length, [answers]);
  const totalAvailableMarks = useMemo(() => questions.reduce((sum, question) => sum + question.marks, 0), [questions]);
  const setupValidationMessage = subjectsError
    || (!selectedSubject ? 'Choose one of your saved subjects.' : '')
    || (!subjectSpecComplete ? 'Update this subject on the Subjects page with its specification and tier.' : '')
    || (!isEnglishLanguagePractice && !poetrySelectionComplete ? 'Choose the first poem for this poetry cluster.' : '')
    || (!isEnglishLanguagePractice && form.topic.trim().length < 3 ? 'Provide a clear topic.' : '')
    || (!isEnglishLanguagePractice && !topicIsAllowed ? 'Choose one of the suggested topics for this qualification.' : '');
  const handleGenerate = async () => {
    if (!selectedSubject) {
      setStatus({ tone: 'error', text: 'Choose one of your saved subjects before generating questions.' });
      return;
    }
    if (!subjectSpecComplete) {
      setStatus({ tone: 'error', text: 'Update this subject on the Subjects page with its specification and tier before generating questions.' });
      return;
    }
    if (!isGenerationValid) {
      if (topicIsAllowed) {
        setStatus({ tone: 'error', text: 'Add a topic before generating questions.' });
      } else {
        setStatus(null);
      }
      return;
    }
    const paperLabel = getEnglishLanguagePaperLabel(form.englishLanguagePaper);
    const specification = isEnglishLanguagePractice
      ? `${getSelectedSpecLabel(selectedSubject, effectiveCreationOption)} - ${paperLabel}`
      : getSelectedSpecLabel(selectedSubject, effectiveCreationOption);
    if (!isEnglishLanguagePractice) {
      const topicError = getQualificationTopicError(form.topic.trim(), topicSuggestions);
      if (topicError) {
        setStatus(null);
        return;
      }
      const relevanceError = getTopicRelevanceError({
        topic: form.topic.trim(),
        subject: selectedSubject.subject,
        examBoard: selectedSubject.exam_board,
        examType: selectedSubject.exam_type,
        specification,
      });
      if (relevanceError) {
        setStatus({ tone: 'error', text: relevanceError });
        return;
      }
    }
    const payload = {
      topic: isEnglishLanguagePractice ? `AQA English Language ${paperLabel}` : form.topic.trim(),
      subject: selectedSubject.subject,
      examBoard: selectedSubject.exam_board,
      examType: selectedSubject.exam_type,
      specification,
      prompt: isEnglishLanguagePractice
        ? `The student is preparing for ${paperLabel}. Create the fixed AQA English Language practice set for this paper.`
        : '',
      figureUrl: form.figureUrl.trim(),
      questionCount: fixedQuestionCount,
      allowMcq: isEnglishLanguagePractice ? true : form.allowMcq,
      allowCalculation: isEnglishLanguagePractice ? false : form.allowCalculation,
      useOnlineResources: true,
    };

    setIsGenerating(true);
    setReport(null);
    setStatus({ tone: 'info', text: 'Generating Topic-wise exam practice questions...' });

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
      const embeddedSource = splitEnglishSourceFromQuestion(generatedQuestions[0]?.question ?? '');
      const nextSourceMaterial = typeof body.sourceMaterial === 'string' && body.sourceMaterial.trim()
        ? body.sourceMaterial.trim()
        : embeddedSource.source;
      const cleanQuestions = embeddedSource.source
        ? generatedQuestions.map((question, index) => (
            index === 0 ? { ...question, question: embeddedSource.question } : question
          ))
        : generatedQuestions;

      const warnings: string[] = Array.isArray(body.warnings)
        ? body.warnings.filter((item: unknown): item is string => typeof item === 'string')
        : [];
      setSourceMaterial(nextSourceMaterial);
      setQuestions(cleanQuestions);
      setAnswers(Array.from({ length: cleanQuestions.length }, () => ''));
      setStatus({
        tone: warnings.length > 0 ? 'warning' : 'success',
        text: `Generated ${cleanQuestions.length} exam-practice questions.${warnings.length > 0 ? ` ${warnings.join(' ')}` : ''}`,
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
    const attemptTopic = isEnglishLanguagePractice
      ? `AQA English Language ${getEnglishLanguagePaperLabel(form.englishLanguagePaper)}`
      : form.topic.trim();

    try {
      const response = await fetch('/api/ai/mark-answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: attemptTopic,
          subject: selectedSubject?.subject ?? form.subject,
          examBoard: selectedSubject?.exam_board ?? form.examBoard,
          examType: selectedSubject?.exam_type ?? form.examType,
          specification: isEnglishLanguagePractice
            ? `${getSelectedSpecLabel(selectedSubject, effectiveCreationOption)} - ${getEnglishLanguagePaperLabel(form.englishLanguagePaper)}`
            : getSelectedSpecLabel(selectedSubject, effectiveCreationOption),
          sourceMaterial,
          questions,
          answers,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setStatus({ tone: 'error', text: body.error || 'Marking failed.' });
        return;
      }

      const markedReport = body.report as MarkingReport;
      setReport({ ...markedReport, sourceMaterial });
      setStatus({ tone: 'success', text: 'Attempt marked with predicted grade and next-step advice.' });

      if (session?.user?.id && selectedSubject) {
        const allWeaknessTags = markedReport.markedAnswers.flatMap((a) => a.weaknessTags ?? []);
        const savedWeaknessTags = allWeaknessTags.length > 0
          ? allWeaknessTags
          : markedReport.weaknessAnalysis.map((item) => item.replace(/^Main pattern to fix:\s*/i, '').replace(/\.$/, '').trim()).filter(Boolean);
        const attemptRow = {
          user_id: session.user.id,
          subject: selectedSubject.subject,
          exam_board: selectedSubject.exam_board,
          exam_type: selectedSubject.exam_type,
          topic: attemptTopic,
          total_marks_awarded: Math.round(markedReport.totalMarksAwarded),
          total_available_marks: Math.round(markedReport.totalAvailableMarks),
          percentage: Math.round(markedReport.percentage),
          predicted_grade: markedReport.predictedGrade,
          weakness_tags: savedWeaknessTags,
          weakness_analysis: markedReport.weaknessAnalysis,
        };
        const { error: saveError } = await supabase.from('exam_practice_attempts').insert({
          ...attemptRow,
          questions_payload: questions,
          answers_payload: answers,
          marking_report: { ...markedReport, sourceMaterial },
        });
        if (saveError) {
          const { error: fallbackSaveError } = await supabase.from('exam_practice_attempts').insert(attemptRow);
          if (fallbackSaveError) {
            console.error('Failed to save attempt:', fallbackSaveError.message);
            setStatus({ tone: 'warning', text: 'Attempt marked, but could not be saved to your history.' });
          } else {
            setStatus({ tone: 'warning', text: 'Attempt marked and saved, but detailed question statistics need the latest database migration.' });
          }
        }
      }
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
    setSourceMaterial('');
    setReport(null);
    setStatus(null);
  };

  return (
    <main className="space-y-7" aria-labelledby="ai-questions-title">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-linear-to-br from-indigo-50 to-white p-6 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.7)] dark:border-white/6 dark:from-[#131B2E] dark:to-[#0d1424] dark:shadow-[0_24px_48px_-28px_rgba(2,6,23,0.95)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">Step 5 of 5</p>
            <div className="mt-2 flex items-center gap-3">
              <Rocket className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
              <h1 id="ai-questions-title" className="text-3xl font-bold text-slate-900 dark:text-white">Smart Practice</h1>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
              Generate exam-board questions, answer them, then get marks, a predicted grade, and targeted upgrade advice.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/study-sessions" className={buttonStyles({ variant: 'secondary' })}>
              <ArrowLeft className="h-4 w-4" />
              Back to revision
            </Link>
            <Link href="/dashboard" className={buttonStyles({ variant: 'primary' })}>
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {status && (inPractice || !setupValidationMessage) ? <div className={`rounded-xl border px-4 py-3 text-sm ${statusStyles[status.tone]}`}>{status.text}</div> : null}

      {isGenerating ? (
        <>
          <style>{`@keyframes ai-loading{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
          <div className="h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
            <div className="h-full w-2/5 rounded-full bg-linear-to-r from-indigo-600 to-purple-500" style={{ animation: 'ai-loading 1.4s ease-in-out infinite' }} />
          </div>
        </>
      ) : null}

      {!inPractice ? (
        <section className="rounded-2xl border border-slate-200 dark:border-white/6 bg-white dark:bg-[#131B2E] p-6 shadow-sm dark:shadow-none">
          <SubjectSpecSelector
            subjects={userSubjects}
            isLoading={subjectsLoading}
            selectedSubjectId={effectiveSubjectId}
            onSubjectChange={(id) => {
              setSelectedSubjectId(id);
              setForm((prev) => ({ ...prev, specOption: '', poemOne: '', poemTwo: '', topic: '' }));
            }}
          />

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            {isEnglishLanguagePractice ? (
              <fieldset className="md:col-span-2">
                <legend className="text-sm font-semibold text-slate-700 dark:text-slate-300">Paper</legend>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {(['paper1', 'paper2'] as const).map((paper) => {
                    const selected = form.englishLanguagePaper === paper;
                    return (
                      <button
                        key={paper}
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, englishLanguagePaper: paper }))}
                        className={`rounded-lg border px-4 py-3 text-left transition ${
                          selected
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-950 dark:border-indigo-500/50 dark:bg-indigo-500/10 dark:text-indigo-100'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-indigo-500/10'
                        }`}
                      >
                        <span className="block text-sm font-semibold">{paper === 'paper1' ? 'Paper 1' : 'Paper 2'}</span>
                        <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                          {paper === 'paper1' ? '8 questions - fiction reading and creative writing' : '5 questions - viewpoints, comparison and writing'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}

            {creationOptions.length > 0 ? (
              <SearchSelect
                label={creationOptionLabel}
                value={form.specOption}
                onChange={(value) => setForm((prev) => ({
                    ...prev,
                    specOption: value,
                    poemOne: '',
                    poemTwo: '',
                    topic: '',
                  }))}
                options={[
                  { value: '', label: `Any ${creationOptionLabel.toLowerCase()}` },
                  ...creationOptions.map((option) => ({ value: option, label: option })),
                ]}
                placeholder={`Search ${creationOptionLabel.toLowerCase()}...`}
                className="text-sm text-slate-700 dark:text-slate-300"
                inputClassName="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100"
              />
            ) : null}

            {isSelectedPoetryCluster ? (
              <>
                <label className="text-sm text-slate-700 dark:text-slate-300">
                  First poem
                  <select
                    value={form.poemOne}
                    onChange={(event) => setForm((prev) => ({
                      ...prev,
                      poemOne: event.target.value,
                      poemTwo: event.target.value === prev.poemTwo ? '' : prev.poemTwo,
                      topic: '',
                    }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100"
                  >
                    <option value="">Select first poem</option>
                    {poetryPoems.map((poem) => (
                      <option key={poem} value={poem}>{poem}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-slate-700 dark:text-slate-300">
                  Second poem <span className="text-slate-400">(optional)</span>
                  <select
                    value={form.poemTwo}
                    onChange={(event) => setForm((prev) => ({ ...prev, poemTwo: event.target.value, topic: '' }))}
                    disabled={!form.poemOne}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-400 disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100 dark:disabled:bg-white/5"
                  >
                    <option value="">No comparison poem</option>
                    {poetryPoems.filter((poem) => poem !== form.poemOne).map((poem) => (
                      <option key={poem} value={poem}>{poem}</option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}

            {!isEnglishLanguagePractice ? (
              <TopicInput
                label="Topic"
                value={form.topic}
                onChange={(value) => {
                  setForm((prev) => ({ ...prev, topic: value }));
                  setStatus(null);
                }}
                suggestions={topicSuggestions}
                isValidSelection={topicIsAllowed}
                placeholder="Start typing a topic from this qualification"
                className="text-sm text-slate-700 dark:text-slate-300"
                inputClassName="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100"
              />
            ) : null}

            {!isEnglishLanguagePractice ? (
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
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100"
                />
              </label>
            ) : null}

          </div>

          {!isEnglishLanguagePractice ? (
          <div className="mt-5">
            <fieldset className="rounded-lg border border-slate-200 p-4 dark:border-white/6">
              <legend className="px-1 text-sm font-semibold text-slate-800 dark:text-slate-200">Question mix</legend>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 dark:border-white/6 dark:bg-[#0A0F1E] dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={form.allowMcq}
                    onChange={(event) => setForm((prev) => ({ ...prev, allowMcq: event.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                  />
                  Allow MCQs
                </label>
                <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 dark:border-white/6 dark:bg-[#0A0F1E] dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={form.allowCalculation}
                    onChange={(event) => setForm((prev) => ({ ...prev, allowCalculation: event.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                  />
                  Allow calculations
                </label>
              </div>
            </fieldset>
          </div>
          ) : null}

          {setupValidationMessage ? (
            <p className={`mt-3 text-xs ${subjectsError ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-300'}`}>
              {setupValidationMessage}
            </p>
          ) : null}

          <div className="mt-5 flex justify-end">
            <button
              className={buttonStyles({ variant: 'primary' })}
              onClick={handleGenerate}
              disabled={isGenerating || !isGenerationValid || !selectedSubject || !subjectSpecComplete}
            >
              <Sparkles className="h-4 w-4" />
              {isGenerating ? 'Generating...' : 'Generate exam questions'}
            </button>
          </div>
        </section>
      ) : null}

      {inPractice && !report ? (
        <section className="rounded-2xl border border-slate-200 dark:border-white/6 bg-white dark:bg-[#131B2E] p-6 shadow-sm dark:shadow-none">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-indigo-600 dark:text-indigo-400">
                {questions.length} questions · {totalAvailableMarks} marks
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

          {sourceMaterial ? (
            <section className="mt-5 rounded-lg border border-indigo-200 bg-indigo-50/60 p-5 dark:border-indigo-500/25 dark:bg-indigo-500/10">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700 dark:text-indigo-300">
                Source Extract
              </p>
              <MarkdownContent className="mt-3 max-h-[34rem] overflow-y-auto pr-2 text-sm leading-7 text-slate-900 dark:text-slate-100" content={sourceMaterial} />
            </section>
          ) : null}

          <div className="mt-5 space-y-5">
            {questions.map((question, index) => (
              <article key={`${question.marks}-${index}`} className="rounded-lg border border-slate-200 p-5 dark:border-white/6">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <span>Question {index + 1}</span>
                  <span className="rounded-full bg-indigo-100 dark:bg-indigo-500/15 px-2.5 py-1 text-indigo-700 dark:text-indigo-300">
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
                    className="mt-4 max-h-72 w-full rounded-lg border border-slate-300 object-contain dark:border-white/6"
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
                                : 'border-slate-300 bg-white text-slate-800 dark:border-white/6 dark:bg-[#0A0F1E] dark:text-slate-200'
                            }`,
                          })}
                        >
                          <span className="mr-2 font-bold">{letter}.</span>
                          <MarkdownContent inline content={option} />
                        </button>
                      );
                    })}
                  </div>
                ) : question.isCalculation ? (
                  <CalculationAnswerEditor
                    value={answers[index] || ''}
                    onChange={(value) => updateAnswer(index, value)}
                    rows={question.marks >= 9 ? 9 : question.marks >= 6 ? 7 : 5}
                  />
                ) : (
                  <label className="mt-4 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Your answer
                    <textarea
                      value={answers[index] || ''}
                      onChange={(event) => updateAnswer(index, event.target.value)}
                      rows={question.marks >= 9 ? 9 : question.marks >= 6 ? 7 : 5}
                      className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100"
                    />
                  </label>
                )}
              </article>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5 dark:border-white/6">
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
        <section className="rounded-2xl border border-slate-200 dark:border-white/6 bg-white dark:bg-[#131B2E] p-6 shadow-sm dark:shadow-none">
          <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 dark:border-white/6 dark:bg-[#0A0F1E]">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">Predicted Grade</p>
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
                <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-indigo-100 dark:bg-indigo-500/15 px-3 py-1.5 text-sm font-semibold text-indigo-800 dark:text-indigo-200">
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
                <div className="rounded-lg border border-slate-200 p-4 dark:border-white/6">
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

                <div className="rounded-lg border border-slate-200 p-4 dark:border-white/6">
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
                <article key={marked.questionIndex} className="rounded-lg border border-slate-200 p-5 dark:border-white/6">
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
                                  : 'border-slate-200 text-slate-700 dark:border-white/6 dark:text-slate-300'
                            }`}
                          >
                            <span className="font-bold">{letter}.</span> <MarkdownContent inline content={option} />
                          </div>
                        );
                      })}
                    </div>
                  ) : answers[marked.questionIndex]?.trim() ? (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/6 dark:bg-[#0A0F1E]">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Your answer</p>
                      <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">{answers[marked.questionIndex]}</p>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm italic text-slate-400 dark:text-slate-500">No answer entered.</p>
                  )}

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
                        {(marked.improvements.length > 0
                          ? marked.improvements
                          : marked.marksAwarded >= marked.maxMarks
                            ? ['Full marks secured.']
                            : ['Add more precise evidence from the question context.']
                        ).map((item) => (
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
            <Link href="/dashboard" className={buttonStyles({ variant: 'primary', size: 'lg' })}>
              <LayoutDashboard className="h-4 w-4" />
              View dashboard progress
              <ArrowRight className="h-4 w-4" />
            </Link>
            <button type="button" onClick={retrySameQuestions} className={buttonStyles({ variant: 'secondary', size: 'lg' })}>
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
            <button type="button" onClick={resetToGenerator} className={buttonStyles({ variant: 'ghost', size: 'lg' })}>
              New set
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
