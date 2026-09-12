import type {
  DailyOperationTaskSummaryDto,
  DiagnosisResult,
  BusinessSignal,
  RecommendedAction,
  OperationsInsightCard,
  OperationsTodayHealth,
  InventoryHealthLevel,
} from '@crosspilot/shared';

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function assessInventoryHealth(
  balances: Array<{ fulfillableQuantity: number; skuCode?: string }>,
): { inventoryHealth: InventoryHealthLevel; inventoryNote: string } {
  if (!balances.length) {
    return { inventoryHealth: 'WATCH', inventoryNote: 'No inventory rows in this workspace' };
  }
  const lowest = balances.reduce((min, row) =>
    row.fulfillableQuantity < min.fulfillableQuantity ? row : min,
  );
  const code = lowest.skuCode ? ` (${lowest.skuCode})` : '';
  if (lowest.fulfillableQuantity <= 0) {
    return {
      inventoryHealth: 'CRITICAL',
      inventoryNote: `Stockout${code}`,
    };
  }
  if (lowest.fulfillableQuantity < 80) {
    return {
      inventoryHealth: 'WATCH',
      inventoryNote: `Lowest fulfillable ${lowest.fulfillableQuantity}${code}`,
    };
  }
  return {
    inventoryHealth: 'HEALTHY',
    inventoryNote: `Lowest fulfillable ${lowest.fulfillableQuantity}${code}`,
  };
}

export function aggregateCampaignMetrics(
  campaigns: Array<{
    metrics30d?: {
      spend?: number;
      sales?: number;
      orders?: number;
      acos?: number;
      roas?: number;
    };
  }>,
): { spend: number; sales: number; orders: number; acos: number; roas: number } {
  let spend = 0;
  let sales = 0;
  let orders = 0;
  for (const campaign of campaigns) {
    const m = campaign.metrics30d || {};
    spend += Number(m.spend || 0);
    sales += Number(m.sales || 0);
    orders += Number(m.orders || 0);
  }
  return {
    spend: round2(spend),
    sales: round2(sales),
    orders,
    acos: sales > 0 ? round2(spend / sales) : 0,
    roas: spend > 0 ? round2(sales / spend) : 0,
  };
}

export function buildHealth(input: {
  revenue: number;
  profit: number;
  margin: number;
  adsCost: number;
  orderCount: number;
  ads: { acos: number; roas: number };
  inventory: { inventoryHealth: InventoryHealthLevel; inventoryNote: string };
}): OperationsTodayHealth {
  return {
    revenue: round2(input.revenue),
    profit: round2(input.profit),
    orders: input.orderCount,
    acos: input.ads.acos,
    roas: input.ads.roas,
    margin: input.margin,
    adsCost: round2(input.adsCost),
    inventoryHealth: input.inventory.inventoryHealth,
    inventoryNote: input.inventory.inventoryNote,
  };
}

function money(n: number | undefined): string {
  if (typeof n !== 'number' || Number.isNaN(n)) return 'Impact not quantified';
  const abs = Math.abs(n).toFixed(2);
  return n < 0 ? `Estimated profit impact -$${abs}` : `Estimated profit impact $${abs}`;
}

function evidenceLines(
  items?: Array<{ title?: string; content?: string }>,
): string[] {
  if (!items?.length) return [];
  return items
    .map((item) => {
      const title = item.title?.trim();
      const content = item.content?.trim();
      if (title && content && title !== content) return `${title}: ${content}`;
      return content || title || '';
    })
    .filter(Boolean)
    .slice(0, 4);
}

function matchingAction(
  actions: RecommendedAction[] | undefined,
  ids: string[] | undefined,
  skuId?: string,
): RecommendedAction | undefined {
  if (!actions?.length) return undefined;
  if (ids?.length) {
    const hit = actions.find((action) =>
      (action.sourceDiagnosisIds || []).some((id) => ids.includes(id)),
    );
    if (hit) return hit;
  }
  if (skuId) return actions.find((action) => action.skuId === skuId);
  return actions[0];
}

