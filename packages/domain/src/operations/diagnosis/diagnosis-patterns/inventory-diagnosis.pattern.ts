/**
 * Inventory Stockout Diagnosis Pattern (Epic 3 Phase 4)
 *
 * Diagnoses root causes of inventory imbalances:
 * - Imminent Stockout / Lead Time Breach (R-INV-01)
 * - Active Out-of-Stock (R-INV-02)
 * - Excess Inventory Overstock (R-INV-03)
 *
 * Reuses InventoryPlanningService concepts.
 * Strict boundary: Load != Detect != Diagnose != Recommend
 * Pure diagnosis only. NO action recommendations (e.g. no "order 420 units").
 */

import {
  Sku360BusinessContext,
  BusinessSignal,
  DiagnosisResult,
  DiagnosisDriver,
  DiagnosisEvidenceGateStatus,
  OperationEvidenceItem,
  SignalDomain,
} from '@crosspilot/shared';

import { roundMoney, roundMargin } from '../../../profit/profit-calculation.service.js';
import { IDiagnosisPattern, DiagnosisExecutionOptions } from '../diagnosis.types.js';

export class InventoryStockoutPattern implements IDiagnosisPattern {
  public readonly patternId = 'INVENTORY_STOCKOUT_PATTERN';
  public readonly targetRuleIds = ['R-INV-01', 'R-INV-02', 'R-INV-03'] as const;
  public readonly targetSignalCodes = [
    'STOCKOUT_IMMINENT',
    'OUT_OF_STOCK',
    'EXCESS_INVENTORY',
  ] as const;

  public canDiagnose(context: Sku360BusinessContext, signals: BusinessSignal[]): boolean {
    return signals.some(
      (s) => s.domain === 'INVENTORY' || this.targetSignalCodes.includes(s.code as any)
    );
  }

