import { createStreamRng } from './rng.js';
import { runEventEngine } from './event-engine.js';
import { runSalesEngine } from './sales-engine.js';
import { receiveInboundArrivals, runInventoryEngine } from './inventory-engine.js';
import { runReviewEngine } from './review-engine.js';
import { runAdsEngine } from './ads-engine.js';
import { runFunnelEngine } from './funnel-engine.js';
import type {
  DaySimulationOutput,
  SimConfig,
  SimWorldState,
} from './types.js';
import { addDaysToSimDate } from './types.js';

export const DEFAULT_SIM_START_DATE = '2026-09-01';
export const DEFAULT_SIM_SEED = 20260901;

/**
 * Default simulation world: the 3 POLEGAS marble toothbrush holder SKUs from
 * the demo seed, with initial FBA stock 500 / 400 / 300.
 */
export function createDefaultSimConfig(): SimConfig {
  return {
    skus: [
      {
        skuCode: 'MTH-WHITE-001',
        asin: 'B0C7M8W101',
        baseDailySales: 14,
        price: 29.99,
        referencePrice: 29.99,
        priceElasticity: -1.2,
        channelMix: { amazon: 0.85, shopify: 0.15 },
        rating: 4.6,
        qualityScore: 0.92,
        leadTimeDays: 15,
        reorderPoint: 150,
        reorderQuantity: 400,
        initialInventory: 500,
      },
      {
        skuCode: 'MTH-GREEN-001',
        asin: 'B0C7M8G202',
        baseDailySales: 10,
        price: 32.99,
        referencePrice: 32.99,
        priceElasticity: -1.2,
        channelMix: { amazon: 0.85, shopify: 0.15 },
        rating: 4.5,
        qualityScore: 0.9,
        leadTimeDays: 15,
        reorderPoint: 120,
        reorderQuantity: 500,
        initialInventory: 400,
      },
      {
        skuCode: 'MTH-GREY-001',
        asin: 'B0C7M8B303',
        baseDailySales: 7,
        price: 28.99,
        referencePrice: 28.99,
        priceElasticity: -1.2,
        channelMix: { amazon: 0.8, shopify: 0.2 },
        rating: 4.1,
        qualityScore: 0.78,
        leadTimeDays: 15,
        reorderPoint: 90,
        reorderQuantity: 250,
        initialInventory: 300,
      },
    ],
    // Index 0 = Sunday (Date.getUTCDay()).
    weekdayFactors: [0.85, 1.05, 1.08, 1.1, 1.02, 0.95, 0.85],
    seasonAmplitude: 0.2,
    seasonPeriodDays: 90,
    noiseAmplitude: 0.15,
    eventDailyProbability: 1,
    reviewProbability: 0.12,
  };
}

export function createInitialWorldState(
  config: SimConfig,
  startDate: string = DEFAULT_SIM_START_DATE,
  rngSeed: number = DEFAULT_SIM_SEED,
): SimWorldState {
  return {
    simDate: startDate,
    dayIndex: 0,
    rngSeed,
    skus: config.skus.map((sku) => ({
      skuCode: sku.skuCode,
      fulfillable: sku.initialInventory,
      inboundShipments: [],
      cumulativeUnitsSold: 0,
      cumulativeUnitsReceived: 0,
      avgDailySales: sku.baseDailySales,
      lowStockActive: false,
      stockoutActive: false,
    })),
    activeEvents: [],
  };
}

export interface DaySimulationResult {
  output: DaySimulationOutput;
  nextState: SimWorldState;
}

/**
 * Advances the simulated world by one day. Pure and deterministic: the same
 * (worldState, config) always yields the same output and nextState, because
 * every engine draws from an RNG stream derived from
 * (worldState.rngSeed, worldState.dayIndex, engineName).
 */
export function simulateOneDay(worldState: SimWorldState, config: SimConfig): DaySimulationResult {
  const { rngSeed, dayIndex, simDate } = worldState;

  // 1. Events: expire finished ones, emit pending/injected ones, roll new anomalies.
  const eventResult = runEventEngine(
    { world: worldState, config },
    createStreamRng(rngSeed, dayIndex, 'event'),
  );

  // 2. Morning inbound reception (before sales, so arrival day has stock).
  const { skuStates: statesAfterArrival, arrivals } = receiveInboundArrivals(
    worldState.skus,
    dayIndex,
  );
  const worldAfterArrival: SimWorldState = {
    ...worldState,
    skus: statesAfterArrival,
    activeEvents: eventResult.activeEvents,
  };

  // 3. Sales: demand → stockout-capped orders per channel.
  const salesResult = runSalesEngine(
    { config, world: worldAfterArrival, activeEvents: eventResult.activeEvents },
    createStreamRng(rngSeed, dayIndex, 'sales'),
  );

  // 4. Inventory: deduct sales, snapshots/balances, reorder & stockout events.
  const inventoryResult = runInventoryEngine({
    skuStates: statesAfterArrival,
    arrivals,
    salesSummary: salesResult.salesSummary,
    config,
    world: worldAfterArrival,
  });

  // 5. Reviews from the day's orders.
  const reviews = runReviewEngine(
    {
      config,
      salesSummary: salesResult.salesSummary,
      activeEvents: eventResult.activeEvents,
      simDate,
      dayIndex,
    },
    createStreamRng(rngSeed, dayIndex, 'review'),
  );

  // 6. Amazon ad metrics consistent with amazon orders.
  const adMetrics = runAdsEngine(
    {
      config,
      salesSummary: salesResult.salesSummary,
      activeEvents: eventResult.activeEvents,
      simDate,
      dayIndex,
    },
    createStreamRng(rngSeed, dayIndex, 'ads'),
  );

  // 7. Channel funnel metrics (shopify funnel + amazon traffic side).
  const channelMetrics = runFunnelEngine(
    { config, salesSummary: salesResult.salesSummary, simDate },
    createStreamRng(rngSeed, dayIndex, 'funnel'),
  );

  const output: DaySimulationOutput = {
    simDate,
    dayIndex,
    orders: salesResult.orders,
    inventorySnapshots: inventoryResult.snapshots,
    inventoryBalances: inventoryResult.balances,
    reviews,
    adMetrics,
    channelMetrics,
    events: [...eventResult.eventRows, ...inventoryResult.eventRows],
    salesSummary: salesResult.salesSummary,
    activeEvents: eventResult.activeEvents,
  };

  const nextState: SimWorldState = {
    simDate: addDaysToSimDate(simDate, 1),
    dayIndex: dayIndex + 1,
    rngSeed,
    skus: inventoryResult.skuStates,
    activeEvents: eventResult.activeEvents,
  };

  return { output, nextState };
}
