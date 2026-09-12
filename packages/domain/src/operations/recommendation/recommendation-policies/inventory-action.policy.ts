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
        title: '确定性库存补货参数',
        content: `可售：${fulfillable}，在途：${inbound}，日均销量：${avgSales.toFixed(1)}/天，覆盖：${daysCover.toFixed(1)} 天，交期：${leadTime} 天，补货点：${planning.reorderPoint}，建议补货量：${recommendedQty}。`,
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
        title: `准备补货订单（${recommendedQty} 件）以恢复断货`,
        reason: `可售库存已完全耗尽（0 件），${avgSales.toFixed(1)} 件/天的需求正在流失。确定性补货测算建议下单 ${recommendedQty} 件。`,
        evidence,
        expectedImpact: `补货有望挽回约 $${estimatedDailyLostRev.toFixed(2)}/天的未满足买家需求损失。`,
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
        title: `核查在途货件与加急补货时效`,
        reason: `当前正在断货，需核查在途 ${inbound} 件并确认供应商加急空运/海运选项。`,
        evidence,
        expectedImpact: `尽量缩短活跃断货期，降低 BSR 与自然排名下滑幅度。`,
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
        title: `准备补货订单（${recommendedQty} 件）以避免售罄`,
        reason: `可售库存（${fulfillable} 件，覆盖 ${daysCover.toFixed(1)} 天）已跌破供应商交期（${leadTime} 天）。确定性补货测算建议下单 ${recommendedQty} 件。`,
        evidence,
        expectedImpact: `补货可在预计 ${daysCover.toFixed(1)} 天内的断货窗口前兜底，保障每日收入。`,
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
        title: `审查库存过剩（覆盖 ${daysCover.toFixed(1)} 天）的促销策略`,
        reason: `库存覆盖 ${daysCover.toFixed(1)} 天，超过 90 天阈值。建议考虑限时促销，降低库龄附加费。`,
        evidence,
        expectedImpact: `加速动销，遏制即将到来的 FBA 长期仓储费。`,
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
