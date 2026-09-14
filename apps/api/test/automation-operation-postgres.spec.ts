import { PrismaClient, Prisma } from '@prisma/client';
import {
  AutomationOperationStore,
  AutomationOperationConflictError,
  AutomationOperationNotFoundError,
} from '@crosspilot/db';
import { computeSha256 } from '@crosspilot/domain';
import { ActionLayerService } from '../src/modules/action-layer/action-layer.service.js';
import { IntelligenceService } from '../src/modules/intelligence/intelligence.service.js';
import { AdvertisingService } from '../src/modules/advertising/advertising.service.js';
import { ConflictException } from '@nestjs/common';

const testDbUrl =
  process.env.AUTOMATION_TEST_DATABASE_URL ||
  process.env.TEST_DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:5432/crosspilot_test';

function isSafeTestDatabaseUrl(urlStr?: string): boolean {
  if (!urlStr) return false;
  try {
    const parsed = new URL(urlStr);
    const pathname = parsed.pathname.toLowerCase();
    return pathname.includes('test');
  } catch {
    return false;
  }
}

const isTestDbConfigured = isSafeTestDatabaseUrl(testDbUrl);
const describeSuite = isTestDbConfigured ? describe : describe.skip;

if (!isTestDbConfigured) {
  console.log('⚠️ [NOT_RUN] PostgreSQL automation operation tests skipped: test database URL missing test identifier.');
}

