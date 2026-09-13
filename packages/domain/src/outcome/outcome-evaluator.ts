import type { OutcomeMetricKey } from '@crosspilot/shared';
import {
  DEFAULT_OUTCOME_EVALUATION_CONFIG,
  type OutcomeEvaluationInput,
  type OutcomeEvaluationResult,
  type OutcomeTargetRef,
  type OutcomeWindow,
} from './outcome.types.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM-DD 字符串日期加减（UTC，规避宿主机时区） */
export function addDays(key: string, days: number): string {
  return new Date(new Date(`${key}T00:00:00.000Z`).getTime() + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * PRD §2.3 T0 锚点：baselineEnd = T0（执行时刻所在日），baselineStart = T0-7d；
 * observeStart = T0+1d，observeEnd = T0+windowDays。
 */
export function computeOutcomeWindows(
  executionDateKey: string,
  windowDays: number,
): OutcomeWindow {
  return {
    baselineStart: addDays(executionDateKey, -7),
    baselineEnd: executionDateKey,
    observeStart: addDays(executionDateKey, 1),
    observeEnd: addDays(executionDateKey, windowDays),
  };
}

/** 判定规则 v1 主指标映射：竞价类 → acos；改价类 → margin；其余 → profit */
export function primaryMetricForAction(actionType: string): OutcomeMetricKey {
  if (actionType === 'DECREASE_BID' || actionType === 'INCREASE_BID') return 'acos';
  if (actionType === 'CHANGE_PRICE') return 'margin';
  return 'profit';
}

/**
 * 从 PlannedAction.target Json 解析 outcome 目标。
 * skuCode 类目标由调用方先解析成 skuId（resolvedSkuId），解析不到时退传 skuCode，
 * 聚合时自然查不到数据 → 该指标 INCONCLUSIVE（诚实数据原则，不伪造）。
 */
export function resolveOutcomeTarget(
  target: Record<string, unknown>,
  resolvedSkuId?: string,
): OutcomeTargetRef | null {
  const skuId = typeof target.skuId === 'string' ? target.skuId : undefined;
  if (skuId) return { targetType: 'sku', targetId: skuId };
  const campaignId = typeof target.campaignId === 'string' ? target.campaignId : undefined;
  if (campaignId) return { targetType: 'campaign', targetId: campaignId };
  const skuCode = typeof target.skuCode === 'string' ? target.skuCode : undefined;
  if (skuCode) return { targetType: 'sku', targetId: resolvedSkuId ?? skuCode };
  const listingId = typeof target.listingId === 'string' ? target.listingId : undefined;
  if (listingId) return { targetType: 'listing', targetId: listingId };
  return null;
}

/** ACOS 为「越低越好」，其余指标均为「越高越好」 */
function isLowerBetter(metric: OutcomeMetricKey): boolean {
  return metric === 'acos';
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

/** 相对变化（小数口径）。before 为 0 时无法算相对变化，按 ±100% 方向性兜底并交由阈值判定 */
export function relativeChange(before: number, after: number): number {
  if (before !== 0) return (after - before) / Math.abs(before);
  if (after > 0) return 1;
  if (after < 0) return -1;
  return 0;
}

function formatMetric(metric: OutcomeMetricKey, value: number): string {
  const ratioLike =
    metric === 'acos' || metric === 'margin' || metric === 'ctr' || metric === 'cvr';
  return ratioLike ? value.toFixed(4) : value.toFixed(2);
}

function formatPct(value: number): string {
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;
}

/**
 * 判定规则 v1（确定性，不用 LLM）：
 * - 窗口未结束 → OBSERVING（不评估）；
 * - 基线/观察窗口数据缺失 → INCONCLUSIVE（reason 指明缺什么，严禁伪造 0）；
 * - 主指标改善 ≥ 阈值且护栏（orders/profit）未恶化 ≥ 阈值 → POSITIVE；
 * - 主指标恶化 ≥ 阈值 → NEGATIVE；
 * - 其余（含主指标改善但护栏恶化，保守）→ NEUTRAL。
 */
export function evaluateOutcome(input: OutcomeEvaluationInput): OutcomeEvaluationResult {
  if (!input.observeWindowEnded) {
    return { status: 'OBSERVING', delta: null, evaluationReason: null };
  }

  const config = { ...DEFAULT_OUTCOME_EVALUATION_CONFIG, ...input.config };
  const primary = input.primaryMetric ?? primaryMetricForAction(input.actionType);
  const primaryLabel = primary.toUpperCase();

  if (!input.baseline || !input.after) {
    const missing = [!input.baseline ? '基线窗口' : null, !input.after ? '观察窗口' : null]
      .filter(Boolean)
      .join('与');
    return {
      status: 'INCONCLUSIVE',
      delta: null,
      evaluationReason: `${missing}无任何指标数据（目标可能未被 simulator 覆盖或 sync 中断），无法判定`,
    };
  }

  const beforePrimary = input.baseline[primary];
  const afterPrimary = input.after[primary];
  if (beforePrimary === null || afterPrimary === null) {
    const missing = [
      beforePrimary === null ? '基线窗口' : null,
      afterPrimary === null ? '观察窗口' : null,
    ]
      .filter(Boolean)
      .join('与');
    return {
      status: 'INCONCLUSIVE',
      delta: null,
      evaluationReason: `主指标 ${primaryLabel} 在${missing}数据缺失，无法判定（按诚实数据原则不伪造 0）`,
    };
  }

  // delta：两窗口均有值的指标才产出对比
  const delta: OutcomeEvaluationResult['delta'] = {};
  for (const key of Object.keys(input.baseline) as OutcomeMetricKey[]) {
    const b = input.baseline[key];
    const a = input.after[key];
    if (b === null || a === null) continue;
    delta[key] = { before: round2(b), after: round2(a), changePct: round4(relativeChange(b, a)) };
  }

  const change = relativeChange(beforePrimary, afterPrimary);
  const absChange = Math.abs(change);
  const improved = isLowerBetter(primary) ? change <= -config.thresholdPct : change >= config.thresholdPct;
  const worsened = isLowerBetter(primary) ? change >= config.thresholdPct : change <= -config.thresholdPct;

  const guardrails = config.guardrailMetrics.filter((g) => g !== primary);
  const worsenedGuardrails: string[] = [];
  const missingGuardrails: string[] = [];
  for (const g of guardrails) {
    const b = input.baseline[g];
    const a = input.after[g];
    if (b === null || a === null) {
      missingGuardrails.push(g.toUpperCase());
      continue;
    }
    const gChange = relativeChange(b, a);
    const gWorsened = isLowerBetter(g) ? gChange >= config.thresholdPct : gChange <= -config.thresholdPct;
    if (gWorsened) worsenedGuardrails.push(`${g.toUpperCase()} ${formatPct(gChange)}`);
  }

  const guardrailNote = missingGuardrails.length
    ? `；护栏指标 ${missingGuardrails.join(' / ')} 无数据，未参与判定`
    : '';

  if (worsened) {
    return {
      status: 'NEGATIVE',
      delta,
      evaluationReason:
        `主指标 ${primaryLabel} 从 ${formatMetric(primary, beforePrimary)} 变为 ` +
        `${formatMetric(primary, afterPrimary)}（${formatPct(change)}），恶化超过 ` +
        `${(config.thresholdPct * 100).toFixed(0)}% 阈值${guardrailNote}`,
    };
  }

  if (improved && worsenedGuardrails.length === 0) {
    return {
      status: 'POSITIVE',
      delta,
      evaluationReason:
        `主指标 ${primaryLabel} 从 ${formatMetric(primary, beforePrimary)} 变为 ` +
        `${formatMetric(primary, afterPrimary)}（${formatPct(change)}），改善超过 ` +
        `${(config.thresholdPct * 100).toFixed(0)}% 阈值；护栏指标未明显恶化${guardrailNote}`,
    };
  }

  if (improved && worsenedGuardrails.length > 0) {
    return {
      status: 'NEUTRAL',
      delta,
      evaluationReason:
        `主指标 ${primaryLabel} 改善 ${formatPct(change)}，但护栏指标 ${worsenedGuardrails.join('、')} ` +
        `恶化超过阈值，保守判为无显著变化${guardrailNote}`,
    };
  }

  return {
    status: 'NEUTRAL',
    delta,
    evaluationReason:
      `主指标 ${primaryLabel} 变化 ${formatPct(change)}，处于 ±` +
      `${(config.thresholdPct * 100).toFixed(0)}% 阈值内${guardrailNote}`,
  };
}
