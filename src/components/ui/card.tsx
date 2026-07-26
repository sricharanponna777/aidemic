import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <section className={`rounded-card border border-subtle bg-surface shadow-card ${className}`.trim()}>
      {children}
    </section>
  );
}

export function CardHeader({ children, className = '' }: CardProps) {
  return <div className={`border-b border-subtle p-4 ${className}`.trim()}>{children}</div>;
}

export function CardTitle({ children, className = '' }: CardProps) {
  return <h3 className={`text-title text-content ${className}`.trim()}>{children}</h3>;
}

export function CardDescription({ children, className = '' }: CardProps) {
  return <p className={`mt-1 text-body text-content-muted ${className}`.trim()}>{children}</p>;
}

export function CardContent({ children, className = '' }: CardProps) {
  return <div className={`p-4 ${className}`.trim()}>{children}</div>;
}
