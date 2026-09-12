'use client';

import React, { useState } from 'react';
import { TopBar } from './top-bar';
import { Sidebar } from './sidebar';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex min-h-[100dvh] bg-background text-fg">
      <a href="#main" className="skip-link">
        跳到主要内容
      </a>
      {navOpen ? (
        <button
          type="button"
          aria-label="关闭导航"
          className="fixed inset-0 z-40 bg-stone-900/40 lg:hidden"
          onClick={() => setNavOpen(false)}
        />
      ) : null}
      <Sidebar open={navOpen} onNavigate={() => setNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenu={() => setNavOpen(true)} />
        <main id="main" className="flex-1 overflow-y-auto px-4 py-5 md:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-content">{children}</div>
        </main>
      </div>
    </div>
  );
}
