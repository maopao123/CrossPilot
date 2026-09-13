import type { OutcomeMetrics } from '@crosspilot/shared';
import {
  addDays,
  aggregateAdMetrics,
  aggregateChannelMetrics,
  aggregateProfitMetrics,
  computeOutcomeWindows,
  dateKey,
  evaluateOutcome,
  mergeOutcomeMetrics,
  primaryMetricForAction,
  relativeChange,
  resolveOutcomeTarget,
} from '../src/index.js';

function metrics(partial: Partial<OutcomeMetrics>): OutcomeMetrics {
  return {
    sessions: null,
    addToCart: null,
    checkout: null,
    orders: null,
    revenue: null,
    impressions: null,
    clicks: null,
    spend: null,
    sales: null,
    ctr: null,
    cvr: null,
    acos: null,
    roas: null,
    profit: null,
    margin: null,
    ...partial,
  };
}

describe('V10 outcome windows（PRD §2.3 T0 锚点）', () => {
  it('baselineEnd=T0、baselineStart=T0-7d、observeStart=T0+1d、observeEnd=T0+windowDays', () => {
    expect(computeOutcomeWindows('2026-09-03', 7)).toEqual({
      baselineStart: '2026-08-27',
      baselineEnd: '2026-09-03',
      observeStart: '2026-09-04',
      observeEnd: '2026-09-10',
    });
    expect(computeOutcomeWindows('2026-09-03', 30).observeEnd).toBe('2026-10-03');
  });

  it('addDays / dateKey 使用 UTC 语义，跨月不回退', () => {
    expect(addDays('2026-09-01', -7)).toBe('2026-08-25');
    expect(dateKey(new Date('2026-09-03T18:30:00.000Z'))).toBe('2026-09-03');
  });
});

describe('V10 primary metric mapping（判定规则 v1）', () => {
  it('竞价类 → acos；改价类 → margin；其余 → profit', () => {
    expect(primaryMetricForAction('DECREASE_BID')).toBe('acos');
    expect(primaryMetricForAction('INCREASE_BID')).toBe('acos');
    expect(primaryMetricForAction('CHANGE_PRICE')).toBe('margin');
    expect(primaryMetricForAction('UPDATE_INVENTORY')).toBe('profit');
    expect(primaryMetricForAction('STOP_CAMPAIGN')).toBe('profit');
  });
});

describe('V10 resolveOutcomeTarget', () => {
  it('skuId 优先，其次 campaignId、skuCode（带解析结果）、listingId', () => {
    expect(resolveOutcomeTarget({ skuId: 'sku-1', campaignId: 'c-1' })).toEqual({
      targetType: 'sku',
      targetId: 'sku-1',
    });
    expect(resolveOutcomeTarget({ campaignId: 'c-1', keyword: 'broad' })).toEqual({
      targetType: 'campaign',
      targetId: 'c-1',
    });
    expect(resolveOutcomeTarget({ skuCode: 'SKU-9' }, 'sku-resolved')).toEqual({
      targetType: 'sku',
      targetId: 'sku-resolved',
    });
    expect(resolveOutcomeTarget({ skuCode: 'SKU-9' })).toEqual({
      targetType: 'sku',
      targetId: 'SKU-9',
    });
    expect(resolveOutcomeTarget({ listingId: 'l-1' })).toEqual({
      targetType: 'listing',
      targetId: 'l-1',
    });
    expect(resolveOutcomeTarget({})).toBeNull();
  });
});

