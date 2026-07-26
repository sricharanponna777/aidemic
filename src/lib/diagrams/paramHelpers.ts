import type { DiagramTemplateSelection } from '@/types';

/** Shared param-bag readers used by every template's parseParams(). Each returns null on
 * anything missing/invalid so templates can fail closed with one guard clause. */

export const stringParam = (selection: DiagramTemplateSelection, key: string): string | null =>
  selection.stringParams.find((p) => p.key === key)?.value ?? null;

export const enumParam = <T extends string>(selection: DiagramTemplateSelection, key: string, allowed: readonly T[]): T | null => {
  const value = stringParam(selection, key);
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
};

export const numberParam = (selection: DiagramTemplateSelection, key: string): number | null => {
  const value = selection.numberParams.find((p) => p.key === key)?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};
