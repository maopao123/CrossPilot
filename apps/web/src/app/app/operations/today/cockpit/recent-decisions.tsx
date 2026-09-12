'use client';

import React from 'react';
import type { OperationsTodayDto } from '@crosspilot/shared';
import { StatusPill } from '@/components/ui/page-header';
import { getStatusLabel } from '@/constants/ui-labels';

export function RecentDecisions({ items }: { items: OperationsTodayDto['recentDecisions'] }) {
  return (
    <section>
      <h2 className="text-[15px] font-semibold tracking-tight">Recent decisions</h2>
      <p className="mt-1 text-[13px] text-fg-muted">Confirmed recommendations. None of these dispatched an Amazon write.</p>
      {!items.length ? (
        <p className="mt-3 text-[13px] text-fg-muted">No confirmed decisions yet.</p>
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
