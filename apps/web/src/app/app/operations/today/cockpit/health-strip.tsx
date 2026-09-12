'use client';

import React from 'react';
import type { OperationsTodayHealth } from '@crosspilot/shared';
import { pct, ratio, usd } from './format';

export function HealthStrip({ health }: { health: OperationsTodayHealth }) {
  const items = [
    { label: '收入', value: usd(health.revenue), hint: `毛利率 ${pct(health.margin)}` },
    { label: '利润', value: usd(health.profit), hint: `广告花费 ${usd(health.adsCost)}` },
    { label: '订单', value: String(health.orders), hint: '工作区总计' },
    { label: 'ACOS', value: pct(health.acos), hint: '花费 / 广告销售额' },
    { label: 'ROAS', value: ratio(health.roas), hint: '广告销售额 / 花费' },
    {
      label: '库存',
      value: health.inventoryHealth === 'HEALTHY' ? '平稳' : health.inventoryHealth === 'WATCH' ? '关注' : '缺货',
      hint: health.inventoryNote,
    },
  ];

  return (
    <section aria-label="经营健康度">
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
