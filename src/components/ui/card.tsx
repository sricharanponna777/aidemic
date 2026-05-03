import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 ${className}`.trim()}>
      {children}
    </section>
  );
}

export function CardHeader({ children, className = '' }: CardProps) {
  return <div className={`border-b border-slate-200 p-4 dark:border-slate-700 ${className}`.trim()}>{children}</div>;
}

export function CardTitle({ children, className = '' }: CardProps) {
  return <h3 className={`text-lg font-semibold text-slate-900 dark:text-slate-100 ${className}`.trim()}>{children}</h3>;
}

export function CardDescription({ children, className = '' }: CardProps) {
  return <p className={`mt-1 text-sm text-slate-600 dark:text-slate-300 ${className}`.trim()}>{children}</p>;
}

export function CardContent({ children, className = '' }: CardProps) {
  return <div className={`p-4 ${className}`.trim()}>{children}</div>;
}
