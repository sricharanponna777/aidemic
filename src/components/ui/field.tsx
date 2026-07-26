import { ReactNode } from 'react';

/** Shared input/textarea/select styling. Use instead of hand-rolling
 *  border + background + focus classes on every form control. */
export function fieldStyles(className = '') {
  return [
    'w-full rounded-field border border-subtle bg-surface px-3.5 py-2 text-body text-content',
    'placeholder:text-content-subtle',
    'focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent focus-visible:border-accent',
    'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:opacity-70',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

export function Label({
  children,
  htmlFor,
  className = '',
}: {
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={`mb-1.5 block text-body font-medium text-content-muted ${className}`.trim()}>
      {children}
    </label>
  );
}

/** Inline alert used for form errors and configuration warnings. */
export function Alert({
  tone = 'danger',
  children,
  className = '',
}: {
  tone?: 'danger' | 'warning' | 'info' | 'success';
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    danger: 'bg-danger-muted text-danger',
    warning: 'bg-warning-muted text-warning',
    info: 'bg-info-muted text-info',
    success: 'bg-success-muted text-success',
  } as const;

  return (
    <div role="alert" className={`rounded-field px-3.5 py-2.5 text-body ${tones[tone]} ${className}`.trim()}>
      {children}
    </div>
  );
}
