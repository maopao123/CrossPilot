import React from 'react';
import { AuthGate } from '../../components/auth-gate';
import { BusinessContextProvider } from '../../components/business-context-provider';
import { AppShell } from '../../components/app-shell';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate>
      <BusinessContextProvider>
        <AppShell>{children}</AppShell>
      </BusinessContextProvider>
    </AuthGate>
  );
}
