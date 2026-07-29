import type { SubtopicMastery } from '@/lib/mastery/read';

/**
 * How much of a specification a predicted grade actually rests on.
 *
 * Deliberately NOT a grade. weightedPredictedGrade() in gradeAverages.ts is
 * calibrated against real mark schemes and published grade boundaries; a mean of
 * retrievability is calibrated against nothing, and grade-prediction accuracy is
 * unevaluated in this codebase. Replacing a measured percentage with a modelled
 * one would trade a number we can defend for one we cannot.
 *
 * Averaging retrievability would also be biased by construction. Only subtopics
 * a student has practised have evidence, and students practise what they have
 * been taught — so the mean runs high early in a course and drifts down as
 * coverage grows, which is the opposite of what it would appear to mean.
 *
 * What the spine can say honestly is how much of the specification has been
 * measured at all. "Predicted 6, from 18% of the course" is a materially
 * different claim from "Predicted 6", and it is the one the data supports.
 */

export interface MasteryCoverage {
  /** Subtopics with enough evidence to have an opinion about. */
  covered: number;
  /** Subtopics in the specification. */
  total: number;
  /** covered / total, 0 when the specification size is unknown. */
  coverage: number;
  /** Mean retrievability across covered subtopics only. 0 when none. */
  meanRetrievability: number;
}

export const emptyMasteryCoverage = (): MasteryCoverage => ({
  covered: 0,
  total: 0,
  coverage: 0,
  meanRetrievability: 0,
});

/**
 * Coverage across one specification.
 *
 * `rows` should already be scoped to the specification `totalSubtopics` counts,
 * otherwise coverage compares a numerator and denominator from different
 * courses. Rows banded 'unknown' are excluded: too little evidence to make a
 * claim is not coverage, it is the absence of it.
 */
export function masteryCoverage(
  rows: SubtopicMastery[],
  totalSubtopics: number
): MasteryCoverage {
  const measured = rows.filter((row) => row.band !== 'unknown');
  const total = Number.isFinite(totalSubtopics) && totalSubtopics > 0 ? Math.trunc(totalSubtopics) : 0;

  if (measured.length === 0) return { ...emptyMasteryCoverage(), total };

  const meanRetrievability =
    measured.reduce((sum, row) => sum + row.retrievability, 0) / measured.length;

  return {
    covered: measured.length,
    total,
    // Capped at 1: a stale mastery row whose subtopic has since been re-seeded
    // out of the specification would otherwise report over 100% coverage.
    coverage: total > 0 ? Math.min(1, measured.length / total) : 0,
    meanRetrievability,
  };
}

/** "measured on 54 of 300 subtopics (18% of the specification)", or null. */
export function describeMasteryCoverage(coverage: MasteryCoverage): string | null {
  if (coverage.covered === 0 || coverage.total === 0) return null;
  const percentage = Math.round(coverage.coverage * 100);
  return `measured on ${coverage.covered} of ${coverage.total} subtopics (${percentage}% of the specification)`;
}
