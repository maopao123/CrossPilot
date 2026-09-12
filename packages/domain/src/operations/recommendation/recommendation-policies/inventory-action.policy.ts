/**
 * Inventory Action Policy (Epic 3 Phase 5)
 *
 * Recommends:
 * - PREPARE_REPLENISHMENT: Reuses InventoryPlanningService to compute recommendedQuantity
 * - REVIEW_REORDER_PLAN: When stockout horizon approaches lead time
 * - INVESTIGATE_STOCKOUT: Immediate root-cause check on active stockout
 *
 * Strict rule: recommendedQuantity MUST come from InventoryPlanningService. NEVER fabricated by LLM.
 * executionMode is always APPROVAL_REQUIRED for purchase replenishment.
 */

import {
  Sku360BusinessContext,
  BusinessSignal,
  DiagnosisResult,
  RecommendedAction,
  ActionRecommendationOptions,
  OperationEvidenceItem,
} from '@crosspilot/shared';
import { InventoryPlanningService } from '../../../inventory/inventory-planning.service.js';
import { roundMoney } from '../../../profit/profit-calculation.service.js';
import { IActionRecommendationPolicy } from '../recommendation.types.js';
import { ActionDeduplicator } from '../action-deduplicator.js';

export class InventoryActionPolicy implements IActionRecommendationPolicy {
  public readonly policyId = 'INVENTORY_ACTION_POLICY';
  public readonly targetDomains = ['INVENTORY'] as const;

  public canRecommend(
    context: Sku360BusinessContext,
    diagnoses: DiagnosisResult[],
    signals: BusinessSignal[]
  ): boolean {
    const hasInvDiagnosis = diagnoses.some((d) => d.affectedDomains.includes('INVENTORY'));
    const hasInvSignal = signals.some((s) => s.domain === 'INVENTORY');
    return hasInvDiagnosis || hasInvSignal;
  }

