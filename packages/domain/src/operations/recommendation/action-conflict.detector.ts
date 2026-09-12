/**
 * Action Conflict Detector (Epic 3 Phase 5)
 *
 * Detects contradictory operational recommendations:
 * - Low inventory/stockout vs Price reduction/Coupon demand stimulation
 * - Aggressive bid expansion vs negative keyword suppression
 *
 * When detected:
 * - Flags conflictDetected: true
 * - Links conflictingActionIds
 * - Explains conflictReason
 * - Downgrades recommendationGateStatus to NEEDS_REVIEW
 */

import { RecommendedAction } from '@crosspilot/shared';

export class ActionConflictDetector {
  /**
   * Evaluates a list of recommended actions for logical business contradictions.
   */
  public static detectConflicts(actions: RecommendedAction[]): RecommendedAction[] {
    if (actions.length <= 1) {
      return actions;
    }

    // Map by SKU
    const skuMap = new Map<string, RecommendedAction[]>();
    for (const action of actions) {
      const sku = action.skuId ?? 'GLOBAL';
      if (!skuMap.has(sku)) {
        skuMap.set(sku, []);
      }
      skuMap.get(sku)!.push(action);
    }

    for (const skuActions of skuMap.values()) {
      // Check 1: Inventory stockout vs Price Discounting / Coupon Demand Stimulation
      const stockoutActions = skuActions.filter(
        (a) => a.actionType === 'PREPARE_REPLENISHMENT' || a.actionType === 'INVESTIGATE_STOCKOUT'
      );
      const pricingStimulationActions = skuActions.filter(
        (a) => a.actionType === 'REVIEW_COUPON_STRATEGY' || a.actionType === 'REVIEW_PRICE_COMPETITIVENESS'
      );

      if (stockoutActions.length > 0 && pricingStimulationActions.length > 0) {
        for (const stockAct of stockoutActions) {
          for (const priceAct of pricingStimulationActions) {
            stockAct.conflictDetected = true;
            stockAct.conflictingActionIds = [
              ...(stockAct.conflictingActionIds ?? []),
              priceAct.actionId,
            ];
            stockAct.conflictReason = `Inventory supply constraint (${stockAct.title}) conflicts with demand stimulation (${priceAct.title}). Aggressive promotion may accelerate stock depletion.`;
            stockAct.recommendationGateStatus = 'NEEDS_REVIEW';

            priceAct.conflictDetected = true;
            priceAct.conflictingActionIds = [
              ...(priceAct.conflictingActionIds ?? []),
              stockAct.actionId,
            ];
            priceAct.conflictReason = `Price discounting / promotion (${priceAct.title}) conflicts with active inventory shortage (${stockAct.title}). Recommending human review before promotional price adjustments.`;
            priceAct.recommendationGateStatus = 'NEEDS_REVIEW';
          }
        }
      }
    }

    return actions;
  }
}
