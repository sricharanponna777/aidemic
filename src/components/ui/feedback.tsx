import { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, type LucideIcon } from 'lucide-react';
import { MonoLabel } from '@/components/ui/telemetry';

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

type PageHeaderProps = {
  /** Shown beside the eyebrow, never on its own. */
  icon?: LucideIcon;
  /** Where the page sits, "Section / Page" -- e.g. "Practice / Active recall". */
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Chips and buttons, right-aligned beside the title. */
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
  titleId?: string;
  children?: ReactNode;
};

/** The page title block, in the blurt screen's style: mono eyebrow, title,
 *  one plain description, chips or actions on the right. Bare, for the top of
 *  a `Workspace`; `PageHero` is the same block in its own card. */
export function PageHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
  actions,
  backHref,
  backLabel,
  titleId,
  children,
  className = '',
}: PageHeaderProps & { className?: string }) {
  return (
    <header className={`p-6 ${className}`.trim()}>
      {backHref && (
        <Link
          href={backHref}
          className="mb-3 inline-flex items-center gap-1.5 text-body text-content-subtle transition-colors hover:text-content"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0 max-w-2xl">
          {eyebrow && (
            <MonoLabel className="flex items-center gap-1.5">
              {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
              {eyebrow}
            </MonoLabel>
          )}
          <h1 id={titleId} className={`text-display text-content ${eyebrow ? 'mt-1.5' : ''}`.trim()}>
            {title}
          </h1>
          {description && <p className="mt-2 text-body text-content-muted">{description}</p>}
        </div>
        {actions && <div className="flex max-w-md flex-wrap items-center justify-end gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/** `PageHeader` in its own card, for pages that are not one `Workspace`. */
export function PageHero(props: PageHeaderProps) {
  return (
    <section className="overflow-hidden rounded-card border border-subtle bg-surface">
      <PageHeader {...props} />
    </section>
  );
}

