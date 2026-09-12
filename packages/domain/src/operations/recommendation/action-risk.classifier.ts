/**
 * Action Risk & Execution Mode Classifier (Epic 3 Phase 5)
 *
 * Enforces:
 * - Priority != Risk Level
 * - ADVISORY: Pure inspection, auditing, telemetry refresh, no side effects
 * - APPROVAL_REQUIRED: Any action that may lead to financial expenditure,
 *   traffic throttling, listing edits, or pricing modifications.
 */

import {
  ActionType,
  ActionRiskLevel,
  ActionExecutionMode,
  RecommendedAction,
} from '@crosspilot/shared';
import { RiskClassificationResult } from './recommendation.types.js';

export class ActionRiskClassifier {
  /**
   * Classifies the risk level and required execution mode for an action.
   */
  public static classify(action: Partial<RecommendedAction>): RiskClassificationResult {
    const actionType = action.actionType;
    let riskLevel: ActionRiskLevel = 'LOW';
    let executionMode: ActionExecutionMode = 'ADVISORY';
    let reason = '';

    switch (actionType) {
      case 'PREPARE_REPLENISHMENT': {
        const qty = Number(action.payload?.recommendedQuantity ?? 0);
        const unitCost = Number(action.payload?.unitCost ?? 20);
        const totalCapital = qty * unitCost;

        executionMode = 'APPROVAL_REQUIRED';
        if (qty >= 200 || totalCapital >= 1000) {
          riskLevel = 'HIGH';
          reason = `High capital expenditure ($${totalCapital.toFixed(2)}, ${qty} units) carries working capital and inventory holding risk. Requires human procurement authorization.`;
        } else {
          riskLevel = 'MEDIUM';
          reason = `Replenishment order requires human sign-off before purchase order transmission.`;
        }
        break;
      }

      case 'REVIEW_REORDER_PLAN': {
        riskLevel = 'MEDIUM';
        executionMode = 'APPROVAL_REQUIRED';
        reason = `Supplier lead time and reorder schedule adjustment requires inventory manager confirmation.`;
        break;
      }

      case 'REVIEW_NEGATIVE_KEYWORD': {
        riskLevel = 'LOW';
        executionMode = 'APPROVAL_REQUIRED';
        reason = `Negative keyword targeting suppresses customer search queries. Requires confirmation to prevent unintended impression loss.`;
        break;
      }

      case 'REVIEW_BID':
      case 'REVIEW_AD_SPEND': {
        riskLevel = 'MEDIUM';
        executionMode = 'APPROVAL_REQUIRED';
        reason = `Campaign budget and bid revisions alter daily ad burn rate and impression share. Requires campaign manager approval.`;
        break;
      }

      case 'REVIEW_PRICE_COMPETITIVENESS':
      case 'REVIEW_COUPON_STRATEGY': {
        riskLevel = 'MEDIUM';
        executionMode = 'APPROVAL_REQUIRED';
        reason = `Price changes and coupon activations directly impact unit margin and Buy Box eligibility.`;
        break;
      }

      case 'REVIEW_LISTING_SPECIFICATION': {
        riskLevel = 'MEDIUM';
        executionMode = 'APPROVAL_REQUIRED';
        reason = `Modifications to listing title or bullet points affect indexing and conversion. Human review required.`;
        break;
      }

      case 'INVESTIGATE_SEARCH_TERM':
      case 'INVESTIGATE_STOCKOUT':
      case 'INVESTIGATE_PRODUCT_FIT':
      case 'REVIEW_RETURN_REASON':
      case 'REFRESH_COMPETITOR_DATA':
      case 'INVESTIGATE_PROFIT_DRIVER':
      case 'NO_ACTION_REQUIRED':
      default: {
        riskLevel = 'LOW';
        executionMode = 'ADVISORY';
        reason = `Analytical review and investigation mode only. No external system state is modified.`;
        break;
      }
    }

    return {
      riskLevel,
      executionMode,
      reason,
    };
  }
}
