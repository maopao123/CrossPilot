import { ForbiddenException } from '@nestjs/common';
import { DailyDiagnosisService } from '../src/modules/daily-diagnosis/daily-diagnosis.service.js';
import { setDailyOperationWorkflowService } from '@crosspilot/tool-platform';

function createSharedPrisma() {
  const agentTasks = new Map<string, any>();
  const agentSteps = new Map<string, any>();
  const approvals = new Map<string, any>();
  const idempotency = new Map<string, any>();

  const uniqueKey = (row: { workspaceId: string; scope: string; idempotencyKey: string }) =>
    `${row.workspaceId}|${row.scope}|${row.idempotencyKey}`;

  const client: any = {
    agentTask: {
      async findUnique({ where }: any) {
        const found = agentTasks.get(where.id);
        return found ? { ...found } : null;
      },
      async count({ where }: any) {
        return agentTasks.has(where.id) ? 1 : 0;
      },
      async updateMany({ where, data }: any) {
        const found = agentTasks.get(where.id);
        if (!found) return { count: 0 };
        if (
          where.checkpointVersion !== undefined &&
          found.checkpointVersion !== where.checkpointVersion
        ) {
          return { count: 0 };
        }
        const updated = { ...found, ...data };
        agentTasks.set(where.id, updated);
        return { count: 1 };
      },
      async update({ where, data }: any) {
        const found = agentTasks.get(where.id);
        if (!found) throw new Error(`Record not found: ${where.id}`);
        const updated = { ...found, ...data };
        agentTasks.set(where.id, updated);
        return { ...updated };
      },
      async create({ data }: any) {
        const copy = { ...data };
        agentTasks.set(copy.id, copy);
        return { ...copy };
      },
      async delete({ where }: any) {
        agentTasks.delete(where.id);
        return { id: where.id };
      },
    },
    agentStep: {
      async findMany({ where }: any) {
        return Array.from(agentSteps.values())
          .filter((s) => s.taskId === where.taskId)
          .map((s) => ({ ...s }));
      },
      async create({ data }: any) {
        const id = data.id ?? `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const copy = { id, ...data };
        agentSteps.set(id, copy);
        return { ...copy };
      },
      async update({ where, data }: any) {
        const found = agentSteps.get(where.id);
        if (!found) throw new Error(`Step not found: ${where.id}`);
        const updated = { ...found, ...data };
        agentSteps.set(where.id, updated);
        return { ...updated };
      },
      async deleteMany({ where }: any) {
        let count = 0;
        for (const [id, step] of agentSteps.entries()) {
          if (step.taskId === where.taskId) {
            agentSteps.delete(id);
            count++;
          }
        }
        return { count };
      },
    },
    approval: {
      async findMany({ where }: any) {
        return Array.from(approvals.values())
          .filter((a) => (where.taskId ? a.taskId === where.taskId : true))
          .map((a) => ({ ...a }));
      },
      async create({ data }: any) {
        const id = data.id ?? `app-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const copy = { id, ...data };
        approvals.set(id, copy);
        return { ...copy };
      },
      async update({ where, data }: any) {
        const found = approvals.get(where.id);
        if (!found) throw new Error(`Approval not found: ${where.id}`);
        const updated = { ...found, ...data };
        approvals.set(where.id, updated);
        return { ...updated };
      },
      async deleteMany({ where }: any) {
        let count = 0;
        for (const [id, app] of approvals.entries()) {
          if (where.taskId && app.taskId === where.taskId) {
            approvals.delete(id);
            count++;
          }
        }
        return { count };
      },
    },
    workflowIdempotency: {
      async create({ data }: any) {
        const key = uniqueKey(data);
        if (idempotency.has(key)) {
          const err: any = new Error('Unique constraint failed on workspaceId_scope_idempotencyKey');
          err.code = 'P2002';
          throw err;
        }
        const row = {
          id: data.id ?? `idem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          workspaceId: data.workspaceId,
          scope: data.scope,
          idempotencyKey: data.idempotencyKey,
          taskId: data.taskId,
          createdAt: new Date(),
        };
        idempotency.set(key, row);
        return { ...row };
      },
      async findUnique({ where }: any) {
        const compound = where.workspaceId_scope_idempotencyKey;
        if (!compound) return null;
        const found = idempotency.get(uniqueKey(compound));
        return found ? { ...found } : null;
      },
      async deleteMany({ where }: any) {
        let count = 0;
        for (const [key, row] of idempotency.entries()) {
          const matchWorkspace = !where.workspaceId || row.workspaceId === where.workspaceId;
          const matchScope = !where.scope || row.scope === where.scope;
          const matchIdem =
            !where.idempotencyKey || row.idempotencyKey === where.idempotencyKey;
          const matchTask = !where.taskId || row.taskId === where.taskId;
          const matchId = !where.id || row.id === where.id;
          if (matchWorkspace && matchScope && matchIdem && matchTask && matchId) {
            idempotency.delete(key);
            count++;
          }
        }
        return { count };
      },
      async findMany() {
        return Array.from(idempotency.values()).map((r) => ({ ...r }));
      },
    },
    async $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
      return fn(client);
    },
  };

  return { client, agentTasks, idempotency };
}

const startDto = (key?: string) => ({
  marketplaceId: 'AMAZON_US',
  mode: 'SKU' as const,
  skuId: 'MTH-WHITE-001',
  dateRange: { from: '2026-03-01T00:00:00Z', to: '2026-03-14T00:00:00Z' },
  idempotencyKey: key,
  options: { waitForCompletion: true },
});

describe('V91-017 persistent daily-diagnosis idempotency', () => {
  afterEach(() => {
    setDailyOperationWorkflowService(null);
  });

  it('returns the same taskId for the same workspace + key and creates one workflow', async () => {
    const prisma = createSharedPrisma();
    const service = new DailyDiagnosisService(prisma.client);
    const a = await service.startDiagnosis('ws-a', startDto('abc'));
    const b = await service.startDiagnosis('ws-a', startDto('abc'));
    expect(b.taskId).toBe(a.taskId);
    expect(prisma.agentTasks.size).toBe(1);
    expect(prisma.idempotency.size).toBe(1);
  });

  it('isolates identical keys across workspaces', async () => {
    const prisma = createSharedPrisma();
    const service = new DailyDiagnosisService(prisma.client);
    const a = await service.startDiagnosis('ws-a', startDto('abc'));
    const b = await service.startDiagnosis('ws-b', startDto('abc'));
    expect(a.taskId).not.toBe(b.taskId);
    expect(prisma.idempotency.size).toBe(2);
  });

  it('survives service restart by reading Postgres instead of process memory', async () => {
    const prisma = createSharedPrisma();
    const first = new DailyDiagnosisService(prisma.client);
    const created = await first.startDiagnosis('ws-a', startDto('restart-key'));
    setDailyOperationWorkflowService(null);
    const restarted = new DailyDiagnosisService(prisma.client);
    const replayed = await restarted.startDiagnosis('ws-a', startDto('restart-key'));
    expect(replayed.taskId).toBe(created.taskId);
    expect(prisma.agentTasks.size).toBe(1);
  });

  it('shares mapping across two service instances (multi-instance) under concurrent starts', async () => {
    const prisma = createSharedPrisma();
    const instanceA = new DailyDiagnosisService(prisma.client);
    const instanceB = new DailyDiagnosisService(prisma.client);
    const [left, right] = await Promise.all([
      instanceA.startDiagnosis('ws-a', startDto('race-key')),
      instanceB.startDiagnosis('ws-a', startDto('race-key')),
    ]);
    expect(left.taskId).toBe(right.taskId);
    expect(prisma.idempotency.size).toBe(1);
    expect(prisma.agentTasks.size).toBe(1);
  });

  it('serializes same-instance concurrent starts onto one workflow via unique constraint', async () => {
    const prisma = createSharedPrisma();
    const service = new DailyDiagnosisService(prisma.client);
    const [left, right] = await Promise.all([
      service.startDiagnosis('ws-a', startDto('same-instance-race')),
      service.startDiagnosis('ws-a', startDto('same-instance-race')),
    ]);
    expect(left.taskId).toBe(right.taskId);
    expect(prisma.idempotency.size).toBe(1);
    expect(prisma.agentTasks.size).toBe(1);
  });

  it('does not let workspace A replay workspace B task via the same key', async () => {
    const prisma = createSharedPrisma();
    const service = new DailyDiagnosisService(prisma.client);
    const b = await service.startDiagnosis('ws-b', startDto('shared-key'));
    const a = await service.startDiagnosis('ws-a', startDto('shared-key'));
    expect(a.taskId).not.toBe(b.taskId);
    await expect(service.getTaskSummary(b.taskId, 'ws-a')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
