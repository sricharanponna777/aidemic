'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Layers,
  Loader2,
  Radar,
  Sparkles,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/feedback';
import { fieldStyles } from '@/components/ui/field';
import { Chip, MonoLabel, PanelHeading, Workspace, WorkspaceBody } from '@/components/ui/telemetry';
import { SearchSelect } from '@/components/SearchSelect';
import { SubjectSpecSelector, getSelectedSpecLabel } from '@/components/SubjectSpecSelector';
import { TopicInput } from '@/components/TopicInput';
import { buttonStyles } from '@/components/ui/button';
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
import {
  getCreationOptionChoices,
  getCreationOptionLabel,
  getExamBoardLabel,
  getExamTypeLabel,
  getPaperOptions,
  getSubjectLabel,
  isSubjectSpecComplete,
} from '@/lib/ai/subjectConfig';
import { getTopicRelevanceError } from '@/lib/ai/topicRelevance';

const MIN_CARDS = 6;
const MAX_CARDS = 40;

type StatusTone = 'success' | 'error' | 'info';
type CardStyle = 'balanced' | 'definitions' | 'exam' | 'mistakes';


const CARD_STYLES: Array<{ id: CardStyle; label: string; description: string; prompt: string }> = [
  {
    id: 'balanced',
    label: 'Balanced deck',
    description: 'Definitions, recall, examples, and checks.',
    prompt:
      'Create clear front/back flashcards. Mix definitions, key facts, examples, and short application prompts. Keep each front focused on one idea, and keep each back concise but complete.',
  },
  {
    id: 'definitions',
    label: 'Key terms',
    description: 'Best for vocabulary-heavy topics.',
    prompt:
      'Create flashcards focused on key terms, definitions, formulas, and must-know facts. The front should ask for the term or meaning. The back should give a precise answer plus one short context clue where useful.',
  },
  {
    id: 'exam',
    label: 'Exam recall',
    description: 'Command words and mark-scheme phrasing.',
    prompt:
      'Create exam-style recall flashcards using command words like state, define, explain, compare, and calculate where appropriate. Include concise mark-scheme-style answers and common exam phrasing.',
  },
  {
    id: 'mistakes',
    label: 'Common mistakes',
    description: 'Targets traps and misconceptions.',
    prompt:
      'Create flashcards that target common mistakes, misconceptions, and confusing pairs. The front should test the trap directly. The back should explain the correct idea and why the mistake is wrong.',
  },
];

const defaultPrompt = CARD_STYLES[0].prompt;

const clampCardCount = (count: number) => Math.min(Math.max(Math.floor(count || MIN_CARDS), MIN_CARDS), MAX_CARDS);

const statusClassNames: Record<StatusTone, string> = {
  info: 'bg-info-muted text-info',
  success: 'bg-success-muted text-success',
  error: 'bg-danger-muted text-danger',
};

