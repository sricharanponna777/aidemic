import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveTopic, attributeQuestions } from '../curriculum/resolve';
import { classifyQuestionsToSubtopics } from '../ai/classifySubtopic';
import { recordMasteryEvents, type EvidenceInput } from './record';

/**
 * Turn a blurting (free-recall) review into Learning Spine evidence.
 *
 * Blurting reports what a student recalled and what they left out at the level
 * of individual spec points, which is the same granularity the spine wants. It
 * is a weaker signal than marked exam practice -- EVIDENCE_WEIGHTS.blurt is 0.6
 * against exam_practice's 1.2 -- because nothing was marked against a scheme.
 *
 * Both directions are recorded. Attributing only the misses would mean the more
 * a student blurts the redder they get, with no path back up, which is exactly
 * the "wall of red" the confidence model exists to prevent. Note this does NOT
 * infer anything from the topic-level coverageScore: `covered` is a list of
 * per-point assertions, at the same granularity as `missed`.
 *
 * Call it from after() -- it makes a classification model call and must never
 * sit in the student's critical path. Every failure is swallowed and logged.
 */

export interface BlurtEvidenceInput {
  subject: string;
  examBoard: string;
  examType: string;
  topic: string;
  /** Spec points the student recalled correctly. */
  covered: string[];
  /** Spec points they omitted. */
  missed: string[];
  /** Things they stated wrongly. Treated as misses. */
  misconceptions: string[];
}

export async function recordBlurtEvidence(
  admin: SupabaseClient,
  userId: string,
  input: BlurtEvidenceInput
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

    // One flat list so a single classification call covers both directions.
    const points = [
      ...input.covered.map((text) => ({ text, passed: true })),
      ...input.missed.map((text) => ({ text, passed: false })),
      ...input.misconceptions.map((text) => ({ text, passed: false })),
    ].filter((point) => point.text?.trim());

    if (points.length === 0) return;

    const texts = points.map((point) => point.text);
    const attribution = attributeQuestions(resolved.subtopics, texts);

    // Spec-point phrasings echo subtopic wording far more often than exam
    // questions do, so the lexical pass carries real load here; the classifier
    // handles whatever is left in one batched call.
    const pending = attribution
      .map((subtopicId, index) => (subtopicId ? -1 : index))
      .filter((index) => index >= 0);

    if (pending.length > 0) {
      const { subtopicIds, error } = await classifyQuestionsToSubtopics(
        resolved.subtopics,
        pending.map((index) => texts[index])
      );
      if (error) console.warn(`[spine] classification: ${error}`);
      pending.forEach((pointIndex, slot) => {
        if (subtopicIds[slot]) attribution[pointIndex] = subtopicIds[slot];
      });
    }

    // Collapse to one event per subtopic: several spec points routinely map to
    // the same subtopic, and letting each emit its own event would let a single
    // blurt outweigh a marked paper.
    type Tally = { passes: number; fails: number; weaknessText: string | null };
    const bySubtopic = new Map<string, Tally>();

    attribution.forEach((subtopicId, index) => {
      if (!subtopicId) return;
      const point = points[index];
      const tally = bySubtopic.get(subtopicId) ?? { passes: 0, fails: 0, weaknessText: null };
      if (point.passed) {
        tally.passes += 1;
      } else {
        tally.fails += 1;
        tally.weaknessText ??= point.text;
      }
      bySubtopic.set(subtopicId, tally);
    });

    const evidence: EvidenceInput[] = [];
    for (const [subtopicId, tally] of bySubtopic) {
      // Recalled and missed within one sitting is contradictory at this
      // granularity -- there is no honest outcome to record, so record none.
      if (tally.passes > 0 && tally.fails > 0) continue;

      evidence.push({
        subtopicId,
        outcome: tally.passes > 0 ? 1 : 0,
        source: 'blurt',
        rawWeaknessText: tally.weaknessText,
      });
    }

    if (evidence.length === 0) return;

    const result = await recordMasteryEvents(admin, userId, evidence);
    for (const error of result.errors) console.error(`[spine] ${error}`);
  } catch (err) {
    console.error('[spine] recordBlurtEvidence failed', err);
  }
}
