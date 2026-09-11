'use client';

import React, { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Check saved theme or default to light ("平时用亮色风格")
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
    return (
      <div className={`w-8 h-8 rounded-md bg-surface-elevated border border-border ${className}`} />
    );
  }

  return (
    <button
      onClick={toggleTheme}
      type="button"
      title={theme === 'light' ? '切换为深色模式 (Switch to Dark)' : '切换为亮色模式 (Switch to Light)'}
      className={`p-1.5 px-2.5 rounded-md border border-border bg-surface-elevated hover:bg-surface transition flex items-center space-x-1.5 text-xs font-medium cursor-pointer shadow-sm ${
        theme === 'light'
          ? 'text-amber-600 hover:text-amber-700 bg-amber-50/50'
          : 'text-indigo-400 hover:text-indigo-300'
      } ${className}`}
    >
      {theme === 'light' ? (
        <>
          <Sun className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20" />
          <span className="text-xs font-medium text-slate-700">亮色</span>
        </>
      ) : (
        <>
          <Moon className="w-3.5 h-3.5 text-indigo-400 fill-indigo-400/20" />
          <span className="text-xs font-medium text-slate-300">暗色</span>
        </>
      )}
    </button>
  );
}
