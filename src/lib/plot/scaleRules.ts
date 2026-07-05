import { isCleanStep } from './scale';

/** True for graph-paper intervals from the 1/2/5 x 10^n family: 1, 2, 5, 10,
 * 20, 50, 100, etc. Kept under the old exported name because callers only
 * need the "is this a sensible step?" answer. */
export const isPowerOfTenStep = (step: number): boolean => {
  if (!Number.isFinite(step) || step <= 0) return false;
  return isCleanStep(step);
};

export interface AxisScaleChoice {
  max: number;
  step: number;
}

export interface AxisScaleEvaluation {
  correct: boolean;
  reason: string;
}

/** True if `value` falls exactly on a gridline spaced `unit` apart -- used to check that a
 * chosen x-axis scale lets every given (fixed) x-value be plotted precisely on a printed
 * gridline intersection, rather than somewhere between two lines. */
const isOnGrid = (value: number, unit: number): boolean => {
  if (unit <= 0) return false;
  const ratio = value / unit;
  return Math.abs(ratio - Math.round(ratio)) < 1e-6;
};

/** Marks a student-chosen axis scale against the GCSE "choose a sensible scale" criterion:
 * the interval must be a clean 1/2/5 x 10^n value (so each major square subdivides cleanly into a 10x10
 * grid), the axis must reach at least the largest value being plotted, and the data should
 * fill at least half the grid so the scale isn't needlessly zoomed out.
 *
 * When `alignValues` is supplied (the fixed, given values that must sit on the axis -- e.g.
 * the x-axis time readings of a line graph), every one of them must additionally land exactly
 * on a minor gridline, so each data point can snap precisely into a grid square instead of
 * falling between lines. */
export const evaluateAxisScale = (
  choice: AxisScaleChoice | null | undefined,
  dataMax: number,
  alignValues?: number[]
): AxisScaleEvaluation => {
  if (!choice || !Number.isFinite(choice.max) || !Number.isFinite(choice.step) || choice.max <= 0 || choice.step <= 0) {
    return { correct: false, reason: 'Scale: choose an axis maximum and interval before plotting.' };
  }
  if (!isPowerOfTenStep(choice.step)) {
    return { correct: false, reason: `Scale: interval should be a clean graph-paper value such as 1, 2, 5, 10, 20 or 50, not ${choice.step}.` };
  }
  if (choice.max < dataMax) {
    return { correct: false, reason: `Scale: axis maximum (${choice.max}) is too small to fit the largest value (${dataMax}).` };
  }
  if (dataMax < choice.max / 2) {
    return { correct: false, reason: `Scale: axis maximum (${choice.max}) is too large -- the data should fill at least half the grid.` };
  }
  if (alignValues && alignValues.length > 0) {
    const minor = choice.step / 10;
    const offGrid = alignValues.filter((v) => !isOnGrid(v, minor));
    if (offGrid.length > 0) {
      return {
        correct: false,
        reason: `Scale: interval doesn't let every value (${offGrid.join(', ')}) land exactly on a gridline -- pick a step that divides them evenly.`,
      };
    }
  }
  return { correct: true, reason: 'Scale: sensible choice -- interval is clean and the data fills the grid well.' };
};