  public recommend(
    context: Sku360BusinessContext,
    diagnoses: DiagnosisResult[],
    signals: BusinessSignal[],
    _options?: ActionRecommendationOptions
  ): RecommendedAction[] {
    const inv = context.inventory;
    if (!inv || inv.availability === 'UNAVAILABLE') {
      return [];
    }

    const actions: RecommendedAction[] = [];
    const invDiagnoses = diagnoses.filter((d) => d.affectedDomains.includes('INVENTORY'));
    const invSignals = signals.filter((s) => s.domain === 'INVENTORY');

    const sourceDiagIds = invDiagnoses.map((d) => d.diagnosisId);
    const sourceSigIds = invSignals.map((s) => s.signalId);

    const fulfillable = inv.fulfillableQuantity;
    const inbound = inv.inboundQuantity;
    const avgSales = inv.avgDailySales;
    const daysCover = inv.daysCover;
    const leadTime = inv.leadTimeDays;
    const asp = context.sales?.averageSellingPrice?.current ?? 29.99;

    // 1. Calculate planning deterministically using InventoryPlanningService
    const planning = InventoryPlanningService.calculatePlanning({
      fulfillableQuantity: fulfillable,
      inboundQuantity: inbound,
      avgDailySales: avgSales,
      leadTimeDays: leadTime,
      safetyStockDays: inv.safetyStockDays ?? 14,
      targetDaysCover: 45,
    });

    const recommendedQty = inv.recommendedQuantity ?? planning.recommendedQuantity;
    const estimatedUnitCost = 20.0;
    const estimatedDailyLostRev = roundMoney(avgSales * asp);

    const evidence: OperationEvidenceItem[] = [
      {
        evidenceId: `EV-ACT-INV-${context.identity.skuId}`,
        category: 'CALCULATED_METRIC',
        title: 'Deterministic Inventory Planning Parameters',
        content: `Fulfillable: ${fulfillable}, Inbound: ${inbound}, AvgSales: ${avgSales.toFixed(1)}/d, Cover: ${daysCover.toFixed(1)}d, LeadTime: ${leadTime}d, ReorderPoint: ${planning.reorderPoint}, RecommendedQty: ${recommendedQty}.`,
        source: 'InventoryPlanningService',
        sourceId: 'calculatePlanning',
        capturedAt: new Date().toISOString(),
      },
    ];

    // Case A: Active Out of Stock
    if (fulfillable === 0) {
      const replenishActionId = ActionDeduplicator.generateActionId(
        context.identity.workspaceId,
        context.identity.skuId,
        'PREPARE_REPLENISHMENT',
        'active-stockout'
      );

      actions.push({
        actionId: replenishActionId,
        workspaceId: context.identity.workspaceId,
        skuId: context.identity.skuId,
        asin: context.identity.asin,
        sourceSignalIds: sourceSigIds,
        sourceDiagnosisIds: sourceDiagIds,
        category: 'INVENTORY',
        actionType: 'PREPARE_REPLENISHMENT',
        priority: 'P1',
        riskLevel: recommendedQty >= 200 ? 'HIGH' : 'MEDIUM',
        executionMode: 'APPROVAL_REQUIRED',
        status: 'PROPOSED',
        title: `Prepare Replenishment Order (${recommendedQty} Units) to Recover Active Stockout`,
        reason: `Sellable stock is fully depleted (0 units). Demand of ${avgSales.toFixed(1)} units/day is currently lost. Deterministic planning recommends reordering ${recommendedQty} units.`,
        evidence,
        expectedImpact: `Replenishment may recover estimated $${estimatedDailyLostRev.toFixed(2)}/day in unfulfilled customer demand exposure.`,
        impactAmount: -estimatedDailyLostRev,
        impactType: 'ESTIMATED',
        recommendationGateStatus: 'READY',
        targetEntity: 'PurchaseOrder',
        payload: {
          recommendedQuantity: recommendedQty,
          reorderPoint: planning.reorderPoint,
          avgDailySales: avgSales,
          unitCost: estimatedUnitCost,
          daysCover,
          leadTimeDays: leadTime,
        },
        createdAt: new Date().toISOString(),
      });

      const auditActionId = ActionDeduplicator.generateActionId(
        context.identity.workspaceId,
        context.identity.skuId,
        'INVESTIGATE_STOCKOUT',
        'supply-chain'
      );

      actions.push({
        actionId: auditActionId,
        workspaceId: context.identity.workspaceId,
        skuId: context.identity.skuId,
        asin: context.identity.asin,
        sourceSignalIds: sourceSigIds,
        sourceDiagnosisIds: sourceDiagIds,
        category: 'INVESTIGATION',
        actionType: 'INVESTIGATE_STOCKOUT',
        priority: 'P1',
        riskLevel: 'LOW',
        executionMode: 'ADVISORY',
        status: 'PROPOSED',
        title: `Investigate Inbound Shipments and Expedited Restock Timeline`,
        reason: `Current active stockout requires reviewing ${inbound} units currently inbound and checking supplier expedited air/ocean options.`,
        evidence,
        expectedImpact: `Minimizes duration of active BSR and organic rank deterioration.`,
        impactType: 'QUALITATIVE',
        recommendationGateStatus: 'READY',
        targetEntity: 'InboundShipment',
        payload: {
          inboundQuantity: inbound,
          fulfillableQuantity: fulfillable,
        },
        createdAt: new Date().toISOString(),
      });
    }
    // Case B: Imminent Stockout
    else if (daysCover <= leadTime) {
      const salesDeltaPct = context.sales?.unitsSold?.deltaPct ?? 0;
      const isVelocitySurge = salesDeltaPct >= 0.20;

      const replenishActionId = ActionDeduplicator.generateActionId(
        context.identity.workspaceId,
        context.identity.skuId,
        'PREPARE_REPLENISHMENT',
        'imminent-stockout'
      );

      actions.push({
        actionId: replenishActionId,
        workspaceId: context.identity.workspaceId,
        skuId: context.identity.skuId,
        asin: context.identity.asin,
        sourceSignalIds: sourceSigIds,
        sourceDiagnosisIds: sourceDiagIds,
        category: 'INVENTORY',
        actionType: 'PREPARE_REPLENISHMENT',
        priority: isVelocitySurge || daysCover <= 7 ? 'P1' : 'P2',
        riskLevel: recommendedQty >= 200 ? 'HIGH' : 'MEDIUM',
        executionMode: 'APPROVAL_REQUIRED',
        status: 'PROPOSED',
        title: `Prepare Replenishment Order (${recommendedQty} Units) Before Runout`,
        reason: `Sellable stock (${fulfillable} units, ${daysCover.toFixed(1)} days cover) breached supplier lead time (${leadTime} days). Deterministic planning recommends reordering ${recommendedQty} units.`,
        evidence,
        expectedImpact: `Reorder prevents projected stockout gap within ${daysCover.toFixed(1)} days, safeguarding daily revenue.`,
        impactAmount: -estimatedDailyLostRev,
        impactType: 'ESTIMATED',
        recommendationGateStatus: 'READY',
        targetEntity: 'PurchaseOrder',
        payload: {
          recommendedQuantity: recommendedQty,
          reorderPoint: planning.reorderPoint,
          avgDailySales: avgSales,
          unitCost: estimatedUnitCost,
          daysCover,
          leadTimeDays: leadTime,
          isVelocitySurge,
        },
        createdAt: new Date().toISOString(),
      });
    }
    // Case C: Excess Inventory Overstock
    else if (daysCover > 90) {
      const excessActionId = ActionDeduplicator.generateActionId(
        context.identity.workspaceId,
        context.identity.skuId,
        'REVIEW_COUPON_STRATEGY',
        'overstock'
      );

      actions.push({
        actionId: excessActionId,
        workspaceId: context.identity.workspaceId,
        skuId: context.identity.skuId,
        asin: context.identity.asin,
        sourceSignalIds: sourceSigIds,
        sourceDiagnosisIds: sourceDiagIds,
        category: 'PRICING',
        actionType: 'REVIEW_COUPON_STRATEGY',
        priority: 'P3',
        riskLevel: 'LOW',
        executionMode: 'ADVISORY',
        status: 'PROPOSED',
        title: `Review Promotional Strategy for Excess Inventory (${daysCover.toFixed(1)} Days Cover)`,
        reason: `Inventory coverage of ${daysCover.toFixed(1)} days exceeds 90-day threshold. Consider limited-time promotions to reduce aged inventory surcharges.`,
        evidence,
        expectedImpact: `Accelerates sell-through to curb upcoming FBA aged inventory fees.`,
        impactType: 'QUALITATIVE',
        recommendationGateStatus: 'READY',
        targetEntity: 'Promotion',
        payload: {
          daysCover,
          fulfillableQuantity: fulfillable,
        },
        createdAt: new Date().toISOString(),
      });
    }

    return actions;
  }
}
