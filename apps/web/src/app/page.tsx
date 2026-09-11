'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('crosspilot_token');
    if (token) {
      router.replace('/app/overview');
    } else {
      router.replace('/login');
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-gray-400 text-sm">
      正在进入 CrossPilot...
    </div>
  );
}
