/**
 * V10 Epic A — Outcome Tracking 对外契约。
 * 状态机：OBSERVING → POSITIVE / NEGATIVE / NEUTRAL / INCONCLUSIVE / EXPIRED（终态不可逆）。
 */

export type OutcomeStatus =
  | 'OBSERVING'
  | 'POSITIVE'
  | 'NEGATIVE'
  | 'NEUTRAL'
  | 'INCONCLUSIVE'
  | 'EXPIRED';

export const OUTCOME_STATUSES: readonly OutcomeStatus[] = [
  'OBSERVING',
  'POSITIVE',
  'NEGATIVE',
  'NEUTRAL',
  'INCONCLUSIVE',
  'EXPIRED',
] as const;

export const OUTCOME_WINDOW_DAYS: readonly number[] = [7, 14, 30] as const;

/**
 * 窗口聚合指标。null = 该窗口数据源无记录（数据缺失），严禁伪造 0。
 * 口径冻结：ACOS = spend / 广告销售额；ROAS = 广告销售额 / spend。
 */
export interface OutcomeMetrics {
  sessions: number | null;
  addToCart: number | null;
  checkout: number | null;
  orders: number | null;
  revenue: number | null;
  impressions: number | null;
  clicks: number | null;
  spend: number | null;
  sales: number | null;
  ctr: number | null;
  cvr: number | null;
  acos: number | null;
  roas: number | null;
  profit: number | null;
  margin: number | null;
}

export type OutcomeMetricKey = keyof OutcomeMetrics;

/** 各指标 before / after / 相对变化（changePct 为小数，-0.262 = -26.2%） */
export interface OutcomeDeltaEntry {
  before: number;
  after: number;
  changePct: number;
}

export type OutcomeDelta = Partial<Record<OutcomeMetricKey, OutcomeDeltaEntry>>;

export interface ActionOutcomeRecord {
  id: string;
  workspaceId: string;
  actionId: string;
  storeId?: string;
  targetType: string;
  targetId: string;
  baselineStart: string; // YYYY-MM-DD
  baselineEnd: string; // YYYY-MM-DD（T0 所在日）
  observeStart: string; // YYYY-MM-DD（T0+1d）
  observeEnd: string; // YYYY-MM-DD（T0+windowDays）
  windowDays: number;
  metricsBefore: OutcomeMetrics | null;
  metricsAfter: OutcomeMetrics | null;
  delta: OutcomeDelta | null;
  status: OutcomeStatus;
  evaluationReason?: string;
  createdAt: string;
  updatedAt: string;
  evaluatedAt?: string;
}

export interface OutcomeListResponse {
  items: ActionOutcomeRecord[];
  total: number;
  page: number;
  pageSize: number;
}

/** GET /outcomes/summary —— 近 90 天各状态计数 + 累计 profit delta（Learning 的对外面孔） */
export interface OutcomeSummaryDto {
  workspaceId: string;
  /** 评估时间基准（sim_date 或宿主机当天），YYYY-MM-DD */
  today: string;
  since: string;
  total: number;
  byStatus: Partial<Record<OutcomeStatus, number>>;
  /** 终态 Outcome 的 delta.profit.change 累计（数据缺失不计，绝不伪造 0） */
  profitDelta: number | null;
}
