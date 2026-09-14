import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { OperationAutomationController } from '../src/modules/operation-automation/operation-automation.controller.js';
import { OperationAutomationService } from '../src/modules/operation-automation/operation-automation.service.js';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { ToolCenterService } from '../src/modules/tool-center/tool-center.service.js';

describe('Batch B: OperationAutomation Approval Hardening & Proof Verification', () => {
  let controller: OperationAutomationController;
  let service: OperationAutomationService;
  let approvalStore: Map<string, any>;
  let mockPrisma: any;
  let mockToolCenter: any;

  const mockUser: any = {
    sub: 'user_operator_001',
    email: 'operator@crosspilot.com',
    role: 'OWNER',
  };

  beforeEach(async () => {
    approvalStore = new Map<string, any>();

    mockPrisma = {
      approval: {
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          const record = {
            id: `appr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            status: 'PENDING',
            requestedAt: new Date(),
            ...data,
          };
          approvalStore.set(record.id, record);
          return { ...record };
        }),
        findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
          for (const item of approvalStore.values()) {
            let match = true;
            if (where.id && item.id !== where.id) match = false;
            if (where.workspaceId && item.workspaceId !== where.workspaceId) match = false;
            if (where.status && item.status !== where.status) match = false;
            if (match) return { ...item };
          }
          return null;
        }),
        findMany: jest.fn().mockImplementation(async ({ where }: any) => {
          const results: any[] = [];
          for (const item of approvalStore.values()) {
            let match = true;
            if (where.workspaceId && item.workspaceId !== where.workspaceId) match = false;
            if (where.status && item.status !== where.status) match = false;
            if (match) results.push({ ...item });
          }
          return results;
        }),
        updateMany: jest.fn().mockImplementation(async ({ where, data }: any) => {
          let count = 0;
          for (const [id, item] of approvalStore.entries()) {
            let match = true;
            if (where.id && item.id !== where.id) match = false;
            if (where.workspaceId && item.workspaceId !== where.workspaceId) match = false;
            if (where.status && item.status !== where.status) match = false;
            if (match) {
              const updated = {
                ...item,
                ...data,
                resolvedAt: data.resolvedAt || new Date(),
              };
              approvalStore.set(id, updated);
              count++;
            }
          }
          return { count };
        }),
        update: jest.fn().mockImplementation(async ({ where, data }: any) => {
          const existing = approvalStore.get(where.id);
          if (!existing) throw new Error('Not found');
          const updated = { ...existing, ...data };
          approvalStore.set(where.id, updated);
          return { ...updated };
        }),
      },
    };

    mockToolCenter = {
      executeTool: jest.fn().mockResolvedValue({
        success: true,
        data: { status: 'PASS' },
      }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [OperationAutomationController],
      providers: [
        OperationAutomationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ToolCenterService, useValue: mockToolCenter },
      ],
    }).compile();

    controller = moduleRef.get<OperationAutomationController>(OperationAutomationController);
    service = moduleRef.get<OperationAutomationService>(OperationAutomationService);
  });

  describe('1. Failure Reproduction: ActionType & TargetId Mismatch (400 BadRequest)', () => {
    it('rejects approval with 400 when approval actionType does not match workflow (e.g. PO_SUBMIT instead of LISTING_PUBLISH)', async () => {
      // Seed an approval record with mismatched actionType
      const approval = await mockPrisma.approval.create({
        data: {
          workspaceId: 'ws_demo',
          actionType: 'PO_SUBMIT', // Mismatched! Expected LISTING_PUBLISH
          targetType: 'SKU',
          targetId: 'MTH-GREEN-001',
          requestedPayload: JSON.stringify({ skuCode: 'MTH-GREEN-001', price: 29.99 }),
          requestedBy: 'operator',
        },
      });

      await expect(
        controller.approveAndExecute(approval.id, 'ws_demo', mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects approval with 400 when approval targetId does not match workflow SKU', async () => {
      // Start a normal workflow for MTH-GREEN-001
      const run = await service.startListingPublishWorkflow(
        { skuCode: 'MTH-GREEN-001', targetPrice: 29.99 },
        'ws_demo',
      );

      // Tamper with approval record to have a different targetId
      const stored = approvalStore.get(run.approvalId!);
      approvalStore.set(run.approvalId!, {
        ...stored,
        targetId: 'MTH-WHITE-999', // Mismatched target
      });

      await expect(
        controller.approveAndExecute(run.approvalId!, 'ws_demo', mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects approval with 400 when caller passes mismatched execution parameters in body', async () => {
      const run = await service.startListingPublishWorkflow(
        { skuCode: 'MTH-GREEN-001', targetPrice: 29.99 },
        'ws_demo',
      );

      // Caller attempts to approve with a mismatched targetId or actionType in body
      await expect(
        controller.approveAndExecute(run.approvalId!, 'ws_demo', mockUser, {
          actionType: 'PRICE_CHANGE',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('2. Failure Reproduction: Atomic CAS Concurrency & Repeat Handling (409 Conflict)', () => {
    it('ensures only 1 request succeeds among concurrent requests, others get 409 Conflict', async () => {
      const run = await service.startListingPublishWorkflow(
        { skuCode: 'MTH-GREEN-001', targetPrice: 29.99 },
        'ws_demo',
      );

      const approvalId = run.approvalId!;

      // Fire 5 concurrent approval requests for the same approvalId
      const promises = Array.from({ length: 5 }, () =>
        controller.approveAndExecute(approvalId, 'ws_demo', mockUser),
      );

      const results = await Promise.allSettled(promises);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly 1 must succeed
      expect(fulfilled.length).toBe(1);
      // All other 4 must fail with ConflictException (HTTP 409)
      expect(rejected.length).toBe(4);

      for (const rej of rejected) {
        const err = (rej as PromiseRejectedResult).reason;
        expect(err).toBeInstanceOf(ConflictException);
      }
    });

    it('rejects repeated approval requests with 409 Conflict when already approved', async () => {
      const run = await service.startListingPublishWorkflow(
        { skuCode: 'MTH-GREEN-001', targetPrice: 29.99 },
        'ws_demo',
      );

      const approvalId = run.approvalId!;

      // First approval succeeds
      const firstRes = await controller.approveAndExecute(approvalId, 'ws_demo', mockUser);
      expect(firstRes.status).toBe('SUCCEEDED');

      // Second approval must fail with 409 ConflictException, not 400 or 500
      await expect(
        controller.approveAndExecute(approvalId, 'ws_demo', mockUser),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('3. Crash Recovery & Pending Dispatch Tracking', () => {
    it('persists PENDING_DISPATCH recovery state in approval comment before dispatch completes', async () => {
      const run = await service.startListingPublishWorkflow(
        { skuCode: 'MTH-GREEN-001', targetPrice: 29.99 },
        'ws_demo',
      );

      const approvalId = run.approvalId!;

      // Inject a crash during actionRouter.dispatch
      (service as any).actionRouter = {
        dispatch: jest.fn().mockImplementation(async () => {
          // Verify that BEFORE dispatch completes, the DB approval record is already APPROVED and has PENDING_DISPATCH
          const inDb = approvalStore.get(approvalId);
          expect(inDb.status).toBe('APPROVED');
          expect(inDb.comment).toContain('PENDING_DISPATCH');
          throw new Error('Simulated network crash before dispatch response');
        }),
      };

      await expect(
        controller.approveAndExecute(approvalId, 'ws_demo', mockUser),
      ).rejects.toThrow('Simulated network crash before dispatch response');

      // Check DB persistence after crash: approval is not lost!
      const postCrash = approvalStore.get(approvalId);
      expect(postCrash.status).toBe('APPROVED');
      expect(postCrash.comment).toBeDefined();
      // It should track dispatch failure or pending dispatch
      expect(postCrash.comment).toMatch(/PENDING_DISPATCH|DISPATCH_ERROR/);
    });

    it('allows querying pending dispatch recovery records', async () => {
      // Seed an approval in APPROVED status with PENDING_DISPATCH in comment
      const crashedApproval = await mockPrisma.approval.create({
        data: {
          workspaceId: 'ws_demo',
          actionType: 'LISTING_PUBLISH',
          targetType: 'SKU',
          targetId: 'MTH-GREEN-001',
          requestedPayload: JSON.stringify({ skuCode: 'MTH-GREEN-001', price: 29.99 }),
          requestedBy: 'operator',
          status: 'APPROVED',
          comment: JSON.stringify({
            dispatchStatus: 'PENDING_DISPATCH',
            approvedAt: new Date().toISOString(),
            actionType: 'LISTING_PUBLISH',
            targetId: 'MTH-GREEN-001',
          }),
        },
      });

      const pendingList = await service.listPendingDispatches('ws_demo');
      expect(pendingList.length).toBeGreaterThanOrEqual(1);
      expect(pendingList.some((a: any) => a.id === crashedApproval.id)).toBe(true);
    });
  });
});
