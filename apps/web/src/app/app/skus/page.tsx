'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Loader2 } from 'lucide-react';

export default function SkusIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/app/skus/sku_white_001');
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
      <div className="w-12 h-12 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center">
        <Box className="w-6 h-6 animate-pulse" />
      </div>
      <div className="text-center">
        <h2 className="text-base font-semibold text-white">正在加载 SKU 360 总览...</h2>
        <p className="text-xs text-gray-400 mt-1">正在跳转至标杆商品 Carrara White (MTH-WHITE-001)</p>
      </div>
      <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
    </div>
  );
}
