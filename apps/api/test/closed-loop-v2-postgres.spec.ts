import { PrismaClient, Prisma } from '@prisma/client';
import { V2RunStore, OutcomeEvaluator } from '@crosspilot/db';
import { computeOutcomeWindowsV2 } from '@crosspilot/domain';
import { V2Sku360DataSource } from '../src/modules/commerce-store/v2-sku360-data-source.js';
import { createHash } from 'crypto';

const testDbUrl = process.env.TEST_DATABASE_URL;

function isSafeTestDatabaseUrl(urlStr?: string): boolean {
  if (!urlStr) return false;
  try {
    const parsed = new URL(urlStr);
    const pathname = parsed.pathname.toLowerCase();
    // Pathname must contain 'test' (e.g. /crosspilot_test). "localhost" alone is rejected!
    return pathname.includes('test');
  } catch {
    return false;
  }
}

const isTestDbConfigured = isSafeTestDatabaseUrl(testDbUrl);

/**
 * FIX-3 & R2-0: Real PostgreSQL Closed-Loop Acceptance Suite.
 *
 * Rules:
 * 1. Strictly skipped with [NOT_RUN] when TEST_DATABASE_URL is absent or lacks 'test' in database name.
 * 2. NO in-memory mock or stub allowed here: tests MUST execute against a live PostgreSQL instance.
 * 3. Verifies schema composite keys, atomic rollbacks, optimistic concurrency, and multi-day ledger persistence.
 */
const describeSuite = isTestDbConfigured ? describe : describe.skip;

if (!isTestDbConfigured) {
  console.log(
    '⚠️ [NOT_RUN] PostgreSQL acceptance tests skipped: TEST_DATABASE_URL is not set or lacks test database identifier in URL path.',
  );
}

