'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('crosspilot_token');
    if (token) {
      router.replace('/app/operations/today');
    } else {
      router.replace('/login');
    }
  }, [router]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background text-sm text-fg-muted">
      正在进入 CrossPilot...
    </div>
  );
}
