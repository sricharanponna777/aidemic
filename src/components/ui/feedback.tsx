import { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/** Full-width placeholder for "no data yet" states. Replaces the ad-hoc
 *  bordered-box-with-icon markup repeated across the dashboard pages. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = '',
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-card border border-dashed border-strong bg-surface-sunken px-6 py-12 text-center ${className}`.trim()}
    >
      {Icon && (
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-accent-muted text-accent">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <p className="font-semibold text-content">{title}</p>
      {description && <p className="mt-1 max-w-sm text-body text-content-subtle">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Standard page title block. */
export function PageHeader({
  title,
  description,
  actions,
  className = '',
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-start justify-between gap-4 ${className}`.trim()}>
      <div className="min-w-0">
        <h1 className="text-display text-content">{title}</h1>
        {description && <p className="mt-1.5 text-body text-content-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

