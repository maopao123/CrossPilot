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
        description: 'Inventory telemetry is unavailable.',
      };

      return {
        diagnosisId: `DIAG-INV-UNAVAILABLE-${context.identity.skuId}`,
        workspaceId: context.identity.workspaceId,
        skuId: context.identity.skuId,
        asin: context.identity.asin,
        title: 'Inventory Anomaly ? Missing Telemetry',
        summary: 'Inventory telemetry is marked UNAVAILABLE. Stockout coverage cannot be determined.',
        primaryDriver: emptyDriver,
        secondaryDrivers: [],
        confidence: 0.2,
        evidence: [],
        affectedDomains: ['INVENTORY'],
        affectedSkus: [context.identity.skuId],
        gateStatus: 'INSUFFICIENT',
        targetSignalIds,
        rootCauseCode: 'ROOT_CAUSE_UNCONFIRMED',
        unknowns: ['Inventory telemetry is UNAVAILABLE; sellable stock and lead times cannot be checked.'],
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
      title = 'Active Stockout: Zero Sellable Units In-Stock';
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
        description: `Sellable inventory is depleted (0 units). Daily demand of ${avgSales.toFixed(1)} units/day is lost (~$${estimatedDailyLoss.toFixed(2)}/day revenue leakage).`,
      };

      if (inbound > 0) {
        secondaryDrivers.push({
          domain: 'INVENTORY',
          metric: 'inboundQuantity',
          impactAmount: 0,
          direction: 'STABLE',
          causalStrength: 'INDICATIVE',
          description: `${inbound} units currently in-transit/inbound, pending fulfillment center check-in.`,
        });
      }

      summary = `SKU has run completely out of stock with 0 sellable units. Active customer demand of ${avgSales.toFixed(1)} units/day is going unfulfilled.`;
    } else if (daysCover <= leadTime) {
      // Case B: Imminent Stockout (Days cover < Supplier Lead Time)
      const salesDeltaPct = context.sales?.unitsSold?.deltaPct ?? 0;
      const isSurge = salesDeltaPct >= 0.20;

      if (isSurge) {
        rootCauseCode = 'INVENTORY_RUNOUT_HIGH_VELOCITY';
        title = `Imminent Stockout: Accelerated by ${(salesDeltaPct * 100).toFixed(1)}% Sales Velocity Surge`;
        affectedDomains.push('SALES');

        primaryDriver = {
          domain: 'INVENTORY',
          metric: 'daysCover',
          impactAmount: 0,
          contributionRatio: 0.65,
          direction: 'DOWN',
          causalStrength: 'STRONG',
          relatedSignalIds: targetSignals.filter((s) => s.code === 'STOCKOUT_IMMINENT').map((s) => s.signalId),
          description: `Current inventory coverage (${daysCover.toFixed(1)} days) breached supplier lead time (${leadTime} days). At ${avgSales.toFixed(1)} units/day, stockout is projected within ${daysCover.toFixed(1)} days.`,
        };

        secondaryDrivers.push({
          domain: 'SALES',
          metric: 'salesVelocitySurge',
          impactAmount: 0,
          contributionRatio: 0.35,
          direction: 'UP',
          causalStrength: 'STRONG',
          description: `Sales velocity surged ${(salesDeltaPct * 100).toFixed(1)}% over baseline, outstripping standard replenishment cycle and depleting buffer stock.`,
        });

        summary = `Stockout will occur in ${daysCover.toFixed(1)} days before supplier replenishment (${leadTime} days lead time) can arrive. Rapid stock runout was driven by a ${(salesDeltaPct * 100).toFixed(1)}% sales demand surge.`;
      } else {
        rootCauseCode = 'INVENTORY_RUNOUT_LEAD_TIME_DEFICIT';
        title = `Imminent Stockout: Coverage (${daysCover.toFixed(1)}d) Below Supplier Lead Time (${leadTime}d)`;

        primaryDriver = {
          domain: 'INVENTORY',
          metric: 'daysCover',
          impactAmount: 0,
          contributionRatio: 1.0,
          direction: 'DOWN',
          causalStrength: 'STRONG',
          relatedSignalIds: targetSignals.filter((s) => s.code === 'STOCKOUT_IMMINENT').map((s) => s.signalId),
          description: `Sellable stock (${fulfillable} units) provides only ${daysCover.toFixed(1)} days of coverage, which is less than the ${leadTime}-day supplier replenishment window.`,
        };

        summary = `Inventory coverage of ${daysCover.toFixed(1)} days has breached the ${leadTime}-day replenishment threshold. Immediate stockout risk before reorder receipt.`;
      }
    } else {
      // Case C: Excess Inventory
      rootCauseCode = 'INVENTORY_EXCESS_OVERSTOCK';
      title = `Excess Inventory: ${daysCover.toFixed(1)} Days of Coverage`;

      primaryDriver = {
        domain: 'INVENTORY',
        metric: 'daysCover',
        impactAmount: 0,
        contributionRatio: 1.0,
        direction: 'UP',
        causalStrength: 'STRONG',
        relatedSignalIds: targetSignals.filter((s) => s.code === 'EXCESS_INVENTORY').map((s) => s.signalId),
        description: `Current coverage of ${daysCover.toFixed(1)} days exceeds the 90-day threshold, tying up working capital with ${fulfillable} units in storage.`,
      };

      summary = `Excess inventory level detected (${daysCover.toFixed(1)} days cover vs 90-day ceiling). Low sales velocity (${avgSales.toFixed(1)} units/day) risks ongoing FBA storage fee surcharges.`;
    }

    // 3. Evidence Gate
    let gateStatus: DiagnosisEvidenceGateStatus = 'SUPPORTED';
    const unknowns: string[] = [];

    if (inv.availability === 'PARTIAL') {
      gateStatus = 'PARTIALLY_SUPPORTED';
      unknowns.push('Inventory telemetry is PARTIAL; warehouse inbound tracking was estimated.');
    }

    const evidence: OperationEvidenceItem[] = [
      {
        evidenceId: `EV-INV-DIAG-${context.identity.skuId}`,
        category: 'CALCULATED_METRIC',
        title: 'Inventory Coverage vs Replenishment Timeline',
        content: `Fulfillable: ${fulfillable}, Inbound: ${inbound}, AvgDailySales: ${avgSales.toFixed(1)}, DaysCover: ${daysCover.toFixed(1)}d, LeadTime: ${leadTime}d, SafetyStock: ${inv.safetyStockDays}d.`,
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
