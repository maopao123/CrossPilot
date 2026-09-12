'use client';

import React from 'react';
import { cn } from '../../lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  className,
  variant = 'primary',
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' &&
          'bg-accent text-accent-fg hover:bg-accent-hover',
        variant === 'secondary' &&
          'border border-border bg-surface text-fg hover:bg-surface-elevated',
        variant === 'ghost' && 'text-fg-muted hover:bg-surface-elevated hover:text-fg',
        variant === 'danger' && 'bg-rose-700 text-white hover:bg-rose-800',
        className,
      )}
      {...props}
    />
  );
}
