import React from 'react';
import { TopBar } from '../../components/top-bar';
import { Sidebar } from '../../components/sidebar';
import { AuthGate } from '../../components/auth-gate';
import { BusinessContextProvider } from '../../components/business-context-provider';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate>
      <BusinessContextProvider>
        <div className="min-h-screen flex flex-col bg-background text-gray-100">
          <TopBar />
          <div className="flex flex-1">
            <Sidebar />
            <main className="flex-1 overflow-y-auto p-6 max-w-7xl mx-auto w-full">
              {children}
            </main>
          </div>
        </div>
      </BusinessContextProvider>
    </AuthGate>
  );
}