export default function AIFlashcardsPage() {
  const router = useRouter();
  const [deckName, setDeckName] = useState('');
  const [topic, setTopic] = useState('');
  const [subtopic, setSubtopic] = useState('');
  const [learningObjective, setLearningObjective] = useState('');
  const [paper, setPaper] = useState('');
  const [description, setDescription] = useState('');
  const [specOption, setSpecOption] = useState('');
  const [poemOne, setPoemOne] = useState('');
  const [poemTwo, setPoemTwo] = useState('');
  const [cardStyle, setCardStyle] = useState<CardStyle>('balanced');
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [cardCount, setCardCount] = useState(12);
  const [status, setStatus] = useState<{ tone: StatusTone; text: string } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const { subjects: userSubjects, isLoading: subjectsLoading, error: subjectsError } = useUserSubjects();
  const [selectedSubjectId, setSelectedSubjectId] = useState('');

  const effectiveSubjectId = selectedSubjectId || userSubjects[0]?.id || '';
  const selectedSubject = userSubjects.find((item) => item.id === effectiveSubjectId) ?? null;
  const creationOptions = getCreationOptionChoices(selectedSubject);
  const creationOptionLabel = getCreationOptionLabel(selectedSubject);
  const poetryPoems = getPoetryClusterPoems(specOption);
  const isSelectedPoetryCluster = isPoetryCluster(specOption);
  const effectiveCreationOption = buildLiteratureCreationOption(specOption, poemOne, poemTwo);
  const { topics: topicOptions, isLoading: topicsLoading } = useTopicOptions(selectedSubject, specOption, poemOne, poemTwo);
  const topicSuggestions = topicOptions.map((option) => option.name);
  const selectedTopicOption = topicOptions.find((option) => option.name === topic.trim()) ?? null;
  const { subtopics: subtopicSuggestions } = useSubtopicOptions(selectedTopicOption?.id ?? null);
  const { objectives: learningObjectiveOptions } = useLearningObjectives(selectedSubject, 'flashcards');
  const paperOptions = getPaperOptions(selectedSubject);
  const subjectSpecComplete = isSubjectSpecComplete(selectedSubject);

  const safeCardCount = clampCardCount(cardCount);
  const topicIsReady = topic.trim().length === 0 || topic.trim().length >= 3;
  const topicIsAllowed = !topic.trim() || topicsLoading || isAllowedQualificationTopic(topic, topicSuggestions);
  const poetrySelectionComplete = !isSelectedPoetryCluster || !!poemOne;
  const canGenerate = topicIsReady && topicIsAllowed && !topicsLoading && poetrySelectionComplete && !!selectedSubject && subjectSpecComplete && !isGenerating;
  const validationMessage = subjectsError
    || (!selectedSubject ? 'Choose one of your saved subjects to generate.' : '')
    || (!subjectSpecComplete ? 'Update this subject on the Subjects page with its specification and tier.' : '')
    || (!poetrySelectionComplete ? 'Choose the first poem for this poetry cluster.' : '')
    || (topicsLoading ? 'Loading topics for this qualification...' : '')
    || (!topicIsReady ? 'Topic must be at least 3 characters, or leave it blank to generalise.' : '')
    || (!topicIsAllowed ? 'Choose one of the suggested topics for this qualification.' : '');

  const summaryRows = [
    { label: 'Deck', value: deckName.trim() || 'AI-generated name' },
    { label: 'Topic', value: topic.trim() || 'General (AI will generalise)' },
    { label: 'Subject', value: selectedSubject ? getSubjectLabel(selectedSubject.subject) : 'Choose subject' },
    { label: 'Level', value: selectedSubject ? `${getExamBoardLabel(selectedSubject.exam_board)} ${getExamTypeLabel(selectedSubject.exam_type)}` : '--' },
    { label: 'Cards', value: `${safeCardCount}` },
    { label: 'Style', value: CARD_STYLES.find((style) => style.id === cardStyle)?.label || 'Balanced deck' },
  ];

  const applyCardStyle = (styleId: CardStyle) => {
    const style = CARD_STYLES.find((item) => item.id === styleId);
    if (!style) return;
    setCardStyle(style.id);
    setPrompt(style.prompt);
  };

  const handleGenerate = async (event: FormEvent) => {
    event.preventDefault();

    if (!topicIsReady) {
      setStatus({ tone: 'error', text: 'Topic must be at least 3 characters, or leave it blank to generalise.' });
      return;
    }
    if (!selectedSubject) {
      setStatus({ tone: 'error', text: 'Choose one of your saved subjects before generating flashcards.' });
      return;
    }
    if (!subjectSpecComplete) {
      setStatus({ tone: 'error', text: 'Update this subject on the Subjects page with its specification and tier before generating flashcards.' });
      return;
    }
    if (!poetrySelectionComplete) {
      setStatus(null);
      return;
    }
    const specification = getSelectedSpecLabel(selectedSubject, effectiveCreationOption);
    if (topic.trim()) {
      const topicError = getQualificationTopicError(topic.trim(), topicSuggestions);
      if (topicError) {
        setStatus(null);
        return;
      }
      const relevanceError = getTopicRelevanceError({
        topic: topic.trim(),
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
    setIsGenerating(true);
    setStatus({ tone: 'info', text: 'Generating the deck...' });

    try {
      const response = await fetch('/api/ai/generate-flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: deckName.trim() || undefined,
          description: description.trim(),
          topic: topic.trim(),
          topicId: selectedTopicOption?.id ?? undefined,
          subtopic: subtopic.trim() || undefined,
          learningObjective: learningObjective || undefined,
          paper: paper || undefined,
          subject: selectedSubject.subject,
          examBoard: selectedSubject.exam_board,
          examType: selectedSubject.exam_type,
          specification,
          prompt: prompt.trim(),
          cardCount: safeCardCount,
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

  const reportColumn = (
    <>
      <PanelHeading icon={Radar}>Generation summary</PanelHeading>
      <section className="rounded-xl border border-subtle bg-surface p-4">
        <dl className="space-y-3">
          {summaryRows.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-3 border-b border-subtle pb-2 last:border-0">
              <dt className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-content-subtle">{row.label}</dt>
              <dd className="text-right text-sm font-medium text-content">{row.value}</dd>
            </div>
          ))}
        </dl>
        {validationMessage ? (
          <p className={`mt-3 text-xs ${subjectsError ? 'text-danger' : 'text-warning'}`}>
            {validationMessage}
          </p>
        ) : null}
      </section>
    </>
  );

  return (
    <form onSubmit={handleGenerate}>
    <Workspace>
      <PageHeader
        className="border-b border-subtle"
        icon={Sparkles}
        eyebrow="Learn / AI flashcards"
        titleId="ai-flashcards-title"
        title="AI Flashcards"
        description="Turn a topic from notes into a saved deck with focused front/back cards."
        backHref="/dashboard/flashcards"
        backLabel="Flashcards"
        actions={
          <>
            <Chip>● Mode: generate deck</Chip>
            <Chip tone="success">
              <Layers className="h-3 w-3" /> {safeCardCount} cards
            </Chip>
          </>
        }
      />

      <WorkspaceBody aside={reportColumn}>
      {status && !validationMessage ? (
        <div className="border-b border-subtle p-4">
          <div role="status" className={`rounded-field px-3.5 py-2.5 text-body ${statusClassNames[status.tone]}`}>
            {status.text}
          </div>
        </div>
      ) : null}

        <section className="flex-1 space-y-5 p-5">
          <div>
            <PanelHeading icon={Layers}>Deck setup</PanelHeading>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <label className="block">
                <MonoLabel className="mb-1">Deck name (optional)</MonoLabel>
                <input
                  value={deckName}
                  onChange={(event) => setDeckName(event.target.value)}
                  placeholder="e.g. Cell Biology Recall"
                  className={fieldStyles()}
                />
              </label>
              <label className="block">
                <MonoLabel className="mb-1">Deck focus (optional)</MonoLabel>
                <input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="e.g. Core definitions and calculation traps"
                  className={fieldStyles()}
                />
              </label>
            </div>
          </div>

          <div className="border-t border-subtle pt-5">
            <PanelHeading icon={BookOpen}>Exam focus</PanelHeading>
            <div className="mt-4">
              <SubjectSpecSelector
                subjects={userSubjects}
                isLoading={subjectsLoading}
                selectedSubjectId={effectiveSubjectId}
                onSubjectChange={(id) => {
                  setSelectedSubjectId(id);
                  setSpecOption('');
                  setPoemOne('');
                  setPoemTwo('');
                  setTopic('');
                  setSubtopic('');
                  setLearningObjective('');
                  setPaper('');
                }}
              />
              {creationOptions.length > 0 ? (
                <SearchSelect
                  label={creationOptionLabel}
                  value={specOption}
                  onChange={(value) => {
                      setSpecOption(value);
                      setPoemOne('');
                      setPoemTwo('');
                      setTopic('');
                      setSubtopic('');
                  }}
                  options={[
                    { value: '', label: `Any ${creationOptionLabel.toLowerCase()}` },
                    ...creationOptions.map((option) => ({ value: option, label: option })),
                  ]}
                  placeholder={`Search ${creationOptionLabel.toLowerCase()}...`}
                  className="mt-4 block"
                />
              ) : null}
              {isSelectedPoetryCluster ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <MonoLabel className="mb-1">First poem</MonoLabel>
                    <select
                      value={poemOne}
                      onChange={(event) => {
                        setPoemOne(event.target.value);
                        setTopic('');
                        setSubtopic('');
                        if (event.target.value === poemTwo) setPoemTwo('');
                      }}
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
                      value={poemTwo}
                      onChange={(event) => {
                        setPoemTwo(event.target.value);
                        setTopic('');
                        setSubtopic('');
                      }}
                      disabled={!poemOne}
                      className={fieldStyles()}
                    >
                      <option value="">No comparison poem</option>
                      {poetryPoems.filter((poem) => poem !== poemOne).map((poem) => (
                        <option key={poem} value={poem}>{poem}</option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
              <TopicInput
                label="Topic (optional)"
                value={topic}
                onChange={(value) => {
                  setTopic(value);
                  setSubtopic('');
                  setStatus(null);
                }}
                suggestions={topicSuggestions}
                isValidSelection={topicIsAllowed}
                placeholder="Start typing a topic, or leave blank to generalise"
                className="mt-4 block"
              />
              {selectedTopicOption?.id && subtopicSuggestions.length > 0 ? (
                <TopicInput
                  label="Subtopic (optional)"
                  value={subtopic}
                  onChange={setSubtopic}
                  suggestions={subtopicSuggestions}
                  placeholder="Narrow the focus within this topic"
                  className="mt-4 block"
                />
              ) : null}
              {learningObjectiveOptions.length > 0 ? (
                <label className="mt-4 block">
                  <MonoLabel className="mb-1">Learning objective (optional)</MonoLabel>
                  <select
                    value={learningObjective}
                    onChange={(event) => setLearningObjective(event.target.value)}
                    className={fieldStyles()}
                  >
                    <option value="">No specific focus</option>
                    {learningObjectiveOptions.map((objective) => (
                      <option key={objective} value={objective}>{objective}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              {paperOptions.length > 0 ? (
                <label className="mt-4 block">
                  <MonoLabel className="mb-1">Paper (optional)</MonoLabel>
                  <select
                    value={paper}
                    onChange={(event) => setPaper(event.target.value)}
                    className={fieldStyles()}
                  >
                    <option value="">General (any paper)</option>
                    {paperOptions.map((paperOption) => (
                      <option key={paperOption} value={paperOption}>{paperOption}</option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          </div>

          <div className="border-t border-subtle pt-5">
            <PanelHeading icon={ClipboardList}>Card style</PanelHeading>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {CARD_STYLES.map((style) => {
                const selected = cardStyle === style.id;
                return (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => applyCardStyle(style.id)}
                    className={buttonStyles({
                      variant: 'plain',
                      size: 'none',
                      className: `justify-start rounded-lg border p-4 text-left ${
                        selected
                          ? 'border-accent bg-accent-muted text-content'
                          : 'border-subtle bg-surface text-content-muted hover:border-strong'
                      }`,
                    })}
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      {selected ? <CheckCircle2 className="h-4 w-4" /> : null}
                      {style.label}
                    </span>
                    <span className="mt-1 block text-sm opacity-75">{style.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-subtle pt-5">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="block">
                <MonoLabel className="mb-1">Flashcard count</MonoLabel>
                <input
                  type="range"
                  min={MIN_CARDS}
                  max={MAX_CARDS}
                  value={safeCardCount}
                  onChange={(event) => setCardCount(Number(event.target.value))}
                  className="mt-3 w-full accent-(--color-accent)"
                />
              </label>
              <input
                aria-label="Flashcard count"
                type="number"
                min={MIN_CARDS}
                max={MAX_CARDS}
                value={safeCardCount}
                onChange={(event) => setCardCount(Number(event.target.value))}
                className={fieldStyles('w-24 font-mono')}
              />
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-subtle p-4">
          <Link href="/dashboard/study-sessions" className="font-mono text-xs text-content-subtle transition-colors hover:text-content max-sm:hidden">
            Flashcard Revision →
          </Link>
          <button
            type="submit"
            disabled={!canGenerate}
            className={buttonStyles({ variant: 'primary', className: 'max-sm:w-full' })}
          >
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {isGenerating ? 'Generating deck...' : 'Generate deck'}
          </button>
        </div>
      </WorkspaceBody>
    </Workspace>
    </form>
  );
}
