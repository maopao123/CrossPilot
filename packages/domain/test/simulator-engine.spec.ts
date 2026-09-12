import {
  createDefaultSimConfig,
  createInitialWorldState,
  simulateOneDay,
} from '../src/simulator/daily-tick';
import { injectEvent } from '../src/simulator/event-engine';
import { roundMoney } from '../src/profit/profit-calculation.service';
import type { DaySimulationOutput, SimConfig, SimWorldState } from '../src/simulator/types';

function runDays(world: SimWorldState, config: SimConfig, days: number) {
  const outputs: DaySimulationOutput[] = [];
  let state = world;
  for (let i = 0; i < days; i++) {
    const result = simulateOneDay(state, config);
    outputs.push(result.output);
    state = result.nextState;
  }
  return { outputs, finalState: state };
}

/** Default config with random events disabled for behavioral assertions. */
function quietConfig(overrides?: Partial<SimConfig>): SimConfig {
  return { ...createDefaultSimConfig(), eventDailyProbability: 0, ...overrides };
}

describe('Commerce Simulator engine', () => {
  it('is deterministic: same seed + dayIndex produce deep-equal output and nextState', () => {
    const config = createDefaultSimConfig();
    const first = simulateOneDay(createInitialWorldState(config), config);
    const second = simulateOneDay(createInitialWorldState(config), config);
    expect(first.output).toEqual(second.output);
    expect(first.nextState).toEqual(second.nextState);

    // Multi-day runs are deterministic too.
    const runA = runDays(createInitialWorldState(config), config, 10);
    const runB = runDays(createInitialWorldState(config), config, 10);
    expect(runA.outputs).toEqual(runB.outputs);
    expect(runA.finalState).toEqual(runB.finalState);
  });

  it('conserves inventory over 30 days: initial + received - sold = final, never negative', () => {
    const config = createDefaultSimConfig();
    const initial = createInitialWorldState(config);
    const { outputs, finalState } = runDays(initial, config, 30);

    for (const sku of config.skus) {
      const finalSku = finalState.skus.find((s) => s.skuCode === sku.skuCode)!;
      expect(finalSku.cumulativeUnitsReceived).toBeGreaterThanOrEqual(0);
      // Conservation identity, tracked entirely inside the engine state.
      expect(sku.initialInventory + finalSku.cumulativeUnitsReceived - finalSku.cumulativeUnitsSold).toBe(
        finalSku.fulfillable,
      );

      // Cross-check cumulative sales against the per-day outputs.
      const soldSum = outputs.reduce(
        (sum, day) => sum + (day.salesSummary.find((s) => s.skuCode === sku.skuCode)?.unitsSold ?? 0),
        0,
      );
      expect(soldSum).toBe(finalSku.cumulativeUnitsSold);

      // Stock is never negative on any day, and snapshots match balances.
      for (const day of outputs) {
        const snapshot = day.inventorySnapshots.find((s) => s.skuCode === sku.skuCode)!;
        const balance = day.inventoryBalances.find((s) => s.skuCode === sku.skuCode)!;
        expect(snapshot.fulfillable).toBeGreaterThanOrEqual(0);
        expect(snapshot.fulfillable).toBe(balance.fulfillableQuantity);
        expect(snapshot.inbound).toBe(balance.inboundQuantity);
      }
    }
  });

  it('keeps the funnel monotone: sessions >= addToCart >= checkout >= orders >= 0', () => {
    const config = createDefaultSimConfig();
    const { outputs } = runDays(createInitialWorldState(config), config, 30);
    for (const day of outputs) {
      for (const row of day.channelMetrics) {
        expect(row.sessions).toBeGreaterThanOrEqual(row.addToCart);
        expect(row.addToCart).toBeGreaterThanOrEqual(row.checkout);
        expect(row.checkout).toBeGreaterThanOrEqual(row.orders);
        expect(row.orders).toBeGreaterThanOrEqual(0);
      }
      // Funnel orders agree with the sales engine's channel split.
      for (const summary of day.salesSummary) {
        const amazon = day.channelMetrics.find(
          (r) => r.skuCode === summary.skuCode && r.channel === 'amazon',
        )!;
        const shopify = day.channelMetrics.find(
          (r) => r.skuCode === summary.skuCode && r.channel === 'shopify',
        )!;
        expect(amazon.orders).toBe(summary.amazonOrders);
        expect(shopify.orders).toBe(summary.shopifyOrders);
      }
    }
  });

  it('zeroes orders while stocked out and resumes after the replenishment lead time', () => {
    const base = createDefaultSimConfig();
    const config: SimConfig = {
      ...base,
      eventDailyProbability: 0,
      noiseAmplitude: 0,
      seasonAmplitude: 0,
      weekdayFactors: [1, 1, 1, 1, 1, 1, 1],
      skus: [
        {
          ...base.skus[0],
          baseDailySales: 10,
          initialInventory: 25,
          reorderPoint: 30,
          reorderQuantity: 50,
          leadTimeDays: 5,
        },
      ],
    };
    const { outputs, finalState } = runDays(createInitialWorldState(config, '2026-09-01', 7), config, 8);

    // Demand is exactly 11/day (base 10 × rating factor 1.052, rounded).
    // Day 0: 25→14 (reorder placed, arrives day 5). Day 1: 14→3.
    // Day 2: capped at 3 → 0. Days 3-4: stockout, 0 orders.
    // Day 5: 50 units arrive in the morning → orders resume.
    const soldByDay = outputs.map(
      (day) => day.salesSummary.find((s) => s.skuCode === 'MTH-WHITE-001')!.unitsSold,
    );
    expect(soldByDay).toEqual([11, 11, 3, 0, 0, 11, 11, 11]);

    // Stockout event fired once, replenishment received on day 5.
    const stockoutEvents = outputs.flatMap((day) =>
      day.events.filter((e) => e.code === 'STOCKOUT'),
    );
    expect(stockoutEvents).toHaveLength(1);
    const received = outputs.flatMap((day) =>
      day.events.filter((e) => e.code === 'REPLENISHMENT_RECEIVED'),
    );
    expect(received).toHaveLength(1);
    expect(finalState.skus[0].fulfillable).toBe(50 - 11 * 3);
    expect(finalState.skus[0].fulfillable).toBeGreaterThanOrEqual(0);
  });

  it('ACOS spike injection raises spend and drops ad conversion for that SKU', () => {
    const config = quietConfig();
    const baseline = simulateOneDay(createInitialWorldState(config), config);

    const spikedWorld = injectEvent(
      createInitialWorldState(config),
      'ACOS_SPIKE',
      'MTH-WHITE-001',
      5,
    );
    const spiked = simulateOneDay(spikedWorld, config);

    // The injected event surfaces as an ACTIVE SimulationEvent row.
    const spikeRows = spiked.output.events.filter((e) => e.code === 'ACOS_SPIKE');
    expect(spikeRows).toHaveLength(1);
    expect(spikeRows[0].status).toBe('ACTIVE');
    expect(spikeRows[0].skuCode).toBe('MTH-WHITE-001');

    // Sales are unaffected by an ACOS event (same orders in both runs).
    const baseSummary = baseline.output.salesSummary.find((s) => s.skuCode === 'MTH-WHITE-001')!;
    const spikeSummary = spiked.output.salesSummary.find((s) => s.skuCode === 'MTH-WHITE-001')!;
    expect(spikeSummary.amazonOrders).toBe(baseSummary.amazonOrders);

    const baseAd = baseline.output.adMetrics.find((m) => m.skuCode === 'MTH-WHITE-001')!;
    const spikeAd = spiked.output.adMetrics.find((m) => m.skuCode === 'MTH-WHITE-001')!;
    expect(spikeAd.spend).toBeGreaterThan(baseAd.spend);
    expect(spikeAd.orders / baseSummary.amazonOrders).toBeLessThan(
      baseAd.orders / baseSummary.amazonOrders,
    );
    // Other SKUs are untouched by a SKU-scoped event.
    const baseGreyAd = baseline.output.adMetrics.find((m) => m.skuCode === 'MTH-GREY-001')!;
    const spikeGreyAd = spiked.output.adMetrics.find((m) => m.skuCode === 'MTH-GREY-001')!;
    expect(spikeGreyAd).toEqual(baseGreyAd);
  });

  it('order amounts equal Σ(quantity × unitPrice) and numbers are SIM-{yyyymmdd}-{seq} unique per day', () => {
    const config = createDefaultSimConfig();
    const { outputs } = runDays(createInitialWorldState(config), config, 10);

    for (const day of outputs) {
      const expectedPrefix = `SIM-${day.simDate.replace(/-/g, '')}-`;
      const numbers = new Set<string>();
      for (const order of day.orders) {
        expect(order.orderNumber).toMatch(/^SIM-\d{8}-\d{4}$/);
        expect(order.orderNumber.startsWith(expectedPrefix)).toBe(true);
        expect(numbers.has(order.orderNumber)).toBe(false);
        numbers.add(order.orderNumber);

        const itemsTotal = order.items.reduce(
          (sum, item) => sum + item.quantity * item.unitPrice,
          0,
        );
        expect(order.totalAmount).toBe(roundMoney(itemsTotal));
      }
      // Order count matches the channel summary.
      const totalOrders = day.salesSummary.reduce(
        (sum, s) => sum + s.amazonOrders + s.shopifyOrders,
        0,
      );
      expect(day.orders).toHaveLength(totalOrders);
    }
  });

  it('negative review wave produces low-rating reviews carrying VOC keywords', () => {
    const base = quietConfig({ reviewProbability: 1 });
    const config: SimConfig = {
      ...base,
      skus: base.skus.map((sku) =>
        sku.skuCode === 'MTH-GREY-001' ? { ...sku, qualityScore: 0.1, rating: 2 } : sku,
      ),
    };
    const world = injectEvent(
      createInitialWorldState(config),
      'NEGATIVE_REVIEW_WAVE',
      'MTH-GREY-001',
      5,
    );
    const { output } = simulateOneDay(world, config);

    const greyReviews = output.reviews.filter((r) => r.skuCode === 'MTH-GREY-001');
    expect(greyReviews.length).toBeGreaterThan(0);
    const negatives = greyReviews.filter((r) => r.rating <= 2);
    expect(negatives.length).toBeGreaterThan(0);
    expect(
      negatives.some((r) =>
        ['孔太小', '假大理石', '崩边'].some((keyword) =>
          r.content.includes(keyword),
        ),
      ),
    ).toBe(true);
  });
});
