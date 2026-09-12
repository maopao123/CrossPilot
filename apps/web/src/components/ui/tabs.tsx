'use client';

import React from 'react';
import { cn } from '../../lib/cn';

export function Tabs({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex gap-1 overflow-x-auto border-b border-border', className)}
      {...props}
    />
  );
}

export function TabButton({
  active,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'shrink-0 border-b-2 px-3 py-2 text-[13px] font-medium',
        active
          ? 'border-accent text-fg'
          : 'border-transparent text-fg-muted hover:text-fg',
        className,
      )}
      {...props}
    />
  );
}
