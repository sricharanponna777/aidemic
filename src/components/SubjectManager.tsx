'use client';

import { useEffect, useState } from 'react';
import { GraduationCap, Plus, Trash2 } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { PageLoader } from '@/components/PageLoader';
import { Chip, Panel, PanelHeading, WorkspaceBody } from '@/components/ui/telemetry';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase-client';
import {
  buildSpecString,
  getExamBoardLabel,
  getExamTypeLabel,
  getSelectableSubjects,
  getSpecEntries,
  getSubjectLabel,
  getTierLabel,
  requiresTierSelection,
  type ExamBoard,
  type UserSubject,
  type SupportedSubject,
} from '@/lib/ai/subjectConfig';
import { COUNTRY_LABELS, type Country } from '@/lib/ai/countryConfig';
import { getQualificationConfig, getQualifications } from '@/lib/ai/qualifications';
import {
  mapStudentSubjectRow,
  resolveSpecificationId,
  STUDENT_SUBJECT_SELECT,
  type StudentSubjectRow,
} from '@/lib/ai/studentSubjects';
import { QualificationPicker } from '@/components/QualificationPicker';

const selectClass =
  'rounded-lg border border-subtle px-3 py-2 text-sm outline-none focus:border-accent bg-surface text-content w-full';

export function SubjectManager() {
  const { session, profile } = useAuth();
  const supabase = createClient();
  const [subjects, setSubjects] = useState<UserSubject[]>([]);
  // Exam date + target grade live on the student_subjects row itself (not in the
  // joined UserSubject shape), so we track them in a parallel map keyed by id.
  const [subjectMeta, setSubjectMeta] = useState<Record<string, { examDate: string; targetGrade: string }>>({});
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [newQualId, setNewQualId] = useState('gcse');
  const [newSubject, setNewSubject] = useState<SupportedSubject>('biology');
  const [newBoard, setNewBoard] = useState<ExamBoard>('aqa');
  const [newSpecName, setNewSpecName] = useState('');
  const [newSpecTier, setNewSpecTier] = useState('');
  const [subjectSaving, setSubjectSaving] = useState(false);
  const [subjectError, setSubjectError] = useState('');

  const userCountry: Country = profile?.country ?? 'uk';
  const qualifications = getQualifications(userCountry);
  const effectiveQualId = qualifications.some((qual) => qual.id === newQualId)
    ? newQualId
    : qualifications[0]?.id ?? '';
  const qualConfig = getQualificationConfig(userCountry, effectiveQualId);
  const isComingSoon = qualConfig?.comingSoon ?? false;
  const newType = (qualConfig?.id ?? 'gcse') as UserSubject['exam_type'];
  const qualBoards = (qualConfig?.boards ?? ['aqa', 'edexcel', 'ocr']) as ExamBoard[];
  // UK English Language practice is AQA-only; elsewhere the qualification's own board wins.
  const boardOptions: ExamBoard[] =
    newSubject === 'english language' && qualBoards.includes('aqa') ? ['aqa'] : qualBoards;
  // A qualification whose board is also its awarding body (CBSE, CISCE, IB) has a single
  // option, so the picker is noise — select it and leave it out of the form.
  const effectiveBoard = boardOptions.includes(newBoard) ? newBoard : boardOptions[0];
  const selectableSubjects = getSelectableSubjects(effectiveBoard, newType);
  const effectiveSubject = selectableSubjects.includes(newSubject) ? newSubject : selectableSubjects[0];

  const pendingSubject: UserSubject = {
    id: 'new',
    subject: effectiveSubject,
    exam_board: effectiveBoard,
    exam_type: newType,
    spec_name: newSpecName,
    spec_tier: newSpecTier,
  };
  const specEntries = getSpecEntries(pendingSubject);
  const effectiveSpecName = specEntries.length === 1 ? specEntries[0].name : newSpecName;
  const selectedSpecEntry =
    specEntries.length === 1 ? specEntries[0] : specEntries.find((e) => e.name === newSpecName) ?? null;
  const tierRequired = requiresTierSelection(pendingSubject, effectiveSpecName);
  const selectedSpecLabel = buildSpecString(effectiveSpecName, newSpecTier, '');

  useEffect(() => {
    if (!session?.user?.id) return;
    let isMounted = true;

    const load = async () => {
      setSubjectsLoading(true);
      const { data, error } = await supabase
        .from('student_subjects')
        .select(STUDENT_SUBJECT_SELECT)
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: true });

      if (!isMounted) return;
      if (error) {
        console.error('Failed to load user subjects', error);
        setSubjectError('Could not load your saved subjects.');
      } else {
        setSubjects(((data as unknown as StudentSubjectRow[]) ?? []).map(mapStudentSubjectRow));
      }

      const { data: metaRows } = await supabase
        .from('student_subjects')
        .select('id, exam_date, target_grade')
        .eq('user_id', session.user.id);
      if (isMounted && metaRows) {
        const map: Record<string, { examDate: string; targetGrade: string }> = {};
        for (const row of metaRows as { id: string; exam_date: string | null; target_grade: string | null }[]) {
          map[row.id] = { examDate: row.exam_date ?? '', targetGrade: row.target_grade ?? '' };
        }
        setSubjectMeta(map);
      }
      setSubjectsLoading(false);
    };

    void load();
    return () => {
      isMounted = false;
    };
  }, [session?.user?.id, supabase]);

  const handleAddSubject = async () => {
    if (!session?.user?.id) return;
    setSubjectError('');
    if (specEntries.length > 1 && !effectiveSpecName) {
      setSubjectError('Choose the specification for this subject.');
      return;
    }
    if (tierRequired && !newSpecTier) {
      const options = selectedSpecEntry?.tiers ?? [];
      setSubjectError(`Choose ${options.join(' or ')} for this subject.`);
      return;
    }
    const duplicate = subjects.some(
      (s) =>
        s.subject === effectiveSubject &&
        s.exam_board === effectiveBoard &&
        s.exam_type === newType &&
        (s.spec_name ?? '') === effectiveSpecName &&
        (s.spec_tier ?? '') === newSpecTier,
    );
    if (duplicate) {
      setSubjectError('That subject is already in your list.');
      return;
    }

    setSubjectSaving(true);
    const specificationId = await resolveSpecificationId(supabase, {
      qualificationLabel: qualConfig?.dbName ?? '',
      boardLabel: getExamBoardLabel(effectiveBoard),
      subjectLabel: getSubjectLabel(effectiveSubject),
      specName: effectiveSpecName,
      specTier: newSpecTier || null,
    });

    if (!specificationId) {
      setSubjectError('Could not find that specification in the curriculum database.');
      setSubjectSaving(false);
      return;
    }

    const { data, error } = await supabase
      .from('student_subjects')
      .insert({ user_id: session.user.id, specification_id: specificationId })
      .select(STUDENT_SUBJECT_SELECT)
      .single();

    if (error) {
      setSubjectError(error.code === '23505' ? 'That subject is already in your list.' : 'Failed to save subject.');
    } else {
      setSubjects((prev) => [...prev, mapStudentSubjectRow(data as unknown as StudentSubjectRow)]);
      setNewSpecName('');
      setNewSpecTier('');
    }
    setSubjectSaving(false);
  };

  const handleRemoveSubject = async (id: string) => {
    await supabase.from('student_subjects').delete().eq('id', id);
    setSubjects((prev) => prev.filter((s) => s.id !== id));
  };

  const handleMetaChange = async (id: string, field: 'examDate' | 'targetGrade', value: string) => {
    setSubjectMeta((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
    const column = field === 'examDate' ? 'exam_date' : 'target_grade';
    await supabase
      .from('student_subjects')
      .update({ [column]: value || null })
      .eq('id', id);
  };

  // Clears the downstream selections; the board and subject fall back to the first valid
  // option for the newly chosen qualification via effectiveBoard/effectiveSubject.
  const resetSubjectFields = () => {
    setNewSpecName('');
    setNewSpecTier('');
  };

  const addForm = (
    <>
      <PanelHeading icon={Plus}>Add a subject</PanelHeading>
      <Panel>
        {/* Country -> Qualification */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-content-subtle">Country</span>
            <div className="rounded-field border border-subtle bg-surface-sunken px-3.5 py-2">
              <span className="text-sm font-semibold text-content">{COUNTRY_LABELS[userCountry]}</span>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-content-subtle">Qualification</label>
            <QualificationPicker
              qualifications={qualifications}
              value={effectiveQualId}
              onChange={(id) => {
                setNewQualId(id);
                resetSubjectFields();
              }}
            />
          </div>
        </div>

        {/* Exam Board + Subject */}
        {!isComingSoon && (
          <div className="mt-3 grid grid-cols-1 gap-3">
            {boardOptions.length > 1 && (
              <div className="flex flex-col gap-1.5">
                <label className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-content-subtle">Exam Board</label>
                <select
                  value={effectiveBoard}
                  onChange={(event) => {
                    setNewBoard(event.target.value as ExamBoard);
                    setNewSpecName('');
                    setNewSpecTier('');
                  }}
                  className={selectClass}
                >
                  {boardOptions.map((board) => (
                    <option key={board} value={board}>
                      {getExamBoardLabel(board)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-content-subtle">Subject</label>
              <select
                value={effectiveSubject}
                onChange={(event) => {
                  setNewSubject(event.target.value as SupportedSubject);
                  setNewSpecName('');
                  setNewSpecTier('');
                }}
                className={selectClass}
              >
                {selectableSubjects.map((subject) => (
                  <option key={subject} value={subject}>
                    {getSubjectLabel(subject)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {isComingSoon ? (
          <p className="mt-3 rounded-field bg-warning-muted px-3.5 py-2.5 text-sm text-warning">
            {qualConfig?.label} support is coming soon — stay tuned.
          </p>
        ) : (
          <>
            {/* Specification + Tier + Add */}
            <div className="mt-3 grid grid-cols-1 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-content-subtle">Specification</label>
                {specEntries.length === 0 ? (
                  <div className="rounded-field border border-subtle bg-surface-sunken px-3.5 py-2 text-sm text-content-subtle">
                    No specification options available for this combination.
                  </div>
                ) : specEntries.length === 1 ? (
                  <div className="rounded-field border border-subtle bg-surface-sunken px-3.5 py-2 text-sm text-content">
                    {specEntries[0].name}
                  </div>
                ) : (
                  <select
                    value={newSpecName}
                    onChange={(event) => {
                      setNewSpecName(event.target.value);
                      setNewSpecTier('');
                    }}
                    className={selectClass}
                  >
                    <option value="">Select specification</option>
                    {specEntries.map((entry) => (
                      <option key={entry.name} value={entry.name}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {selectedSpecEntry?.tiers?.length ? (
                <div className="flex flex-col gap-1.5">
                  <label className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-content-subtle">
                    {getTierLabel(newType)}
                  </label>
                  <select
                    value={newSpecTier}
                    onChange={(event) => setNewSpecTier(event.target.value)}
                    className={selectClass}
                  >
                    <option value="">Select {getTierLabel(newType).toLowerCase()}</option>
                    {selectedSpecEntry.tiers.map((tier) => (
                      <option key={tier} value={tier}>
                        {tier}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={handleAddSubject}
                  disabled={subjectSaving || specEntries.length === 0}
                  className={buttonStyles({ variant: 'primary', className: 'w-full justify-center' })}
                >
                  <Plus className="h-4 w-4" />
                  {subjectSaving ? 'Adding...' : 'Add subject'}
                </button>
              </div>
            </div>

            {selectedSpecLabel ? (
              <p className="mt-2 font-mono text-[11px] text-content-subtle">
                AI generation will use {selectedSpecLabel}.
              </p>
            ) : null}
          </>
        )}
        {subjectError ? (
          <p className="mt-2 text-sm text-danger">{subjectError}</p>
        ) : null}
      </Panel>
      <p className="font-mono text-[11px] text-content-subtle">Exam dates feed the planner&apos;s countdown.</p>
    </>
  );

  return (
    <WorkspaceBody aside={addForm}>
      <section className="flex-1 p-5">
        <PanelHeading icon={GraduationCap} aside={<Chip>{subjects.length} saved</Chip>}>
          Your subjects
        </PanelHeading>
        <p className="mb-4 mt-1 text-[13px] text-content-subtle">
          Save the exact qualifications you study so AI content matches your course.
        </p>

        <div className="space-y-2">
          {subjectsLoading ? (
            <PageLoader text="Loading subjects..." />
          ) : subjects.length === 0 ? (
            <p className="rounded-lg border border-dashed border-subtle bg-surface-sunken p-4 text-sm text-content-muted">
              No subjects added yet.
            </p>
          ) : (
            subjects.map((subject) => (
              <div
                key={subject.id}
                className="rounded-lg border border-subtle bg-surface px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold text-content">
                      {getSubjectLabel(subject.subject)}
                      <span className="font-normal text-content-subtle"> &middot; {getExamTypeLabel(subject.exam_type)}</span>
                    </span>
                    <Chip>{getExamBoardLabel(subject.exam_board)}</Chip>
                    {buildSpecString(subject.spec_name ?? '', subject.spec_tier ?? '', '') ? (
                      <Chip tone="success">{buildSpecString(subject.spec_name ?? '', subject.spec_tier ?? '', '')}</Chip>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveSubject(subject.id)}
                    className="text-content-subtle transition hover:text-danger"
                    aria-label="Remove subject"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-3 font-mono text-[11px] uppercase tracking-[0.14em] text-content-subtle">
                  <label className="flex items-center gap-1.5">
                    Exam date
                    <input
                      type="date"
                      value={subjectMeta[subject.id]?.examDate ?? ''}
                      onChange={(e) => handleMetaChange(subject.id, 'examDate', e.target.value)}
                      className="rounded-md border border-subtle bg-surface px-2 py-1 font-sans text-xs normal-case tracking-normal text-content outline-none focus:border-accent"
                      aria-label={`Exam date for ${getSubjectLabel(subject.subject)}`}
                    />
                  </label>
                  <label className="flex items-center gap-1.5">
                    Target grade
                    <input
                      type="text"
                      value={subjectMeta[subject.id]?.targetGrade ?? ''}
                      onChange={(e) => handleMetaChange(subject.id, 'targetGrade', e.target.value)}
                      placeholder="e.g. 7"
                      maxLength={4}
                      className="w-16 rounded-md border border-subtle bg-surface px-2 py-1 font-sans text-xs normal-case tracking-normal text-content outline-none focus:border-accent"
                      aria-label={`Target grade for ${getSubjectLabel(subject.subject)}`}
                    />
                  </label>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </WorkspaceBody>
  );
}
