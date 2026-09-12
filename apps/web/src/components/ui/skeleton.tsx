import React from 'react';
import { cn } from '../../lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-lg bg-surface-elevated', className)}
      aria-hidden
    />
  );
}

export function PageLoading({ label = '正在加载…' }: { label?: string }) {
  return (
    <div className="space-y-4 py-6" role="status" aria-live="polite">
      <Skeleton className="h-7 w-48" />
      <div className="cp-metric-strip">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="cp-metric space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-24" />
          </div>
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function InlineError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-800 dark:text-amber-300"
    >
      {message}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="cp-empty">
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {description ? (
        <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-fg-muted">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