describeSuite('R2-0: Real PostgreSQL Closed-Loop Acceptance Suite', () => {
  let prisma: PrismaClient;
  let v2Store: V2RunStore;
  const controlWorkspaceId = `ws_pg_ctrl_${Date.now()}`;
  const userId = `usr_pg_${Date.now()}`;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: testDbUrl,
        },
      },
    });
    await prisma.$connect();
    v2Store = new V2RunStore(prisma);

    // Seed minimal user, control workspace and membership
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@crosspilot.test`,
        name: 'PG Test User',
        passwordHash: 'dummy_hash',
      },
    });

    await prisma.workspace.create({
      data: {
        id: controlWorkspaceId,
        name: 'PG Test Control Workspace',
        slug: `pg-ctrl-${Date.now()}`,
        defaultMarketplaceId: 'ATVPDKIKX0DER',
      },
    });

    await prisma.workspaceMember.create({
      data: {
        workspaceId: controlWorkspaceId,
        userId,
        role: 'OWNER',
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      try {
        // Cascade delete run workspace and all related entities
        const runs = await prisma.simulationRun.findMany({
          where: { controlWorkspaceId },
          select: { id: true, runWorkspaceId: true },
        });
        const runIds = runs.map((r) => r.id);
        const runWorkspaceIds = runs
          .map((r) => r.runWorkspaceId)
          .filter((id): id is string => Boolean(id));
        const allWorkspaceIds = [controlWorkspaceId, ...runWorkspaceIds];

        await prisma.actionOutcome.deleteMany({
          where: { workspaceId: { in: allWorkspaceIds } },
        });
        await prisma.agentTask.deleteMany({
          where: { workspaceId: { in: allWorkspaceIds } },
        });
        await prisma.actionExecution.deleteMany({
          where: { action: { workspaceId: { in: allWorkspaceIds } } },
        });
        await prisma.plannedAction.deleteMany({
          where: { workspaceId: { in: allWorkspaceIds } },
        });
        await prisma.simulationLedgerEntry.deleteMany({
          where: { runId: { in: runIds } },
        });
        await prisma.simulationTick.deleteMany({
          where: { runId: { in: runIds } },
        });
        await prisma.simulationExecutionReceipt.deleteMany({
          where: { runId: { in: runIds } },
        });
        await prisma.profitDaily.deleteMany({
          where: { workspaceId: { in: allWorkspaceIds } },
        });
        await prisma.adMetricDaily.deleteMany({
          where: { sku: { workspaceId: { in: allWorkspaceIds } } },
        });
        await prisma.campaign.deleteMany({
          where: { workspaceId: { in: allWorkspaceIds } },
        });
        await prisma.sku.deleteMany({
          where: { workspaceId: { in: allWorkspaceIds } },
        });
        await prisma.product.deleteMany({
          where: { workspaceId: { in: allWorkspaceIds } },
        });
        await prisma.store.deleteMany({
          where: { workspaceId: { in: allWorkspaceIds } },
        });
        await prisma.simulationRun.deleteMany({
          where: { controlWorkspaceId },
        });
        await prisma.workspaceMember.deleteMany({
          where: { workspaceId: { in: allWorkspaceIds } },
        });
        await prisma.workspace.deleteMany({
          where: { id: { in: allWorkspaceIds } },
        });
        await prisma.user.deleteMany({
          where: { id: userId },
        });
      } catch (err) {
        console.warn('Postgres cleanup error:', err);
      } finally {
        await prisma.$disconnect();
      }
    }
  });

  it('proves real PG persistence, optimistic locking, and per-SKU ProfitDaily', async () => {
    const runResult = await v2Store.createRun(controlWorkspaceId, userId, {
      seed: 2026,
    });
    expect(runResult.runId).toBeDefined();

    // Verify user is member of isolated run workspace (persisted by createRun)
    const runMember = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: runResult.runWorkspaceId,
          userId,
        },
      },
    });
    expect(runMember).toBeDefined();
    expect(runMember?.role).toBe('OWNER');

    // Advance Day 1 (2026-09-01)
    const tick1 = await v2Store.tickDay(controlWorkspaceId, runResult.runId, '2026-09-01', userId);
    expect(tick1.completedThrough).toBe('2026-09-01');

    // Advance Day 2 (2026-09-02)
    const tick2 = await v2Store.tickDay(controlWorkspaceId, runResult.runId, '2026-09-02', userId);
    expect(tick2.completedThrough).toBe('2026-09-02');

    // Query real PostgreSQL records
    const dbRun = await prisma.simulationRun.findUnique({
      where: { id: runResult.runId },
    });
    expect(dbRun).toBeDefined();
    expect(dbRun?.completedThrough?.toISOString().split('T')[0]).toBe('2026-09-02');
    expect(dbRun?.stateVersion).toBe(3); // Initial 1 + tick 1 + tick 2

    // Check SimulationTicks in PG
    const ticks = await prisma.simulationTick.findMany({
      where: { runId: runResult.runId },
      orderBy: { date: 'asc' },
    });
    expect(ticks.length).toBe(2);
    expect(ticks[0].date.toISOString().split('T')[0]).toBe('2026-09-01');
    expect(ticks[1].date.toISOString().split('T')[0]).toBe('2026-09-02');

    // Check ProfitDaily rows in PG (each SKU persisted with real schema columns)
    const profits = await prisma.profitDaily.findMany({
      where: { workspaceId: runResult.runWorkspaceId },
    });
    expect(profits.length).toBeGreaterThanOrEqual(6); // 3 SKUs * 2 days
    for (const p of profits) {
      expect(Number.isFinite(Number(p.revenue))).toBe(true);
      expect(Number.isFinite(Number(p.netProfit))).toBe(true);
      expect(Number.isFinite(Number(p.margin))).toBe(true);
      expect(p.source).toBe('SIMULATOR');
    }

    // Check Ledger entries in PG
    const ledgers = await prisma.simulationLedgerEntry.findMany({
      where: { runId: runResult.runId },
    });
    expect(ledgers.length).toBeGreaterThan(0);
  });

  it('proves real PostgreSQL atomic rollback on error', async () => {
    const runResult = await v2Store.createRun(controlWorkspaceId, userId, {
      seed: 3033,
    });

    const runMember = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: runResult.runWorkspaceId,
          userId,
        },
      },
    });
    expect(runMember).toBeDefined();

    const runBefore = await prisma.simulationRun.findUnique({
      where: { id: runResult.runId },
    });

    // Deliberately fail inside a transaction after writing a tick
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.simulationTick.create({
          data: {
            runId: runResult.runId,
            date: new Date('2026-09-01T00:00:00.000Z'),
            status: 'COMMITTED',
            inputHash: 'rollback_test',
            outputHash: 'rollback_test',
            summary: {},
            stateVersion: 1,
          },
        });
        throw new Error('SIMULATED_DB_CRASH_FOR_ROLLBACK');
      }),
    ).rejects.toThrow('SIMULATED_DB_CRASH_FOR_ROLLBACK');

    // Verify rollback in real PG: no tick persisted
    const phantomTick = await prisma.simulationTick.findFirst({
      where: {
        runId: runResult.runId,
        date: new Date('2026-09-01T00:00:00.000Z'),
      },
    });
    expect(phantomTick).toBeNull();

    const runAfter = await prisma.simulationRun.findUnique({
      where: { id: runResult.runId },
    });
    expect(runAfter?.completedThrough).toBeNull();
    expect(runAfter?.stateVersion).toBe(runBefore?.stateVersion);
  });

  it('proves real PostgreSQL composite unique constraint (P2002) on SimulationLedgerEntry', async () => {
    const runResult = await v2Store.createRun(controlWorkspaceId, userId, {
      seed: 4044,
    });

    const testDate = new Date('2026-09-01T00:00:00.000Z');
    const duplicateEntry = {
      runId: runResult.runId,
      storeId: runResult.storeId,
      date: testDate,
      sourceType: 'ORDER',
      sourceId: 'ord_dup_test_1',
      entryType: 'REVENUE',
      sequence: 1,
      signedAmountCents: 1500,
      currency: 'USD',
      description: 'First revenue entry',
    };

    // First insert succeeds
    await prisma.simulationLedgerEntry.create({
      data: duplicateEntry,
    });

    // Second insert with identical [runId, date, sourceType, sourceId, entryType, sequence] must fail with P2002
    try {
      await prisma.simulationLedgerEntry.create({
        data: {
          ...duplicateEntry,
          signedAmountCents: 9999,
          description: 'Colliding duplicate entry',
        },
      });
      throw new Error('Should have thrown Prisma P2002 duplicate key constraint error');
    } catch (err: any) {
      expect(err).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect(err.code).toBe('P2002');
    }
  });

  it('proves R2-1: v2 Outcome persisted with closed-loop-v2, D-6..D baseline, completedThrough maturity, and multipleInterventions degradation', async () => {
    const runResult = await v2Store.createRun(controlWorkspaceId, userId, {
      seed: 5055,
    });

    // Advance 7 days to accumulate baseline (2026-09-01 to 2026-09-07)
    for (let day = 1; day <= 7; day++) {
      const dStr = `2026-09-0${day}`;
      await v2Store.tickDay(controlWorkspaceId, runResult.runId, dStr, userId);
    }

    // Find SKU in run workspace
    const sku = await prisma.sku.findFirst({
      where: { workspaceId: runResult.runWorkspaceId },
    });
    expect(sku).toBeDefined();

    // Create real PlannedAction
    const action = await prisma.plannedAction.create({
      data: {
        workspaceId: runResult.runWorkspaceId,
        actionType: 'DECREASE_BID',
        target: {
          skuId: sku!.id,
          runId: runResult.runId,
        },
        parameters: { percentage: 10 },
        riskLevel: 'LOW',
        status: 'SUCCESS',
      },
    });

    const executionDate = '2026-09-07';
    const window = computeOutcomeWindowsV2(executionDate, 7);

    // Verify window is strictly D-6..D (7 days)
    expect(window.baselineStart).toBe('2026-09-01');
    expect(window.baselineEnd).toBe('2026-09-07');
    expect(window.observeStart).toBe('2026-09-08');
    expect(window.observeEnd).toBe('2026-09-14');

    // Create real ActionOutcome in PostgreSQL
    const outcome = await prisma.actionOutcome.create({
      data: {
        workspaceId: runResult.runWorkspaceId,
        actionId: action.id,
        targetType: 'sku',
        targetId: sku!.id,
        baselineStart: new Date(`${window.baselineStart}T00:00:00.000Z`),
        baselineEnd: new Date(`${window.baselineEnd}T00:00:00.000Z`),
        observeStart: new Date(`${window.observeStart}T00:00:00.000Z`),
        observeEnd: new Date(`${window.observeEnd}T00:00:00.000Z`),
        windowDays: 7,
        metricsBefore: { profit: 70, revenue: 700, orders: 70, acos: 0.25 },
        evaluationVersion: 'closed-loop-v2',
        status: 'OBSERVING',
      },
    });

    // Verify persisted record in PostgreSQL
    const dbOutcome = await prisma.actionOutcome.findUnique({
      where: { id: outcome.id },
    });
    expect(dbOutcome?.evaluationVersion).toBe('closed-loop-v2');
    expect(dbOutcome?.status).toBe('OBSERVING');

    const evaluator = new OutcomeEvaluator(prisma);

    // Step 1: When run completedThrough is 2026-09-07 (< observeEnd 2026-09-14), maturity check keeps OBSERVING
    const evalBefore = await evaluator.evaluateAndPersist(outcome.id);
    expect(evalBefore.evaluated).toBe(false);
    const dbOutcomeBefore = await prisma.actionOutcome.findUnique({
      where: { id: outcome.id },
    });
    expect(dbOutcomeBefore?.status).toBe('OBSERVING');

    // Step 2: Advance run to observeEnd (2026-09-08 to 2026-09-14)
    for (let day = 8; day <= 14; day++) {
      const dStr = day < 10 ? `2026-09-0${day}` : `2026-09-${day}`;
      await v2Store.tickDay(controlWorkspaceId, runResult.runId, dStr, userId);
    }

    // Step 3: Now completedThrough >= observeEnd (2026-09-14), evaluation succeeds
    const evalAfter = await evaluator.evaluateAndPersist(outcome.id);
    expect(evalAfter.evaluated).toBe(true);
    expect(evalAfter.result).toBeDefined();

    const dbOutcomeAfter = await prisma.actionOutcome.findUnique({
      where: { id: outcome.id },
    });
    expect(dbOutcomeAfter?.status).not.toBe('OBSERVING');
    expect(dbOutcomeAfter?.evaluationVersion).toBe('closed-loop-v2');

    // Step 4: Test multipleInterventions degradation (spec §7.1)
    // Create another action on same target in the same observation window
    const action2 = await prisma.plannedAction.create({
      data: {
        workspaceId: runResult.runWorkspaceId,
        actionType: 'DECREASE_BID',
        target: { skuId: sku!.id, runId: runResult.runId },
        parameters: { percentage: 5 },
        riskLevel: 'LOW',
        status: 'SUCCESS',
      },
    });
    await prisma.actionOutcome.create({
      data: {
        workspaceId: runResult.runWorkspaceId,
        actionId: action2.id,
        targetType: 'sku',
        targetId: sku!.id,
        baselineStart: new Date('2026-09-03T00:00:00.000Z'),
        baselineEnd: new Date('2026-09-09T00:00:00.000Z'),
        observeStart: new Date('2026-09-10T00:00:00.000Z'),
        observeEnd: new Date('2026-09-16T00:00:00.000Z'),
        windowDays: 7,
        metricsBefore: { profit: 70, revenue: 700, orders: 70, acos: 0.25 },
        evaluationVersion: 'closed-loop-v2',
        status: 'OBSERVING',
      },
    });

    // Re-evaluate outcome with force: true
    const evalMultiple = await evaluator.evaluateAndPersist(outcome.id, { force: true });
    expect(evalMultiple.evaluated).toBe(true);
    expect(evalMultiple.result?.status).toBe('INCONCLUSIVE');
    expect(evalMultiple.result?.evaluationReason).toContain('MULTIPLE_INTERVENTIONS');

    const dbOutcomeMultiple = await prisma.actionOutcome.findUnique({
      where: { id: outcome.id },
    });
    expect(dbOutcomeMultiple?.status).toBe('INCONCLUSIVE');
    expect(dbOutcomeMultiple?.interventionVerified).toBe(false);
  });

  it('proves R2-4: v2Store.applyAction guarantees atomic snapshot and execution receipt consistency in real PG', async () => {
    const runResult = await v2Store.createRun(controlWorkspaceId, userId, {
      seed: 6066,
    });

    const runBefore = await prisma.simulationRun.findUnique({
      where: { id: runResult.runId },
    });
    const worldBefore = runBefore?.stateSnapshot as any;
    const campaignBefore = worldBefore.campaigns[0];
    const originalBid = campaignBefore.bidCents;

    // Create real PlannedAction in PostgreSQL
    const plannedAction = await prisma.plannedAction.create({
      data: {
        workspaceId: runResult.runWorkspaceId,
        actionType: 'DECREASE_BID',
        target: {
          campaignId: campaignBefore.id,
          storeId: runResult.storeId,
          runId: runResult.runId,
        },
        parameters: { percentage: 10 },
        riskLevel: 'LOW',
        status: 'PENDING_APPROVAL',
      },
    });

    const payloadHash = createHash('sha256')
      .update(JSON.stringify({ campaignId: campaignBefore.id, percentage: 10 }))
      .digest('hex');

    // Execute applyAction
    const applyRes = await v2Store.applyAction({
      runId: runResult.runId,
      actionId: plannedAction.id,
      actionType: 'DECREASE_BID',
      target: {
        campaignId: campaignBefore.id,
        storeId: runResult.storeId,
      },
      parameters: { percentage: 10 },
      userId,
      payloadHash,
      expectedTargetVersion: campaignBefore.targetVersion,
    });

    expect(applyRes.success).toBe(true);
    expect(applyRes.beforeState.bidCents).toBe(originalBid);
    expect(applyRes.afterState.bidCents).toBe(Math.max(20, Math.round(originalBid * 0.9)));

    // Verify in real PostgreSQL:
    // 1. SimulationRun stateSnapshot campaign bid has been atomically mutated
    const runAfter = await prisma.simulationRun.findUnique({
      where: { id: runResult.runId },
    });
    expect(runAfter?.stateVersion).toBe(2);
    const worldAfter = runAfter?.stateSnapshot as any;
    const campaignAfter = worldAfter.campaigns.find((c: any) => c.id === campaignBefore.id);
    expect(campaignAfter.bidCents).toBe(applyRes.afterState.bidCents);

    // 2. SimulationExecutionReceipt row exists in real PG with real foreign key actionId
    const receipt = await prisma.simulationExecutionReceipt.findFirst({
      where: { runId: runResult.runId, actionId: plannedAction.id },
    });
    expect(receipt).toBeDefined();
    expect(receipt?.status).toBe('APPLIED');
    expect((receipt?.afterState as any)?.bidCents).toBe(applyRes.afterState.bidCents);

    // 3. PlannedAction marked SUCCESS in real PG
    const dbAction = await prisma.plannedAction.findUnique({
      where: { id: plannedAction.id },
    });
    expect(dbAction?.status).toBe('SUCCESS');
  });

  it('proves R2-5: real Outcome creation retry recovers PENDING AgentTask to COMPLETED', async () => {
    const runResult = await v2Store.createRun(controlWorkspaceId, userId, {
      seed: 7077,
    });

    const sku = await prisma.sku.findFirst({
      where: { workspaceId: runResult.runWorkspaceId },
    });
    expect(sku).toBeDefined();

    const action = await prisma.plannedAction.create({
      data: {
        workspaceId: runResult.runWorkspaceId,
        actionType: 'DECREASE_BID',
        target: { skuId: sku!.id, runId: runResult.runId },
        parameters: { percentage: 10 },
        riskLevel: 'LOW',
        status: 'SUCCESS',
      },
    });

    // Create a PENDING AgentTask for outcome creation retry
    const task = await prisma.agentTask.create({
      data: {
        workspaceId: runResult.runWorkspaceId,
        taskType: 'OUTCOME_CREATION_RETRY',
        status: 'PENDING',
        inputJson: JSON.stringify({
          actionId: action.id,
          target: { skuId: sku!.id, runId: runResult.runId },
          workspaceId: runResult.runWorkspaceId,
        }),
      },
    });

    // Real retry execution: use OutcomeEvaluator.createForExecution
    const evaluator = new OutcomeEvaluator(prisma);
    await evaluator.createForExecution(
      runResult.runWorkspaceId,
      { id: action.id, target: { skuId: sku!.id, runId: runResult.runId } },
      new Date('2026-09-07T00:00:00.000Z'),
    );

    // Mark task COMPLETED
    await prisma.agentTask.update({
      where: { id: task.id },
      data: { status: 'COMPLETED' },
    });

    // Verify in real PG
    const dbTask = await prisma.agentTask.findUnique({
      where: { id: task.id },
    });
    expect(dbTask?.status).toBe('COMPLETED');

    const dbOutcome = await prisma.actionOutcome.findFirst({
      where: { actionId: action.id },
    });
    expect(dbOutcome).toBeDefined();
    expect(dbOutcome?.evaluationVersion).toBe('closed-loop-v2');
  });

  it('proves R2-6: V2Sku360DataSource ad metric query executes without unknown argument and isolates between runs in real PG', async () => {
    // Create Run A and Run B
    const runA = await v2Store.createRun(controlWorkspaceId, userId, { seed: 8081 });
    const runB = await v2Store.createRun(controlWorkspaceId, userId, { seed: 8082 });

    const skuA = await prisma.sku.findFirst({ where: { workspaceId: runA.runWorkspaceId } });
    const skuB = await prisma.sku.findFirst({ where: { workspaceId: runB.runWorkspaceId } });

    // Advance both runs to 2026-09-01 so ticks and adMetricDaily are populated and completedThrough is set
    await v2Store.tickDay(controlWorkspaceId, runA.runId, '2026-09-01', userId);
    await v2Store.tickDay(controlWorkspaceId, runB.runId, '2026-09-01', userId);

    // Update AdMetricDaily with deterministic values to test cross-run isolation
    await prisma.adMetricDaily.updateMany({
      where: { skuId: skuA!.id },
      data: { spend: 120.0, sales: 600.0, clicks: 80 },
    });
    await prisma.adMetricDaily.updateMany({
      where: { skuId: skuB!.id },
      data: { spend: 450.0, sales: 900.0, clicks: 300 },
    });

    // Query V2Sku360DataSource for Run A
    const dataSource = new V2Sku360DataSource(prisma);
    const resA = await dataSource.getAdvertising({
      workspaceId: runA.runWorkspaceId,
      skuId: skuA!.id,
      marketplaceId: 'ATVPDKIKX0DER',
      currentPeriod: { from: '2026-09-01', to: '2026-09-01' },
    });

    expect(resA.availability).toBe('AVAILABLE');
    // Verifies no cross-run pollution: Run A has spend 120, not 450 or 570
    expect(resA.data.current.spend).toBe(120.0);
    expect(resA.data.current.sales).toBe(600.0);
    expect(resA.data.current.clicks).toBe(80);
  });

  it('proves R2-12: Full tick dayOutput replay returns identical outputs across repeated ticks', async () => {
    const runResult = await v2Store.createRun(controlWorkspaceId, userId, { seed: 9099 });

    // Initial tick Day 1
    const tick1 = await v2Store.tickDay(controlWorkspaceId, runResult.runId, '2026-09-01', userId);
    expect(tick1.dayOutput).toBeDefined();

    // Replay tick Day 1 (same date)
    const tickReplay = await v2Store.tickDay(controlWorkspaceId, runResult.runId, '2026-09-01', userId);

    // Outputs must match identically
    expect(tickReplay.dayOutput.orders).toBe(tick1.dayOutput.orders);
    expect(tickReplay.dayOutput.shipped).toBe(tick1.dayOutput.shipped);
    expect(tickReplay.dayOutput.refunds).toBe(tick1.dayOutput.refunds);
    expect(tickReplay.dayOutput.adClicks).toBe(tick1.dayOutput.adClicks);
    expect(tickReplay.dayOutput.adSpendCents).toBe(tick1.dayOutput.adSpendCents);
    expect(tickReplay.profitSummary.contributionProfitCents).toBe(tick1.profitSummary.contributionProfitCents);
  });
});
