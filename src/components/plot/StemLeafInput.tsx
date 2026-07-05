'use client';

import { useState } from 'react';
import type { PlotStemLeafData } from '@/types';

export interface StemLeafRow {
  stem: number;
  leaves: number[];
}

interface StemLeafInputProps {
  spec: PlotStemLeafData;
  value: StemLeafRow[] | null;
  onChange: (value: StemLeafRow[]) => void;
  readOnly?: boolean;
  correctValues?: StemLeafRow[] | null;
}

const parseLeaves = (raw: string): number[] =>
  raw
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .flatMap((token) => (/^\d+$/.test(token) ? token.split('').map(Number) : []));

export function StemLeafInput({ spec, value, onChange, readOnly = false, correctValues }: StemLeafInputProps) {
  const stems = spec.correctRows.map((row) => row.stem);
  const [drafts, setDrafts] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    for (const row of value ?? []) initial[row.stem] = row.leaves.join(' ');
    return initial;
  });

  const handleChange = (stem: number, raw: string) => {
    const nextDrafts = { ...drafts, [stem]: raw };
    setDrafts(nextDrafts);
    onChange(stems.map((s) => ({ stem: s, leaves: parseLeaves(nextDrafts[s] ?? '') })));
  };

  const correctByStem = new Map((correctValues ?? []).map((row) => [row.stem, row.leaves]));
  const submittedByStem = new Map((value ?? []).map((row) => [row.stem, row.leaves]));

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500 dark:text-slate-400">Key: {spec.key}</p>
      <table className="w-full border-collapse text-sm">
        <tbody>
          {stems.map((stem) => (
            <tr key={stem} className="border-b border-slate-200 dark:border-white/10">
              <td className="w-12 py-1 pr-2 font-medium text-slate-700 dark:text-slate-300">{stem}</td>
              <td className="py-1">
                {readOnly ? (
                  <span className="text-amber-600 dark:text-amber-400">{(submittedByStem.get(stem) ?? []).join(' ') || '—'}</span>
                ) : (
                  <input
                    type="text"
                    value={drafts[stem] ?? ''}
                    onChange={(event) => handleChange(stem, event.target.value)}
                    placeholder="e.g. 2 5 7"
                    className="w-full rounded border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-white/10"
                  />
                )}
              </td>
              {correctValues ? (
                <td className="py-1 pl-3 text-emerald-600 dark:text-emerald-400">{(correctByStem.get(stem) ?? []).join(' ')}</td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      {correctValues ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {readOnly && !value
            ? 'No answer was submitted for this question.'
            : (
              <>
                <span className="text-amber-600 dark:text-amber-400">Amber</span> = your leaves,{' '}
                <span className="text-emerald-600 dark:text-emerald-400">green</span> = correct leaves.
              </>
            )}
        </p>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">Enter the leaf digits for each stem, in ascending order, separated by spaces.</p>
      )}
    </div>
  );
}
