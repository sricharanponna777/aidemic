import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { gradeFromPercentage } from '@/lib/ai/gradeScales';
import { getSpecTier } from '@/lib/ai/qualifications';
import { buildSpecString } from '@/lib/ai/subjectConfig';
import { normalizeBoard, normalizeExamType } from '@/lib/ai/validation';

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
  teacherAdjusted?: boolean;
};

type MarkingReport = {
  markedAnswers: MarkedAnswer[];
  totalMarksAwarded: number;
  totalAvailableMarks: number;
  percentage: number;
  predictedGrade: string;
  [key: string]: unknown;
};

type QuestionPayload = { marks: number };

type AttemptJoinRow = {
  id: string;
  status: string;
  ai_feedback: MarkingReport | null;
  ai_feedback_original: MarkingReport | null;
  assignments: {
    questions_payload: QuestionPayload[];
    classes: {
      teacher_id: string;
      specifications: {
        name: string;
        tier: string | null;
        subjects: { name: string; exam_boards: { name: string; qualifications: { name: string } | null } | null } | null;
      } | null;
    } | null;
  } | null;
};

interface OverridePayload {
  overrides?: unknown;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;

  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Establish the caller is an approved teacher before touching the attempt.
    // Note this is only a role check -- it is NOT the ownership check. Anyone can
    // create their own `teachers` row ("Users can create their own teacher profile"
    // is `WITH CHECK (auth.uid() = user_id)`), so row existence alone proves
    // nothing; the class-ownership comparison below is what actually authorizes.
    const { data: teacherRow } = await supabase
      .from('teachers')
      .select('id, verification_status')
      .eq('user_id', authData.user.id)
      .maybeSingle();
    if (!teacherRow || teacherRow.verification_status !== 'approved') {
      return NextResponse.json({ error: 'Only approved teachers can override marks.' }, { status: 403 });
    }

    const body = (await request.json()) as OverridePayload;
    const overrides = Array.isArray(body.overrides) ? body.overrides : [];
    if (overrides.length === 0) {
      return NextResponse.json({ error: 'At least one mark override is required.' }, { status: 400 });
    }
    const parsedOverrides: { questionIndex: number; marksAwarded: number }[] = [];
    for (const entry of overrides) {
      const questionIndex = Number((entry as { questionIndex?: unknown })?.questionIndex);
      const marksAwarded = Number((entry as { marksAwarded?: unknown })?.marksAwarded);
      if (!Number.isInteger(questionIndex) || questionIndex < 0 || !Number.isFinite(marksAwarded) || marksAwarded < 0) {
        return NextResponse.json({ error: 'Invalid override entry.' }, { status: 400 });
      }
      parsedOverrides.push({ questionIndex, marksAwarded });
    }

    // `classes.teacher_id` is selected so ownership can be compared explicitly
    // below. It deliberately does NOT rely on RLS to scope this SELECT: the
    // policies on assignment_attempts are a union (students see their own,
    // parents see their linked child's, teachers see their classes'), so a row
    // coming back proves only that *some* policy matched -- not the teacher one.
    const { data: attemptRow, error: attemptError } = await supabase
      .from('assignment_attempts')
      .select(
        'id, status, ai_feedback, ai_feedback_original, assignments ( questions_payload, classes ( teacher_id, specifications ( name, tier, subjects ( name, exam_boards ( name, qualifications ( name ) ) ) ) ) )'
      )
      .eq('id', attemptId)
      .maybeSingle();
    if (attemptError || !attemptRow) {
      return NextResponse.json({ error: 'Attempt not found.' }, { status: 404 });
    }
    const attempt = attemptRow as unknown as AttemptJoinRow;

    // The actual authorization. The update below runs with the service role and
    // so bypasses RLS entirely; without this comparison any authenticated user
    // could create a teachers row and rewrite the marks on their own attempt.
    if (attempt.assignments?.classes?.teacher_id !== teacherRow.id) {
      return NextResponse.json({ error: 'Attempt not found.' }, { status: 404 });
    }

    if (attempt.status !== 'completed' || !attempt.ai_feedback) {
      return NextResponse.json({ error: 'This attempt has no marking to override yet.' }, { status: 400 });
    }

    const questions = attempt.assignments?.questions_payload ?? [];
    for (const override of parsedOverrides) {
      const question = questions[override.questionIndex];
      if (!question || override.marksAwarded > question.marks) {
        return NextResponse.json(
          { error: `Question ${override.questionIndex + 1}: marks must be between 0 and ${question?.marks ?? 0}.` },
          { status: 400 }
        );
      }
      if (!attempt.ai_feedback.markedAnswers.some((m) => m.questionIndex === override.questionIndex)) {
        return NextResponse.json({ error: `Question ${override.questionIndex + 1} has no existing marking.` }, { status: 400 });
      }
    }

    const overrideByIndex = new Map(parsedOverrides.map((o) => [o.questionIndex, o.marksAwarded]));
    const markedAnswers = attempt.ai_feedback.markedAnswers.map((answer) =>
      overrideByIndex.has(answer.questionIndex)
        ? { ...answer, marksAwarded: overrideByIndex.get(answer.questionIndex) as number, teacherAdjusted: true }
        : answer
    );
    const totalMarksAwarded = markedAnswers.reduce((sum, item) => sum + item.marksAwarded, 0);
    const totalAvailableMarks = questions.reduce((sum, q) => sum + q.marks, 0);
    const percentage = totalAvailableMarks > 0 ? Math.round((totalMarksAwarded / totalAvailableMarks) * 100) : 0;

    const spec = attempt.assignments?.classes?.specifications;
    const subjectChain = spec?.subjects;
    const examType = normalizeExamType(subjectChain?.exam_boards?.qualifications?.name) || 'gcse';
    const board = normalizeBoard(subjectChain?.exam_boards?.name);
    const tier = getSpecTier(buildSpecString(spec?.name ?? '', spec?.tier ?? '', ''), examType);
    const predictedGrade = gradeFromPercentage(percentage, examType, tier, board);

    const updatedReport: MarkingReport = {
      ...attempt.ai_feedback,
      markedAnswers,
      totalMarksAwarded,
      totalAvailableMarks,
      percentage,
      predictedGrade,
    };

    const adminClient = createAdminClient();
    const { data: updated, error: updateError } = await adminClient
      .from('assignment_attempts')
      .update({
        ai_feedback: updatedReport,
        ai_feedback_original: attempt.ai_feedback_original ?? attempt.ai_feedback,
        score: totalMarksAwarded,
        percentage,
        predicted_grade: predictedGrade,
        teacher_overridden_at: new Date().toISOString(),
        teacher_overridden_by: teacherRow.id,
      })
      .eq('id', attemptId)
      .select('ai_feedback, ai_feedback_original, teacher_overridden_at')
      .single();

    if (updateError || !updated) {
      console.error('[assignment-attempts/override] Failed to save override', updateError);
      return NextResponse.json({ error: 'Failed to save the mark override.' }, { status: 500 });
    }

    return NextResponse.json({
      report: updated.ai_feedback,
      originalReport: updated.ai_feedback_original,
      teacherOverriddenAt: updated.teacher_overridden_at,
    });
  } catch (err) {
    console.error('[assignment-attempts/override] Unhandled error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to override marks.' }, { status: 500 });
  }
}