describe('V10 metrics aggregator（口径冻结：ACOS = spend / sales）', () => {
  it('ad 窗口聚合：acos 为小数口径 spend/sales，roas = sales/spend', () => {
    const m = aggregateAdMetrics([
      { impressions: 1000, clicks: 100, spend: 42, orders: 10, sales: 100 },
      { impressions: 1000, clicks: 100, spend: 42, orders: 10, sales: 100 },
    ]);
    expect(m?.spend).toBe(84);
    expect(m?.sales).toBe(200);
    expect(m?.acos).toBe(0.42); // 84/200，与 operations-today.mapper 一致
    expect(m?.roas).toBe(2.381); // 200/84
    expect(m?.ctr).toBe(0.1);
    expect(m?.cvr).toBe(0.1);
    expect(m?.orders).toBe(20);
  });

  it('百分数与小数 acos 等价：42% 存 0.42 与 spend 42 / sales 100 同口径', () => {
    const fromDecimal = aggregateAdMetrics([
      { impressions: 100, clicks: 10, spend: 0.42, orders: 1, sales: 1 },
    ]);
    expect(fromDecimal?.acos).toBe(0.42);
  });

  it('spend>0 而 sales=0 时 acos 无有限值 → null（不伪造 0）', () => {
    const m = aggregateAdMetrics([{ impressions: 100, clicks: 10, spend: 5, orders: 0, sales: 0 }]);
    expect(m?.acos).toBeNull();
    expect(m?.roas).toBe(0);
  });

  it('窗口无记录返回 null（数据缺失语义）', () => {
    expect(aggregateAdMetrics([])).toBeNull();
    expect(aggregateChannelMetrics([])).toBeNull();
    expect(aggregateProfitMetrics([])).toBeNull();
  });

  it('channel 窗口聚合 cvr = orders/sessions；profit 聚合 margin = profit/revenue', () => {
    const c = aggregateChannelMetrics([
      { sessions: 200, addToCart: 20, checkout: 12, orders: 10, revenue: 300 },
      { sessions: 200, addToCart: 20, checkout: 12, orders: 10, revenue: 300 },
    ]);
    expect(c?.sessions).toBe(400);
    expect(c?.orders).toBe(20);
    expect(c?.cvr).toBe(0.05);
    expect(c?.revenue).toBe(600);

    const p = aggregateProfitMetrics([
      { revenue: 600, netProfit: 120 },
      { revenue: 400, netProfit: 60 },
    ]);
    expect(p?.profit).toBe(180);
    expect(p?.margin).toBe(0.18);
  });

  it('merge：各组缺失指标保持 null；全部缺失整体为 null', () => {
    const merged = mergeOutcomeMetrics([
      aggregateChannelMetrics([{ sessions: 100, addToCart: 0, checkout: 0, orders: 5, revenue: 100 }]),
      aggregateProfitMetrics([]),
    ]);
    expect(merged?.orders).toBe(5);
    expect(merged?.profit).toBeNull(); // simulator 无 profit_daily → 缺失，不伪造 0
    expect(mergeOutcomeMetrics([null, null])).toBeNull();
  });
});

