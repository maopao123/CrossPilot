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
    return { inventoryHealth: 'WATCH', inventoryNote: '当前工作区没有库存记录' };
  }
  const lowest = balances.reduce((min, row) =>
    row.fulfillableQuantity < min.fulfillableQuantity ? row : min,
  );
  const code = lowest.skuCode ? ` (${lowest.skuCode})` : '';
  if (lowest.fulfillableQuantity <= 0) {
    return {
      inventoryHealth: 'CRITICAL',
      inventoryNote: `断货${code}`,
    };
  }
  if (lowest.fulfillableQuantity < 80) {
    return {
      inventoryHealth: 'WATCH',
      inventoryNote: `最低可售库存 ${lowest.fulfillableQuantity}${code}`,
    };
  }
  return {
    inventoryHealth: 'HEALTHY',
    inventoryNote: `最低可售库存 ${lowest.fulfillableQuantity}${code}`,
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
  if (typeof n !== 'number' || Number.isNaN(n)) return '影响未量化';
  const abs = Math.abs(n).toFixed(2);
  return n < 0 ? `预计利润影响 -$${abs}` : `预计利润影响 $${abs}`;
}

function evidenceLines(
  items?: Array<{ title?: string; content?: string }>,
): string[] {
  if (!items?.length) return [];
  return items
    .map((item) => {
      const title = item.title?.trim();
      const content = item.content?.trim();
      if (title && content && title !== content) return `${title}：${content}`;
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
    recommendation: action?.reason || action?.title || '请查看关联的运营 Action',
  };
}

export function mapSignalToInsight(
  signal: BusinessSignal,
  actions?: RecommendedAction[],
): OperationsInsightCard {
  const action = matchingAction(actions, signal.signalId ? [signal.signalId] : undefined, signal.skuId);
  const change =
    typeof signal.changePct === 'number'
      ? `${signal.metric} 当前 ${signal.currentValue}，对比基线 ${signal.baselineValue ?? '无'}（${(signal.changePct * 100).toFixed(1)}%）`
      : `${signal.metric} 当前为 ${signal.currentValue}`;
  return {
    id: `wf05-sig-${signal.signalId}`,
    source: 'WF05',
    severity: signal.severity,
    title: signal.title,
    problem: signal.description || signal.title,
    evidence: evidenceLines(signal.evidence).length ? evidenceLines(signal.evidence) : [change],
    impact: change,
    recommendation: action?.reason || action?.title || '检查相关的广告活动或 SKU',
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
  const sku = event.sku?.skuCode ? `SKU ${event.sku.skuCode}` : '全目录';
  const recByCode: Record<string, string> = {
    ACOS_SPIKE: '复盘关键词竞价，暂停浪费预算的宽泛词',
    RETURN_SPIKE: '排查退货原因，核对商品详情页规格',
    NEGATIVE_REVIEW_WAVE: '优先修复 VOC 中占比最高的缺陷',
    VIRAL_SURGE: '销量激增，及时补货避免 FBA 断货',
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
    evidence: [`${event.code} 影响 ${sku}`],
    impact:
      event.code === 'ACOS_SPIKE'
        ? '广告花费增速超过转化'
        : event.code === 'RETURN_SPIKE'
          ? '退货损失与买家满意度承压'
          : '运营状况较平稳基线出现变化',
    recommendation: recByCode[event.code] || '查看关联证据后决定是否执行',
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
    return simDate ? `${critical.title} · 模拟 ${simDate}` : critical.title;
  }
  if (health.inventoryHealth === 'CRITICAL') return health.inventoryNote;
  return simDate
    ? `${simDate} 暂无阻塞性问题，关注 ACOS ${health.acos} 与毛利率 ${(health.margin * 100).toFixed(1)}%。`
    : '当前运营窗口暂无阻塞性问题。';
}

export function pickCritical(issues: OperationsInsightCard[]): OperationsInsightCard[] {
  const ranked = [...issues].sort((a, b) => {
    const rank = { CRITICAL: 0, WARNING: 1, INFO: 2 };
    return rank[a.severity] - rank[b.severity];
  });
  return ranked.slice(0, 4);
}
