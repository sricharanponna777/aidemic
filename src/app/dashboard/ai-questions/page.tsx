'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Calculator,
  ClipboardCheck,
  Clock,
  LayoutDashboard,
  Radar,
  RefreshCw,
  Rocket,
  Printer,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import { GenerationProgressPanel } from '@/components/ai/GenerationProgressPanel';
import { MarkdownContent } from '@/components/MarkdownContent';
import { MathAnswerEditor } from '@/components/MathAnswerEditor';
import { PlotAnswerInput } from '@/components/plot/PlotAnswerInput';
import { DiagramAnswerInput } from '@/components/diagram/DiagramAnswerInput';
import { SearchSelect } from '@/components/SearchSelect';
import { SubjectSpecSelector, getSelectedSpecLabel } from '@/components/SubjectSpecSelector';
import { TopicInput } from '@/components/TopicInput';
import { buttonStyles } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/feedback';
import { fieldStyles } from '@/components/ui/field';
import { Chip, Meter, MonoLabel, Panel, PanelHeading, Stat, StatusBar, Workspace, WorkspaceBody } from '@/components/ui/telemetry';
import { useAuth } from '@/hooks/useAuth';
import { useGenerationJob, type GenerationJobRow } from '@/hooks/useGenerationJob';
import { useUserSubjects } from '@/hooks/useUserSubjects';
import { useTopicOptions } from '@/hooks/useTopicOptions';
import { useSubtopicOptions } from '@/hooks/useSubtopicOptions';
import { useLearningObjectives } from '@/hooks/useLearningObjectives';
import {
  buildLiteratureCreationOption,
  getPoetryClusterPoems,
  getQualificationTopicError,
  isAllowedQualificationTopic,
  isPoetryCluster,
} from '@/lib/ai/majorTopics';
import { aiCacheKey, cachedAiFetch, readAiCache, writeAiCache } from '@/lib/aiCache';
import { createClient } from '@/lib/supabase-client';
import { getCreationOptionChoices, getCreationOptionLabel, getPaperOptions, isSubjectSpecComplete } from '@/lib/ai/subjectConfig';
import { getTopicRelevanceError } from '@/lib/ai/topicRelevance';
import { gradeBadgeTone } from '@/lib/gradeTone';
import { isDiagramCompletionTopic } from '@/lib/ai/text';
import type { DiagramSpec, DiagramTemplateSelection, PaperSummary, PlotSpec } from '@/types';
// GAMIFICATION PAUSED: import { announceXp } from '@/lib/gamification/client';


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
  questionType: 'open' | 'mcq' | 'plot' | 'diagram';
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
  plotSpec: PlotSpec | null;
  diagramSpec: DiagramSpec | null;
  diagramTemplate: DiagramTemplateSelection | null;
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
  subtopic: string;
  learningObjective: string;
  paper: string;
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
  subtopic: '',
  learningObjective: '',
  paper: '',
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
  info: 'bg-info-muted text-info',
  success: 'bg-success-muted text-success',
  warning: 'bg-warning-muted text-warning',
  error: 'bg-danger-muted text-danger',
};

const SS_QUESTIONS = 'exam-questions';
const SS_ANSWERS = 'exam-answers';
const SS_SOURCE = 'exam-source-material';
const SS_REPORT = 'exam-report';
const SS_SUBJECT_ID = 'exam-subject-id';
const SS_FORM = 'exam-form';
const SS_SESSION_META = 'exam-session-meta';
const SS_MOCK_MODE = 'exam-mock-mode';
const SS_MOCK_DURATION = 'exam-mock-duration';
const SS_MOCK_DEADLINE = 'exam-mock-deadline';
/**
 * The in-flight generation job, so a student who navigates away mid-run picks
 * it back up instead of losing it. Everything the finished result needs to be
 * applied is stored with it rather than re-read from the form: the form is
 * still editable while a job runs, and a resumed run must land as the run that
 * was actually started.
 */
const SS_JOB = 'exam-generation-job';

const MOCK_DURATION_OPTIONS = [30, 45, 60, 90] as const;


const STAGE_LABELS = { saving: 'Saving your question set' };
const JOB_COLUMNS = 'id, status, result, error, updated_at';

type GenerationResult = {
  questions?: ExamQuestion[];
  sourceMaterial?: string;
  warnings?: string[];
};

type QuestionJobRow = GenerationJobRow & { result: GenerationResult | null };

type SessionMeta = {
  topic: string;
  subject: string;
  examBoard: string;
  examType: string;
  specification: string;
};

/** A generation job in flight, plus the context its result must be applied with. */
type PendingJob = {
  id: string;
  startedAt: number;
  questionCount: number;
  meta: SessionMeta;
  isPaperMode: boolean;
  isMockExam: boolean;
  mockDurationMinutes: number;
  /** Where the finished set is cached (see aiCache), so a run resumed after
   *  navigating away is cached too. Null when nobody is signed in. */
  cacheKey: string | null;
};

function ssRead<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw !== null ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function ssWrite(key: string, value: unknown) {
  try {
    if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, JSON.stringify(value));
    }
  } catch {}
}

// A "Practice this topic" action elsewhere in the app (e.g. the dashboard's weak-topic
// recommendation) can link here with ?subjectId=...&topic=... to jump straight into a
// pre-filled practice setup. Read once via lazy useState initializers below, so the
// deep link overrides whatever was restored from sessionStorage without needing an effect.
function readDeepLinkParams(): { subjectId: string; topic: string; subtopic: string } {
  try {
    const params = new URLSearchParams(window.location.search);
    return {
      subjectId: params.get('subjectId') || '',
      topic: params.get('topic') || '',
      // Daily Review sends this when the Learning Spine identified the gap at
      // subtopic level, so practice starts on the exact weak subtopic.
      subtopic: params.get('subtopic') || '',
    };
  } catch {
    return { subjectId: '', topic: '', subtopic: '' };
  }
}

const formatCountdown = (seconds: number) => {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
};

