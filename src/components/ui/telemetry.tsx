import type { ReactNode } from 'react';

/**
 * The orbital-workspace visual language (docs/design/orbital-workspace):
 * mono uppercase labels, small bordered chips, thin meters. Monochrome by
 * default; colour only ever means a state (success / warning / danger) or XP.
 */

export function MonoLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-content-subtle ${className}`.trim()}>
      {children}
    </p>
  );
}

export type ChipTone = 'neutral' | 'inverse' | 'success' | 'warning' | 'danger' | 'xp';

const CHIP_TONES: Record<ChipTone, string> = {
  neutral: 'border-subtle bg-surface-sunken text-content-muted',
  inverse: 'border-transparent bg-accent text-accent-fg',
  success: 'border-success/30 bg-success-muted text-success',
  warning: 'border-warning/30 bg-warning-muted text-warning',
  danger: 'border-danger/30 bg-danger-muted text-danger',
  xp: 'border-xp/30 bg-xp-muted text-xp',
};

export function Chip({
  tone = 'neutral',
  mono = true,
  className = '',
  children,
}: {
  tone?: ChipTone;
  mono?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium ${
        mono ? 'font-mono' : ''
      } ${CHIP_TONES[tone]} ${className}`.trim()}
    >
      {children}
    </span>
  );
}

/** A thin progress bar. `fraction` is clamped to 0..1. */
export function Meter({
  fraction,
  tone = 'accent',
  className = '',
  label,
}: {
  fraction: number;
  tone?: 'accent' | 'xp' | 'success' | 'warning';
  className?: string;
  /** Accessible name, e.g. "Level progress". */
  label?: string;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0)) * 100);
  const fill = { accent: 'bg-accent', xp: 'bg-xp', success: 'bg-success', warning: 'bg-warning' }[tone];
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={`h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken ring-1 ring-inset ring-subtle ${className}`.trim()}
    >
      <div className={`h-full rounded-full ${fill} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** The bordered panel every telemetry block sits in. */
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-subtle bg-surface p-4 ${className}`.trim()}>{children}</section>;
}
