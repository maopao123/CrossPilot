'use client';

import React, { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('crosspilot-theme');
    if (saved === 'dark') {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    } else {
      setTheme('light');
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    if (theme === 'light') {
      setTheme('dark');
      localStorage.setItem('crosspilot-theme', 'dark');
      document.documentElement.classList.add('dark');
    } else {
      setTheme('light');
      localStorage.setItem('crosspilot-theme', 'light');
      document.documentElement.classList.remove('dark');
    }
  };

  if (!mounted) {
    return <div className={`h-8 w-8 rounded-lg border border-border bg-surface-elevated ${className}`} />;
  }

  return (
    <button
      onClick={toggleTheme}
      type="button"
      title={theme === 'light' ? '切换为暗色模式' : '切换为亮色模式'}
      aria-label={theme === 'light' ? '切换为暗色模式' : '切换为亮色模式'}
      className={`rounded-lg border border-border p-1.5 text-fg-muted hover:bg-surface-elevated hover:text-fg ${className}`}
    >
      {theme === 'light' ? (
        <Sun className="h-3.5 w-3.5" strokeWidth={1.5} />
      ) : (
        <Moon className="h-3.5 w-3.5" strokeWidth={1.5} />
      )}
    </button>
  );
}
