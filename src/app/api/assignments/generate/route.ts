import { NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import {
  generateQuestionSet,
  isGenerationFailure,
  type GenerateQuestionsPayload,
  type GenerationStage,
} from '@/app/api/ai/generate-questions/route';
import { AI_DAILY_LIMITS, checkAiRateLimit } from '@/lib/ai/rateLimit';
import { createStageTimer } from '@/lib/ai/timing';
import { MAX_AI_ERROR_TEXT, txt } from '@/lib/ai/text';

/**
 * Background assignment generation.
 *
 * Creating an assignment used to block the teacher's browser for the full
 * ~74-second pipeline. This route validates the request, writes a job row, and
 * returns the job id immediately; generation then runs in `after()`, which keeps
 * the invocation alive past the response, and reports its stage onto the job row
 * for the browser to poll.
 *
 * The trade this makes: `after()` is still the same serverless invocation, so
 * the work does not survive the platform killing the function. What it does buy
 * is that the work no longer depends on the *browser* staying connected -- the
 * teacher can navigate away, and a completed job is still there when they
 * return. A durable queue would be the next step and needs no schema change:
 * the job row already is the queue entry.
 */

// Generation measured ~74s; leave headroom for spec validation plus a backfill
// pass before the platform kills the invocation mid-write.
export const maxDuration = 300;

type CreateJobBody = {
  classId?: string;
  topicId?: string;
  subtopicId?: string;
  learningObjectiveId?: string;
  title?: string;
  description?: string;
  dueDate?: string;
  allowReattempts?: boolean;
  /** Everything generation itself needs; validated by generateQuestionSet. */
  generation?: GenerateQuestionsPayload;
};

/** Job statuses that map 1:1 onto a generation stage. */
const STAGE_STATUS: Record<GenerationStage, string> = {
  validating: 'validating',
  generating: 'generating',
  backfilling: 'backfilling',
  finalising: 'finalising',
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as CreateJobBody;
    const classId = typeof body.classId === 'string' ? txt(body.classId, 64) : '';
    if (!classId) return NextResponse.json({ error: 'A class is required.' }, { status: 400 });
    if (!body.generation) return NextResponse.json({ error: 'Generation details are required.' }, { status: 400 });

    // Ownership: the caller must be the teacher of this class. Checked with the
    // caller's own client, so RLS is doing the work rather than this comparison.
    const { data: classRow } = await supabase
      .from('classes')
      .select('id, teacher_id, teachers!inner ( user_id )')
      .eq('id', classId)
      .maybeSingle();
    const owner = classRow as unknown as { id: string; teacher_id: string; teachers: { user_id: string } | null } | null;
    if (!owner || owner.teachers?.user_id !== authData.user.id) {
      return NextResponse.json({ error: 'You do not teach this class.' }, { status: 403 });
    }

    // Charged at request time, not on completion: the AI spend happens either
    // way, and a teacher who closes the tab must not get a free retry.
    const { allowed } = await checkAiRateLimit(supabase, AI_DAILY_LIMITS.generateQuestions);
    if (!allowed) {
      return NextResponse.json({ error: 'Daily AI usage limit reached. Try again tomorrow.' }, { status: 429 });
    }

    const admin = createAdminClient();
    const { data: jobRow, error: jobError } = await admin
      .from('assignment_generation_jobs')
      .insert({
        teacher_id: owner.teacher_id,
        class_id: classId,
        requested_by: authData.user.id,
        status: 'queued',
        request: body,
      })
      .select('id')
      .single();

    if (jobError || !jobRow) {
      console.error('[assignment-generate] could not create job', jobError);
      return NextResponse.json({ error: 'Could not start generation. Please try again.' }, { status: 500 });
    }

    const jobId = (jobRow as { id: string }).id;
    const userId = authData.user.id;

    after(() => runJob({ admin, supabase, jobId, userId, teacherId: owner.teacher_id, classId, body }));

    return NextResponse.json({ success: true, jobId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to start generation.';
    return NextResponse.json({ error: txt(message, MAX_AI_ERROR_TEXT) }, { status: 500 });
  }
}

async function runJob({
  admin,
  supabase,
  jobId,
  userId,
  teacherId,
  classId,
  body,
}: {
  admin: ReturnType<typeof createAdminClient>;
  supabase: Awaited<ReturnType<typeof createClient>>;
  jobId: string;
  userId: string;
  teacherId: string;
  classId: string;
  body: CreateJobBody;
}) {
  const timer = createStageTimer('assignment-generate');
  const setStatus = (status: string, extra: Record<string, unknown> = {}) =>
    admin.from('assignment_generation_jobs').update({ status, ...extra }).eq('id', jobId);

  /**
   * Stage updates are deliberately not awaited inside the pipeline -- doing so
   * would put a database round trip between every step of the very thing being
   * measured. They must still be *issued*, though: a Supabase query builder is
   * a lazy thenable, so `void builder` composes the request and never sends it.
   * That left every job reading `queued` right up until it finished, which is
   * the one thing a progress display must never do.
   *
   * Chained rather than fired in parallel, because two in-flight updates can
   * land in either order and would park the teacher on a stage the job has
   * already left.
   */
  let stageWrites: Promise<void> = Promise.resolve();
  const reportStage = (status: string) => {
    stageWrites = stageWrites.then(() =>
      setStatus(status).then(
        ({ error }) => {
          if (error) console.error('[assignment-generate] stage update failed', status, error);
        },
        (err: unknown) => console.error('[assignment-generate] stage update failed', status, err)
      )
    );
  };

  /**
   * Write a terminal status. Waits for the queued stage writes first so a late
   * `generating` cannot overwrite `completed` and strand the browser polling a
   * job that has already finished.
   */
  const settle = async (status: string, extra: Record<string, unknown> = {}) => {
    await stageWrites;
    await setStatus(status, extra);
  };

  const fail = async (message: string) => {
    timer.done({ jobId, failed: true, error: message.slice(0, 200) });
    await settle('failed', { error: txt(message, 500) });
  };

  try {
    const result = await generateQuestionSet(body.generation!, {
      supabase,
      userId,
      timer,
      onStage: (stage) => reportStage(STAGE_STATUS[stage]),
    });

    if (isGenerationFailure(result)) {
      await fail(result.error);
      return;
    }

    await settle('saving');

    const { data: assignmentRow, error: insertError } = await timer.step('assignmentInsertMs', () =>
      admin
        .from('assignments')
        .insert({
          class_id: classId,
          teacher_id: teacherId,
          title: txt(body.title?.trim() || body.generation!.topic || 'Practice', 200),
          description: body.description?.trim() || null,
          topic_id: body.topicId || null,
          subtopic_id: body.subtopicId || null,
          learning_objective_id: body.learningObjectiveId || null,
          assignment_type: 'practice',
          due_date: body.dueDate ? new Date(body.dueDate).toISOString() : null,
          questions_payload: result.questions,
          source_material: result.sourceMaterial || null,
          allow_reattempts: !!body.allowReattempts,
        })
        .select('id')
        .single()
    );

    if (insertError || !assignmentRow) {
      await fail(insertError?.message || 'Questions were generated but the assignment could not be saved.');
      return;
    }

    timer.done({ jobId, produced: result.questionCount, warnings: result.warnings.length });
    await settle('completed', {
      assignment_id: (assignmentRow as { id: string }).id,
      warnings: result.warnings,
    });
  } catch (err) {
    await fail(err instanceof Error ? err.message : 'Generation failed.');
  }
}
