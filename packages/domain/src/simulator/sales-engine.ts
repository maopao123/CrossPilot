import { roundMoney } from '../profit/profit-calculation.service.js';
import type { Rng } from './rng.js';
import { aggregateEventMultipliers } from './event-engine.js';
import type {
  SimConfig,
  SimOrderRow,
  SimWorldState,
  SkuChannelSales,
} from './types.js';
import { dayOfWeek, simDateCompact, simDateToUtcDate } from './types.js';

export interface SalesEngineInput {
  config: SimConfig;
  /**
   * World view for the day. `skus[].fulfillable` must already reflect any
   * inbound arrivals received this morning (daily-tick applies them first).
   */
  world: SimWorldState;
  activeEvents: SimWorldState['activeEvents'];
}

export interface SalesEngineOutput {
  orders: SimOrderRow[];
  salesSummary: SkuChannelSales[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Per SKU: demand = base × weekday × season × price elasticity × rating ×
 * active event multiplier × noise. Demand is capped by available FBA stock;
 * zero stock means zero orders (stockout). Units are split into one-unit
 * orders across amazon/shopify by the channel mix.
 */
export function runSalesEngine(input: SalesEngineInput, rng: Rng): SalesEngineOutput {
  const { config, world, activeEvents } = input;
  const orders: SimOrderRow[] = [];
  const salesSummary: SkuChannelSales[] = [];
  const weekdayFactor = config.weekdayFactors[dayOfWeek(world.simDate)];
  const seasonFactor =
    1 + config.seasonAmplitude * Math.sin((2 * Math.PI * world.dayIndex) / config.seasonPeriodDays);
  const dateCompact = simDateCompact(world.simDate);
  let seq = 0;

  for (const sku of config.skus) {
    const skuState = world.skus.find((state) => state.skuCode === sku.skuCode);
    const available = skuState ? skuState.fulfillable : 0;
    const multipliers = aggregateEventMultipliers(activeEvents, sku.skuCode, world.dayIndex);

    const priceFactor = Math.pow(sku.price / sku.referencePrice, sku.priceElasticity);
    const ratingFactor = clamp(0.5 + 0.12 * sku.rating, 0.6, 1.15);
    const noise = 1 + (rng() * 2 - 1) * config.noiseAmplitude;

    const demand = Math.max(
      0,
      Math.round(
        sku.baseDailySales *
          weekdayFactor *
          seasonFactor *
          priceFactor *
          ratingFactor *
          multipliers.sales *
          noise,
      ),
    );
    const unitsSold = Math.min(demand, available);

    let amazonOrders = Math.min(unitsSold, Math.round(unitsSold * sku.channelMix.amazon));
    let shopifyOrders = unitsSold - amazonOrders;
    if (shopifyOrders < 0) {
      shopifyOrders = 0;
      amazonOrders = unitsSold;
    }

    for (const [channel, count] of [
      ['amazon', amazonOrders],
      ['shopify', shopifyOrders],
    ] as const) {
      for (let i = 0; i < count; i++) {
        seq += 1;
        const hour = 8 + Math.floor(rng() * 12);
        const minute = Math.floor(rng() * 60);
        orders.push({
          orderNumber: `SIM-${dateCompact}-${String(seq).padStart(4, '0')}`,
          channel,
          status: 'SHIPPED',
          totalAmount: roundMoney(sku.price),
          currencyCode: 'USD',
          orderedAt: simDateToUtcDate(world.simDate, hour, minute),
          items: [{ skuCode: sku.skuCode, quantity: 1, unitPrice: sku.price }],
        });
      }
    }

    salesSummary.push({
      skuCode: sku.skuCode,
      amazonOrders,
      shopifyOrders,
      unitsSold,
      unitsDemanded: demand,
    });
  }

  return { orders, salesSummary };
}
