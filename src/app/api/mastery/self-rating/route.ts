import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { recordMasteryEvents } from '@/lib/mastery/record';
import { outcomeFromSelfRating } from '@/lib/mastery';
import { isSelfRating, shouldEmitSelfRatingEvent } from '@/lib/mastery/fromSelfRating';
import { studentStudiesSubtopic } from '@/lib/curriculum/enrolment';

/**
 * Record a red/amber/green self-rating against a curriculum subtopic.
 *
 * A route rather than a client write because neither spine table has a client
 * write policy: mastery drives the planner, the review queue and predicted
 * grades, so a student able to insert their own evidence could forge all three.
 * The rating itself is of course still self-reported — what the server controls
 * is how much of it reaches the belief state, which is the cooldown in
 * fromSelfRating.ts plus EVIDENCE_WEIGHTS.self_rating (0.2).
 */

type SelfRatingPayload = { subtopicId?: unknown; rating?: unknown };

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as SelfRatingPayload;
    const subtopicId = typeof body.subtopicId === 'string' ? body.subtopicId : '';
    const rating = body.rating;

    if (!subtopicId) return NextResponse.json({ error: 'subtopicId is required.' }, { status: 400 });
    if (!isSelfRating(rating)) {
      return NextResponse.json({ error: 'rating must be red, amber or green.' }, { status: 400 });
    }

    const userId = authData.user.id;

    if (!(await studentStudiesSubtopic(supabase, userId, subtopicId))) {
      return NextResponse.json({ error: 'That subtopic is not in your subjects.' }, { status: 403 });
    }

    const admin = createAdminClient();

    const [{ data: existing }, { data: lastEvent }] = await Promise.all([
      admin
        .from('student_subtopic_mastery')
        .select('self_rating')
        .eq('user_id', userId)
        .eq('subtopic_id', subtopicId)
        .maybeSingle(),
      admin
        .from('mastery_events')
        .select('created_at')
        .eq('user_id', userId)
        .eq('subtopic_id', subtopicId)
        .eq('source', 'self_rating')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const previousRating = (existing as { self_rating: string | null } | null)?.self_rating ?? null;
    const emit = shouldEmitSelfRatingEvent(
      isSelfRating(previousRating) ? previousRating : null,
      rating,
      (lastEvent as { created_at: string } | null)?.created_at ?? null
    );

    if (emit) {
      // Ahead of the label write on purpose: recordMasteryEvents upserts the
      // whole derived row, so a self_rating set first would be overwritten by
      // the fold. Awaited rather than deferred to after() because the response
      // reports whether the belief state moved.
      const result = await recordMasteryEvents(admin, userId, [
        { subtopicId, outcome: outcomeFromSelfRating(rating), source: 'self_rating' },
      ]);
      for (const error of result.errors) console.error(`[spine] ${error}`);
    }

    // The label always reflects the latest click, even when the evidence was
    // suppressed -- it is what the student said, not what we measured.
    const { data: updated, error: updateError } = await admin
      .from('student_subtopic_mastery')
      .update({ self_rating: rating, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('subtopic_id', subtopicId)
      .select('subtopic_id')
      .maybeSingle();

    if (updateError) {
      return NextResponse.json({ error: 'Could not save your rating.' }, { status: 500 });
    }

    // No row to update means this is the student's first contact with the
    // subtopic and the event was suppressed (or failed). Insert the label alone;
    // the numeric columns default to a zero-evidence state, which masteryBand
    // reads as 'unknown' rather than weak.
    if (!updated) {
      const { error: insertError } = await admin
        .from('student_subtopic_mastery')
        .insert({ user_id: userId, subtopic_id: subtopicId, self_rating: rating });

      if (insertError) {
        return NextResponse.json({ error: 'Could not save your rating.' }, { status: 500 });
      }
    }

    return NextResponse.json({ rating, evidenceRecorded: emit });
  } catch {
    return NextResponse.json({ error: 'Could not save your rating.' }, { status: 500 });
  }
}