  public diagnose(
    context: Sku360BusinessContext,
    signals: BusinessSignal[],
    _options?: DiagnosisExecutionOptions
  ): DiagnosisResult | null {
    const inv = context.inventory;
    const targetSignals = signals.filter(
      (s) => s.domain === 'INVENTORY' || this.targetSignalCodes.includes(s.code as any)
    );
    const targetSignalIds = targetSignals.map((s) => s.signalId);

    // 1. Availability Check
    if (!inv || inv.availability === 'UNAVAILABLE') {
      const emptyDriver: DiagnosisDriver = {
        domain: 'INVENTORY',
        metric: 'fulfillableQuantity',
        direction: 'DOWN',
        causalStrength: 'UNKNOWN',
        description: '库存数据不可用。',
      };

      return {
        diagnosisId: `DIAG-INV-UNAVAILABLE-${context.identity.skuId}`,
        workspaceId: context.identity.workspaceId,
        skuId: context.identity.skuId,
        asin: context.identity.asin,
        title: '库存异常？遥测数据缺失',
        summary: '库存遥测标记为 UNAVAILABLE，无法确定断货风险。',
        primaryDriver: emptyDriver,
        secondaryDrivers: [],
        confidence: 0.2,
        evidence: [],
        affectedDomains: ['INVENTORY'],
        affectedSkus: [context.identity.skuId],
        gateStatus: 'INSUFFICIENT',
        targetSignalIds,
        rootCauseCode: 'ROOT_CAUSE_UNCONFIRMED',
        unknowns: ['库存遥测为 UNAVAILABLE；无法核验可售库存与交期。'],
        calculatedAt: new Date().toISOString(),
      };
    }

    const fulfillable = inv.fulfillableQuantity;
    const inbound = inv.inboundQuantity;
    const avgSales = inv.avgDailySales;
    const daysCover = inv.daysCover;
    const leadTime = inv.leadTimeDays;
    const asp = context.sales?.averageSellingPrice?.current ?? 29.99;

    let rootCauseCode = 'INVENTORY_RUNOUT_LEAD_TIME_DEFICIT';
    let title: string;
    let summary: string;
    let primaryDriver: DiagnosisDriver;
    const secondaryDrivers: DiagnosisDriver[] = [];
    const affectedDomains: SignalDomain[] = ['INVENTORY'];

    // 2. Classify Inventory Failure Mode
    if (fulfillable === 0 || daysCover === 0) {
      // Case A: Active Out of Stock
      rootCauseCode = 'INVENTORY_STOCKOUT_ACTIVE';
      title = '正在断货：在库可售数量为零';
      const estimatedDailyLoss = roundMoney(avgSales * asp);

      primaryDriver = {
        domain: 'INVENTORY',
        metric: 'fulfillableQuantity',
        impactAmount: -estimatedDailyLoss,
        impactType: 'ESTIMATED',
        contributionRatio: 1.0,
        direction: 'DOWN',
        causalStrength: 'STRONG',
        relatedSignalIds: targetSignals.filter((s) => s.code === 'OUT_OF_STOCK').map((s) => s.signalId),
        description: `可售库存已耗尽（0 件）。日需求 ${avgSales.toFixed(1)} 件/天正在流失（约 $${estimatedDailyLoss.toFixed(2)}/天的收入泄漏）。`,
      };

      if (inbound > 0) {
        secondaryDrivers.push({
          domain: 'INVENTORY',
          metric: 'inboundQuantity',
          impactAmount: 0,
          direction: 'STABLE',
          causalStrength: 'INDICATIVE',
          description: `${inbound} 件在途/入库中，等待运营中心签收。`,
        });
      }

      summary = `SKU 已完全断货，可售数量为 0。${avgSales.toFixed(1)} 件/天的活跃买家需求无法满足。`;
    } else if (daysCover <= leadTime) {
      // Case B: Imminent Stockout (Days cover < Supplier Lead Time)
      const salesDeltaPct = context.sales?.unitsSold?.deltaPct ?? 0;
      const isSurge = salesDeltaPct >= 0.20;

      if (isSurge) {
        rootCauseCode = 'INVENTORY_RUNOUT_HIGH_VELOCITY';
        title = `断货迫近：销售速度激增 ${(salesDeltaPct * 100).toFixed(1)}% 所致`;
        affectedDomains.push('SALES');

        primaryDriver = {
          domain: 'INVENTORY',
          metric: 'daysCover',
          impactAmount: 0,
          contributionRatio: 0.65,
          direction: 'DOWN',
          causalStrength: 'STRONG',
          relatedSignalIds: targetSignals.filter((s) => s.code === 'STOCKOUT_IMMINENT').map((s) => s.signalId),
          description: `当前库存覆盖（${daysCover.toFixed(1)} 天）已跌破供应商交期（${leadTime} 天）。按 ${avgSales.toFixed(1)} 件/天计算，预计 ${daysCover.toFixed(1)} 天内断货。`,
        };

        secondaryDrivers.push({
          domain: 'SALES',
          metric: 'salesVelocitySurge',
          impactAmount: 0,
          contributionRatio: 0.35,
          direction: 'UP',
          causalStrength: 'STRONG',
          description: `销售速度较基准激增 ${(salesDeltaPct * 100).toFixed(1)}%，超过标准补货周期，耗尽缓冲库存。`,
        });

        summary = `断货将在 ${daysCover.toFixed(1)} 天内发生，早于供应商补货（交期 ${leadTime} 天）到达；快速售罄由 ${(salesDeltaPct * 100).toFixed(1)}% 的需求激增驱动。`;
      } else {
        rootCauseCode = 'INVENTORY_RUNOUT_LEAD_TIME_DEFICIT';
        title = `断货迫近：覆盖（${daysCover.toFixed(1)} 天）低于供应商交期（${leadTime} 天）`;

        primaryDriver = {
          domain: 'INVENTORY',
          metric: 'daysCover',
          impactAmount: 0,
          contributionRatio: 1.0,
          direction: 'DOWN',
          causalStrength: 'STRONG',
          relatedSignalIds: targetSignals.filter((s) => s.code === 'STOCKOUT_IMMINENT').map((s) => s.signalId),
          description: `可售库存（${fulfillable} 件）仅可支撑 ${daysCover.toFixed(1)} 天，少于 ${leadTime} 天的供应商补货周期。`,
        };

        summary = `库存覆盖 ${daysCover.toFixed(1)} 天已跌破 ${leadTime} 天的补货阈值，补货入库前存在即时断货风险。`;
      }
    } else {
      // Case C: Excess Inventory
      rootCauseCode = 'INVENTORY_EXCESS_OVERSTOCK';
      title = `库存过剩：覆盖 ${daysCover.toFixed(1)} 天`;

      primaryDriver = {
        domain: 'INVENTORY',
        metric: 'daysCover',
        impactAmount: 0,
        contributionRatio: 1.0,
        direction: 'UP',
        causalStrength: 'STRONG',
        relatedSignalIds: targetSignals.filter((s) => s.code === 'EXCESS_INVENTORY').map((s) => s.signalId),
        description: `当前覆盖 ${daysCover.toFixed(1)} 天超过 90 天阈值，${fulfillable} 件在库库存占用营运资金。`,
      };

      summary = `检测到库存过剩（覆盖 ${daysCover.toFixed(1)} 天，高于 90 天上限）。低动销速度（${avgSales.toFixed(1)} 件/天）可能持续产生 FBA 长期仓储附加费。`;
    }

    // 3. Evidence Gate
    let gateStatus: DiagnosisEvidenceGateStatus = 'SUPPORTED';
    const unknowns: string[] = [];

    if (inv.availability === 'PARTIAL') {
      gateStatus = 'PARTIALLY_SUPPORTED';
      unknowns.push('库存遥测为 PARTIAL；仓库在途追踪为估算值。');
    }

    const evidence: OperationEvidenceItem[] = [
      {
        evidenceId: `EV-INV-DIAG-${context.identity.skuId}`,
        category: 'CALCULATED_METRIC',
        title: '库存覆盖与补货周期对比',
        content: `可售：${fulfillable}，在途：${inbound}，日均销量：${avgSales.toFixed(1)}，覆盖天数：${daysCover.toFixed(1)} 天，交期：${leadTime} 天，安全库存：${inv.safetyStockDays} 天。`,
        source: 'InventoryPlanningService',
        sourceId: 'calculateDaysCover',
        capturedAt: new Date().toISOString(),
        metadata: {
          fulfillable,
          inbound,
          avgSales,
          daysCover,
          leadTime,
          reorderPoint: inv.reorderPoint,
        },
      },
    ];

    return {
      diagnosisId: `DIAG-INV-${context.identity.skuId}-${context.currentPeriod.to.slice(0, 10).replace(/-/g, '')}`,
      workspaceId: context.identity.workspaceId,
      skuId: context.identity.skuId,
      asin: context.identity.asin,
      title,
      summary,
      primaryDriver,
      secondaryDrivers,
      confidence: gateStatus === 'SUPPORTED' ? 0.95 : 0.70,
      evidence,
      affectedDomains,
      affectedSkus: [context.identity.skuId],
      gateStatus,
      targetSignalIds,
      rootCauseCode,
      unknowns: unknowns.length > 0 ? unknowns : undefined,
      calculatedAt: new Date().toISOString(),
    };
  }
}
