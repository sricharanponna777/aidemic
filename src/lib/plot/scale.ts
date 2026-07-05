export const linearScale = (domain: [number, number], range: [number, number]) => {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const ratio = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (value: number) => r0 + (value - d0) * ratio;
};

export const invertLinearScale = (domain: [number, number], range: [number, number]) => {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const ratio = r1 === r0 ? 0 : (d1 - d0) / (r1 - r0);
  return (pixel: number) => d0 + (pixel - r0) * ratio;
};

export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const EPSILON = 1e-9;
const CLEAN_STEP_MULTIPLIERS = [1, 2, 5, 10] as const;

const roundFloat = (value: number) => {
  const rounded = Number.parseFloat(value.toPrecision(12));
  return Object.is(rounded, -0) ? 0 : rounded;
};

/** GCSE graph-paper axes should use familiar 1/2/5 x 10^n intervals: 0.2, 0.5,
 * 1, 2, 5, 10, 20, 50, etc. */
export const isCleanStep = (step: number): boolean => {
  if (!Number.isFinite(step) || step <= 0) return false;
  const magnitude = 10 ** Math.floor(Math.log10(step));
  const normalized = step / magnitude;
  return CLEAN_STEP_MULTIPLIERS.some((multiplier) => Math.abs(normalized - multiplier) < 1e-6);
};

/** Picks a labelled axis interval from the 1/2/5/10 family. For example, a
 * max value of 43 with about 6 major squares gives a step of 10, so the axis is
 * labelled 0, 10, 20, 30, 40, 50. */
export const niceStep = (span: number, targetTicks: number) => {
  if (!Number.isFinite(span) || span <= 0 || targetTicks <= 0) return 1;
  const rough = span / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const multiplier = CLEAN_STEP_MULTIPLIERS.find((candidate) => normalized <= candidate) ?? 10;
  return roundFloat(multiplier * magnitude);
};

const axisMaxForStep = (dataMax: number, step: number) => {
  const max = Math.ceil((dataMax - EPSILON) / step) * step;
  return roundFloat(Math.max(max, step));
};

const nextSmallerCleanStep = (step: number) => {
  const magnitude = 10 ** Math.floor(Math.log10(step));
  const normalized = step / magnitude;
  if (normalized > 5) return roundFloat(5 * magnitude);
  if (normalized > 2) return roundFloat(2 * magnitude);
  if (normalized > 1) return roundFloat(magnitude);
  return roundFloat(5 * (magnitude / 10));
};

const isOnMinorGrid = (value: number, step: number) => {
  const minor = step / 10;
  if (!Number.isFinite(minor) || minor <= 0) return false;
  const ratio = value / minor;
  return Math.abs(ratio - Math.round(ratio)) < 1e-6;
};

/** Seeds a graph-paper axis from the values being plotted. Labels use one fewer
 * place of precision than the plotted values where possible, while the minor
 * grid still lets each given value land exactly on a small square. */
export const deriveAxisFromValues = (values: number[], targetTicks = 6) => {
  const finiteValues = values.filter((value) => Number.isFinite(value) && value >= 0);
  const dataMax = Math.max(...finiteValues, 0);
  const safeMax = dataMax > 0 ? dataMax : 1;
  const baseStep = niceStep(safeMax, targetTicks);

  let step = baseStep;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const max = axisMaxForStep(safeMax, step);
    const minorCount = max / (step / 10);
    if (minorCount <= 300 && finiteValues.every((value) => isOnMinorGrid(value, step))) {
      return { max, step };
    }
    step = nextSmallerCleanStep(step);
  }

  return { max: axisMaxForStep(safeMax, baseStep), step: baseStep };
};

/** Rounds a dragged value to the nearest 1/10 of the given axis interval, so a point "snaps"
 * into the minor gridline squares formed by subdividing each major square 10x10 -- matching
 * how marks are actually plotted to the nearest small square on GCSE graph paper. */
export const snapToStep = (value: number, step: number) => {
  if (!Number.isFinite(step) || step <= 0) return value;
  const minor = step / 10;
  return Math.round(value / minor) * minor;
};

/** Seeds an axis-scale picker with a clean graph-paper max/step for callers
 * that only know the largest value. Prefer deriveAxisFromValues when the
 * actual plotted values are available, because it can also align minor squares. */
export const deriveDefaultAxis = (dataMax: number) => {
  return deriveAxisFromValues([dataMax]);
};

export const bandScale = (categories: string[], range: [number, number], paddingRatio = 0.2) => {
  const [r0, r1] = range;
  const step = categories.length > 0 ? (r1 - r0) / categories.length : 0;
  const bandwidth = step * (1 - paddingRatio);
  const position = (category: string) => {
    const index = categories.indexOf(category);
    return r0 + step * index + (step - bandwidth) / 2;
  };
  return { position, bandwidth };
};
