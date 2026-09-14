import {
  createDefaultV2Config,
  createInitialV2WorldState,
} from '@crosspilot/domain';
import {
  advanceClosedLoopRun,
  runClosedLoopV2Sweep,
} from '../src/processors/closed-loop-v2.processor';

function createMockPrismaForRunner(initialRun: any) {
  let runState = { ...initialRun };
  const ticks: any[] = [];
  const ledgerEntries: any[] = [];
  const profitDailies: any[] = [];
  const adMetrics: any[] = [];
  const receipts: any[] = [];
  const agentTasks: any[] = [];
  const actionOutcomes: any[] = [];

  const mockClient: any = {
    simulationRun: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        if (where.id === runState.id) {
          return { ...runState };
        }
        return null;
      }),
      findFirst: jest.fn(async ({ where }: { where: any }) => {
        if (where?.runWorkspaceId === runState.runWorkspaceId) {
          return { ...runState };
        }
        return null;
      }),
      findMany: jest.fn(async ({ where }: { where?: any } = {}) => {
        if (!where || where.status === runState.status) {
          return [{ id: runState.id, status: runState.status }];
        }
        return [];
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
        let nextVersion = runState.stateVersion;
        if (data.stateVersion && typeof data.stateVersion === 'object' && data.stateVersion.increment) {
          nextVersion = (runState.stateVersion || 0) + data.stateVersion.increment;
        } else if (data.stateVersion !== undefined) {
          nextVersion = data.stateVersion;
        }
        runState = { ...runState, ...data, stateVersion: nextVersion };
        return { ...runState };
      }),
      updateMany: jest.fn(async ({ where, data }: { where: any; data: any }) => {
        if (where.id === runState.id) {
          if (where.stateVersion !== undefined && where.stateVersion !== runState.stateVersion) {
            return { count: 0 };
          }
          let nextVersion = runState.stateVersion;
          if (data.stateVersion && typeof data.stateVersion === 'object' && data.stateVersion.increment) {
            nextVersion = (runState.stateVersion || 0) + data.stateVersion.increment;
          } else if (data.stateVersion !== undefined) {
            nextVersion = data.stateVersion;
          }
          runState = { ...runState, ...data, stateVersion: nextVersion };
          return { count: 1 };
        }
        return { count: 0 };
      }),
    },
    plannedAction: {
      create: jest.fn(async ({ data }: any) => {
        return { id: data.id || `act_${Date.now()}`, ...data };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        return { id: where.id, ...data };
      }),
    },
    actionExecution: {
      create: jest.fn(async ({ data }: any) => {
        return { id: `exec_${Date.now()}`, ...data };
      }),
    },
    simulationTick: {
      findFirst: jest.fn(async ({ where }: { where: any }) => {
        const targetDateStr =
          where.date instanceof Date
            ? where.date.toISOString().split('T')[0]
            : String(where.date).split('T')[0];
        const match = ticks.find(
          (t) =>
            t.runId === where.runId &&
            (t.date instanceof Date ? t.date.toISOString().split('T')[0] : String(t.date).split('T')[0]) === targetDateStr,
        );
        return match ?? null;
      }),
      create: jest.fn(async ({ data }: { data: any }) => {
        ticks.push({ ...data, id: `tick_${ticks.length + 1}` });
        return { ...data, id: `tick_${ticks.length}` };
      }),
      findMany: jest.fn(async () => [...ticks]),
    },
    simulationLedgerEntry: {
      createMany: jest.fn(async ({ data }: { data: any[] }) => {
        ledgerEntries.push(...data);
        return { count: data.length };
      }),
      findMany: jest.fn(async () => [...ledgerEntries]),
    },
    financeLedgerEntry: {
      createMany: jest.fn(async ({ data }: { data: any[] }) => {
        ledgerEntries.push(...data);
        return { count: data.length };
      }),
      findMany: jest.fn(async () => [...ledgerEntries]),
    },
    profitDaily: {
      create: jest.fn(async ({ data }: any) => {
        profitDailies.push(data);
        return data;
      }),
      upsert: jest.fn(async ({ create, update }: any) => {
        const item = { ...create, ...update };
        profitDailies.push(item);
        return item;
      }),
      findMany: jest.fn(async () => [...profitDailies]),
    },
    channelDailyMetric: {
      createMany: jest.fn(async ({ data }: any) => ({ count: data.length })),
    },
    adMetricDaily: {
      createMany: jest.fn(async ({ data }: any) => ({ count: data.length })),
      upsert: jest.fn(async ({ create, update }: any) => {
        const item = { ...create, ...update };
        adMetrics.push(item);
        return item;
      }),
      findMany: jest.fn(async () => [
        { clicks: 150, spend: 90, sales: 120 }, // acos = 0.75 > 0.40, clicks >= 100
      ]),
    },
    inventorySnapshot: {
      createMany: jest.fn(async ({ data }: any) => ({ count: data.length })),
    },
    inventoryBalance: {
      upsert: jest.fn(async ({ create, update }: any) => ({ ...create, ...update })),
    },
    simulationExecutionReceipt: {
      create: jest.fn(async ({ data }: any) => {
        receipts.push({ ...data, id: `rcpt_${receipts.length + 1}` });
        return { ...data, id: `rcpt_${receipts.length}` };
      }),
      findMany: jest.fn(async () => [...receipts]),
    },
    workspaceMember: {
      findFirst: jest.fn(async () => ({
        id: 'mem_1',
        userId: 'usr_test',
        workspaceId: 'ws_control',
      })),
    },
    order: {
      create: jest.fn(async ({ data }: any) => ({ id: `ord_${Date.now()}`, ...data })),
    },
    orderItem: {
      create: jest.fn(async ({ data }: any) => ({ id: `item_${Date.now()}`, ...data })),
    },
    fbaInventory: {
      update: jest.fn(async ({ data }: any) => ({ id: 'fba_1', ...data })),
    },
    fbaShipment: {
      update: jest.fn(async ({ data }: any) => ({ id: 'ship_1', ...data })),
    },
    fbaInventoryLedger: {
      create: jest.fn(async ({ data }: any) => ({ id: 'fbaledger_1', ...data })),
    },
    actionOutcome: {
      findMany: jest.fn(async () => actionOutcomes),
    },
    agentTask: {
      findMany: jest.fn(async () => agentTasks),
      update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
    },
    $transaction: jest.fn(async (cb: any) => {
      return await cb(mockClient);
    }),
  };

  return {
    mockClient,
    getRunState: () => runState,
    setRunState: (patch: any) => {
      runState = { ...runState, ...patch };
    },
    ticks,
    ledgerEntries,
    profitDailies,
    receipts,
  };
}

