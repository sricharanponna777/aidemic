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
 * Background practice-question generation for students.
 *
 * The sibling of `/api/assignments/generate`, and the same trade: this route
 * validates and writes a job row, returns its id immediately, and runs the
 * pipeline in `after()` — which keeps the invocation alive past the response —
 * reporting its stage onto the row for the browser to poll. The work no longer
 * depends on the browser staying connected, so a student who navigates away
 * mid-generation can pick the run back up.
 *
 * `/api/ai/generate-questions` keeps its synchronous POST untouched: Daily
 * Review and the teacher question bank still call it and neither shows staged
 * progress. Both routes drive the identical `generateQuestionSet` pipeline, so
 * there is one generator, not two.
 */

// Generation measured ~74s; leave headroom for spec validation plus a backfill
// pass before the platform kills the invocation mid-write.
export const maxDuration = 300;

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

    const body = (await request.json()) as GenerateQuestionsPayload;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Generation details are required.' }, { status: 400 });
    }

    // Charged at request time, not on completion: the AI spend happens either
    // way, and a student who closes the tab must not get a free retry.
    const { allowed } = await checkAiRateLimit(supabase, AI_DAILY_LIMITS.generateQuestions);
    if (!allowed) {
      return NextResponse.json({ error: 'Daily AI usage limit reached. Try again tomorrow.' }, { status: 429 });
    }

    const admin = createAdminClient();
    const { data: jobRow, error: jobError } = await admin
      .from('question_generation_jobs')
      .insert({ user_id: authData.user.id, status: 'queued', request: body })
      .select('id')
      .single();

    if (jobError || !jobRow) {
      console.error('[questions-generate] could not create job', jobError);
      return NextResponse.json({ error: 'Could not start generation. Please try again.' }, { status: 500 });
    }

    const jobId = (jobRow as { id: string }).id;
    after(() => runJob({ admin, supabase, jobId, userId: authData.user.id, body }));

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
  body,
}: {
  admin: ReturnType<typeof createAdminClient>;
  supabase: Awaited<ReturnType<typeof createClient>>;
  jobId: string;
  userId: string;
  body: GenerateQuestionsPayload;
}) {
  const timer = createStageTimer('questions-generate');
  const setStatus = (status: string, extra: Record<string, unknown> = {}) =>
    admin.from('question_generation_jobs').update({ status, ...extra }).eq('id', jobId);

  /**
   * Stage updates are deliberately not awaited inside the pipeline -- doing so
   * would put a database round trip between every step of the very thing being
   * measured. They must still be *issued*, though: a Supabase query builder is
   * a lazy thenable, so `void builder` composes the request and never sends it.
   *
   * Chained rather than fired in parallel, because two in-flight updates can
   * land in either order and would park the student on a stage the job has
   * already left.
   */
  let stageWrites: Promise<void> = Promise.resolve();
  const reportStage = (status: string) => {
    stageWrites = stageWrites.then(() =>
      setStatus(status).then(
        ({ error }) => {
          if (error) console.error('[questions-generate] stage update failed', status, error);
        },
        (err: unknown) => console.error('[questions-generate] stage update failed', status, err)
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
    const result = await generateQuestionSet(body, {
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

    timer.done({ jobId, produced: result.questionCount, warnings: result.warnings.length });
    // The payload the synchronous route returns in its response body, parked
    // for the poller to collect. Shape-identical on purpose: the browser does
    // exactly what it did with the old response.
    await settle('completed', {
      result: {
        questions: result.questions,
        sourceMaterial: result.sourceMaterial,
        sources: result.sources,
        usedOnlineResources: result.usedOnlineResources,
        warnings: result.warnings,
      },
      warnings: result.warnings,
    });
  } catch (err) {
    await fail(err instanceof Error ? err.message : 'Generation failed.');
  }
}
