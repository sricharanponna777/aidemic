import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applyEvidence,
  initialMasteryState,
  EVIDENCE_WEIGHTS,
  type MasterySource,
  type MasteryState,
} from '../mastery';

/**
 * Server-side write path for the Learning Spine.
 *
 * Two tables move together: `mastery_events` (append-only evidence) and
 * `student_subtopic_mastery` (derived belief state). Neither has a client write
 * policy — mastery drives predicted grades, the planner and XP, so a student
 * able to insert their own evidence could forge all three. Everything here must
 * therefore run with the service-role client, from server code only.
 *
 * Recording is deliberately BEST-EFFORT: if the spine write fails, the caller's
 * primary job (marking the attempt, saving the answer) must still succeed. A
 * dropped event is recoverable — `student_subtopic_mastery` is derived, so a
 * replay job can rebuild it — whereas a failed marking response is a broken
 * feature in the student's face. Callers get the counts back and should log,
 * not throw.
 */

export interface EvidenceInput {
  subtopicId: string;
  /** Normalised 0..1 performance. */
  outcome: number;
  source: MasterySource;
  sourceId?: string | null;
  marksAwarded?: number | null;
  marksAvailable?: number | null;
  learningObjectiveId?: string | null;
  misconceptionId?: string | null;
  /** Kept when misconception classification finds no match. */
  rawWeaknessText?: string | null;
  difficulty?: 'easy' | 'medium' | 'hard' | 'exam' | 'challenge' | null;
  responseSeconds?: number | null;
  /** Defaults to now. Set explicitly when backfilling history. */
  occurredAt?: string;
}

export interface RecordResult {
  eventsWritten: number;
  subtopicsUpdated: number;
  errors: string[];
}

export type MasteryRow = {
  subtopic_id: string;
  strength: number | string;
  stability: number | string;
  confidence: number | string;
  evidence_count: number;
  last_seen_at: string | null;
  due_at: string | null;
};

/** Postgres returns `numeric` as a string over the wire; normalise on read. */
export const num = (value: number | string | null | undefined): number => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const rowToState = (row: MasteryRow | undefined): MasteryState =>
  row
    ? {
        strength: num(row.strength),
        stability: num(row.stability),
        confidence: num(row.confidence),
        evidenceCount: row.evidence_count ?? 0,
        lastSeenAt: row.last_seen_at,
        dueAt: row.due_at,
      }
    : initialMasteryState();

/**
 * Write a batch of evidence and fold it into the affected belief states.
 *
 * Events are inserted first so that nothing is lost if the derived-state update
 * fails: the log is the source of truth and can always be replayed.
 */
export async function recordMasteryEvents(
  admin: SupabaseClient,
  userId: string,
  evidence: EvidenceInput[]
): Promise<RecordResult> {
  const result: RecordResult = { eventsWritten: 0, subtopicsUpdated: 0, errors: [] };
  const usable = evidence.filter((item) => item.subtopicId);
  if (usable.length === 0) return result;

  const rows = usable.map((item) => ({
    user_id: userId,
    subtopic_id: item.subtopicId,
    learning_objective_id: item.learningObjectiveId ?? null,
    source: item.source,
    source_id: item.sourceId ?? null,
    marks_awarded: item.marksAwarded ?? null,
    marks_available: item.marksAvailable ?? null,
    outcome: Math.min(1, Math.max(0, item.outcome)),
    weight: EVIDENCE_WEIGHTS[item.source] ?? 1,
    misconception_id: item.misconceptionId ?? null,
    raw_weakness_text: item.rawWeaknessText ?? null,
    difficulty: item.difficulty ?? null,
    response_seconds: item.responseSeconds ?? null,
    created_at: item.occurredAt ?? new Date().toISOString(),
  }));

  const { error: insertError } = await admin.from('mastery_events').insert(rows);
  if (insertError) {
    result.errors.push(`mastery_events insert failed: ${insertError.message}`);
    return result;
  }
  result.eventsWritten = rows.length;

  // Fold into the derived state, one row per affected subtopic.
  const subtopicIds = [...new Set(usable.map((item) => item.subtopicId))];
  const { data: existing, error: readError } = await admin
    .from('student_subtopic_mastery')
    .select('subtopic_id, strength, stability, confidence, evidence_count, last_seen_at, due_at')
    .eq('user_id', userId)
    .in('subtopic_id', subtopicIds);

  if (readError) {
    result.errors.push(`mastery read failed: ${readError.message}`);
    return result;
  }

  const bySubtopic = new Map<string, MasteryRow>(
    ((existing ?? []) as MasteryRow[]).map((row) => [row.subtopic_id, row])
  );

  const upserts = subtopicIds.map((subtopicId) => {
    const forSubtopic = rows
      .filter((row) => row.subtopic_id === subtopicId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));

    let state = rowToState(bySubtopic.get(subtopicId));
    for (const row of forSubtopic) {
      state = applyEvidence(state, {
        outcome: row.outcome,
        weight: row.weight,
        at: row.created_at,
      });
    }

    return {
      user_id: userId,
      subtopic_id: subtopicId,
      strength: state.strength,
      stability: state.stability,
      confidence: state.confidence,
      evidence_count: state.evidenceCount,
      last_seen_at: state.lastSeenAt,
      due_at: state.dueAt,
      updated_at: new Date().toISOString(),
    };
  });

  const { error: upsertError } = await admin
    .from('student_subtopic_mastery')
    .upsert(upserts, { onConflict: 'user_id,subtopic_id' });

  if (upsertError) {
    result.errors.push(`mastery upsert failed: ${upsertError.message}`);
    return result;
  }

  result.subtopicsUpdated = upserts.length;
  return result;
}