describeSuite('A3: Real PostgreSQL Automation Operation Persistence & Approval Suite', () => {
  let prisma: PrismaClient;
  let store: AutomationOperationStore;
  let actionLayerService: ActionLayerService;

  const timestamp = Date.now();
  const userId = `usr_auto_${timestamp}`;
  const ws1 = `ws_auto_1_${timestamp}`;
  const ws2 = `ws_auto_2_${timestamp}`;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: testDbUrl } },
    });
    await prisma.$connect();
    store = new AutomationOperationStore(prisma);

    // Create user and two test workspaces
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@crosspilot.test`,
        name: 'Auto Tester',
        passwordHash: 'dummy',
      },
    });

    await prisma.workspace.createMany({
      data: [
        { id: ws1, name: 'Auto WS 1', slug: `slug-${ws1}` },
        { id: ws2, name: 'Auto WS 2', slug: `slug-${ws2}` },
      ],
    });

    await prisma.workspaceMember.createMany({
      data: [
        { workspaceId: ws1, userId, role: 'OWNER' },
        { workspaceId: ws2, userId, role: 'OWNER' },
      ],
    });

    const intelMock = {} as unknown as IntelligenceService;
    const adMock = {} as unknown as AdvertisingService;
    actionLayerService = new ActionLayerService(prisma as any, intelMock, adMock);
  });

  afterAll(async () => {
    try {
      await prisma.automationOperation.deleteMany({
        where: { workspaceId: { in: [ws1, ws2] } },
      });
      await prisma.actionExecution.deleteMany({
        where: { workspaceId: { in: [ws1, ws2] } },
      });
      await prisma.plannedAction.deleteMany({
        where: { workspaceId: { in: [ws1, ws2] } },
      });
      await prisma.workspaceMember.deleteMany({
        where: { workspaceId: { in: [ws1, ws2] } },
      });
      await prisma.workspace.deleteMany({
        where: { id: { in: [ws1, ws2] } },
      });
      await prisma.user.deleteMany({
        where: { id: userId },
      });
    } catch {
      // Ignore cleanup error
    } finally {
      await prisma.$disconnect();
    }
  });

  async function createTestPlannedAction(workspaceId: string, actionType = 'CREATE_PURCHASE_ORDER') {
    const actionId = `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const action = await prisma.plannedAction.create({
      data: {
        id: actionId,
        workspaceId,
        actionType,
        target: { supplierId: 'sup-001', connectionId: 'erp-conn-1' },
        parameters: {
          currency: 'USD',
          lines: [{ skuId: 'SKU-001', quantity: 40, unitCostMinor: 250 }],
        },
        riskLevel: 'high',
        needApproval: true,
        status: 'WAITING_APPROVAL',
      },
    });
    return action;
  }

  test('proves createOrReplay idempotency: same key + same payload replays existing record', async () => {
    const action = await createTestPlannedAction(ws1);
    const scope = { workspaceId: ws1, connectionId: 'conn-1' };
    const idempotencyKey = `idemp_${Date.now()}_1`;
    const payload = { skuId: 'SKU-001', quantity: 40 };
    const payloadHash = computeSha256(payload);

    // 1st call: CREATED
    const res1 = await store.createOrReplay(scope, {
      actionId: action.id,
      operationKind: 'CREATE_PURCHASE_ORDER',
      idempotencyKey,
      payloadHash,
      mode: 'SIMULATOR',
      provider: 'simulator-erp',
    });
    expect(res1.kind).toBe('CREATED');
    expect(res1.operation.idempotencyKey).toBe(idempotencyKey);
    expect(res1.operation.phase).toBe('READY');
    expect(res1.operation.effect).toBe('NOT_APPLIED');
    expect(res1.operation.version).toBe(1);

    // 2nd call with same payload: REPLAYED
    const res2 = await store.createOrReplay(scope, {
      actionId: action.id,
      operationKind: 'CREATE_PURCHASE_ORDER',
      idempotencyKey,
      payloadHash,
      mode: 'SIMULATOR',
      provider: 'simulator-erp',
    });
    expect(res2.kind).toBe('REPLAYED');
    expect(res2.operation.id).toBe(res1.operation.id);
  });

  test('proves createOrReplay conflict: same key + different payload throws AutomationOperationConflictError', async () => {
    const action = await createTestPlannedAction(ws1);
    const scope = { workspaceId: ws1, connectionId: 'conn-1' };
    const idempotencyKey = `idemp_${Date.now()}_2`;
    const payload1 = { skuId: 'SKU-001', quantity: 40 };
    const payload2 = { skuId: 'SKU-001', quantity: 80 }; // Different quantity!

    const res1 = await store.createOrReplay(scope, {
      actionId: action.id,
      operationKind: 'CREATE_PURCHASE_ORDER',
      idempotencyKey,
      payloadHash: computeSha256(payload1),
      mode: 'SIMULATOR',
      provider: 'simulator-erp',
    });
    expect(res1.kind).toBe('CREATED');

    // Calling with same key but different payload must throw conflict
    await expect(
      store.createOrReplay(scope, {
        actionId: action.id,
        operationKind: 'CREATE_PURCHASE_ORDER',
        idempotencyKey,
        payloadHash: computeSha256(payload2),
        mode: 'SIMULATOR',
        provider: 'simulator-erp',
      }),
    ).rejects.toThrow(AutomationOperationConflictError);
  });

  test('proves concurrent lease claim: exactly one lease succeeds under OCC, second caller gets conflict', async () => {
    const action = await createTestPlannedAction(ws1);
    const scope = { workspaceId: ws1, connectionId: 'conn-1' };
    const idempotencyKey = `idemp_${Date.now()}_3`;
    const payloadHash = computeSha256({ sku: 'SKU-1' });

    const created = await store.createOrReplay(scope, {
      actionId: action.id,
      operationKind: 'CREATE_PURCHASE_ORDER',
      idempotencyKey,
      payloadHash,
      mode: 'SIMULATOR',
      provider: 'simulator-erp',
    });

    const opId = created.operation.id;
    const initialVersion = created.operation.version; // 1

    // Worker A and Worker B try to claim concurrently with expectedVersion=1
    const [claimA, claimB] = await Promise.allSettled([
      store.claim(ws1, opId, initialVersion, 'worker-A', 5000),
      store.claim(ws1, opId, initialVersion, 'worker-B', 5000),
    ]);

    const fulfilled = [claimA, claimB].filter((r) => r.status === 'fulfilled');
    const rejected = [claimA, claimB].filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    // The rejected one must be an OCC_VERSION_CONFLICT
    const rejectedReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectedReason).toBeInstanceOf(AutomationOperationConflictError);
    expect(rejectedReason.message).toContain('OCC_VERSION_CONFLICT');

    // The database must now have version=2 and phase=READY (claim preserves phase per F-P0-2)
    const updated = await store.findById(ws1, opId);
    expect(updated?.version).toBe(2);
    expect(updated?.phase).toBe('READY');
  });

  test('proves tenant isolation: operation cannot be claimed or queried across workspaces', async () => {
    const action = await createTestPlannedAction(ws1);
    const scope = { workspaceId: ws1, connectionId: 'conn-1' };
    const idempotencyKey = `idemp_${Date.now()}_4`;

    const created = await store.createOrReplay(scope, {
      actionId: action.id,
      operationKind: 'CREATE_PURCHASE_ORDER',
      idempotencyKey,
      payloadHash: computeSha256({ tenant: 'ws1' }),
      mode: 'SIMULATOR',
      provider: 'simulator-erp',
    });

    // Query from ws2 must return null
    const crossQuery = await store.findById(ws2, created.operation.id);
    expect(crossQuery).toBeNull();

    // Claim from ws2 must throw NotFoundException
    await expect(
      store.claim(ws2, created.operation.id, created.operation.version, 'worker-cross'),
    ).rejects.toThrow(AutomationOperationNotFoundError);
  });

  test('proves recordEvidence transitions phase to COMPLETED and effect to APPLIED, clearing lease', async () => {
    const action = await createTestPlannedAction(ws1);
    const scope = { workspaceId: ws1, connectionId: 'conn-1' };
    const idempotencyKey = `idemp_${Date.now()}_5`;

    const created = await store.createOrReplay(scope, {
      actionId: action.id,
      operationKind: 'CREATE_PURCHASE_ORDER',
      idempotencyKey,
      payloadHash: computeSha256({ test: 'evidence' }),
      mode: 'SIMULATOR',
      provider: 'simulator-erp',
    });

    const claimed = await store.claim(ws1, created.operation.id, created.operation.version, 'worker-1');
    expect(claimed.phase).toBe('READY');
    expect(claimed.version).toBe(2);

    const evidenceRecorded = await store.recordEvidence(ws1, claimed.id, claimed.version, {
      mode: 'SIMULATOR',
      provider: 'simulator-erp',
      operationId: idempotencyKey,
      phase: 'COMPLETED',
      effect: 'APPLIED',
      recovery: 'NONE',
      externalId: 'ERP-PO-9988',
    });

    expect(evidenceRecorded.version).toBe(3);
    expect(evidenceRecorded.phase).toBe('COMPLETED');
    expect(evidenceRecorded.effect).toBe('APPLIED');
    expect(evidenceRecorded.recovery).toBe('NONE');
    expect(evidenceRecorded.externalId).toBe('ERP-PO-9988');
    expect(evidenceRecorded.leaseOwner).toBeNull();
  });

  test('proves ActionLayerService rejects unapproved CREATE_PURCHASE_ORDER action', async () => {
    const action = await createTestPlannedAction(ws1);
    expect(action.status).toBe('WAITING_APPROVAL');

    // Executing before approval must fail
    await expect(actionLayerService.execute(ws1, action.id, userId)).rejects.toThrow(
      /only APPROVED actions can execute/,
    );
  });

  test('proves ActionLayerService detects tampered payload after approval (PAYLOAD_HASH_MISMATCH)', async () => {
    const action = await createTestPlannedAction(ws1);

    // 1. Approve
    await actionLayerService.approve(ws1, action.id, userId);

    // 2. Tamper parameters in database after approval
    await prisma.plannedAction.update({
      where: { id: action.id },
      data: {
        parameters: {
          currency: 'USD',
          lines: [{ skuId: 'SKU-001', quantity: 9999, unitCostMinor: 10 }], // Tampered quantity!
        },
      },
    });

    // 3. Executing tampered action must throw ConflictException
    await expect(actionLayerService.execute(ws1, action.id, userId)).rejects.toThrow(
      ConflictException,
    );
  });

  test('proves ActionLayerService approves and executes CREATE_PURCHASE_ORDER, creating persisted operation and history', async () => {
    const action = await createTestPlannedAction(ws1);

    // 1. Approve
    const approved = await actionLayerService.approve(ws1, action.id, userId);
    expect(approved.status).toBe('APPROVED');
    expect((approved.parameters as any)._approval.payloadHash).toBeDefined();

    // 2. Execute
    const executing = await actionLayerService.execute(ws1, action.id, userId);
    expect(executing.status).toBe('EXECUTING');

    // 3. Verify AutomationOperation was created in database
    const op = await prisma.automationOperation.findFirst({
      where: { actionId: action.id, workspaceId: ws1 },
    });
    expect(op).not.toBeNull();
    expect(op?.operationKind).toBe('CREATE_PURCHASE_ORDER');
    expect(op?.phase).toBe('SUBMITTED');
    expect(op?.leaseOwner).toBe(userId);

    // 4. Verify ActionExecution history recorded
    const history = await actionLayerService.history(ws1, action.id);
    expect(history.length).toBeGreaterThanOrEqual(2); // approved, execution_started
    expect(history.some((h) => h.status === 'approved')).toBe(true);
    expect(history.some((h) => h.status === 'execution_started')).toBe(true);
  });
});