function buildInitialRun(runId: string, seed: number = 1001, policyEnabled: boolean = false) {
  const config = createDefaultV2Config(seed, '2026-09-01');
  const worldState = createInitialV2WorldState(
    runId,
    'ws_run',
    'store_test',
    config,
    { 'MTH-WHITE-001': 'sku_w', 'MTH-GREEN-001': 'sku_g', 'MTH-GREY-001': 'sku_gr' },
    { 'MTH-WHITE-001': 'cmp_w', 'MTH-GREEN-001': 'cmp_g', 'MTH-GREY-001': 'cmp_gr' },
  );

  return {
    id: runId,
    controlWorkspaceId: 'ws_control',
    runWorkspaceId: 'ws_run',
    storeId: 'store_test',
    modelVersion: 'closed-loop-v2',
    configHash: 'hash_1001',
    seed,
    status: 'RUNNING',
    completedThrough: null,
    stateVersion: 1,
    stateSnapshot: worldState,
    config,
    policyEnabled,
    policyLimits: {
      maxSingleBidChangePct: 0.20,
      maxCumulativeBidChangePct: 0.30,
      cooldownDays: 3,
      maxDailyActionsPerTarget: 3,
      min7DayClicks: 100,
      minBidUSD: 0.20,
    },
  };
}

