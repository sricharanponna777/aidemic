import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * The orbital-workspace visual language (docs/design/orbital-workspace):
 * mono uppercase labels, small bordered chips, thin meters. Neutral by
 * default; colour means brand (accent), a state (success / warning / danger)
 * or XP.
 */

export function MonoLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-content-subtle ${className}`.trim()}>
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
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium ${
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

/** A section title: icon plus mono label, with an optional chip or link on
 *  the right. A real heading element, so pages keep their outline. */
export function PanelHeading({
  icon: Icon,
  as: Tag = 'h2',
  aside,
  className = '',
  children,
}: {
  icon?: LucideIcon;
  as?: 'h2' | 'h3';
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex items-center justify-between gap-2 ${className}`.trim()}>
      <Tag className="flex min-w-0 items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-content">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-content-subtle" aria-hidden="true" />}
        {children}
      </Tag>
      {aside}
    </div>
  );
}

/** One labelled number, as in the blurt report's stat boxes. */
export function Stat({
  label,
  value,
  hint,
  tone = 'default',
  className = '',
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'xp';
  className?: string;
}) {
  const text = {
    default: 'text-content',
    accent: 'text-accent',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
    xp: 'text-xp',
  }[tone];
  return (
    <div className={`rounded-lg border border-subtle bg-surface p-3 ${className}`.trim()}>
      <MonoLabel>{label}</MonoLabel>
      <p className={`mt-1 font-mono text-xl font-semibold ${text}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[13px] text-content-subtle">{hint}</p>}
    </div>
  );
}

/** The blurt screen's frame: one bordered card that holds a `PageHeader`
 *  (pass it `className="border-b border-subtle"`) and a `WorkspaceBody`. */
export function Workspace({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`overflow-hidden rounded-card border border-subtle bg-surface ${className}`.trim()}>{children}</div>;
}

/** The work column and, on large screens, the report column beside it. The
 *  report stacks below the work on smaller screens. */
export function WorkspaceBody({ aside, children }: { aside?: ReactNode; children: ReactNode }) {
  if (!aside) return <div className="min-w-0">{children}</div>;
  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col lg:border-r lg:border-subtle">{children}</div>
      <aside className="space-y-4 border-t border-subtle bg-surface-sunken/60 p-5 lg:border-t-0">{aside}</aside>
    </div>
  );
}

/** A full-width mono strip between workspace sections: timer, counts, save
 *  state. */
export function StatusBar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-subtle px-5 py-3 font-mono text-xs text-content-subtle ${className}`.trim()}
    >
      {children}
    </div>
  );
}
