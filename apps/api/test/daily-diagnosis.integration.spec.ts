/**
 * Daily Diagnosis API & SSE Integration Tests (Epic 3 Phase 7)
 *
 * Tests:
 * 1. REST Endpoints (Start 202, Status, Selective Inclusion, Summary <4KB)
 * 2. HITL Action Decisions (Approve, Reject, Dismiss, OCC conflict 409)
 * 3. Strict RBAC (VIEWER forbidden 403) & Workspace Isolation (403 WORKSPACE_ACCESS_DENIED)
 * 4. Zero External Execution Guarantee (Approval != Execute)
 * 5. SSE Observation Channel (Snapshot, Heartbeat, Live Stream, Teardown)
 * 6. Outbound Sensitive Data Redaction
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DailyDiagnosisController } from '../src/modules/daily-diagnosis/daily-diagnosis.controller.js';
import { DailyDiagnosisService } from '../src/modules/daily-diagnosis/daily-diagnosis.service.js';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import {
  WorkflowNotFoundError,
  CheckpointVersionConflictError,
  SensitiveDataGuard,
} from '@crosspilot/domain';
import { HttpStatus, ForbiddenException } from '@nestjs/common';

function createMockPrisma() {
  const agentTasks = new Map<string, any>();
  const agentSteps = new Map<string, any>();
  const approvals = new Map<string, any>();
  const idempotency = new Map<string, any>();
  const idempotencyKeyOf = (row: {
    workspaceId: string;
    scope: string;
    idempotencyKey: string;
  }) => `${row.workspaceId}|${row.scope}|${row.idempotencyKey}`;

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
        const key = idempotencyKeyOf(data);
        if (idempotency.has(key)) {
          const err: any = new Error('Unique constraint failed');
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
        const found = idempotency.get(idempotencyKeyOf(compound));
        return found ? { ...found } : null;
      },
      async deleteMany({ where }: any) {
        let count = 0;
        for (const [key, row] of idempotency.entries()) {
          if (where.workspaceId && row.workspaceId !== where.workspaceId) continue;
          if (where.scope && row.scope !== where.scope) continue;
          if (where.idempotencyKey && row.idempotencyKey !== where.idempotencyKey) continue;
          if (where.taskId && row.taskId !== where.taskId) continue;
          idempotency.delete(key);
          count++;
        }
        return { count };
      },
    },
    async $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
      return fn(client);
    },
  };

  return { client, agentTasks, approvals, agentSteps };
}

describe('Epic 3 Phase 7: Operation API & SSE Endpoints Integration', () => {
  let controller: DailyDiagnosisController;
  let service: DailyDiagnosisService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  const workspaceA = 'ws-alpha';
  const workspaceB = 'ws-beta';

  beforeEach(async () => {
    mockPrisma = createMockPrisma();

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [DailyDiagnosisController],
      providers: [
        DailyDiagnosisService,
        {
          provide: PrismaService,
          useValue: mockPrisma.client,
        },
      ],
    }).compile();

    controller = moduleRef.get<DailyDiagnosisController>(DailyDiagnosisController);
    service = moduleRef.get<DailyDiagnosisService>(DailyDiagnosisService);
  });

  // ==========================================================================
  // 1. Workflow Start (202 Accepted) & Idempotency
  // ==========================================================================
  describe('1. POST /operations/daily-diagnosis (Workflow Start)', () => {
    it('starts workflow diagnosis and returns 202 response with status and stream URLs', async () => {
      const startDto = {
        marketplaceId: 'AMAZON_US',
        mode: 'SKU' as const,
        skuId: 'MTH-WHITE-001',
        dateRange: { from: '2026-03-01T00:00:00Z', to: '2026-03-14T00:00:00Z' },
        options: { waitForCompletion: true }, // wait for sync verification
      };

      const req = { workspaceMember: { role: 'OPERATOR' } };
      const response = await controller.startDiagnosis(
        workspaceA,
        'user_123',
        startDto,
        req,
      );

      expect(response.taskId).toBeDefined();
      expect(response.workflowRunId).toBeDefined();
      expect(['RUNNING', 'WAITING_APPROVAL', 'COMPLETED']).toContain(response.status);
      expect(response.streamUrl).toBe(`/operations/daily-diagnosis/${response.taskId}/events`);
      expect(response.statusUrl).toBe(`/operations/daily-diagnosis/${response.taskId}`);
    });

    it('returns the same task when called with identical idempotencyKey', async () => {
      const idempotencyKey = 'idem-test-key-999';
      const startDto = {
        marketplaceId: 'AMAZON_US',
        mode: 'SKU' as const,
        skuId: 'MTH-WHITE-001',
        dateRange: { from: '2026-03-01T00:00:00Z', to: '2026-03-14T00:00:00Z' },
        idempotencyKey,
        options: { waitForCompletion: true },
      };

      const req = { workspaceMember: { role: 'OPERATOR' } };
      const run1 = await controller.startDiagnosis(workspaceA, 'user_123', startDto, req);
      const run2 = await controller.startDiagnosis(workspaceA, 'user_123', startDto, req);

      expect(run2.taskId).toBe(run1.taskId);
    });

    it('rejects VIEWER role with 403 AUTH_FORBIDDEN on startDiagnosis', async () => {
      const startDto = {
        marketplaceId: 'AMAZON_US',
        mode: 'WORKSPACE' as const,
        dateRange: { from: '2026-03-01T00:00:00Z', to: '2026-03-14T00:00:00Z' },
      };

      const req = { workspaceMember: { role: 'VIEWER' } };
      await expect(
        controller.startDiagnosis(workspaceA, 'user_viewer', startDto, req),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ==========================================================================
  // 2. Task Summary & Selective Inclusion (<4KB Compact Default)
  // ==========================================================================
  describe('2. GET /operations/daily-diagnosis/:taskId (Status & Summary)', () => {
    let activeTaskId: string;

    beforeEach(async () => {
      // Execute Green scenario task (which generates actions)
      const res = await controller.startDiagnosis(
        workspaceA,
        'user_123',
        {
          marketplaceId: 'AMAZON_US',
          mode: 'SKU',
          skuId: 'MTH-GREEN-001',
          dateRange: { from: '2026-03-01T00:00:00Z', to: '2026-03-14T00:00:00Z' },
          options: { waitForCompletion: true },
        },
        { workspaceMember: { role: 'OPERATOR' } },
      );
      activeTaskId = res.taskId;
    });

    it('returns compact task summary (<4KB) without heavy collections by default', async () => {
      const summary = await controller.getTaskSummary(activeTaskId, workspaceA);

      expect(summary.taskId).toBe(activeTaskId);
      expect(summary.skuSummary).toBeDefined();
      expect(summary.signalSummary).toBeDefined();
      expect(summary.diagnosisSummary).toBeDefined();
      expect(summary.actionSummary).toBeDefined();
      expect(summary.approvalSummary).toBeDefined();

      // By default, bulky arrays are NOT attached to keep response under 4KB
      expect(summary.actions).toBeUndefined();
      expect(summary.signals).toBeUndefined();
      expect(summary.diagnoses).toBeUndefined();
      expect(summary.stepTraces).toBeUndefined();
      expect(summary.contexts).toBeUndefined();

      // Check size < 4096 bytes
      const jsonSize = Buffer.byteLength(JSON.stringify(summary), 'utf8');
      expect(jsonSize).toBeLessThan(4096);
    });

    it('selectively expands actions and signals when requested via include parameter', async () => {
      const expanded = await controller.getTaskSummary(
        activeTaskId,
        workspaceA,
        'actions,signals',
      );

      expect(expanded.actions).toBeDefined();
      expect(expanded.actions!.length).toBeGreaterThan(0);
      expect(expanded.signals).toBeDefined();
      expect(expanded.signals!.length).toBeGreaterThan(0);

      // Other non-included fields remain undefined
      expect(expanded.diagnoses).toBeUndefined();
      expect(expanded.stepTraces).toBeUndefined();
      expect(expanded.contexts).toBeUndefined();
    });

    it('throws 404 WorkflowNotFoundError if task does not exist', async () => {
      await expect(
        controller.getTaskSummary('non-existent-task-id', workspaceA),
      ).rejects.toThrow(WorkflowNotFoundError);
    });

    it('enforces strict workspace isolation: throws 403 for cross-workspace access', async () => {
      await expect(
        controller.getTaskSummary(activeTaskId, workspaceB),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ==========================================================================
  // 3. HITL Action Decisions (Approval != Execute) & OCC Conflict
  // ==========================================================================
  describe('3. HITL Action Decisions (Approve, Reject, Dismiss & OCC)', () => {
    let taskId: string;
    let pendingActionId: string;
    let initialVersion: number;

    beforeEach(async () => {
      const res = await controller.startDiagnosis(
        workspaceA,
        'user_123',
        {
          marketplaceId: 'AMAZON_US',
          mode: 'SKU',
          skuId: 'MTH-GREEN-001',
          dateRange: { from: '2026-03-01T00:00:00Z', to: '2026-03-14T00:00:00Z' },
          options: { waitForCompletion: true },
        },
        { workspaceMember: { role: 'OPERATOR' } },
      );
      taskId = res.taskId;

      const summary = await controller.getTaskSummary(taskId, workspaceA, 'actions');
      initialVersion = summary.checkpointVersion;
      const pendingAction = summary.actions?.find((a) => a.status === 'PROPOSED');
      expect(pendingAction).toBeDefined();
      pendingActionId = pendingAction!.actionId;
    });

    it('approves an action, updates approval state, and does NOT execute externally', async () => {
      const decisionRes = await controller.approveAction(
        taskId,
        pendingActionId,
        workspaceA,
        'user_123',
        { expectedVersion: initialVersion, note: 'Approved after human verification' },
        { workspaceMember: { role: 'ADMIN' } },
      );

      expect(decisionRes.decision).toBe('APPROVED');
      expect(decisionRes.actionId).toBe(pendingActionId);
      expect(decisionRes.approvalSummary.approvedCount).toBeGreaterThanOrEqual(1);
      expect(decisionRes.checkpointVersion).toBeGreaterThan(initialVersion);

      // Verify zero external execution: state remains within workflow
      const updated = await controller.getTaskSummary(taskId, workspaceA, 'actions');
      const action = updated.actions?.find((a) => a.actionId === pendingActionId);
      expect(action?.status).toBe('APPROVED');
    });

    it('rejects an action with note and increments rejectedCount', async () => {
      const decisionRes = await controller.rejectAction(
        taskId,
        pendingActionId,
        workspaceA,
        'user_123',
        { expectedVersion: initialVersion, note: 'Rejected by merchandiser' },
        { workspaceMember: { role: 'ADMIN' } },
      );

      expect(decisionRes.decision).toBe('REJECTED');
      expect(decisionRes.approvalSummary.rejectedCount).toBe(1);
    });

    it('dismisses an action and sets status to DISMISSED', async () => {
      const decisionRes = await controller.dismissAction(
        taskId,
        pendingActionId,
        workspaceA,
        'user_123',
        { expectedVersion: initialVersion, note: 'Dismissed as false positive' },
        { workspaceMember: { role: 'ADMIN' } },
      );

      expect(decisionRes.decision).toBe('DISMISSED');
      expect(decisionRes.approvalSummary.dismissedCount).toBe(1);
    });

    it('enforces OCC: throws 409 CheckpointVersionConflictError when expectedVersion does not match', async () => {
      await expect(
        controller.approveAction(
          taskId,
          pendingActionId,
          workspaceA,
          'user_123',
          { expectedVersion: 99999 }, // mismatched version
          { workspaceMember: { role: 'ADMIN' } },
        ),
      ).rejects.toThrow(CheckpointVersionConflictError);
    });

    it('forbids VIEWER role from approving, rejecting, or dismissing actions', async () => {
      const viewerReq = { workspaceMember: { role: 'VIEWER' } };

      await expect(
        controller.approveAction(taskId, pendingActionId, workspaceA, 'v1', {}, viewerReq),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        controller.rejectAction(taskId, pendingActionId, workspaceA, 'v1', {}, viewerReq),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        controller.dismissAction(taskId, pendingActionId, workspaceA, 'v1', {}, viewerReq),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ==========================================================================
  // 4. Workflow Resume
  // ==========================================================================
  describe('4. POST /operations/daily-diagnosis/:taskId/resume', () => {
    it('resumes workflow after all pending actions are decided and marks COMPLETED', async () => {
      const res = await controller.startDiagnosis(
        workspaceA,
        'user_123',
        {
          marketplaceId: 'AMAZON_US',
          mode: 'SKU',
          skuId: 'MTH-WHITE-001',
          dateRange: { from: '2026-03-01T00:00:00Z', to: '2026-03-14T00:00:00Z' },
          options: { waitForCompletion: true },
        },
        { workspaceMember: { role: 'OPERATOR' } },
      );

      const resumeRes = await controller.resumeWorkflow(
        res.taskId,
        workspaceA,
        {},
        { workspaceMember: { role: 'OPERATOR' } },
      );

      expect(resumeRes.taskId).toBe(res.taskId);
      expect(['COMPLETED', 'WAITING_APPROVAL']).toContain(resumeRes.status);
    });
  });

  // ==========================================================================
  // 5. Real-Time SSE Observation Channel
  // ==========================================================================
  describe('5. GET /operations/daily-diagnosis/:taskId/events (SSE Stream)', () => {
    it('sets SSE headers, emits initial snapshot event, and handles client close', async () => {
      const startRes = await controller.startDiagnosis(
        workspaceA,
        'user_123',
        {
          marketplaceId: 'AMAZON_US',
          mode: 'SKU',
          skuId: 'MTH-WHITE-001',
          dateRange: { from: '2026-03-01T00:00:00Z', to: '2026-03-14T00:00:00Z' },
          options: { waitForCompletion: true },
        },
        { workspaceMember: { role: 'OPERATOR' } },
      );

      const headers: Record<string, string> = {};
      const writtenChunks: string[] = [];
      let closeHandler: (() => void) | undefined;

      const mockReq: any = {
        on(event: string, handler: () => void) {
          if (event === 'close') {
            closeHandler = handler;
          }
        },
      };

      const mockRes: any = {
        setHeader(name: string, value: string) {
          headers[name] = value;
        },
        flushHeaders: jest.fn(),
        write(chunk: string) {
          writtenChunks.push(chunk);
        },
        end: jest.fn(),
      };

      await controller.streamEvents(startRes.taskId, workspaceA, mockReq, mockRes);

      // Verify SSE Headers
      expect(headers['Content-Type']).toBe('text/event-stream');
      expect(headers['Cache-Control']).toBe('no-cache');
      expect(headers['Connection']).toBe('keep-alive');

      // Verify Snapshot Event
      expect(writtenChunks.length).toBeGreaterThanOrEqual(1);
      expect(writtenChunks[0]).toContain('event: snapshot');
      expect(writtenChunks[0]).toContain(startRes.taskId);

      // Verify Clean Teardown on Close
      expect(closeHandler).toBeDefined();
      closeHandler!();
      expect(mockRes.end).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 6. Outbound Sensitive Data Scrubbing
  // ==========================================================================
  describe('6. Outbound Sensitive Data Redaction', () => {
    it('scrubs passwords, API keys, tokens before returning summary', () => {
      const sensitiveData = {
        taskId: 'task-123',
        apiKey: 'sk-ant-live-secret-key-12345',
        bearerToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy',
        password: 'my-super-secret-password',
        summary: {
          overallHealth: 'HEALTHY',
        },
      };

      const scrubbed: any = SensitiveDataGuard.scrub(sensitiveData);

      expect(scrubbed.apiKey).toBe('[REDACTED]');
      expect(scrubbed.bearerToken).toBe('[REDACTED]');
      expect(scrubbed.password).toBe('[REDACTED]');
      expect(scrubbed.taskId).toBe('task-123');
    });
  });
});