describe('V10 evaluateOutcome 全分支', () => {
  const ended = { observeWindowEnded: true };

  it('窗口未结束 → OBSERVING，不评估', () => {
    const r = evaluateOutcome({
      actionType: 'DECREASE_BID',
      baseline: metrics({ acos: 0.42 }),
      after: metrics({ acos: 0.31 }),
      observeWindowEnded: false,
    });
    expect(r.status).toBe('OBSERVING');
    expect(r.delta).toBeNull();
    expect(r.evaluationReason).toBeNull();
  });

  it('POSITIVE：主指标 acos 改善 ≥5% 且护栏未恶化', () => {
    const r = evaluateOutcome({
      actionType: 'DECREASE_BID',
      baseline: metrics({ acos: 0.42, orders: 100, profit: 500 }),
      after: metrics({ acos: 0.31, orders: 98, profit: 590 }),
      ...ended,
    });
    expect(r.status).toBe('POSITIVE');
    expect(r.delta?.acos?.before).toBe(0.42);
    expect(r.delta?.acos?.after).toBe(0.31);
    expect(r.delta?.acos?.changePct).toBeCloseTo(-0.2619, 4);
    expect(r.evaluationReason).toContain('ACOS');
  });

  it('NEGATIVE：主指标恶化 ≥5%（acos 上升）', () => {
    const r = evaluateOutcome({
      actionType: 'DECREASE_BID',
      baseline: metrics({ acos: 0.31, orders: 100, profit: 500 }),
      after: metrics({ acos: 0.42, orders: 100, profit: 520 }),
      ...ended,
    });
    expect(r.status).toBe('NEGATIVE');
    expect(r.evaluationReason).toContain('恶化');
  });

  it('NEUTRAL：变化在 ±5% 阈值内', () => {
    const r = evaluateOutcome({
      actionType: 'DECREASE_BID',
      baseline: metrics({ acos: 0.41, orders: 100, profit: 500 }),
      after: metrics({ acos: 0.42, orders: 100, profit: 500 }),
      ...ended,
    });
    expect(r.status).toBe('NEUTRAL');
    expect(r.evaluationReason).toContain('阈值内');
  });

  it('INCONCLUSIVE：基线或观察窗口数据缺失（严禁伪造 0），reason 指明缺哪边', () => {
    const noBaseline = evaluateOutcome({
      actionType: 'DECREASE_BID',
      baseline: null,
      after: metrics({ acos: 0.31 }),
      ...ended,
    });
    expect(noBaseline.status).toBe('INCONCLUSIVE');
    expect(noBaseline.evaluationReason).toContain('基线窗口');

    const noAfter = evaluateOutcome({
      actionType: 'DECREASE_BID',
      baseline: metrics({ acos: 0.42 }),
      after: null,
      ...ended,
    });
    expect(noAfter.status).toBe('INCONCLUSIVE');
    expect(noAfter.evaluationReason).toContain('观察窗口');
  });

  it('INCONCLUSIVE：主指标在窗口内缺失（simulator 无 profit_daily 场景）', () => {
    const r = evaluateOutcome({
      actionType: 'UPDATE_INVENTORY',
      baseline: metrics({ orders: 10, sessions: 100 }),
      after: metrics({ orders: 12, sessions: 110 }),
      ...ended,
    });
    expect(r.status).toBe('INCONCLUSIVE');
    expect(r.evaluationReason).toContain('PROFIT');
    expect(r.evaluationReason).toContain('数据缺失');
  });

  it('主指标改善但护栏恶化 ≥5% → 保守 NEUTRAL', () => {
    const r = evaluateOutcome({
      actionType: 'DECREASE_BID',
      baseline: metrics({ acos: 0.42, orders: 100, profit: 500 }),
      after: metrics({ acos: 0.31, orders: 80, profit: 500 }),
      ...ended,
    });
    expect(r.status).toBe('NEUTRAL');
    expect(r.evaluationReason).toContain('护栏');
  });

  it('护栏无数据 → 不阻塞 POSITIVE，但 reason 需注明未参与判定', () => {
    const r = evaluateOutcome({
      actionType: 'DECREASE_BID',
      baseline: metrics({ acos: 0.42, orders: 100 }),
      after: metrics({ acos: 0.31, orders: 98 }),
      ...ended,
    });
    expect(r.status).toBe('POSITIVE');
    expect(r.evaluationReason).toContain('PROFIT');
    expect(r.evaluationReason).toContain('未参与判定');
  });

  it('CHANGE_PRICE 主指标 margin：越高越好，恶化 → NEGATIVE', () => {
    const r = evaluateOutcome({
      actionType: 'CHANGE_PRICE',
      baseline: metrics({ margin: 0.2, orders: 100, profit: 500 }),
      after: metrics({ margin: 0.15, orders: 100, profit: 400 }),
      ...ended,
    });
    expect(r.status).toBe('NEGATIVE');
    expect(r.delta?.margin?.changePct).toBeCloseTo(-0.25, 4);
  });

  it('relativeChange：before 为 0 时按方向性兜底', () => {
    expect(relativeChange(0, 0)).toBe(0);
    expect(relativeChange(0, 5)).toBe(1);
    expect(relativeChange(0, -5)).toBe(-1);
    expect(relativeChange(200, 180)).toBeCloseTo(-0.1, 4);
  });
});
