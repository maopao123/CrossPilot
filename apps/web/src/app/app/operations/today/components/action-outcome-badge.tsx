'use client';

import React, { useEffect, useState } from 'react';
import type { ActionOutcomeRecord } from '@crosspilot/shared';
import { ApiClient } from '@/lib/api-client';
import { getStatusLabel } from '@/constants/ui-labels';

const TONE_BY_STATUS: Record<string, string> = {
  OBSERVING: 'bg-gray-500/15 text-gray-300 border-gray-500/30',
  POSITIVE: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  NEGATIVE: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  NEUTRAL: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  INCONCLUSIVE: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  EXPIRED: 'bg-gray-500/10 text-gray-400 border-gray-600/40 border-dashed',
};

/**
 * V10 Epic A：Action 卡片「执行结果」徽标。
 * 数据来源：并行请求 GET /api/v1/actions/:id/outcomes（7/14/30 天观察窗），
 * 请求失败（如无执行记录）静默降级为不展示，绝不影响主卡片。
 */
export function ActionOutcomeBadges({ actionId }: { actionId: string }) {
  const [outcomes, setOutcomes] = useState<ActionOutcomeRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    ApiClient.get<ActionOutcomeRecord[]>(`/api/v1/actions/${actionId}/outcomes`)
      .then((rows) => {
        if (!cancelled) setOutcomes(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setOutcomes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [actionId]);

  if (!outcomes.length) return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {outcomes.map((outcome) => (
        <span
          key={outcome.id}
          title={outcome.evaluationReason || getStatusLabel(outcome.status)}
          className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ${
            TONE_BY_STATUS[outcome.status] ?? TONE_BY_STATUS.OBSERVING!
          }`}
        >
          {outcome.windowDays} 天 · {getStatusLabel(outcome.status)}
        </span>
      ))}
    </span>
  );
}
