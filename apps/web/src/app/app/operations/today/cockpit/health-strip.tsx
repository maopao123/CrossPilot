'use client';

import React from 'react';
import type { OperationsTodayHealth } from '@crosspilot/shared';
import { pct, ratio, usd } from './format';

export function HealthStrip({ health }: { health: OperationsTodayHealth }) {
  const items = [
    { label: 'Revenue', value: usd(health.revenue), hint: `margin ${pct(health.margin)}` },
    { label: 'Profit', value: usd(health.profit), hint: `ads ${usd(health.adsCost)}` },
    { label: 'Orders', value: String(health.orders), hint: 'workspace total' },
    { label: 'ACOS', value: pct(health.acos), hint: 'spend / ad sales' },
    { label: 'ROAS', value: ratio(health.roas), hint: 'ad sales / spend' },
    {
      label: 'Inventory',
      value: health.inventoryHealth === 'HEALTHY' ? 'Steady' : health.inventoryHealth === 'WATCH' ? 'Watch' : 'Stockout',
      hint: health.inventoryNote,
    },
  ];

  return (
    <section aria-label="Business health">
      <div className="cp-metric-strip">
        {items.map((item) => (
          <div key={item.label} className="cp-metric">
            <div className="cp-metric-label">{item.label}</div>
            <div className="cp-metric-value">{item.value}</div>
            <p className="mt-1 text-[11px] text-fg-muted">{item.hint}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
