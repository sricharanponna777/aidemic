import { NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { recordMasteryEvents } from '@/lib/mastery/record';

/**
 * Mark one micro-question and record it as Learning Spine evidence.
 *
 * The correctness decision is made here, against the question as it was stored
 * by /next, because the client necessarily holds the answer key already. The
 * `answered_at IS NULL` guard makes each item single-use, which is what stops a
 * correct answer being replayed into an unbounded run of passes.
 */

type AnswerPayload = { itemId?: unknown; selectedOption?: unknown };

const OPTIONS = ['A', 'B', 'C', 'D'];

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as AnswerPayload;
    const itemId = typeof body.itemId === 'string' ? body.itemId : '';
    const selectedOption =
      typeof body.selectedOption === 'string' ? body.selectedOption.trim().toUpperCase() : '';

    if (!itemId) return NextResponse.json({ error: 'itemId is required.' }, { status: 400 });
    if (!OPTIONS.includes(selectedOption)) {
      return NextResponse.json({ error: 'selectedOption must be A, B, C or D.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: item, error: readError } = await admin
      .from('review_queue_items')
      .select('id, user_id, subtopic_id, question, answered_at')
      .eq('id', itemId)
      .maybeSingle();

    if (readError || !item) return NextResponse.json({ error: 'Question not found.' }, { status: 404 });
    // Deliberately the same 404 as a missing row: whether someone else's item
    // exists is not the caller's business.
    if (item.user_id !== authData.user.id) {
      return NextResponse.json({ error: 'Question not found.' }, { status: 404 });
    }
    if (item.answered_at) {
      return NextResponse.json({ error: 'This question was already answered.' }, { status: 409 });
    }

    const question = item.question as { correctOption?: string; explanation?: string };
    const correct = selectedOption === question.correctOption;
    const outcome = correct ? 1 : 0;

    // Claim the item before recording, so a double submission loses the race
    // here rather than emitting a second event.
    const { data: claimed, error: claimError } = await admin
      .from('review_queue_items')
      .update({ answered_at: new Date().toISOString(), outcome })
      .eq('id', itemId)
      .is('answered_at', null)
      .select('id')
      .maybeSingle();

    if (claimError) return NextResponse.json({ error: 'Could not save your answer.' }, { status: 500 });
    if (!claimed) return NextResponse.json({ error: 'This question was already answered.' }, { status: 409 });

    after(async () => {
      const result = await recordMasteryEvents(admin, authData.user.id, [
        {
          subtopicId: item.subtopic_id,
          outcome,
          source: 'exam_practice',
          sourceId: itemId,
        },
      ]);
      for (const error of result.errors) console.error(`[spine] ${error}`);
    });

    return NextResponse.json({
      correct,
      correctOption: question.correctOption ?? '',
      explanation: question.explanation ?? '',
    });
  } catch {
    return NextResponse.json({ error: 'Could not save your answer.' }, { status: 500 });
  }
}
