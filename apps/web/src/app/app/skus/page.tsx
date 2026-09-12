'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Loader2 } from 'lucide-react';
import { loadCatalogSkus } from '../../../lib/catalog';
import { useBusinessContext } from '../../../components/business-context-provider';

export default function SkusIndexPage() {
  const router = useRouter();
  const { skuId } = useBusinessContext();
  const [message, setMessage] = useState('正在加载 SKU 360 总览...');

  useEffect(() => {
    let cancelled = false;
    async function go() {
      try {
        if (skuId) {
          router.replace(`/app/skus/${skuId}`);
          return;
        }
        const { skus } = await loadCatalogSkus();
        if (cancelled) return;
        if (skus[0]?.id) {
          router.replace(`/app/skus/${skus[0].id}`);
        } else {
          setMessage('当前工作区没有 SKU');
        }
      } catch {
        if (!cancelled) setMessage('无法载入 SKU 列表');
      }
    }
    go();
    return () => {
      cancelled = true;
    };
  }, [router, skuId]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
      <div className="w-12 h-12 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center">
        <Box className="w-6 h-6 animate-pulse" />
      </div>
      <div className="text-center">
        <h2 className="text-base font-semibold text-white">{message}</h2>
      </div>
      <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
    </div>
  );
}
