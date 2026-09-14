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

/**
 * v2 闭环评估窗口：严格 7 天基线 [D-6..D]（7 天完整日），观察窗 [D+1..D+windowDays]。
 */
export function computeOutcomeWindowsV2(
  executionDateKey: string,
  windowDays: number,
): OutcomeWindow {
  return {
    baselineStart: addDays(executionDateKey, -6),
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

export interface OutcomeEvaluationInputV2 extends OutcomeEvaluationInput {
  windowDays: number;
  zeroConversionSpend?: boolean;
  evaluationVersion?: string;
}

/**
 * Closed-loop v2 Outcome Evaluator with daily average normalization,
 * zero conversion spend handling, and completedThrough maturity gates.
 */
export function evaluateOutcomeV2(input: OutcomeEvaluationInputV2): OutcomeEvaluationResult {
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

  // Zero conversion spend check: spend > 0 but adSales = 0
  if (
    input.zeroConversionSpend ||
    (primary === 'acos' &&
      input.after.acos === null &&
      ((input.after as any).adSpend > 0 || (input.after as any).spend > 0))
  ) {
    return {
      status: 'NEGATIVE',
      delta: null,
      evaluationReason:
        'ZERO_CONVERSION_SPEND: 广告花费大于0但广告销售为0，ACOS无有效转化，判定为负向效果',
    };
  }

  // Volume metrics that require daily normalization
  const volumeMetrics: OutcomeMetricKey[] = ['profit', 'revenue', 'orders'];
  const baselineDays = 7;
  const observeDays = input.windowDays || 7;

  const delta: OutcomeEvaluationResult['delta'] = {};
  for (const key of Object.keys(input.baseline) as OutcomeMetricKey[]) {
    const b = input.baseline[key];
    const a = input.after[key];
    if (b === null || a === null) continue;

    if (volumeMetrics.includes(key)) {
      const bDaily = b / baselineDays;
      const aDaily = a / observeDays;
      // When baseline <= 0, relative percentage change is undefined/misleading -> null
      const changePct = bDaily <= 0 ? null : relativeChange(bDaily, aDaily);
      delta[key] = {
        before: round2(bDaily),
        after: round2(aDaily),
        changePct: changePct !== null ? round4(changePct) : null,
      };
    } else {
      // For ratio-like or non-volume metrics: when baseline <= 0, do not compute relativeChange
      const changePct = b <= 0 ? null : relativeChange(b, a);
      delta[key] = {
        before: round2(b),
        after: round2(a),
        changePct: changePct !== null ? round4(changePct) : null,
      };
    }
  }

  const beforePrimaryVal = input.baseline[primary];
  const afterPrimaryVal = input.after[primary];

  if (beforePrimaryVal === null || afterPrimaryVal === null) {
    return {
      status: 'INCONCLUSIVE',
      delta: null,
      evaluationReason: `主指标 ${primaryLabel} 数据缺失，无法判定`,
    };
  }

  const beforeNorm = volumeMetrics.includes(primary)
    ? beforePrimaryVal / baselineDays
    : beforePrimaryVal;
  const afterNorm = volumeMetrics.includes(primary)
    ? afterPrimaryVal / observeDays
    : afterPrimaryVal;

  let change = 0;
  let improved = false;
  let worsened = false;

  if (beforeNorm <= 0) {
    const absDiff = afterNorm - beforeNorm;
    if (absDiff < 0) {
      worsened = true;
    } else if (afterNorm > 0 && absDiff >= (primary === 'profit' ? 10 : primary === 'orders' ? 1 : 0.01)) {
      improved = true;
    } else {
      improved = false;
    }
  } else {
    change = relativeChange(beforeNorm, afterNorm);
    improved = isLowerBetter(primary)
      ? change <= -config.thresholdPct
      : change >= config.thresholdPct;
    worsened = isLowerBetter(primary)
      ? change >= config.thresholdPct
      : change <= -config.thresholdPct;
  }

  // Guardrail check
  const guardrails = config.guardrailMetrics.filter((g) => g !== primary);
  const worsenedGuardrails: string[] = [];
  for (const g of guardrails) {
    const b = input.baseline[g];
    const a = input.after[g];
    if (b === null || a === null) continue;
    const bDaily = volumeMetrics.includes(g) ? b / baselineDays : b;
    const aDaily = volumeMetrics.includes(g) ? a / observeDays : a;
    let gWorsened = false;
    let gChange: number | null = null;
    if (bDaily <= 0) {
      if (aDaily < bDaily) {
        gWorsened = true;
      }
    } else {
      gChange = relativeChange(bDaily, aDaily);
      gWorsened = isLowerBetter(g) ? gChange >= config.thresholdPct : gChange <= -config.thresholdPct;
    }
    if (gWorsened) {
      const changeStr = gChange !== null ? ` ${formatPct(gChange)}` : ` (基线 ${round2(bDaily)} → 观察 ${round2(aDaily)})`;
      worsenedGuardrails.push(`${g.toUpperCase()} 恶化${changeStr}`);
    }
  }

  const changeReason = beforeNorm <= 0
    ? `基线 ${round2(beforeNorm)} → 观察 ${round2(afterNorm)}（差值 ${afterNorm >= beforeNorm ? '+' : ''}${round2(afterNorm - beforeNorm)}，基线≤0不计算百分比）`
    : `变化 ${formatPct(change)}`;

  if (worsened) {
    return {
      status: 'NEGATIVE',
      delta,
      evaluationReason: beforeNorm <= 0
        ? `主指标 ${primaryLabel} 恶化，${changeReason}`
        : `主指标 ${primaryLabel} 恶化 ${formatPct(change)}，超过 ${(config.thresholdPct * 100).toFixed(0)}% 阈值`,
    };
  }

  if (improved) {
    if (worsenedGuardrails.length > 0) {
      return {
        status: 'NEUTRAL',
        delta,
        evaluationReason: beforeNorm <= 0
          ? `主指标 ${primaryLabel} 虽改善（${changeReason}），但护栏指标恶化（${worsenedGuardrails.join('；')}），按保守原则不计正向效果`
          : `主指标 ${primaryLabel} 虽改善 ${formatPct(change)}，但护栏指标恶化（${worsenedGuardrails.join('；')}），按保守原则不计正向效果`,
      };
    }
    return {
      status: 'POSITIVE',
      delta,
      evaluationReason: beforeNorm <= 0
        ? `主指标 ${primaryLabel} 改善，${changeReason}`
        : `主指标 ${primaryLabel} 改善 ${formatPct(change)}，超过 ${(config.thresholdPct * 100).toFixed(0)}% 阈值`,
    };
  }

  return {
    status: 'NEUTRAL',
    delta,
    evaluationReason: `主指标 ${primaryLabel} ${changeReason}，处于阈值范围内`,
  };
}
