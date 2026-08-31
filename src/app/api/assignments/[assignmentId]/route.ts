import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { resolveDiagramSpec } from '@/lib/ai/diagramTemplate';
import { toStudentSafeDiagramSpec, toStudentSafePlotSpec } from '@/lib/assignments/studentSafeSpecs';
import type { DiagramSpec, DiagramTemplateSelection, PlotSpec } from '@/types';

type StoredQuestion = {
  questionType: 'open' | 'mcq' | 'plot' | 'diagram';
  question: string;
  marks: number;
  options: string[];
  correctOption: '' | 'A' | 'B' | 'C' | 'D';
  markScheme?: string[];
  modelAnswer?: string;
  plotSpec: PlotSpec | null;
  diagramSpec: DiagramSpec | null;
  diagramTemplate?: DiagramTemplateSelection | null;
};

// Strip every answer-bearing field before an in-progress attempt is sent to the
// browser: correctOption/markScheme/modelAnswer at the question level, and the
// answer keys buried inside plotSpec/diagramSpec (correctLabel, correctValues,
// correctOption, the endpoints of connections the student must draw, and the
// word bank's answer-ordered sequence). Previously only the first group was
// stripped, so every plot and diagram answer was readable in the network tab.
//
// A templated diagram is resolved here rather than in the browser. The client
// re-resolves so its geometry tracks the current template code; doing that
// server-side keeps the same guarantee while letting us withhold the template
// selection, which would otherwise regenerate the answers client-side.
function sanitizeQuestion(question: StoredQuestion, seed: string) {
  const resolvedDiagramSpec = question.diagramTemplate?.templateId
    ? resolveDiagramSpec(question.diagramSpec, question.diagramTemplate) ?? question.diagramSpec
    : question.diagramSpec;

  return {
    questionType: question.questionType,
    question: question.question,
    marks: question.marks,
    options: question.options,
    correctOption: '' as const,
    plotSpec: toStudentSafePlotSpec(question.plotSpec),
    diagramSpec: toStudentSafeDiagramSpec(resolvedDiagramSpec, seed),
    diagramTemplate: null,
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: assignmentRow, error: assignmentError } = await supabase
    .from('assignments')
    .select('id, title, description, questions_payload, source_material, class_id, allow_reattempts')
    .eq('id', assignmentId)
    .maybeSingle();
  if (assignmentError || !assignmentRow) {
    return NextResponse.json({ error: 'Assignment not found.' }, { status: 404 });
  }

  const { data: enrollment } = await supabase
    .from('class_students')
    .select('id')
    .eq('class_id', assignmentRow.class_id)
    .eq('student_id', authData.user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (!enrollment) {
    return NextResponse.json({ error: 'You are not enrolled in this class.' }, { status: 403 });
  }

  const { data: attemptRow } = await supabase
    .from('assignment_attempts')
    .select('answers_payload, ai_feedback, status')
    .eq('assignment_id', assignmentId)
    .eq('student_id', authData.user.id)
    .maybeSingle();

  const isCompleted = attemptRow?.status === 'completed';
  const questions = ((assignmentRow.questions_payload as StoredQuestion[] | null) ?? []) as StoredQuestion[];

  return NextResponse.json({
    assignment: {
      id: assignmentRow.id,
      title: assignmentRow.title,
      description: assignmentRow.description,
      source_material: assignmentRow.source_material,
      questions_payload: isCompleted
        ? questions
        : questions.map((question, index) => sanitizeQuestion(question, `${assignmentId}:${index}`)),
      allow_reattempts: assignmentRow.allow_reattempts,
    },
    attempt: attemptRow ?? null,
  });
}
