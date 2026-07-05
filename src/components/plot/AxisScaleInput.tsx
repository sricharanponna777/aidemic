'use client';

import type { AxisScaleChoice } from '@/lib/plot/scaleRules';

interface AxisScaleInputProps {
  value: AxisScaleChoice;
  onChange: (value: AxisScaleChoice) => void;
  axisLabel?: string;
}

/** Lets the student choose their own axis maximum and interval before plotting, rather than
 * having the scale drawn for them -- picking a sensible scale (interval a power of ten, data
 * filling at least half the grid) is a marked GCSE skill in its own right. */
export function AxisScaleInput({ value, onChange, axisLabel = 'Y-axis' }: AxisScaleInputProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-600 dark:border-white/10 dark:text-slate-300">
      <span className="font-medium">{axisLabel} scale:</span>
      <label className="flex items-center gap-1">
        Max
        <input
          type="number"
          min={0}
          value={value.max}
          onChange={(e) => onChange({ ...value, max: Number(e.target.value) || 0 })}
          className="w-20 rounded border border-slate-300 bg-transparent px-1.5 py-0.5 dark:border-white/10"
        />
      </label>
      <label className="flex items-center gap-1">
        Interval
        <input
          type="number"
          min={0}
          value={value.step}
          onChange={(e) => onChange({ ...value, step: Number(e.target.value) || 0 })}
          className="w-20 rounded border border-slate-300 bg-transparent px-1.5 py-0.5 dark:border-white/10"
        />
      </label>
      <span className="text-slate-400 dark:text-slate-500">Choose a clean interval such as 1, 2, 5, 10, 20 or 50 that fills at least half the grid.</span>
    </div>
  );
}