describe('FIX-9: Closed-loop v2 Worker Runner Production Integration Spec', () => {
  it('directly imports advanceClosedLoopRun and advances 37 days sequentially with DB persistence', async () => {
    const initialRun = buildInitialRun('run_full_37', 1001, false);
    const mock = createMockPrismaForRunner(initialRun);

    const result = await advanceClosedLoopRun(mock.mockClient, 'run_full_37', { maxDays: 37 });

    expect(result.runId).toBe('run_full_37');
    expect(result.advancedDays).toBe(37);
    expect(result.completedThrough).toBe('2026-10-07');
    expect(result.status).toBe('RUNNING');

    // Verify DB records
    const completedStr =
      mock.getRunState().completedThrough instanceof Date
        ? mock.getRunState().completedThrough.toISOString().split('T')[0]
        : String(mock.getRunState().completedThrough).split('T')[0];
    expect(completedStr).toBe('2026-10-07');
    expect(mock.ticks.length).toBe(37);
    expect(mock.profitDailies.length).toBe(37 * 3); // 3 SKUs per day
    expect(mock.ledgerEntries.length).toBeGreaterThan(0);

    // Verify first and last tick dates
    const firstTickDate = mock.ticks[0].date.toISOString().split('T')[0];
    const lastTickDate = mock.ticks[36].date.toISOString().split('T')[0];
    expect(firstTickDate).toBe('2026-09-01');
    expect(lastTickDate).toBe('2026-10-07');
  });

  it('crash recovery: resuming after day 15 continues seamlessly from day 16 without double-ticking', async () => {
    const initialRun = buildInitialRun('run_crash_37', 1002, false);
    const mock = createMockPrismaForRunner(initialRun);

    // Phase 1: Advance 15 days, simulating crash/interruption
    const phase1 = await advanceClosedLoopRun(mock.mockClient, 'run_crash_37', { maxDays: 15 });
    expect(phase1.advancedDays).toBe(15);
    expect(phase1.completedThrough).toBe('2026-09-15');
    expect(mock.ticks.length).toBe(15);

    const phase1TickDates = mock.ticks.map((t) => t.date.toISOString().split('T')[0]);
    expect(phase1TickDates[14]).toBe('2026-09-15');

    // Phase 2: Resume with remaining 22 days (total 37)
    // Runner reads completedThrough ('2026-09-15') and begins strictly at 2026-09-16
    const phase2 = await advanceClosedLoopRun(mock.mockClient, 'run_crash_37', { maxDays: 22 });
    expect(phase2.advancedDays).toBe(22);
    expect(phase2.completedThrough).toBe('2026-10-07');

    // Verify overall ticks: exactly 37 distinct dates without double-accounting
    expect(mock.ticks.length).toBe(37);
    const allDates = mock.ticks.map((t) => t.date.toISOString().split('T')[0]);
    const uniqueDates = new Set(allDates);
    expect(uniqueDates.size).toBe(37);
    expect(allDates[15]).toBe('2026-09-16');
  });

  it('clean pause: stops execution at day boundary when run status is PAUSED', async () => {
    const initialRun = buildInitialRun('run_pause', 1003, false);
    const mock = createMockPrismaForRunner(initialRun);

    // Advance 5 days normally
    const step1 = await advanceClosedLoopRun(mock.mockClient, 'run_pause', { maxDays: 5 });
    expect(step1.advancedDays).toBe(5);
    expect(step1.completedThrough).toBe('2026-09-05');

    // Operator pauses the run
    mock.setRunState({ status: 'PAUSED' });

    // Calling advance on paused run stops immediately
    const step2 = await advanceClosedLoopRun(mock.mockClient, 'run_pause', { maxDays: 10 });
    expect(step2.advancedDays).toBe(0);
    expect(step2.status).toBe('PAUSED');
    expect(mock.ticks.length).toBe(5);
  });

  it('enforces autopilot policy guardrails and creates execution receipts with cooldown', async () => {
    const initialRun = buildInitialRun('run_policy', 1004, true);
    const mock = createMockPrismaForRunner(initialRun);

    // Advance 10 days with policyEnabled = true
    const result = await advanceClosedLoopRun(mock.mockClient, 'run_policy', { maxDays: 10 });
    expect(result.advancedDays).toBe(10);

    // Autopilot policy should have generated receipts for high acos campaigns
    expect(mock.receipts.length).toBeGreaterThan(0);
    const firstReceipt = mock.receipts[0];
    expect(firstReceipt.operationKind).toBe('APPLY');
    expect(firstReceipt.status).toBe('APPLIED');

    // If multiple actions occurred on the same campaign, cooldown of >= 3 days was respected
    const cmpActions = mock.receipts.filter((r) => r.actionId.includes('cmp_w'));
    if (cmpActions.length > 1) {
      for (let i = 1; i < cmpActions.length; i++) {
        const d1 = new Date(cmpActions[i - 1].appliedDate).getTime();
        const d2 = new Date(cmpActions[i].appliedDate).getTime();
        const diffDays = (d2 - d1) / (24 * 3600 * 1000);
        expect(diffDays).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('runClosedLoopV2Sweep advances all RUNNING runs by 1 day', async () => {
    const initialRun = buildInitialRun('run_sweep', 1005, false);
    const mock = createMockPrismaForRunner(initialRun);

    await runClosedLoopV2Sweep(mock.mockClient);

    expect(mock.ticks.length).toBe(1);
    const completedStr =
      mock.getRunState().completedThrough instanceof Date
        ? mock.getRunState().completedThrough.toISOString().split('T')[0]
        : String(mock.getRunState().completedThrough).split('T')[0];
    expect(completedStr).toBe('2026-09-01');
  });
});
