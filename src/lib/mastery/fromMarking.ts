import type { SupabaseClient } from '@supabase/supabase-js';
import { attributeQuestions } from '../curriculum/resolve';
import { cachedLoadTopicSubtopics, cachedResolveTopic } from '../curriculum/cache';
import { classifyQuestionsToSubtopics } from '../ai/classifySubtopic';
import { recordMasteryEvents, type EvidenceInput } from './record';
import { outcomeFromMarks } from '../mastery';
import type { MasterySource } from '../mastery';

/**
 * Turn a completed marking run into Learning Spine evidence.
 *
 * This is the dual-write: the attempt still saves exactly as it did before,
 * and in addition each marked question is resolved onto a curriculum subtopic
 * and logged as a `mastery_event`. Nothing downstream of the spine works until
 * evidence flows, so this is the load-bearing integration.
 *
 * Call it from `after()` — it makes a classification model call and must never
 * sit in the student's critical path. Every failure is swallowed and logged:
 * a missed event is recoverable by replay, a failed marking response is not.
 */

interface MarkingQuestionLike {
  question?: string;
  marks?: number;
}

interface MarkedAnswerLike {
  questionIndex?: number;
  marksAwarded?: number;
  maxMarks?: number;
  weaknessTags?: string[];
}

export interface MarkingEvidenceInput {
  subject: string;
  examBoard: string;
  examType: string;
  topic: string;
  source: MasterySource;
  sourceId?: string | null;
  questions: MarkingQuestionLike[];
  markedAnswers: MarkedAnswerLike[];
  /**
   * Curriculum ids the caller already knows, bypassing the free-text lookup.
   *
   * Assignments store `topic_id` / `subtopic_id` / `learning_objective_id` as
   * real foreign keys, so resolving their free-text *title* against
   * `topics.name` is guessing at something we were handed. It also never
   * succeeded: an assignment titled "Cell Biology - Assignment - 01" matches no
   * topic name, so `resolveTopic` returned null and every assignment's evidence
   * was silently dropped before this fix.
   */
  curriculum?: {
    topicId?: string | null;
    subtopicId?: string | null;
    learningObjectiveId?: string | null;
  } | null;
}

/**
 * Decide which subtopic each question belongs to.
 *
 * Three routes, cheapest first:
 *  - a known `subtopicId` attributes the whole set with no lookup and no model
 *    call (the assignment was *generated* for that subtopic);
 *  - a known `topicId` skips the free-text topic lookup but still classifies
 *    each question across that topic's subtopics;
 *  - otherwise the original free-text path, which is all a self-practice
 *    attempt has.
 */
async function attributeToSubtopics(
  input: MarkingEvidenceInput,
  texts: string[]
): Promise<(string | null)[]> {
  const subtopicId = input.curriculum?.subtopicId;
  if (subtopicId) return texts.map(() => subtopicId);

  const topicId = input.curriculum?.topicId;
  const subtopics = topicId
    ? await cachedLoadTopicSubtopics(topicId)
    : (await cachedResolveTopic(
        { subject: input.subject, examBoard: input.examBoard, examType: input.examType },
        input.topic
      ))?.subtopics ?? [];

  if (subtopics.length === 0) {
    console.warn(`[spine] unresolved topic: ${input.subject}/${input.topic}`);
    return texts.map(() => null);
  }

  const attribution = attributeQuestions(subtopics, texts);

  // The lexical path only catches questions that echo a subtopic's wording,
  // which is rare; the classifier handles the rest in one batched call.
  const pending = attribution
    .map((id, index) => (id ? -1 : index))
    .filter((index) => index >= 0);

  if (pending.length > 0) {
    const { subtopicIds, error } = await classifyQuestionsToSubtopics(
      subtopics,
      pending.map((index) => texts[index])
    );
    if (error) console.warn(`[spine] classification: ${error}`);
    pending.forEach((questionIndex, slot) => {
      if (subtopicIds[slot]) attribution[questionIndex] = subtopicIds[slot];
    });
  }

  return attribution;
}

export async function recordMarkingEvidence(
  admin: SupabaseClient,
  userId: string,
  input: MarkingEvidenceInput
): Promise<void> {
  try {
    const texts = input.questions.map((question) => question.question || '');
    const attribution = await attributeToSubtopics(input, texts);

    const evidence: EvidenceInput[] = [];
    attribution.forEach((subtopicId, index) => {
      if (!subtopicId) return;
      const marked = input.markedAnswers.find((answer) => answer.questionIndex === index)
        ?? input.markedAnswers[index];
      if (!marked) return;

      const available = marked.maxMarks ?? input.questions[index]?.marks ?? 0;
      if (!available) return;

      evidence.push({
        subtopicId,
        outcome: outcomeFromMarks(marked.marksAwarded ?? 0, available),
        source: input.source,
        sourceId: input.sourceId ?? null,
        learningObjectiveId: input.curriculum?.learningObjectiveId ?? null,
        marksAwarded: marked.marksAwarded ?? 0,
        marksAvailable: available,
        // Held until the misconception taxonomy is seeded; the clustering job
        // that grows the taxonomy reads exactly this column.
        rawWeaknessText: marked.weaknessTags?.[0] ?? null,
      });
    });

    if (evidence.length === 0) return;

    const result = await recordMasteryEvents(admin, userId, evidence);
    for (const error of result.errors) console.error(`[spine] ${error}`);
  } catch (err) {
    console.error('[spine] recordMarkingEvidence failed', err);
  }
}
