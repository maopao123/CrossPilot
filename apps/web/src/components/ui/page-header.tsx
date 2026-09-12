import React from 'react';
import { cn } from '../../lib/cn';

export function PageHeader({
  title,
  description,
  badge,
  actions,
  className,
}: {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('cp-page-header', className)}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="cp-title">{title}</h1>
          {badge}
        </div>
        {description ? <p className="cp-kicker">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function StatusPill({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
}) {
  const tones = {
    neutral: 'border-border bg-surface-elevated text-fg-muted',
    success: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    warning: 'border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-400',
    danger: 'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-400',
    accent: 'border-accent/20 bg-accent-subtle text-accent',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
