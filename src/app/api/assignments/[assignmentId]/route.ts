import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import type { PlotSpec } from '@/types';

type StoredQuestion = {
  questionType: 'open' | 'mcq' | 'plot';
  question: string;
  marks: number;
  options: string[];
  correctOption: '' | 'A' | 'B' | 'C' | 'D';
  markScheme?: string[];
  modelAnswer?: string;
  plotSpec: PlotSpec | null;
};

// Strip answer-key fields (correctOption/markScheme/modelAnswer) so a student
// can't read them from the network response before submitting.
function sanitizeQuestion(question: StoredQuestion) {
  return {
    questionType: question.questionType,
    question: question.question,
    marks: question.marks,
    options: question.options,
    correctOption: '' as const,
    plotSpec: question.plotSpec,
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
      questions_payload: isCompleted ? questions : questions.map(sanitizeQuestion),
      allow_reattempts: assignmentRow.allow_reattempts,
    },
    attempt: attemptRow ?? null,
  });
}
