import { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, type LucideIcon } from 'lucide-react';

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

/** The page title block every dashboard page opens with. One card recipe, one
 *  h1 size, no eyebrow — pages differ only in icon, copy and actions. */
export function PageHero({
  icon: Icon,
  title,
  description,
  actions,
  backHref,
  backLabel,
  titleId,
  children,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
  titleId?: string;
  children?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-card border border-subtle bg-linear-to-br from-accent-muted to-surface p-6 shadow-raised">
      {backHref && (
        <Link
          href={backHref}
          className="mb-3 inline-flex items-center gap-1.5 text-body text-content-subtle transition-colors hover:text-content"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            {Icon && <Icon className="h-7 w-7 shrink-0 text-accent" />}
            <h1 id={titleId} className="text-display text-content dark:text-white">
              {title}
            </h1>
          </div>
          {description && <p className="mt-2 max-w-2xl text-body text-content-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

