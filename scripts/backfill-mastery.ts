/**
 * Backfill the Learning Spine from historical exam_practice_attempts.
 *
 * Existing users should open the knowledge graph onto a populated map, not an
 * empty one — an empty graph on day one is the single fastest way to make the
 * feature feel broken. This replays every stored attempt through the same
 * resolver, matcher and recorder the live path uses.
 *
 * Safe to re-run: pass --dry to see what it would do. Without --reset it will
 * append duplicate events, so use --reset when re-running for real.
 *
 *   bun run scripts/backfill-mastery.ts --dry
 *   bun run scripts/backfill-mastery.ts --reset
 */

import { createClient } from '@supabase/supabase-js';
import { resolveTopic, attributeQuestions } from '../src/lib/curriculum/resolve';
import { classifyQuestionsToSubtopics } from '../src/lib/ai/classifySubtopic';
import { recordMasteryEvents, type EvidenceInput } from '../src/lib/mastery/record';
import { masteryFromEvents, outcomeFromMarks } from '../src/lib/mastery';

const DRY = process.argv.includes('--dry');
const RESET = process.argv.includes('--reset');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

type Question = { question?: string; marks?: number };
type MarkedAnswer = { marksAwarded?: number; marks?: number; awarded?: number; score?: number };

type Attempt = {
  id: string;
  user_id: string;
  subject: string;
  exam_board: string;
  exam_type: string;
  topic: string;
  created_at: string;
  total_marks_awarded: number;
  total_available_marks: number;
  weakness_tags: string[] | null;
  weakness_analysis: string[] | null;
  questions_payload: Question[] | null;
  marking_report: { markedAnswers?: MarkedAnswer[] } | null;
};

/** Per-question marks, tolerating the several shapes markedAnswers has had. */
const awardedFor = (marked: MarkedAnswer | undefined): number | null => {
  if (!marked) return null;
  for (const value of [marked.marksAwarded, marked.awarded, marked.score, marked.marks]) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
};

/**
 * Undo a previous backfill without destroying evidence this script never wrote.
 *
 * Only `exam_practice` events are regenerated below, so only those are cleared.
 * `student_subtopic_mastery` is derived, which makes the correct reset a
 * re-derivation rather than a delete: dropping the whole table would wipe the
 * belief states built from assignments, flashcards and blurts, none of which
 * this script can rebuild.
 */