export function mapDiagnosisToInsight(
  diagnosis: DiagnosisResult,
  actions?: RecommendedAction[],
): OperationsInsightCard {
  const action = matchingAction(actions, [diagnosis.diagnosisId], diagnosis.skuId);
  const impactAmount = diagnosis.primaryDriver?.impactAmount;
  return {
    id: `wf05-diag-${diagnosis.diagnosisId}`,
    source: 'WF05',
    severity: (impactAmount ?? 0) < -500 ? 'CRITICAL' : 'WARNING',
    title: diagnosis.title,
    problem: diagnosis.summary || diagnosis.title,
    evidence: evidenceLines(diagnosis.evidence),
    impact: money(impactAmount),
    recommendation: action?.reason || action?.title || 'Review the linked operating action',
  };
}

export function mapSignalToInsight(
  signal: BusinessSignal,
  actions?: RecommendedAction[],
): OperationsInsightCard {
  const action = matchingAction(actions, signal.signalId ? [signal.signalId] : undefined, signal.skuId);
  const change =
    typeof signal.changePct === 'number'
      ? `${signal.metric} ${signal.currentValue} vs baseline ${signal.baselineValue ?? 'n/a'} (${(signal.changePct * 100).toFixed(1)}%)`
      : `${signal.metric} is ${signal.currentValue}`;
  return {
    id: `wf05-sig-${signal.signalId}`,
    source: 'WF05',
    severity: signal.severity,
    title: signal.title,
    problem: signal.description || signal.title,
    evidence: evidenceLines(signal.evidence).length ? evidenceLines(signal.evidence) : [change],
    impact: change,
    recommendation: action?.reason || action?.title || 'Inspect the contributing campaign or SKU',
  };
}

export function mapSimEventToInsight(event: {
  id: string;
  code: string;
  severity: string;
  title: string;
  description: string;
  sku?: { skuCode?: string | null } | null;
}): OperationsInsightCard {
  const sku = event.sku?.skuCode ? `SKU ${event.sku.skuCode}` : 'catalog';
  const recByCode: Record<string, string> = {
    ACOS_SPIKE: 'Review keyword bidding and pause wasteful broad terms',
    RETURN_SPIKE: 'Inspect return reasons and listing specifications',
    NEGATIVE_REVIEW_WAVE: 'Address the dominant VOC defect in the listing',
    VIRAL_SURGE: 'Raise replenishment before velocity empties FBA',
  };
  const severity =
    event.severity === 'CRITICAL' || event.severity === 'WARNING' || event.severity === 'INFO'
      ? event.severity
      : 'WARNING';
  return {
    id: `sim-${event.id}`,
    source: 'SIMULATOR',
    severity,
    title: event.title,
    problem: event.description,
    evidence: [`${event.code} on ${sku}`],
    impact:
      event.code === 'ACOS_SPIKE'
        ? 'Ad spend is rising faster than conversion'
        : event.code === 'RETURN_SPIKE'
          ? 'Return loss and customer satisfaction are under pressure'
          : 'Operating conditions changed versus the quiet baseline',
    recommendation: recByCode[event.code] || 'Open the linked evidence and decide whether to act',
  };
}

export function insightsFromDiagnosis(
  summary: DailyOperationTaskSummaryDto | null,
): OperationsInsightCard[] {
  if (!summary) return [];
  const fromDiagnoses = (summary.diagnoses || []).map((d) =>
    mapDiagnosisToInsight(d, summary.actions),
  );
  if (fromDiagnoses.length) return fromDiagnoses;
  return (summary.signals || []).map((s) => mapSignalToInsight(s, summary.actions));
}

export function buildHeadline(
  issues: OperationsInsightCard[],
  health: OperationsTodayHealth,
  simDate?: string,
): string {
  const critical = issues.find((i) => i.severity === 'CRITICAL') || issues[0];
  if (critical) {
    return simDate ? `${critical.title} · sim ${simDate}` : critical.title;
  }
  if (health.inventoryHealth === 'CRITICAL') return health.inventoryNote;
  return simDate
    ? `No blocking issues on ${simDate}. Watch ACOS ${health.acos} and margin ${(health.margin * 100).toFixed(1)}%.`
    : 'No blocking issues in the current operating window.';
}

export function pickCritical(issues: OperationsInsightCard[]): OperationsInsightCard[] {
  const ranked = [...issues].sort((a, b) => {
    const rank = { CRITICAL: 0, WARNING: 1, INFO: 2 };
    return rank[a.severity] - rank[b.severity];
  });
  return ranked.slice(0, 4);
}
