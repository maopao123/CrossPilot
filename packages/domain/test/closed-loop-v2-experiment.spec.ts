import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  computeManifestHash,
  calculatePairwiseDeltas,
  computeBootstrapStats,
  runDeterministicSimulation,
  SimulationExperimentManifest,
  createDefaultV2Config,
  createInitialV2WorldState,
  simulateV2Day,
} from '../src/simulator/v2/index.js';

describe('CL-4: Closed-loop v2 Three-Group Experiment & Replay Consistency', () => {
  let manifest: SimulationExperimentManifest;

  beforeAll(() => {
    const fixturePath = resolve(__dirname, 'fixtures/closed-loop-v2-scenarios.json');
    const content = readFileSync(fixturePath, 'utf-8');
    manifest = JSON.parse(content);
  });

  describe('1. Manifest & Scenario Partition', () => {
    it('contains S01 to S10, seeds 1001 to 1010, with train and held-out partitions', () => {
      expect(manifest.seeds).toEqual([1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010]);
      expect(manifest.scenarios.length).toBe(10);

      const trainScenarios = manifest.scenarios.filter((s) => s.partition === 'train');
      const heldOutScenarios = manifest.scenarios.filter((s) => s.partition === 'held-out');

      expect(trainScenarios.length).toBe(6);
      expect(trainScenarios.map((s) => s.id)).toEqual(['S01', 'S02', 'S03', 'S04', 'S05', 'S06']);

      expect(heldOutScenarios.length).toBe(4);
      expect(heldOutScenarios.map((s) => s.id)).toEqual(['S07', 'S08', 'S09', 'S10']);
    });

    it('computes a stable SHA-256 manifest hash', () => {
      const hash1 = computeManifestHash(manifest);
      const hash2 = computeManifestHash(manifest);
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('2. Truthful Paired Profit Reporting & Edge Cases', () => {
    it('negative delta: CrossPilot profit 80 vs Control 100 -> delta -20, relative -20%', () => {
      const { absoluteDeltaCents, relativeDeltaPct } = calculatePairwiseDeltas(8000, 10000);
      expect(absoluteDeltaCents).toBe(-2000);
      expect(relativeDeltaPct).toBe(-0.2);
    });

    it('positive delta: CrossPilot profit 120 vs Control 100 -> delta +20, relative +20%', () => {
      const { absoluteDeltaCents, relativeDeltaPct } = calculatePairwiseDeltas(12000, 10000);
      expect(absoluteDeltaCents).toBe(2000);
      expect(relativeDeltaPct).toBe(0.2);
    });

    it('zero baseline: Control profit 0 -> relative delta is null, absolute delta is accurate', () => {
      const { absoluteDeltaCents, relativeDeltaPct } = calculatePairwiseDeltas(5000, 0);
      expect(absoluteDeltaCents).toBe(5000);
      expect(relativeDeltaPct).toBeNull();
    });

    it('negative baseline: Control profit -100 -> relative delta is null', () => {
      const { absoluteDeltaCents, relativeDeltaPct } = calculatePairwiseDeltas(2000, -10000);
      expect(absoluteDeltaCents).toBe(12000);
      expect(relativeDeltaPct).toBeNull();
    });
  });

  describe('3. Bootstrap Confidence Interval (95%)', () => {
    it('computes mean, median, min, max and 95% CI over paired seed deltas', () => {
      const seedDeltas = [150, 180, -50, 220, 190, 140, 210, -80, 160, 200];
      const stats = computeBootstrapStats(seedDeltas, 1000, 1001);

      expect(stats.mean).toBe(132);
      expect(stats.median).toBe(170);
      expect(stats.min).toBe(-80);
      expect(stats.max).toBe(220);
      expect(stats.ciLower95).toBe(64);
      expect(stats.ciUpper95).toBe(189);
    });
  });

  describe('4. External Demand Consistency Across Intervention Branches', () => {
    it('actions in experimental group do not drift natural demand or external events for the same date/SKU', () => {
      const config = createDefaultV2Config(1001, '2026-09-01');
      const stateControl = createInitialV2WorldState(
        'run_ctrl',
        'ws_ctrl',
        'store_ctrl',
        config,
        { 'MTH-WHITE-001': 'sku_w', 'MTH-GREEN-001': 'sku_g', 'MTH-GREY-001': 'sku_gr' },
        { 'MTH-WHITE-001': 'cmp_w', 'MTH-GREEN-001': 'cmp_g', 'MTH-GREY-001': 'cmp_gr' },
      );

      // Branch with active intervention: lower bid on White SKU
      const stateIntervention = JSON.parse(JSON.stringify(stateControl));
      stateIntervention.runId = 'run_exp';
      stateIntervention.campaigns.find((c: any) => c.id === 'cmp_w').bidCents = 60; // 50% bid drop

      const externalEvents = [{ code: 'TEST_EVENT', date: '2026-09-01', demandMultiplier: 1.3 }];

      const outCtrl = simulateV2Day(stateControl, config, externalEvents);
      const outExp = simulateV2Day(stateIntervention, config, externalEvents);

      // 1. Natural sessions and orders for the intervened SKU must be identical (demand not drifted)
      const ctrlWhiteNat = outCtrl.naturalOutputs.find((n) => n.skuCode === 'MTH-WHITE-001')!;
      const expWhiteNat = outExp.naturalOutputs.find((n) => n.skuCode === 'MTH-WHITE-001')!;
      expect(ctrlWhiteNat.sessions).toBe(expWhiteNat.sessions);
      expect(ctrlWhiteNat.orders).toBe(expWhiteNat.orders);

      // 2. Unaffected SKU (Green) metrics must be 100% identical in both runs
      const ctrlGreenSku = outCtrl.skuOutputs.find((s) => s.skuCode === 'MTH-GREEN-001')!;
      const expGreenSku = outExp.skuOutputs.find((s) => s.skuCode === 'MTH-GREEN-001')!;
      expect(ctrlGreenSku).toEqual(expGreenSku);

      // 3. Ad clicks on intervened SKU must drop due to lower bid
      const ctrlWhiteAd = outCtrl.adOutputs.find((a) => a.skuCode === 'MTH-WHITE-001')!;
      const expWhiteAd = outExp.adOutputs.find((a) => a.skuCode === 'MTH-WHITE-001')!;
      expect(expWhiteAd.clicks).toBeLessThan(ctrlWhiteAd.clicks);
    });
  });

  describe('5. Deterministic Replay Consistency', () => {
    it('two runs with identical seeds, configs, events and action scripts yield identical daily hashes and state hash', () => {
      const config = createDefaultV2Config(1005, '2026-09-01');
      const createInit = () =>
        createInitialV2WorldState(
          'run_replay',
          'ws_replay',
          'store_replay',
          config,
          { 'MTH-WHITE-001': 'sku_w', 'MTH-GREEN-001': 'sku_g', 'MTH-GREY-001': 'sku_gr' },
          { 'MTH-WHITE-001': 'cmp_w', 'MTH-GREEN-001': 'cmp_g', 'MTH-GREY-001': 'cmp_gr' },
        );

      const actionScript = [
        {
          day: 3,
          action: (s: any) => {
            const cmp = s.campaigns.find((c: any) => c.skuId === 'sku_w');
            if (cmp) cmp.bidCents = Math.round(cmp.bidCents * 0.8);
          },
        },
      ];

      const run1 = runDeterministicSimulation({
        seed: 1005,
        config,
        initialState: createInit(),
        externalEvents: [],
        days: 7,
        actionScript,
      });

      const run2 = runDeterministicSimulation({
        seed: 1005,
        config,
        initialState: createInit(),
        externalEvents: [],
        days: 7,
        actionScript,
      });

      expect(run1.dailyHashes.length).toBe(7);
      expect(run1.dailyHashes).toEqual(run2.dailyHashes);
      expect(run1.finalStateHash).toBe(run2.finalStateHash);
      expect(run1.totalProfitCents).toBe(run2.totalProfitCents);
    });
  });
});
