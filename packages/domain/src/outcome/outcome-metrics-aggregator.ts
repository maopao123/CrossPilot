import type { OutcomeMetrics } from '@crosspilot/shared';
import type {
  RawAdMetricRow,
  RawChannelMetricRow,
  RawProfitMetricRow,
} from './outcome.types.js';

function emptyMetrics(): OutcomeMetrics {
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
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

/**
 * sku 目标：channel_daily_metrics 窗口聚合（sessions/addToCart/checkout/orders/conversionRate/revenue）。
 * 窗口内无记录返回 null（数据缺失），严禁伪造 0。
 */
export function aggregateChannelMetrics(rows: RawChannelMetricRow[]): OutcomeMetrics | null {
  if (!rows.length) return null;
  const m = emptyMetrics();
  let sessions = 0;
  let orders = 0;
  let revenue = 0;
  let addToCart = 0;
  let checkout = 0;
  for (const row of rows) {
    sessions += row.sessions;
    orders += row.orders;
    revenue += row.revenue;
    addToCart += row.addToCart;
    checkout += row.checkout;
  }
  m.sessions = sessions;
  m.orders = orders;
  m.revenue = round2(revenue);
  m.addToCart = addToCart;
  m.checkout = checkout;
  m.cvr = sessions > 0 ? round4(orders / sessions) : null;
  return m;
}

/**
 * campaign / ad_target 目标：ad_metric_daily 窗口聚合。
 * 口径冻结：ACOS = spend / 广告销售额；ROAS = 广告销售额 / spend（与 operations-today.mapper 一致）。
 * spend>0 而 sales=0 时 ACOS 无有限值，置 null（缺失语义），由判定层产出 INCONCLUSIVE。
 */
export function aggregateAdMetrics(rows: RawAdMetricRow[]): OutcomeMetrics | null {
  if (!rows.length) return null;
  const m = emptyMetrics();
  let impressions = 0;
  let clicks = 0;
  let spend = 0;
  let sales = 0;
  let orders = 0;
  for (const row of rows) {
    impressions += row.impressions;
    clicks += row.clicks;
    spend += row.spend;
    sales += row.sales;
    orders += row.orders;
  }
  m.impressions = impressions;
  m.clicks = clicks;
  m.spend = round2(spend);
  m.sales = round2(sales);
  m.orders = orders;
  m.ctr = impressions > 0 ? round4(clicks / impressions) : null;
  m.cvr = clicks > 0 ? round4(orders / clicks) : null;
  m.acos = sales > 0 ? round4(spend / sales) : spend > 0 ? null : 0;
  m.roas = spend > 0 ? round4(sales / spend) : sales > 0 ? null : 0;
  return m;
}

/** profit 指标：profit_daily 窗口聚合（simulator 目前不写该表 → 返回 null，不伪造 0） */
export function aggregateProfitMetrics(rows: RawProfitMetricRow[]): OutcomeMetrics | null {
  if (!rows.length) return null;
  const m = emptyMetrics();
  let revenue = 0;
  let profit = 0;
  for (const row of rows) {
    revenue += row.revenue;
    profit += row.netProfit;
  }
  m.revenue = round2(revenue);
  m.profit = round2(profit);
  m.margin = revenue > 0 ? round4(profit / revenue) : null;
  return m;
}

/**
 * 合并各数据源聚合结果（sku 目标 = channel + profit；campaign 目标 = ad）。
 * 各组缺失的指标保持 null；全部数据源都无记录时整体返回 null。
 */
export function mergeOutcomeMetrics(parts: Array<OutcomeMetrics | null>): OutcomeMetrics | null {
  const present = parts.filter((p): p is OutcomeMetrics => p !== null);
  if (!present.length) return null;
  const merged = emptyMetrics();
  for (const key of Object.keys(merged) as Array<keyof OutcomeMetrics>) {
    for (const part of present) {
      if (part[key] !== null) {
        merged[key] = part[key];
        break;
      }
    }
  }
  return merged;
}