async function resetExamPracticeEvidence() {
  const { data: doomed, error } = await admin
    .from('mastery_events')
    .select('user_id, subtopic_id')
    .eq('source', 'exam_practice');
  if (error) {
    console.error('Could not read events to reset:', error.message);
    process.exit(1);
  }

  const pairs = [...new Set((doomed ?? []).map((row) => `${row.user_id}|${row.subtopic_id}`))];
  console.log(`Clearing exam_practice events and re-deriving ${pairs.length} mastery rows…`);

  await admin.from('mastery_events').delete().eq('source', 'exam_practice');

  for (const pair of pairs) {
    const [userId, subtopicId] = pair.split('|');
    const { data: surviving } = await admin
      .from('mastery_events')
      .select('outcome, weight, created_at')
      .eq('user_id', userId)
      .eq('subtopic_id', subtopicId);

    const events = (surviving ?? []) as { outcome: number; weight: number; created_at: string }[];
    if (events.length === 0) {
      // Nothing left to derive from, so the belief state should not exist.
      await admin
        .from('student_subtopic_mastery')
        .delete()
        .eq('user_id', userId)
        .eq('subtopic_id', subtopicId);
      continue;
    }

    const state = masteryFromEvents(
      events.map((event) => ({ outcome: event.outcome, weight: event.weight, at: event.created_at }))
    );
    await admin.from('student_subtopic_mastery').upsert(
      {
        user_id: userId,
        subtopic_id: subtopicId,
        strength: state.strength,
        stability: state.stability,
        confidence: state.confidence,
        evidence_count: state.evidenceCount,
        last_seen_at: state.lastSeenAt,
        due_at: state.dueAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,subtopic_id' }
    );
  }
}

async function main() {
  if (RESET && !DRY) {
    await resetExamPracticeEvidence();
  }

  const { data, error } = await admin
    .from('exam_practice_attempts')
    .select(
      'id, user_id, subject, exam_board, exam_type, topic, created_at, total_marks_awarded, total_available_marks, weakness_tags, weakness_analysis, questions_payload, marking_report'
    )
    .order('created_at');

  if (error) {
    console.error('Could not read attempts:', error.message);
    process.exit(1);
  }

  const attempts = (data ?? []) as Attempt[];
  console.log(`${attempts.length} attempts to process${DRY ? ' (dry run)' : ''}\n`);

  const stats = {
    attempts: 0,
    unresolvedTopic: 0,
    questions: 0,
    attributed: 0,
    classified: 0,
    unattributed: 0,
    events: 0,
  };

  for (const attempt of attempts) {
    stats.attempts += 1;

    const resolved = await resolveTopic(
      admin,
      { subject: attempt.subject, examBoard: attempt.exam_board, examType: attempt.exam_type },
      attempt.topic
    );

    if (!resolved || resolved.subtopics.length === 0) {
      stats.unresolvedTopic += 1;
      console.log(`  ✗ ${attempt.subject}/${attempt.topic} — no matching specification topic`);
      continue;
    }

    const questions = attempt.questions_payload ?? [];
    const marked = attempt.marking_report?.markedAnswers ?? [];
    const texts = questions.map((q) => q.question || '');
    const attribution = attributeQuestions(resolved.subtopics, texts);

    // The lexical path resolves only questions that echo a subtopic's wording,
    // which in practice is almost none. Everything else goes to the classifier.
    const pending = attribution
      .map((subtopicId, index) => (subtopicId ? -1 : index))
      .filter((index) => index >= 0);

    if (pending.length > 0) {
      const { subtopicIds, error: classifyError } = await classifyQuestionsToSubtopics(
        resolved.subtopics,
        pending.map((index) => texts[index])
      );
      if (classifyError) console.error(`    ! ${classifyError}`);
      pending.forEach((questionIndex, slot) => {
        if (subtopicIds[slot]) {
          attribution[questionIndex] = subtopicIds[slot];
          stats.classified += 1;
        }
      });
    }

    const evidence: EvidenceInput[] = [];
    attribution.forEach((subtopicId, index) => {
      stats.questions += 1;
      if (!subtopicId) {
        stats.unattributed += 1;
        return;
      }
      stats.attributed += 1;

      const available = questions[index]?.marks ?? null;
      const awarded = awardedFor(marked[index]);
      // Fall back to the attempt-level percentage when per-question marks are
      // missing — the outcome is still real, just less precise.
      const outcome =
        awarded !== null && available
          ? outcomeFromMarks(awarded, available)
          : outcomeFromMarks(attempt.total_marks_awarded, attempt.total_available_marks);

      evidence.push({
        subtopicId,
        outcome,
        source: 'exam_practice',
        sourceId: attempt.id,
        marksAwarded: awarded,
        marksAvailable: available,
        rawWeaknessText: (attempt.weakness_tags ?? attempt.weakness_analysis ?? [])[0] ?? null,
        occurredAt: attempt.created_at,
      });
    });

    console.log(
      `  ${evidence.length > 0 ? '✓' : '·'} ${attempt.subject}/${attempt.topic} → ` +
        `${resolved.specificationName}${resolved.tier ? ` (${resolved.tier})` : ''} · ` +
        `${evidence.length}/${texts.length} questions attributed` +
        (resolved.ambiguousSpecification ? ' · specification was ambiguous' : '')
    );

    if (!DRY && evidence.length > 0) {
      const outcome = await recordMasteryEvents(admin, attempt.user_id, evidence);
      stats.events += outcome.eventsWritten;
      for (const err of outcome.errors) console.error(`    ! ${err}`);
    } else {
      stats.events += evidence.length;
    }
  }

  console.log('\n─── summary ───');
  console.log(`attempts processed     ${stats.attempts}`);
  console.log(`topic unresolved       ${stats.unresolvedTopic}`);
  console.log(`questions seen         ${stats.questions}`);
  console.log(`  attributed           ${stats.attributed}`);
  console.log(`    via classifier     ${stats.classified}`);
  console.log(`  unattributed         ${stats.unattributed}`);
  console.log(`events ${DRY ? 'that would be written' : 'written'}  ${stats.events}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
