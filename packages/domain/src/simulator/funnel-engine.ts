import { roundMargin, roundMoney } from '../profit/profit-calculation.service.js';
import type { Rng } from './rng.js';
import { randRange } from './rng.js';
import type {
  SimChannelMetricRow,
  SimConfig,
  SkuChannelSales,
} from './types.js';
import { simDateToUtcDate } from './types.js';

export interface FunnelEngineInput {
  config: SimConfig;
  salesSummary: SkuChannelSales[];
  simDate: string;
}

/**
 * Per-SKU daily channel funnel metrics. Shopify rows model the storefront
 * funnel (sessions → addToCart → checkout → orders, consistent with the
 * sales engine's shopify order count); amazon rows back out plausible
 * traffic from the amazon order count. Monotone by construction:
 * sessions ≥ addToCart ≥ checkout ≥ orders ≥ 0.
 */
export function runFunnelEngine(input: FunnelEngineInput, rng: Rng): SimChannelMetricRow[] {
  const { config, salesSummary, simDate } = input;
  const rows: SimChannelMetricRow[] = [];
  const metricDate = simDateToUtcDate(simDate);

  for (const sku of config.skus) {
    const summary = salesSummary.find((item) => item.skuCode === sku.skuCode);

    if (sku.channelMix.shopify > 0) {
      const orders = summary?.shopifyOrders ?? 0;
      const conversion = randRange(rng, 0.015, 0.03);
      const sessions =
        orders > 0
          ? Math.ceil(orders / conversion)
          : Math.round(sku.baseDailySales * sku.channelMix.shopify * randRange(rng, 8, 14));
      const addToCart = Math.max(orders, Math.round(sessions * randRange(rng, 0.16, 0.26)));
      const checkout = Math.max(orders, Math.round(addToCart * randRange(rng, 0.5, 0.7)));
      rows.push({
        skuCode: sku.skuCode,
        channel: 'shopify',
        metricDate,
        sessions,
        addToCart,
        checkout,
        orders,
        conversionRate: sessions > 0 ? roundMargin(orders / sessions) : 0,
        bounceRate: roundMargin(randRange(rng, 0.35, 0.55)),
        revenue: roundMoney(orders * sku.price),
      });
    }

    if (sku.channelMix.amazon > 0) {
      const orders = summary?.amazonOrders ?? 0;
      const sessionConversion = randRange(rng, 0.09, 0.16);
      const sessions =
        orders > 0
          ? Math.ceil(orders / sessionConversion)
          : Math.round(sku.baseDailySales * sku.channelMix.amazon * randRange(rng, 8, 14));
      const addToCart = Math.max(orders, Math.round(sessions * randRange(rng, 0.25, 0.35)));
      const checkout = Math.max(orders, Math.round(addToCart * randRange(rng, 0.4, 0.6)));
      rows.push({
        skuCode: sku.skuCode,
        channel: 'amazon',
        metricDate,
        sessions,
        addToCart,
        checkout,
        orders,
        conversionRate: sessions > 0 ? roundMargin(orders / sessions) : 0,
        bounceRate: roundMargin(randRange(rng, 0.25, 0.4)),
        revenue: roundMoney(orders * sku.price),
      });
    }
  }

  return rows;
}
