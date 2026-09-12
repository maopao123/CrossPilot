'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('crosspilot_token');
    if (!token) {
      router.replace('/login');
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-gray-400 text-sm">
        正在验证登录状态...
      </div>
    );
  }

  return <>{children}</>;
}
