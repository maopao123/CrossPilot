import type {
  CommerceActionType,
  OutcomeDelta,
  OutcomeMetricKey,
  OutcomeMetrics,
  OutcomeStatus,
} from '@crosspilot/shared';

export type { OutcomeDelta, OutcomeMetricKey, OutcomeMetrics, OutcomeStatus };

export interface OutcomeTargetRef {
  targetType: 'sku' | 'campaign' | 'ad_target' | 'listing';
  targetId: string;
}

/** 判定配置 v1：阈值默认 5%（小数 0.05） */
export interface OutcomeEvaluationConfig {
  /** 主指标改善/恶化阈值（相对变化的小数口径，0.05 = 5%） */
  thresholdPct: number;
  /** 护栏指标（默认 orders + profit，主指标本身自动排除） */
  guardrailMetrics: OutcomeMetricKey[];
}

export const DEFAULT_OUTCOME_EVALUATION_CONFIG: OutcomeEvaluationConfig = {
  thresholdPct: 0.05,
  guardrailMetrics: ['orders', 'profit'],
};

export interface OutcomeEvaluationInput {
  actionType: CommerceActionType | string;
  /** 覆盖默认主指标映射（测试与 Epic C 实验复用用） */
  primaryMetric?: OutcomeMetricKey;
  config?: Partial<OutcomeEvaluationConfig>;
  /** 基线窗口聚合指标；整个窗口无数据为 null（严禁伪造 0） */
  baseline: OutcomeMetrics | null;
  /** 观察窗口聚合指标；整个窗口无数据为 null */
  after: OutcomeMetrics | null;
  /** 观察窗是否已结束（未结束保持 OBSERVING，不评估） */
  observeWindowEnded: boolean;
}

export interface OutcomeEvaluationResult {
  status: OutcomeStatus;
  delta: OutcomeDelta | null;
  evaluationReason: string | null;
}

/** 观察窗日期（全部用 YYYY-MM-DD 字符串，避免时区歧义） */
export interface OutcomeWindow {
  baselineStart: string;
  baselineEnd: string;
  observeStart: string;
  observeEnd: string;
}

/** channel_daily_metrics 原始行（数字已由读层转出 Decimal） */
export interface RawChannelMetricRow {
  sessions: number;
  addToCart: number;
  checkout: number;
  orders: number;
  revenue: number;
}

/** ad_metric_daily 原始行 */
export interface RawAdMetricRow {
  impressions: number;
  clicks: number;
  spend: number;
  orders: number;
  sales: number;
}

/** profit_daily 原始行 */
export interface RawProfitMetricRow {
  revenue: number;
  netProfit: number;
}