const reportTone = (percentage: number) => {
  if (percentage >= 75) return 'text-success';
  if (percentage >= 50) return 'text-info';
  return 'text-danger';
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

export default function AIQuestionsPage() {
  const { session } = useAuth();
  const supabase = createClient();
  const router = useRouter();

  const [form, setForm] = useState<AIGenerateForm>(() => {
    const deepLink = readDeepLinkParams();
    const base = ssRead<AIGenerateForm>(SS_FORM, defaultForm);
    return deepLink.topic
      ? { ...base, topic: deepLink.topic, subtopic: deepLink.subtopic }
      : base;
  });
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const job = useGenerationJob<QuestionJobRow>({ table: 'question_generation_jobs', columns: JOB_COLUMNS });
  const [isMarking, setIsMarking] = useState(false);
  const [questions, setQuestions] = useState<ExamQuestion[]>(() => {
    const deepLink = readDeepLinkParams();
    return deepLink.subjectId || deepLink.topic ? [] : ssRead<ExamQuestion[]>(SS_QUESTIONS, []);
  });
  const [answers, setAnswers] = useState<string[]>(() => {
    const deepLink = readDeepLinkParams();
    return deepLink.subjectId || deepLink.topic ? [] : ssRead<string[]>(SS_ANSWERS, []);
  });
  const [sourceMaterial, setSourceMaterial] = useState(() => {
    const deepLink = readDeepLinkParams();
    return deepLink.subjectId || deepLink.topic ? '' : ssRead(SS_SOURCE, '');
  });
  const [report, setReport] = useState<MarkingReport | null>(() => {
    const deepLink = readDeepLinkParams();
    return deepLink.subjectId || deepLink.topic ? null : ssRead<MarkingReport | null>(SS_REPORT, null);
  });
  const { subjects: userSubjects, isLoading: subjectsLoading, error: subjectsError } = useUserSubjects();
  const [selectedSubjectId, setSelectedSubjectId] = useState(() => {
    const deepLink = readDeepLinkParams();
    return deepLink.subjectId || ssRead(SS_SUBJECT_ID, '');
  });
  const [sessionMeta, setSessionMeta] = useState<SessionMeta | null>(() => {
    const deepLink = readDeepLinkParams();
    return deepLink.subjectId || deepLink.topic ? null : ssRead<SessionMeta | null>(SS_SESSION_META, null);
  });
  const [isMockExam, setIsMockExam] = useState(() => ssRead<boolean>(SS_MOCK_MODE, false));
  // Paper mode is a property of the generation, not of the session: it decides
  // what gets generated and then hands off to the paper page, so unlike the
  // mock-exam flags there is nothing to restore on a refresh.
  const [isPaperMode, setIsPaperMode] = useState(false);
  const [pendingPapers, setPendingPapers] = useState<PaperSummary[]>([]);
  const [mockDurationMinutes, setMockDurationMinutes] = useState<number>(() => ssRead<number>(SS_MOCK_DURATION, 45));
  const [mockDeadline, setMockDeadline] = useState<number | null>(() => ssRead<number | null>(SS_MOCK_DEADLINE, null));
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState<number | null>(null);
  const hasAutoSubmittedRef = useRef(false);

  useEffect(() => {
    const deepLink = readDeepLinkParams();
    if (deepLink.subjectId || deepLink.topic) router.replace('/dashboard/ai-questions');
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/papers')
      .then((response) => (response.ok ? response.json() : { papers: [] }))
      .then((body) => {
        if (!cancelled) setPendingPapers(Array.isArray(body.papers) ? body.papers : []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => { ssWrite(SS_QUESTIONS, questions); }, [questions]);
  useEffect(() => { ssWrite(SS_ANSWERS, answers); }, [answers]);
  useEffect(() => { ssWrite(SS_SOURCE, sourceMaterial); }, [sourceMaterial]);
  useEffect(() => { ssWrite(SS_REPORT, report); }, [report]);
  useEffect(() => { ssWrite(SS_SUBJECT_ID, selectedSubjectId); }, [selectedSubjectId]);
  useEffect(() => { ssWrite(SS_FORM, form); }, [form]);
  useEffect(() => { ssWrite(SS_SESSION_META, sessionMeta); }, [sessionMeta]);
  useEffect(() => { ssWrite(SS_MOCK_MODE, isMockExam); }, [isMockExam]);
  useEffect(() => { ssWrite(SS_MOCK_DURATION, mockDurationMinutes); }, [mockDurationMinutes]);
  useEffect(() => { ssWrite(SS_MOCK_DEADLINE, mockDeadline); }, [mockDeadline]);

  const effectiveSubjectId = selectedSubjectId || userSubjects[0]?.id || '';
  const selectedSubject = userSubjects.find((subject) => subject.id === effectiveSubjectId) ?? null;
  const creationOptions = getCreationOptionChoices(selectedSubject);
  const creationOptionLabel = getCreationOptionLabel(selectedSubject);
  const poetryPoems = getPoetryClusterPoems(form.specOption);
  const isSelectedPoetryCluster = isPoetryCluster(form.specOption);
  const effectiveCreationOption = buildLiteratureCreationOption(form.specOption, form.poemOne, form.poemTwo);
  const { topics: topicOptions, isLoading: topicsLoading } = useTopicOptions(selectedSubject, form.specOption, form.poemOne, form.poemTwo);
  const topicSuggestions = topicOptions.map((option) => option.name);
  const selectedTopicOption = topicOptions.find((option) => option.name === form.topic.trim()) ?? null;
  const { subtopics: subtopicSuggestions } = useSubtopicOptions(selectedTopicOption?.id ?? null);
  const { objectives: learningObjectiveOptions } = useLearningObjectives(selectedSubject, 'exam_practice');
  const paperOptions = getPaperOptions(selectedSubject);
  const subjectSpecComplete = isSubjectSpecComplete(selectedSubject);
  const topicIsAllowed = !form.topic.trim() || topicsLoading || isAllowedQualificationTopic(form.topic, topicSuggestions);
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

  const topicIsReady = form.topic.trim().length === 0 || form.topic.trim().length >= 3;
  const isGenerationValid = isEnglishLanguagePractice || (topicIsReady && topicIsAllowed && !topicsLoading && poetrySelectionComplete);
  const inPractice = questions.length > 0;
  const answeredCount = useMemo(() => answers.filter((answer) => answer.trim().length > 0).length, [answers]);
  const totalAvailableMarks = useMemo(() => questions.reduce((sum, question) => sum + question.marks, 0), [questions]);
  const setupValidationMessage = subjectsError
    || (!selectedSubject ? 'Choose one of your saved subjects.' : '')
    || (!subjectSpecComplete ? 'Update this subject on the Subjects page with its specification and tier.' : '')
    || (!isEnglishLanguagePractice && !poetrySelectionComplete ? 'Choose the first poem for this poetry cluster.' : '')
    || (!isEnglishLanguagePractice && topicsLoading ? 'Loading topics for this qualification...' : '')
    || (!isEnglishLanguagePractice && !topicIsReady ? 'Topic must be at least 3 characters, or leave it blank to generalise.' : '')
    || (!isEnglishLanguagePractice && !topicIsAllowed ? 'Choose one of the suggested topics for this qualification.' : '');
  /**
   * Apply a finished question set. Shared by a fresh run and by one resumed
   * after navigating away, so both land identically -- and applied with the
   * context the run was *started* with, which the form may since have moved on
   * from.
   */
  const applyGenerationResult = async (result: GenerationResult, pending: PendingJob) => {
    const generatedQuestions: ExamQuestion[] = Array.isArray(result.questions) ? result.questions : [];
    if (generatedQuestions.length === 0) {
      setStatus({ tone: 'error', text: 'No questions were returned.' });
      return;
    }
    const embeddedSource = splitEnglishSourceFromQuestion(generatedQuestions[0]?.question ?? '');
    const nextSourceMaterial = typeof result.sourceMaterial === 'string' && result.sourceMaterial.trim()
      ? result.sourceMaterial.trim()
      : embeddedSource.source;
    const cleanQuestions = embeddedSource.source
      ? generatedQuestions.map((question, index) => (
          index === 0 ? { ...question, question: embeddedSource.question } : question
        ))
      : generatedQuestions;

    const warnings: string[] = Array.isArray(result.warnings)
      ? result.warnings.filter((item: unknown): item is string => typeof item === 'string')
      : [];

    if (pending.isPaperMode) {
      // The paper is stored server-side and answered on paper, so this flow
      // never enters the on-screen practice state at all.
      const paperResponse = await fetch('/api/papers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...pending.meta, sourceMaterial: nextSourceMaterial, questions: cleanQuestions }),
      });
      const paperBody = await paperResponse.json();
      if (!paperResponse.ok) {
        setStatus({ tone: 'error', text: paperBody.error || 'Could not create the paper.' });
        return;
      }
      router.push(`/dashboard/ai-questions/paper/${paperBody.paperId}`);
      return;
    }

    setSessionMeta(pending.meta);
    setSourceMaterial(nextSourceMaterial);
    setQuestions(cleanQuestions);
    setAnswers(Array.from({ length: cleanQuestions.length }, () => ''));
    hasAutoSubmittedRef.current = false;
    setMockDeadline(pending.isMockExam ? Date.now() + pending.mockDurationMinutes * 60000 : null);
    setStatus({
      tone: warnings.length > 0 ? 'warning' : 'success',
      text: pending.isMockExam
        ? `Mock exam started: ${cleanQuestions.length} questions, ${pending.mockDurationMinutes} minutes on the clock.`
        : `Generated ${cleanQuestions.length} exam-practice questions.${warnings.length > 0 ? ` ${warnings.join(' ')}` : ''}`,
    });
  };

  /** Handle a job that stopped being tracked: completed, failed, or timed out. */
  const settleJob = async (settled: QuestionJobRow | null, pending: PendingJob) => {
    if (!settled) {
      // Still running server-side, so the pointer stays put and coming back to
      // this tab resumes it rather than starting a second paid run.
      setStatus({
        tone: 'warning',
        text: 'Generation is taking longer than expected. It is still running — come back to this tab shortly.',
      });
      return;
    }
    ssWrite(SS_JOB, null);
    if (settled.status === 'failed' || !settled.result) {
      setStatus({ tone: 'error', text: settled.error || 'Generation failed.' });
      return;
    }
    if (pending.cacheKey) writeAiCache(pending.cacheKey, settled.result);
    await applyGenerationResult(settled.result, pending);
  };

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
      if (!topicIsReady) {
        setStatus({ tone: 'error', text: 'Topic must be at least 3 characters, or leave it blank to generalise.' });
      } else if (topicIsAllowed) {
        setStatus({ tone: 'error', text: 'Complete the setup above before generating questions.' });
      } else {
        setStatus(null);
      }
      return;
    }
    const paperLabel = getEnglishLanguagePaperLabel(form.englishLanguagePaper);
    const specification = isEnglishLanguagePractice
      ? `${getSelectedSpecLabel(selectedSubject, effectiveCreationOption)} - ${paperLabel}`
      : getSelectedSpecLabel(selectedSubject, effectiveCreationOption);
    if (!isEnglishLanguagePractice && form.topic.trim()) {
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
      subtopic: isEnglishLanguagePractice ? undefined : form.subtopic.trim() || undefined,
      learningObjective: isEnglishLanguagePractice ? undefined : form.learningObjective || undefined,
      paper: isEnglishLanguagePractice ? undefined : form.paper || undefined,
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
      // Interactive diagram-completion is unlocked by the diagram-completion learning
      // objective OR by topic/subtopic wording that implies a labelled/structural diagram
      // (mirrors isDiagramCompletionTopic's own gating); the server re-validates the same way.
      // Plot and diagram questions are marked by deterministic server code against
      // coordinates and node labels, which a photograph of handwriting cannot
      // produce -- so a paper never asks for one.
      allowPlot: !isPaperMode,
      allowDiagram:
        !isPaperMode &&
        !isEnglishLanguagePractice &&
        isDiagramCompletionTopic(selectedSubject.subject, form.topic, form.subtopic, form.learningObjective || ''),
      useOnlineResources: true,
    };

    const pending: PendingJob = {
      id: '',
      startedAt: Date.now(),
      questionCount: fixedQuestionCount,
      meta: {
        topic: payload.topic || 'General revision',
        subject: selectedSubject.subject,
        examBoard: selectedSubject.exam_board,
        examType: selectedSubject.exam_type,
        specification,
      },
      isPaperMode,
      isMockExam,
      mockDurationMinutes,
      cacheKey: await aiCacheKey('/api/questions/generate', payload),
    };

    // The same request as before: reuse that set rather than paying for a new
    // run. A paper is still created from it, since that happens on apply.
    const cached = pending.cacheKey ? readAiCache<GenerationResult>(pending.cacheKey) : null;
    if (cached) {
      setReport(null);
      setStatus(null);
      await applyGenerationResult(cached, pending);
      return;
    }

    setIsGenerating(true);
    setReport(null);
    // The progress panel says what the old status banner said, and says it with
    // a stage rather than a guess, so there is nothing left for the banner here.
    setStatus(null);
    job.begin({ questionCount: pending.questionCount, startedAt: pending.startedAt });

    try {
      // Generation runs as a background job: this returns a job id as soon as
      // the row exists, and the pipeline reports each stage onto that row for
      // the panel to follow. The work no longer depends on this page staying
      // open, which is what makes resuming possible at all.
      const response = await fetch('/api/questions/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        setStatus({ tone: 'error', text: body.error || 'Generation failed.' });
        return;
      }

      const started: PendingJob = { ...pending, id: body.jobId as string };
      ssWrite(SS_JOB, started);
      await settleJob(await job.track(started.id), started);
    } catch (err) {
      console.error('Question generation failed', err);
      setStatus({ tone: 'error', text: 'Generation failed due to a network or server error.' });
    } finally {
      setIsGenerating(false);
      job.reset();
    }
  };

  /**
   * Pick up a generation that was still running when this page was last left.
   * The job row is the source of truth, so the run survives the navigation, and
   * the elapsed clock is restored from when it actually started rather than
   * restarting from zero and understating the wait.
   */
  useEffect(() => {
    let cancelled = false;
    const resume = async () => {
      const pending = ssRead<PendingJob | null>(SS_JOB, null);
      if (!pending?.id) return;
      // A finished set is already on screen from this session; the pointer is
      // stale and applying it again would clobber work in progress.
      if (questions.length > 0) {
        ssWrite(SS_JOB, null);
        return;
      }
      setIsGenerating(true);
      job.begin({ questionCount: pending.questionCount, startedAt: pending.startedAt });
      try {
        const settled = await job.track(pending.id);
        if (!cancelled) await settleJob(settled, pending);
      } finally {
        if (!cancelled) {
          setIsGenerating(false);
          job.reset();
        }
      }
    };
    void resume();
    return () => {
      cancelled = true;
    };
    // Mount-only: this resumes whatever was in flight when the page was left.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const meta = sessionMeta ?? {
      topic: isEnglishLanguagePractice
        ? `AQA English Language ${getEnglishLanguagePaperLabel(form.englishLanguagePaper)}`
        : form.topic.trim() || 'General revision',
      subject: selectedSubject?.subject ?? '',
      examBoard: selectedSubject?.exam_board ?? '',
      examType: selectedSubject?.exam_type ?? '',
      specification: isEnglishLanguagePractice
        ? `${getSelectedSpecLabel(selectedSubject, effectiveCreationOption)} - ${getEnglishLanguagePaperLabel(form.englishLanguagePaper)}`
        : getSelectedSpecLabel(selectedSubject, effectiveCreationOption),
    };

    try {
      const response = await cachedAiFetch('/api/ai/mark-answers', {
        topic: meta.topic,
        subject: meta.subject,
        examBoard: meta.examBoard,
        examType: meta.examType,
        attemptMode: isMockExam ? 'mock' : 'practice',
        specification: meta.specification,
        sourceMaterial,
        questions,
        answers,
      });
      const body = await response.json();
      if (!response.ok) {
        setStatus({ tone: 'error', text: body.error || 'Marking failed.' });
        return;
      }

      const markedReport = body.report as MarkingReport;
      setReport({ ...markedReport, sourceMaterial });
      // GAMIFICATION PAUSED: announceXp(body.xp);
      setStatus({ tone: 'success', text: 'Attempt marked with predicted grade and next-step advice.' });

      if (session?.user?.id && meta.subject) {
        const allWeaknessTags = markedReport.markedAnswers.flatMap((a) => a.weaknessTags ?? []);
        const savedWeaknessTags = allWeaknessTags.length > 0
          ? allWeaknessTags
          : markedReport.weaknessAnalysis.map((item) => item.replace(/^Main pattern to fix:\s*/i, '').replace(/\.$/, '').trim()).filter(Boolean);
        const attemptRow = {
          user_id: session.user.id,
          subject: meta.subject,
          exam_board: meta.examBoard,
          exam_type: meta.examType,
          topic: meta.topic,
          total_marks_awarded: Math.round(markedReport.totalMarksAwarded),
          total_available_marks: Math.round(markedReport.totalAvailableMarks),
          percentage: Math.round(markedReport.percentage),
          predicted_grade: markedReport.predictedGrade,
          weakness_tags: savedWeaknessTags,
          weakness_analysis: markedReport.weaknessAnalysis,
          // Part of the base row, not the enriched one: the fallback below drops
          // the payload columns, and dropping this with them silently recorded a
          // mock as an ordinary practice attempt in every average.
          attempt_mode: isMockExam ? 'mock' : 'practice',
        };
        const { error: saveError } = await supabase.from('exam_practice_attempts').insert({
          ...attemptRow,
          questions_payload: questions,
          answers_payload: answers,
          marking_report: { ...markedReport, sourceMaterial },
          duration_minutes: isMockExam ? mockDurationMinutes : null,
          time_taken_seconds: isMockExam && mockDeadline
            ? Math.max(0, mockDurationMinutes * 60 - Math.max(0, Math.round((mockDeadline - Date.now()) / 1000)))
            : null,
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
    hasAutoSubmittedRef.current = false;
    setMockDeadline(isMockExam ? Date.now() + mockDurationMinutes * 60000 : null);
    setStatus({ tone: 'info', text: isMockExam ? 'Mock exam restarted with a fresh clock.' : 'Attempt reset with the same questions.' });
  };

  const resetToGenerator = () => {
    if (inPractice && isMockExam && !report) {
      const confirmAbandon = window.confirm('End this timed mock exam without submitting? Your progress will be lost.');
      if (!confirmAbandon) return;
    }
    setQuestions([]);
    setAnswers([]);
    setSourceMaterial('');
    setReport(null);
    setSessionMeta(null);
    setStatus(null);
    setIsMockExam(false);
    setMockDeadline(null);
    hasAutoSubmittedRef.current = false;
    try {
      sessionStorage.removeItem(SS_QUESTIONS);
      sessionStorage.removeItem(SS_ANSWERS);
      sessionStorage.removeItem(SS_SOURCE);
      sessionStorage.removeItem(SS_REPORT);
      sessionStorage.removeItem(SS_SUBJECT_ID);
      sessionStorage.removeItem(SS_FORM);
      sessionStorage.removeItem(SS_SESSION_META);
      sessionStorage.removeItem(SS_MOCK_MODE);
      sessionStorage.removeItem(SS_MOCK_DURATION);
      sessionStorage.removeItem(SS_MOCK_DEADLINE);
      sessionStorage.removeItem(SS_JOB);
    } catch {}
  };

  const handleMarkAnswersRef = useRef(handleMarkAnswers);
  useEffect(() => {
    handleMarkAnswersRef.current = handleMarkAnswers;
  });

  useEffect(() => {
    if (!isMockExam || !mockDeadline || report) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const remaining = Math.round((mockDeadline - Date.now()) / 1000);
      setTimeRemainingSeconds(Math.max(0, remaining));
      if (remaining <= 0 && !hasAutoSubmittedRef.current) {
        hasAutoSubmittedRef.current = true;
        void handleMarkAnswersRef.current();
      }
    };
    const interval = window.setInterval(tick, 1000);
    const timeout = window.setTimeout(tick, 0);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [isMockExam, mockDeadline, report]);

  const reportColumn = (
    <>
      <PanelHeading
        icon={Radar}
        aside={report ? <Chip tone="success">Marked</Chip> : inPractice ? <Chip tone="success">● Live session</Chip> : null}
      >
        Report
      </PanelHeading>

      {job.status ? (
        <GenerationProgressPanel
          status={job.status}
          elapsedMs={job.elapsedMs}
          progress={job.progress}
          remainingMs={job.remainingMs}
          overrunningStage={job.overrunningStage}
          labels={STAGE_LABELS}
          footer="Generation keeps running on the server — you can move around the app and come back to this tab to pick it up."
        />
      ) : null}

      {!inPractice && !job.status ? (
        <Panel>
          <p className="text-sm font-semibold text-content">Your report appears here</p>
          <ul className="mt-2 space-y-1.5 text-[13px] text-content-subtle">
            <li>Marks for every question</li>
            <li>A predicted grade for this attempt</li>
            <li>Feedback and an exemplar answer</li>
            <li>What to do to move up a grade</li>
          </ul>
        </Panel>
      ) : null}

      {!inPractice && pendingPapers.length > 0 ? (
        <Panel>
          <PanelHeading icon={Printer} as="h3">
            Papers waiting for you
          </PanelHeading>
          <p className="mt-1 text-[13px] text-content-subtle">Printed papers you have not uploaded and marked yet.</p>
          <ul className="mt-3 space-y-2">
            {pendingPapers.map((paper) => (
              <li key={paper.id}>
                <Link
                  href={`/dashboard/ai-questions/paper/${paper.id}`}
                  className="block rounded-lg border border-subtle bg-surface-sunken px-3 py-2.5 transition-colors hover:border-strong"
                >
                  <span className="block truncate text-sm font-semibold text-content">{paper.topic}</span>
                  <span className="mt-0.5 block font-mono text-[11px] text-content-subtle">
                    {paper.paperCode} · {paper.questionCount} questions · {paper.totalMarks} marks
                  </span>
                  <span className="mt-1 block text-xs font-semibold text-accent">
                    {paper.status === 'printed'
                      ? 'Upload your pages'
                      : paper.status === 'uploaded'
                        ? `${paper.pageCount} page${paper.pageCount === 1 ? '' : 's'} — transcribe`
                        : 'Check and mark'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {inPractice && !report ? (
        <>
          <Panel>
            <div className="flex items-baseline justify-between gap-2">
              <MonoLabel>Answered</MonoLabel>
              <span className="font-mono text-xs text-content-subtle">
                {answeredCount} / {questions.length}
              </span>
            </div>
            <Meter fraction={questions.length ? answeredCount / questions.length : 0} className="mt-3" label="Questions answered" />
          </Panel>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Questions" value={questions.length} />
            <Stat label="Marks" value={totalAvailableMarks} />
          </div>
          {isMockExam && timeRemainingSeconds !== null ? (
            <Stat
              label="Time left"
              value={formatCountdown(timeRemainingSeconds)}
              tone={timeRemainingSeconds <= 60 ? 'danger' : 'default'}
              hint="Marked automatically when time runs out"
            />
          ) : null}
          <Panel>
            <p className="text-sm font-semibold text-content">
              {isMockExam ? 'Mock exam rules' : 'How marking works'}
            </p>
            <p className="mt-1 text-[13px] text-content-subtle">
              {isMockExam
                ? 'No feedback until you submit. Unanswered questions score zero.'
                : 'Each answer is marked against the mark scheme. You can mark with some questions blank.'}
            </p>
          </Panel>
        </>
      ) : null}

      {report ? (
        <>
          <Panel>
            <div className="flex items-baseline justify-between gap-2">
              <MonoLabel>Grade equivalent</MonoLabel>
              <span className="font-mono text-[11px] text-content-subtle">This attempt only</span>
            </div>
            <div className="mt-2 flex items-end justify-between gap-3">
              <p
                className={`inline-flex rounded-lg px-3 py-1 font-mono text-4xl font-bold ${gradeBadgeTone({
                  grade: report.predictedGrade,
                  examType: selectedSubject?.exam_type,
                  specTier: selectedSubject?.spec_tier,
                })}`}
              >
                {report.predictedGrade}
              </p>
              <div className="text-right">
                <p className="font-mono text-2xl font-semibold text-content">{report.percentage}%</p>
                <p className="font-mono text-xs text-content-subtle">
                  {report.totalMarksAwarded} / {report.totalAvailableMarks} marks
                </p>
              </div>
            </div>
            <Meter fraction={report.percentage / 100} className="mt-3" label="Score" />
            <div className="mt-3">
              {report.targetGrade ? (
                <Chip tone="success">
                  <TrendingUp className="h-3 w-3" />
                  Target next: {report.targetGrade}
                </Chip>
              ) : (
                <Chip tone="inverse">
                  <Target className="h-3 w-3" />
                  Top grade secured
                </Chip>
              )}
            </div>
            <p className="mt-3 text-xs text-content-subtle">{report.gradeBoundaryNote}</p>
          </Panel>

          <Panel>
            <PanelHeading as="h3">Weakness analysis</PanelHeading>
            <ul className="mt-3 space-y-2 text-[13px] text-content-muted">
              {report.weaknessAnalysis.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <Link href="/dashboard/exam-coach" className={buttonStyles({ variant: 'secondary', size: 'sm', className: 'mt-4' })}>
              See patterns across all attempts
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Panel>

          <Panel>
            <PanelHeading as="h3">Grade upgrade advice</PanelHeading>
            <ul className="mt-3 space-y-2 text-[13px] text-content-muted">
              {report.gradeBoostAdvice.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      ) : null}
    </>
  );

  return (
    <Workspace>
      <PageHeader
        className="border-b border-subtle"
        icon={Rocket}
        eyebrow="Practice / Exam questions"
        titleId="ai-questions-title"
        title="Smart Practice"
        description="Generate exam-board questions, answer them, then get marks, a predicted grade, and targeted upgrade advice."
        actions={
          <>
            <Chip>● Mode: {isPaperMode ? 'on paper' : isMockExam ? 'timed mock' : 'practice'}</Chip>
            {inPractice ? (
              <Chip tone="success">
                {questions.length} questions · {totalAvailableMarks} marks
              </Chip>
            ) : null}
            {isMockExam ? (
              <Chip tone="danger">
                <Clock className="h-3 w-3" /> Timer: {mockDurationMinutes} min
              </Chip>
            ) : null}
          </>
        }
      />

      <WorkspaceBody aside={reportColumn}>
      {status && (inPractice || !setupValidationMessage) ? (
        <div className="border-b border-subtle p-4">
          <div role="status" aria-live="polite" className={`rounded-field px-3.5 py-2.5 text-body ${statusStyles[status.tone]}`}>
            {status.text}
          </div>
        </div>
      ) : null}

      {!inPractice ? (
        <>
        <div className="flex-1 p-5">
          <SubjectSpecSelector
            subjects={userSubjects}
            isLoading={subjectsLoading}
            selectedSubjectId={effectiveSubjectId}
            onSubjectChange={(id) => {
              setSelectedSubjectId(id);
              setForm((prev) => ({ ...prev, specOption: '', poemOne: '', poemTwo: '', topic: '', subtopic: '', learningObjective: '', paper: '' }));
            }}
          />

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            {isEnglishLanguagePractice ? (
              <fieldset className="md:col-span-2">
                <legend className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-content-subtle">Paper</legend>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {(['paper1', 'paper2'] as const).map((paper) => {
                    const selected = form.englishLanguagePaper === paper;
                    return (
                      <button
                        key={paper}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setForm((prev) => ({ ...prev, englishLanguagePaper: paper }))}
                        className={`rounded-lg border px-4 py-3 text-left transition ${
                          selected
                            ? 'border-accent bg-accent-muted text-content'
                            : 'border-subtle bg-surface text-content-muted hover:border-strong'
                        }`}
                      >
                        <span className="block text-sm font-semibold">{paper === 'paper1' ? 'Paper 1' : 'Paper 2'}</span>
                        <span className="mt-1 block text-xs text-content-subtle">
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
                    subtopic: '',
                  }))}
                options={[
                  { value: '', label: `Any ${creationOptionLabel.toLowerCase()}` },
                  ...creationOptions.map((option) => ({ value: option, label: option })),
                ]}
                placeholder={`Search ${creationOptionLabel.toLowerCase()}...`}
                inputClassName={fieldStyles()}
              />
            ) : null}

            {isSelectedPoetryCluster ? (
              <>
                <label className="block">
                  <MonoLabel className="mb-1">First poem</MonoLabel>
                  <select
                    value={form.poemOne}
                    onChange={(event) => setForm((prev) => ({
                      ...prev,
                      poemOne: event.target.value,
                      poemTwo: event.target.value === prev.poemTwo ? '' : prev.poemTwo,
                      topic: '',
                      subtopic: '',
                    }))}
                    className={fieldStyles()}
                  >
                    <option value="">Select first poem</option>
                    {poetryPoems.map((poem) => (
                      <option key={poem} value={poem}>{poem}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <MonoLabel className="mb-1">Second poem (optional)</MonoLabel>
                  <select
                    value={form.poemTwo}
                    onChange={(event) => setForm((prev) => ({ ...prev, poemTwo: event.target.value, topic: '', subtopic: '' }))}
                    disabled={!form.poemOne}
                    className={fieldStyles()}
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
                label="Topic (optional)"
                value={form.topic}
                onChange={(value) => {
                  setForm((prev) => ({ ...prev, topic: value, subtopic: '' }));
                  setStatus(null);
                }}
                suggestions={topicSuggestions}
                isValidSelection={topicIsAllowed}
                placeholder="Start typing a topic, or leave blank to generalise"
                inputClassName={fieldStyles()}
              />
            ) : null}

            {!isEnglishLanguagePractice && selectedTopicOption?.id && subtopicSuggestions.length > 0 ? (
              <TopicInput
                label="Subtopic (optional)"
                value={form.subtopic}
                onChange={(value) => setForm((prev) => ({ ...prev, subtopic: value }))}
                suggestions={subtopicSuggestions}
                placeholder="Narrow the focus within this topic"
                inputClassName={fieldStyles()}
              />
            ) : null}

            {!isEnglishLanguagePractice && learningObjectiveOptions.length > 0 ? (
              <label className="block">
                <MonoLabel className="mb-1">Learning objective (optional)</MonoLabel>
                <select
                  value={form.learningObjective}
                  onChange={(event) => setForm((prev) => ({ ...prev, learningObjective: event.target.value }))}
                  className={fieldStyles()}
                >
                  <option value="">No specific focus</option>
                  {learningObjectiveOptions.map((objective) => (
                    <option key={objective} value={objective}>{objective}</option>
                  ))}
                </select>
              </label>
            ) : null}

            {!isEnglishLanguagePractice && paperOptions.length > 0 ? (
              <label className="block">
                <MonoLabel className="mb-1">Paper (optional)</MonoLabel>
                <select
                  value={form.paper}
                  onChange={(event) => setForm((prev) => ({ ...prev, paper: event.target.value }))}
                  className={fieldStyles()}
                >
                  <option value="">General (any paper)</option>
                  {paperOptions.map((paper) => (
                    <option key={paper} value={paper}>{paper}</option>
                  ))}
                </select>
              </label>
            ) : null}

            {!isEnglishLanguagePractice ? (
              <label className="block">
                <MonoLabel className="mb-1">Question count</MonoLabel>
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
                  className={fieldStyles()}
                />
              </label>
            ) : null}

            {!isEnglishLanguagePractice ? (
              <label className="flex min-h-11 items-center gap-3 rounded-lg border border-subtle bg-surface px-3 text-sm font-medium text-content">
                <input
                  type="checkbox"
                  checked={isMockExam}
                  onChange={(event) => setIsMockExam(event.target.checked)}
                  className="h-4 w-4 rounded border-subtle text-accent"
                />
                Timed mock exam (countdown, no feedback until submitted)
              </label>
            ) : null}

            {!isEnglishLanguagePractice ? (
              <label className="flex min-h-11 items-center gap-3 rounded-lg border border-subtle bg-surface px-3 text-sm font-medium text-content">
                <input
                  type="checkbox"
                  checked={isPaperMode}
                  onChange={(event) => {
                    setIsPaperMode(event.target.checked);
                    // Nothing on paper can be timed by a countdown in the browser.
                    if (event.target.checked) setIsMockExam(false);
                  }}
                  className="h-4 w-4 rounded border-subtle text-accent"
                />
                Sit on paper (print, write by hand, photograph, upload)
              </label>
            ) : null}

            {!isEnglishLanguagePractice && isMockExam ? (
              <label className="block">
                <MonoLabel className="mb-1">Duration</MonoLabel>
                <select
                  value={mockDurationMinutes}
                  onChange={(event) => setMockDurationMinutes(Number(event.target.value))}
                  className={fieldStyles()}
                >
                  {MOCK_DURATION_OPTIONS.map((mins) => (
                    <option key={mins} value={mins}>{mins} minutes</option>
                  ))}
                </select>
              </label>
            ) : null}

          </div>

          {!isEnglishLanguagePractice ? (
          <div className="mt-5">
            <fieldset className="rounded-lg border border-subtle bg-surface-sunken p-4">
              <legend className="px-1 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-content-subtle">Question mix</legend>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="flex min-h-11 items-center gap-3 rounded-lg border border-subtle bg-surface px-3 text-sm font-medium text-content">
                  <input
                    type="checkbox"
                    checked={form.allowMcq}
                    onChange={(event) => setForm((prev) => ({ ...prev, allowMcq: event.target.checked }))}
                    className="h-4 w-4 rounded border-subtle text-accent"
                  />
                  Allow MCQs
                </label>
                <label className="flex min-h-11 items-center gap-3 rounded-lg border border-subtle bg-surface px-3 text-sm font-medium text-content">
                  <input
                    type="checkbox"
                    checked={form.allowCalculation}
                    onChange={(event) => setForm((prev) => ({ ...prev, allowCalculation: event.target.checked }))}
                    className="h-4 w-4 rounded border-subtle text-accent"
                  />
                  Allow calculations
                </label>
              </div>
            </fieldset>
          </div>
          ) : null}

          {setupValidationMessage ? (
            <p className={`mt-3 text-xs ${subjectsError ? 'text-danger' : 'text-warning'}`}>
              {setupValidationMessage}
            </p>
          ) : null}

        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-subtle p-4">
          <p className="font-mono text-xs text-content-subtle max-sm:hidden">
            {isPaperMode ? 'Paper mode: print, write, upload' : isMockExam ? `Timed: ${mockDurationMinutes} min` : 'Untimed practice'}
          </p>
          <button
            className={buttonStyles({ variant: 'primary', className: 'max-sm:w-full' })}
            onClick={handleGenerate}
            disabled={isGenerating || !isGenerationValid || !selectedSubject || !subjectSpecComplete}
          >
            <Sparkles className="h-4 w-4" />
            {isGenerating ? 'Generating...' : 'Generate exam questions'}
          </button>
        </div>
        </>
      ) : null}

      {inPractice && !report ? (
        <>
          <StatusBar>
            <span className="font-semibold text-content">
              {answeredCount} / {questions.length} answered
            </span>
            <span>
              Marks: <span className="font-semibold text-content">{totalAvailableMarks}</span>
            </span>
            {isMockExam && timeRemainingSeconds !== null ? (
              <span
                role="status"
                aria-live="polite"
                className={`flex items-center gap-1.5 font-semibold tabular-nums ${timeRemainingSeconds <= 60 ? 'text-danger' : 'text-content'}`}
              >
                <Clock className="h-3.5 w-3.5" />
                {formatCountdown(timeRemainingSeconds)} remaining
              </span>
            ) : null}
          </StatusBar>

          <div className="flex-1 space-y-5 p-5">
          <h2 className="sr-only">{isMockExam ? 'Timed Mock Exam' : 'Answer Practice'}</h2>
          {sourceMaterial ? (
            <section className="rounded-lg border border-subtle bg-surface-sunken p-5">
              <MonoLabel>Source extract</MonoLabel>
              <p className="mt-1 text-xs text-content-subtle">Written for this practice paper. Not an extract from a real publication.</p>
              <MarkdownContent className="mt-3 max-h-136 overflow-y-auto pr-2 text-sm leading-7 text-content" content={sourceMaterial} />
            </section>
          ) : null}

          <div className="space-y-5">
            {questions.map((question, index) => (
              <article key={`${question.marks}-${index}`} className="rounded-lg border border-subtle bg-surface p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <MonoLabel className="mr-1">Question {String(index + 1).padStart(2, '0')}</MonoLabel>
                  <Chip tone="inverse">{question.marks} marks</Chip>
                  <Chip>{question.commandWord}</Chip>
                  {question.questionType === 'mcq' ? <Chip>MCQ</Chip> : null}
                  {question.isCalculation ? (
                    <Chip tone="success">
                      <Calculator className="h-3 w-3" />
                      Calculation
                    </Chip>
                  ) : null}
                </div>

                <MarkdownContent className="mt-4 text-lg font-semibold text-content" content={question.question} />
                {question.figureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- arbitrary external URL (AI/user supplied); host isn't known ahead of time for next/image's remotePatterns
                  <img
                    src={question.figureUrl}
                    alt="Question figure"
                    className="mt-4 max-h-72 w-full rounded-lg border border-subtle object-contain"
                  />
                ) : null}

                {question.skillsAssessed.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {question.skillsAssessed.map((skill) => (
                      <Chip key={skill} mono={false}>
                        {skill}
                      </Chip>
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
                          aria-pressed={selected}
                          onClick={() => updateAnswer(index, letter)}
                          className={`flex w-full items-center justify-start gap-3 rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors ${
                            selected
                              ? 'border-accent bg-accent-muted text-content'
                              : 'border-subtle bg-surface text-content-muted hover:border-strong'
                          }`}
                        >
                          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border font-mono text-xs font-bold ${
                            selected
                              ? 'border-accent bg-accent text-accent-fg'
                              : 'border-subtle text-content-subtle'
                          }`}>{letter}</span>
                          <MarkdownContent inline content={option} />
                        </button>
                      );
                    })}
                  </div>
                ) : question.questionType === 'plot' && question.plotSpec ? (
                  <div className="mt-4">
                    <PlotAnswerInput
                      plotSpec={question.plotSpec}
                      value={answers[index] || ''}
                      onChange={(value) => updateAnswer(index, value)}
                      mode="answer"
                    />
                  </div>
                ) : question.questionType === 'diagram' && question.diagramSpec ? (
                  <div className="mt-4">
                    <DiagramAnswerInput
                      diagramSpec={question.diagramSpec}
                      diagramTemplate={question.diagramTemplate}
                      value={answers[index] || ''}
                      onChange={(value) => updateAnswer(index, value)}
                      mode="answer"
                    />
                  </div>
                ) : (
                  <MathAnswerEditor
                    className="mt-4"
                    value={answers[index] || ''}
                    onChange={(value) => updateAnswer(index, value)}
                    rows={question.marks >= 9 ? 9 : question.marks >= 6 ? 7 : 5}
                  />
                )}
              </article>
            ))}
          </div>

          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-subtle p-4">
            <button type="button" onClick={resetToGenerator} className={buttonStyles({ variant: 'secondary' })}>
              New set
            </button>
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-mono text-xs text-content-subtle max-sm:hidden">
                {answeredCount} of {questions.length} answered
              </p>
              <button type="button" onClick={handleMarkAnswers} disabled={isMarking || answeredCount === 0} className={buttonStyles({ variant: 'primary' })}>
                <ClipboardCheck className="h-4 w-4" />
                {isMarking ? 'Marking...' : 'Mark full attempt'}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {report ? (
        <>
        <div className="flex-1 space-y-5 p-5">
          <div>
            <h2 className="text-title text-content">Marked attempt</h2>
            <MarkdownContent className="mt-2 text-sm text-content-muted" content={report.summary} />
          </div>

          <div className="space-y-5">
            {report.markedAnswers.map((marked) => {
              const question = questions[marked.questionIndex];
              if (!question) return null;
              return (
                <article key={marked.questionIndex} className="rounded-lg border border-subtle bg-surface p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <MonoLabel className="mr-1">Question {String(marked.questionIndex + 1).padStart(2, '0')}</MonoLabel>
                      <Chip>{question.commandWord}</Chip>
                      {question.questionType === 'mcq' ? <Chip>MCQ</Chip> : null}
                    </div>
                    <span className={`font-mono text-lg font-bold ${reportTone(Math.round((marked.marksAwarded / Math.max(marked.maxMarks, 1)) * 100))}`}>
                      {marked.marksAwarded} / {marked.maxMarks}
                    </span>
                  </div>

                  <MarkdownContent className="mt-3 text-content" content={question.question} />

                  {question.questionType === 'plot' && question.plotSpec ? (
                    <div className="mt-3">
                      <PlotAnswerInput
                        plotSpec={question.plotSpec}
                        value=""
                        onChange={() => {}}
                        mode="review"
                        studentSubmission={(() => {
                          try {
                            return JSON.parse(answers[marked.questionIndex] || '');
                          } catch {
                            return null;
                          }
                        })()}
                      />
                    </div>
                  ) : question.questionType === 'diagram' && question.diagramSpec ? (
                    <div className="mt-3">
                      <DiagramAnswerInput
                        diagramSpec={question.diagramSpec}
                        diagramTemplate={question.diagramTemplate}
                        value=""
                        onChange={() => {}}
                        mode="review"
                        studentSubmission={(() => {
                          try {
                            return JSON.parse(answers[marked.questionIndex] || '');
                          } catch {
                            return null;
                          }
                        })()}
                      />
                    </div>
                  ) : question.questionType === 'mcq' ? (
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
                                ? 'border-success bg-success-muted text-success'
                                : isSelected
                                  ? 'border-danger bg-danger-muted text-danger'
                                  : 'border-subtle text-content-muted'
                            }`}
                          >
                            <span className="font-bold">{letter}.</span> <MarkdownContent inline content={option} />
                          </div>
                        );
                      })}
                    </div>
                  ) : answers[marked.questionIndex]?.trim() ? (
                    <div className="mt-3 rounded-lg border border-subtle bg-surface-sunken px-4 py-3">
                      <MonoLabel>Your answer</MonoLabel>
                      <MarkdownContent className="mt-1.5 text-sm text-content" content={answers[marked.questionIndex]} />
                    </div>
                  ) : (
                    <p className="mt-3 text-sm italic text-content-subtle">No answer entered.</p>
                  )}

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div>
                      <MonoLabel>Feedback · {marked.band}</MonoLabel>
                      <MarkdownContent className="mt-2 text-sm text-content-muted" content={marked.feedback} />
                    </div>

                    <div>
                      <MonoLabel>Exemplar answer</MonoLabel>
                      <MarkdownContent className="mt-2 text-sm text-content-muted" content={marked.exemplarAnswer} />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <MonoLabel className="text-success">Strengths</MonoLabel>
                      <ul className="mt-2 space-y-1 text-sm text-content-muted">
                        {(marked.strengths.length > 0 ? marked.strengths : ['No clear credit points were identified.']).map((item, index) => (
                          <li key={`${item}-${index}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <MonoLabel className="text-info">Improvements</MonoLabel>
                      <ul className="mt-2 space-y-1 text-sm text-content-muted">
                        {(marked.improvements.length > 0
                          ? marked.improvements
                          : marked.marksAwarded >= marked.maxMarks
                            ? ['Full marks secured.']
                            : ['Add more precise evidence from the question context.']
                        ).map((item, index) => (
                          <li key={`${item}-${index}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-subtle p-4">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={resetToGenerator} className={buttonStyles({ variant: 'ghost' })}>
              New set
            </button>
            <button type="button" onClick={retrySameQuestions} className={buttonStyles({ variant: 'secondary' })}>
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
          </div>
          <Link href="/dashboard" className={buttonStyles({ variant: 'primary', className: 'max-sm:w-full' })}>
            <LayoutDashboard className="h-4 w-4" />
            View dashboard progress
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        </>
      ) : null}
      </WorkspaceBody>
    </Workspace>
  );
}
