import { roundMoney } from '../profit/profit-calculation.service.js';
import type { Rng } from './rng.js';
import { randRange } from './rng.js';
import { aggregateEventMultipliers } from './event-engine.js';
import type {
  ActiveSimEvent,
  SimAdMetricRow,
  SimConfig,
  SkuChannelSales,
} from './types.js';
import { simDateToUtcDate } from './types.js';

export interface AdsEngineInput {
  config: SimConfig;
  salesSummary: SkuChannelSales[];
  activeEvents: ActiveSimEvent[];
  simDate: string;
  dayIndex: number;
}

/**
 * Amazon-channel ad metrics, self-consistent with the day's amazon orders:
 * ad orders are a subset of organic + ad orders, and
 * impressions → clicks (CTR band) → spend (CPC band) → orders/sales.
 * While an ACOS_SPIKE event is active, spend inflates and conversion drops.
 */
export function runAdsEngine(input: AdsEngineInput, rng: Rng): SimAdMetricRow[] {
  const { config, salesSummary, activeEvents, simDate, dayIndex } = input;
  const rows: SimAdMetricRow[] = [];
  const metricDate = simDateToUtcDate(simDate);

  for (const sku of config.skus) {
    if (sku.channelMix.amazon <= 0) continue;
    const summary = salesSummary.find((item) => item.skuCode === sku.skuCode);
    const amazonOrders = summary?.amazonOrders ?? 0;
    const multipliers = aggregateEventMultipliers(activeEvents, sku.skuCode, dayIndex);

    const adOrderShare = randRange(rng, 0.3, 0.42);
    const adOrders = Math.min(
      amazonOrders,
      Math.round(amazonOrders * adOrderShare * multipliers.adConversion),
    );

    const conversionRate = Math.max(0.01, randRange(rng, 0.08, 0.14) * multipliers.adConversion);
    const baselineClicks = Math.round(
      sku.baseDailySales * sku.channelMix.amazon * 18 * randRange(rng, 0.8, 1.2),
    );
    let clicks = Math.max(Math.round(adOrders / conversionRate), baselineClicks);
    if (multipliers.adsSpend > 1) {
      clicks = Math.round(clicks * Math.min(multipliers.adsSpend * 0.55, 2));
    }

    const clickThroughRate = randRange(rng, 0.003, 0.005);
    const impressions = Math.round(clicks / clickThroughRate);
    const cpc = randRange(rng, 0.8, 1.4) * multipliers.adsSpend;
    const spend = roundMoney(clicks * cpc);
    const sales = roundMoney(adOrders * sku.price);

    rows.push({
      skuCode: sku.skuCode,
      metricDate,
      impressions,
      clicks,
      spend,
      orders: adOrders,
      sales,
    });
  }

  return rows;
}
