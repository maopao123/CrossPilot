import { roundMoney, roundMargin } from '../profit/profit-calculation.service';

export interface SearchTermInput {
  searchTerm: string;
  impressions: number;
  clicks: number;
  spend: number;
  orders: number;
  sales: number;
}

export interface AdOptimizationResult {
  searchTerm: string;
  spend: number;
  sales: number;
  orders: number;
  acos: number;
  cvr: number;
  ctr: number;
  action: 'ADD_NEGATIVE_EXACT' | 'REDUCE_BID' | 'INCREASE_BID' | 'MAINTAIN';
  reason: string;
  suggestedBidAdjustmentPercent?: number;
}

export class AdOptimizerService {
  /**
   * Deterministic evaluation of search terms against target ACOS and waste spend thresholds.
   * Target ACOS default: 30% (0.30).
   */
  static analyzeSearchTerm(term: SearchTermInput, targetAcos = 0.30): AdOptimizationResult {
    const spend = roundMoney(term.spend);
    const sales = roundMoney(term.sales);
    const clicks = term.clicks;
    const impressions = term.impressions;
    const orders = term.orders;

    const ctr = impressions > 0 ? roundMargin(clicks / impressions) : 0;
    const cvr = clicks > 0 ? roundMargin(orders / clicks) : 0;
    const acos = sales > 0 ? roundMargin(spend / sales) : (spend > 0 ? 1.0 : 0);

    let action: AdOptimizationResult['action'] = 'MAINTAIN';
    let reason = 'Performance is within acceptable variance range.';
    let suggestedBidAdjustmentPercent: number | undefined;

    // Rule 1: High Spend with 0 or 1 order and ACOS > 80% => Negative Exact
    if (spend >= 40 && acos >= 0.80) {
      action = 'ADD_NEGATIVE_EXACT';
      reason = `Search term has excessive ACOS (${(acos * 100).toFixed(1)}% vs target ${(targetAcos * 100).toFixed(0)}%) with $${spend.toFixed(2)} spend. Recommend adding to Negative Exact.`;
    } else if (clicks >= 20 && orders === 0) {
      action = 'ADD_NEGATIVE_EXACT';
      reason = `High click volume (${clicks} clicks) with zero conversions. Recommend adding to Negative Exact.`;
    } else if (acos > targetAcos * 1.3 && orders >= 2) {
      action = 'REDUCE_BID';
      suggestedBidAdjustmentPercent = -20;
      reason = `ACOS (${(acos * 100).toFixed(1)}%) exceeds target. Recommend lowering bid by 20%.`;
    } else if (acos < targetAcos * 0.7 && orders >= 3) {
      action = 'INCREASE_BID';
      suggestedBidAdjustmentPercent = 15;
      reason = `Strong ACOS (${(acos * 100).toFixed(1)}%) with solid conversion. Recommend raising bid by 15% to capture impression share.`;
    }

    return {
      searchTerm: term.searchTerm,
      spend,
      sales,
      orders,
      acos,
      cvr,
      ctr,
      action,
      reason,
      suggestedBidAdjustmentPercent,
    };
  }
}
