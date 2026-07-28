import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveTopic, attributeQuestions } from '../curriculum/resolve';
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
}

export async function recordMarkingEvidence(
  admin: SupabaseClient,
  userId: string,
  input: MarkingEvidenceInput
): Promise<void> {
  try {
    const resolved = await resolveTopic(
      admin,
      { subject: input.subject, examBoard: input.examBoard, examType: input.examType },
      input.topic
    );
    if (!resolved || resolved.subtopics.length === 0) {
      console.warn(`[spine] unresolved topic: ${input.subject}/${input.topic}`);
      return;
    }

    const texts = input.questions.map((question) => question.question || '');
    const attribution = attributeQuestions(resolved.subtopics, texts);

    // The lexical path only catches questions that echo a subtopic's wording,
    // which is rare; the classifier handles the rest in one batched call.
    const pending = attribution
      .map((subtopicId, index) => (subtopicId ? -1 : index))
      .filter((index) => index >= 0);

    if (pending.length > 0) {
      const { subtopicIds, error } = await classifyQuestionsToSubtopics(
        resolved.subtopics,
        pending.map((index) => texts[index])
      );
      if (error) console.warn(`[spine] classification: ${error}`);
      pending.forEach((questionIndex, slot) => {
        if (subtopicIds[slot]) attribution[questionIndex] = subtopicIds[slot];
      });
    }

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
