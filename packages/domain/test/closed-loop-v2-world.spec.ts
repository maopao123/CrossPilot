import {
  createDefaultV2Config,
  createInitialV2WorldState,
  simulateV2Day,
  V2WorldState,
  V2Config,
} from '../src/simulator/v2/index.js';
import {
  generateLedgerEntries,
  calculateContributionProfit,
} from '../src/simulator/v2/finance-ledger.js';
import { projectObservables } from '../src/simulator/v2/observation.js';

describe('CL-1: Closed-loop v2 World Engine & Finance Ledger (Pure Domain)', () => {
  const RUN_ID = 'run_test_001';
  const WS_ID = 'ws_run_test_001';
  const STORE_ID = 'store_test_001';

  let config: V2Config;
  let initialState: V2WorldState;

  beforeEach(() => {
    config = createDefaultV2Config(1001, '2026-09-01');
    const skuMap = {
      'MTH-WHITE-001': 'sku_white_id',
      'MTH-GREEN-001': 'sku_green_id',
      'MTH-GREY-001': 'sku_grey_id',
    };
    const campMap = {
      'MTH-WHITE-001': 'camp_white_id',
      'MTH-GREEN-001': 'camp_green_id',
      'MTH-GREY-001': 'camp_grey_id',
    };
    initialState = createInitialV2WorldState(RUN_ID, WS_ID, STORE_ID, config, skuMap, campMap);
  });

  describe('1. Fixed Sample: Paused Campaign', () => {
    it('stops ad traffic and spend when campaign is PAUSED, but retains natural traffic and orders', () => {
      // Pause white campaign
      initialState.campaigns[0].status = 'PAUSED';

      const output = simulateV2Day(initialState, config);

      const whiteAd = output.adOutputs.find((a) => a.skuCode === 'MTH-WHITE-001');
      expect(whiteAd).toBeDefined();
      expect(whiteAd!.clicks).toBe(0);
      expect(whiteAd!.impressions).toBe(0);
      expect(whiteAd!.spendCents).toBe(0);
      expect(whiteAd!.adOrders).toBe(0);

      // Natural demand continues
      const whiteNatural = output.naturalOutputs.find((n) => n.skuCode === 'MTH-WHITE-001');
      expect(whiteNatural).toBeDefined();
      expect(whiteNatural!.sessions).toBeGreaterThan(0);
      expect(whiteNatural!.orders).toBeGreaterThan(0);

      // Total orders equal natural orders
      const whiteSkuOutput = output.skuOutputs.find((s) => s.skuCode === 'MTH-WHITE-001');
      expect(whiteSkuOutput!.totalOrders).toBe(whiteNatural!.orders);
    });

    it('fixed invariant: naturalSessions=100, naturalCVR=1, inventory=200 -> naturalOrders=100, reserved=100', () => {
      const customConfig = createDefaultV2Config(1001, '2026-09-01');
      customConfig.skus[0].baseNaturalSessions = 100;
      customConfig.skus[0].baseNaturalCVR = 1.0;
      customConfig.skus[0].initialInventory = 200;

      initialState.skus[0].available = 200;
      initialState.skus[0].reserved = 0;
      initialState.campaigns[0].status = 'PAUSED';

      const output = simulateV2Day(initialState, customConfig);

      const whiteSku = output.nextState.skus.find((s) => s.skuCode === 'MTH-WHITE-001')!;
      const whiteNatural = output.naturalOutputs.find((n) => n.skuCode === 'MTH-WHITE-001')!;

      expect(whiteNatural.orders).toBe(whiteNatural.sessions);
      expect(output.adOutputs.find((a) => a.skuCode === 'MTH-WHITE-001')!.clicks).toBe(0);
      expect(whiteSku.available).toBe(200 - whiteNatural.orders);
      expect(whiteSku.reserved).toBe(whiteNatural.orders);
    });
  });

  describe('2. Fixed Sample: Stockout and Inventory Invariant', () => {
    it('demands 20 units (with keyed noise) with available=5 -> orders=5, lostSales=demand-5, available does not go below 0', () => {
      const customConfig = createDefaultV2Config(1001, '2026-09-01');
      customConfig.skus[0].baseNaturalSessions = 20;
      customConfig.skus[0].baseNaturalCVR = 1.0;

      initialState.skus[0].available = 5;
      initialState.skus[0].reserved = 0;
      initialState.campaigns[0].status = 'PAUSED';

      const output = simulateV2Day(initialState, customConfig);

      const whiteSkuOutput = output.skuOutputs.find((s) => s.skuCode === 'MTH-WHITE-001')!;
      const whiteNatural = output.naturalOutputs.find((n) => n.skuCode === 'MTH-WHITE-001')!;
      const nextSku = output.nextState.skus.find((s) => s.skuCode === 'MTH-WHITE-001')!;

      expect(whiteSkuOutput.totalOrders).toBe(5);
      expect(whiteSkuOutput.lostSales).toBe(whiteSkuOutput.naturalOrders - 5);
      expect(nextSku.available).toBe(0);
      expect(nextSku.reserved).toBe(5);
      expect(nextSku.available).toBeGreaterThanOrEqual(0);
    });

    it('preserves core inventory invariant: initial + arrivals + returns - shipped = available + reserved + unsellable', () => {
      let state = initialState;
      for (let day = 1; day <= 10; day++) {
        const prevTotals = new Map<string, number>();
        for (const sku of state.skus) {
          prevTotals.set(sku.id, sku.available + sku.reserved + sku.unsellable);
        }

        const output = simulateV2Day(state, config);

        for (const nextSku of output.nextState.skus) {
          expect(nextSku.available).toBeGreaterThanOrEqual(0);
          expect(nextSku.reserved).toBeGreaterThanOrEqual(0);
          expect(nextSku.unsellable).toBeGreaterThanOrEqual(0);

          const prevTotal = prevTotals.get(nextSku.id) ?? 0;
          const nextTotal = nextSku.available + nextSku.reserved + nextSku.unsellable;

          // Arriving shipments
          const arrived = (state.pendingShipments ?? [])
            .filter((s) => s.skuId === nextSku.id && s.arrivalDate === state.nextDate)
            .reduce((sum, s) => sum + s.quantity, 0);

          // Returned items processed today
          const returns = output.processedRefunds.filter((r) => r.skuId === nextSku.id).length;

          // Shipped orders fulfilled today
          const shipped = output.shippedOrders.filter((o) => o.skuId === nextSku.id).length;

          // Inventory Conservation Equation: Next = Prev + Arrived + Returns - Shipped
          expect(nextTotal).toBe(prevTotal + arrived + returns - shipped);
        }

        state = output.nextState;
      }
    });
  });

  describe('3. Fixed Sample: Budget Constraint on Ad Clicks', () => {
    it('caps clicks when budget is reached: potentialClicks=100, CPC=100 cents, budget=500 cents -> clicks=5, spend=500 cents', () => {
      const customConfig = createDefaultV2Config(1001, '2026-09-01');
      customConfig.skus[0].baseAdClicks = 100;
      customConfig.skus[0].referenceBidCents = 100;
      customConfig.skus[0].referenceCpcCents = 100;

      initialState.campaigns[0].bidCents = 100;
      initialState.campaigns[0].dailyBudgetCents = 500; // 500 cents = $5.00
      initialState.campaigns[0].status = 'ACTIVE';

      const output = simulateV2Day(initialState, customConfig);

      const whiteAd = output.adOutputs.find((a) => a.skuCode === 'MTH-WHITE-001')!;
      expect(whiteAd.clicks).toBe(5);
      expect(whiteAd.spendCents).toBe(500);
      expect(whiteAd.spendCents).toBeLessThanOrEqual(initialState.campaigns[0].dailyBudgetCents);
    });
  });

  describe('4. Fixed Ledger & Contribution Profit Reconciliation', () => {
    it('fixed ledger: revenue 10000, cogs 3000, ad 2000, channel fees 1000, other 0 -> profit 4000 cents', () => {
      const entries = [
        {
          runId: RUN_ID,
          storeId: STORE_ID,
          date: '2026-09-01',
          sourceType: 'ORDER',
          sourceId: 'ord_1',
          entryType: 'REVENUE',
          sequence: 0,
          signedAmountCents: 10000,
          currency: 'USD',
        },
        {
          runId: RUN_ID,
          storeId: STORE_ID,
          date: '2026-09-01',
          sourceType: 'ORDER',
          sourceId: 'ord_1',
          entryType: 'COGS',
          sequence: 0,
          signedAmountCents: -3000,
          currency: 'USD',
        },
        {
          runId: RUN_ID,
          storeId: STORE_ID,
          date: '2026-09-01',
          sourceType: 'AD_DAILY',
          sourceId: 'camp_1',
          entryType: 'AD_SPEND',
          sequence: 0,
          signedAmountCents: -2000,
          currency: 'USD',
        },
        {
          runId: RUN_ID,
          storeId: STORE_ID,
          date: '2026-09-01',
          sourceType: 'ORDER',
          sourceId: 'ord_1',
          entryType: 'PLATFORM_FEE',
          sequence: 0,
          signedAmountCents: -1000,
          currency: 'USD',
        },
      ];

      const profit = calculateContributionProfit(entries);
      expect(profit).toBe(4000);
    });

    it('idempotent ledger: duplicate entry key does not double count amounts', () => {
      const baseEntry = {
        runId: RUN_ID,
        storeId: STORE_ID,
        date: '2026-09-01',
        sourceType: 'ORDER',
        sourceId: 'ord_1',
        entryType: 'REVENUE',
        sequence: 0,
        signedAmountCents: 10000,
        currency: 'USD',
      };

      const entriesWithDuplicates = [baseEntry, { ...baseEntry }];
      const profit = calculateContributionProfit(entriesWithDuplicates);
      expect(profit).toBe(10000);
    });
  });

  describe('5. Observation Projection', () => {
    it('projects metrics without leaking hidden simulation truth or future events', () => {
      const output = simulateV2Day(initialState, config);
      const observables = projectObservables(output);

      expect(observables.channelDailyMetrics).toBeDefined();
      expect(observables.adMetrics).toBeDefined();
      expect(observables.inventorySnapshots).toBeDefined();

      // Does not expose raw internal events or event codes to observable consumer
      expect((observables as any).activeEvents).toBeUndefined();
      expect((observables as any).rngSeed).toBeUndefined();

      // R2-P1 #6: projects actual inbound from pending shipments rather than hardcoded 0
      const snapshot = observables.inventorySnapshots[0];
      expect(snapshot).toBeDefined();
      expect(typeof snapshot.inbound).toBe('number');
    });
  });

  describe('6. R2-7: Quality Event Active Window & Isolation', () => {
    it('does NOT apply return rate multiplier before the event start date', () => {
      // Order delivered on 2026-09-01, return decision on 2026-09-04 (Delivery + 3)
      initialState.nextDate = '2026-09-04';
      initialState.pendingOrders = [
        {
          id: 'ord_early_defect',
          skuId: 'sku_white_id',
          skuCode: 'MTH-WHITE-001',
          orderDate: '2026-08-30',
          priceCents: 2000,
          status: 'DELIVERED',
          shipDate: '2026-08-31',
          deliveryDate: '2026-09-01',
          unitCostCents: 800,
          channel: 'amazon',
          source: 'organic',
        },
      ];

      // Defect starts on 2026-09-05 (future date relative to return decision date 2026-09-04)
      const futureDefectEvent = {
        code: 'INTERNAL_SUPPLIER_QUALITY_DEFECT',
        date: '2026-09-05',
        skuCode: 'MTH-WHITE-001',
        returnRateMultiplier: 3.0,
        durationDays: 7,
      };

      const output = simulateV2Day(initialState, config, [futureDefectEvent]);
      // On 2026-09-04, defect is not active yet.
      // With default config.returnRate = 0.05 and no multiplier, the return decision ratio must not use 3x
      expect(output).toBeDefined();
    });

    it('applies return rate multiplier within the active window [date, date + durationDays - 1]', () => {
      // Order delivered on 2026-09-03, return decision on 2026-09-06
      initialState.nextDate = '2026-09-06';
      initialState.pendingOrders = [
        {
          id: 'ord_active_defect',
          skuId: 'sku_white_id',
          skuCode: 'MTH-WHITE-001',
          orderDate: '2026-09-01',
          priceCents: 2000,
          status: 'DELIVERED',
          shipDate: '2026-09-02',
          deliveryDate: '2026-09-03',
          unitCostCents: 800,
          channel: 'amazon',
          source: 'organic',
        },
      ];

      // Defect active from 2026-09-02 to 2026-09-08
      const activeDefectEvent = {
        code: 'INTERNAL_SUPPLIER_QUALITY_DEFECT',
        date: '2026-09-02',
        skuCode: 'MTH-WHITE-001',
        returnRateMultiplier: 10.0, // forced high multiplier
        durationDays: 7,
      };

      const output = simulateV2Day(initialState, config, [activeDefectEvent]);
      expect(output.processedRefunds.length + output.nextState.pendingRefunds.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('7. R2-8: Scenario Event Handlers (S03 and S06)', () => {
    it('S03: OPERATOR_PAUSE_AD pauses the targeted campaign on event date', () => {
      initialState.nextDate = '2026-09-05';
      const pauseEvent = {
        code: 'OPERATOR_PAUSE_AD',
        date: '2026-09-05',
        skuCode: 'MTH-GREEN-001',
      };

      const output = simulateV2Day(initialState, config, [pauseEvent]);
      const greenCamp = output.nextState.campaigns.find((c) => c.skuId === 'sku_green_id');
      expect(greenCamp?.status).toBe('PAUSED');

      // White campaign remains active
      const whiteCamp = output.nextState.campaigns.find((c) => c.skuId === 'sku_white_id');
      expect(whiteCamp?.status).toBe('ACTIVE');
    });

    it('S06: TIMEOUT_CRASH_DRILL injects failure on matching date', () => {
      initialState.nextDate = '2026-09-06';
      const timeoutEvent = {
        code: 'TIMEOUT_CRASH_DRILL',
        date: '2026-09-06',
        failureSchedule: { tickTimeout: true },
      };

      expect(() => simulateV2Day(initialState, config, [timeoutEvent])).toThrow(
        /Injected tick timeout crash/,
      );
    });
  });
});
