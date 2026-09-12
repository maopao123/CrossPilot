'use client';

import React from 'react';
import type { OperationsTodayDto } from '@crosspilot/shared';
import { StatusPill } from '@/components/ui/page-header';
import { getStatusLabel } from '@/constants/ui-labels';

export function RecentDecisions({ items }: { items: OperationsTodayDto['recentDecisions'] }) {
  return (
    <section>
      <h2 className="text-[15px] font-semibold tracking-tight">近期决策</h2>
      <p className="mt-1 text-[13px] text-fg-muted">已确认的建议。这些决策均未向 Amazon 写入任何内容。</p>
      {!items.length ? (
        <p className="mt-3 text-[13px] text-fg-muted">暂无已确认的决策。</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {items.map((item) => (
            <li key={item.id} className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
              <div>
                <div className="text-[14px] font-medium">{item.decision}</div>
                <div className="mt-1 text-[12px] text-fg-muted">{new Date(item.updatedAt).toLocaleString()}</div>
              </div>
              <StatusPill tone={item.status === 'REJECTED' ? 'danger' : 'success'}>
                {getStatusLabel(item.status)}
              </StatusPill>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
