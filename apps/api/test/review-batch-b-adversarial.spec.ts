/**
 * 统筹对抗探针 P-1/P-2/P-3（Batch B 复审，review-kimi）
 * 与执行方 spec 的区别：使用真实隔离 PG（crosspilot_test）验证并发 CAS，
 * 并验证客户端 body 自报值不能绕过服务端审批记录校验。
 */
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { OperationAutomationService } from '../src/modules/operation-automation/operation-automation.service.js';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:5432/crosspilot_test';

describe('Review Batch B: adversarial probes (real PG)', () => {
  let prisma: PrismaClient;
  let service: OperationAutomationService;
  let wsId: string;

  const createApproval = async (overrides: Record<string, any> = {}) => {
    return prisma.approval.create({
      data: {
        workspaceId: wsId,
        actionType: 'LISTING_PUBLISH',
        targetType: 'SKU',
        targetId: `SKU-${Date.now()}`,
        requestedPayload: '{}',
        requestedBy: 'reviewer',
        status: 'PENDING',
        ...overrides,
      },
    });
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
    await prisma.$connect();
    wsId = `ws-review-b-${Date.now()}`;
    await prisma.workspace.create({
      data: { id: wsId, name: `Review Batch B ${wsId}`, slug: `slug-${wsId}` },
    });
    service = new OperationAutomationService(prisma as any, {} as any);
  });

  afterAll(async () => {
    if (prisma) {
      try {
        await prisma.approval.deleteMany({ where: { workspaceId: wsId } });
        await prisma.workspace.deleteMany({ where: { id: wsId } });
      } catch {
        // ignore
      } finally {
        await prisma.$disconnect();
      }
    }
  });

  it('P-1: concurrent approveAndExecute on real PG — exactly one succeeds, others get 409', async () => {
    const approval = await createApproval();
    const attempts = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        service.approveAndExecute(approval.id, wsId, 'reviewer')),
    );
    const fulfilled = attempts.filter((a) => a.status === 'fulfilled');
    const conflicts = attempts.filter(
      (a) => a.status === 'rejected' && (a as PromiseRejectedResult).reason instanceof ConflictException,
    );
    expect(fulfilled.length).toBe(1);
    expect(conflicts.length).toBe(3);
    const persisted = await prisma.approval.findUnique({ where: { id: approval.id } });
    expect(persisted?.status).toBe('APPROVED');
  });

  it('P-1b: repeat approval after success gets 409', async () => {
    const approval = await createApproval();
    await service.approveAndExecute(approval.id, wsId, 'reviewer');
    await expect(service.approveAndExecute(approval.id, wsId, 'reviewer')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('P-2a: client body targetId mismatch vs approval record is rejected 400 (client cannot self-approve)', async () => {
    const approval = await createApproval({ targetId: 'SKU-SERVER-REAL' });
    await expect(
      service.approveAndExecute(approval.id, wsId, 'reviewer', {
        actionType: 'LISTING_PUBLISH',
        targetId: 'SKU-CLIENT-FAKE',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const persisted = await prisma.approval.findUnique({ where: { id: approval.id } });
    expect(persisted?.status).toBe('PENDING');
  });

  it('P-2b: body omitted, but server-side payload skuCode mismatches approval targetId — still rejected 400', async () => {
    const approval = await createApproval({
      targetId: 'SKU-SERVER-REAL2',
      requestedPayload: JSON.stringify({ skuCode: 'SKU-TASK-OTHER', price: 19.99 }),
    });
    await expect(
      service.approveAndExecute(approval.id, wsId, 'reviewer'),
    ).rejects.toBeInstanceOf(BadRequestException);
    const persisted = await prisma.approval.findUnique({ where: { id: approval.id } });
    expect(persisted?.status).toBe('PENDING');
  });

  it('P-2c: approval record actionType=PO_SUBMIT cannot be overridden by client body actionType=LISTING_PUBLISH', async () => {
    const approval = await createApproval({ actionType: 'PO_SUBMIT' });
    await expect(
      service.approveAndExecute(approval.id, wsId, 'reviewer', {
        actionType: 'LISTING_PUBLISH',
        targetId: approval.targetId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const persisted = await prisma.approval.findUnique({ where: { id: approval.id } });
    expect(persisted?.status).toBe('PENDING');
  });

  it('P-2-control: matching client body is accepted (proves rejection is not blanket)', async () => {
    const approval = await createApproval({ targetId: 'SKU-CONTROL-OK' });
    const run = await service.approveAndExecute(approval.id, wsId, 'reviewer', {
      actionType: 'LISTING_PUBLISH',
      targetId: 'SKU-CONTROL-OK',
    });
    expect(run.status).toBeDefined();
    const persisted = await prisma.approval.findUnique({ where: { id: approval.id } });
    expect(persisted?.status).toBe('APPROVED');
  });

  it('P-3: one-character targetId difference is rejected (body SKU-AAAA vs record SKU-AAAB)', async () => {
    const approval = await createApproval({ targetId: 'SKU-AAAB' });
    await expect(
      service.approveAndExecute(approval.id, wsId, 'reviewer', { targetId: 'SKU-AAAA' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const approval2 = await createApproval({
      targetId: 'SKU-XXXB',
      requestedPayload: JSON.stringify({ skuCode: 'SKU-XXXA' }),
    });
    await expect(
      service.approveAndExecute(approval2.id, wsId, 'reviewer'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('P-2d: cross-workspace access to approval is rejected (404)', async () => {
    const approval = await createApproval();
    await expect(
      service.approveAndExecute(approval.id, `ws-other-${Date.now()}`, 'reviewer'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('P-1c: crash window leaves PENDING_DISPATCH recoverable via listPendingDispatches', async () => {
    const approval = await createApproval();
    // simulate crash: break actionRouter dispatch after CAS succeeds
    (service as any).actionRouter = {
      dispatch: async () => {
        throw new Error('SERVER_CRASH_SIMULATION');
      },
    };
    await expect(service.approveAndExecute(approval.id, wsId, 'reviewer')).rejects.toThrow(
      'SERVER_CRASH_SIMULATION',
    );
    // DISPATCH_ERROR path writes comment; but if process truly died before that update,
    // comment would stay PENDING_DISPATCH. Simulate the true-crash remnant directly:
    await prisma.approval.update({
      where: { id: approval.id },
      data: {
        comment: JSON.stringify({ dispatchStatus: 'PENDING_DISPATCH', approvedAt: new Date().toISOString() }),
      },
    });
    const pendings = await service.listPendingDispatches(wsId);
    expect(pendings.some((a: any) => a.id === approval.id)).toBe(true);
    // workspace isolation of listing
    const otherWs = `ws-review-b-other-${Date.now()}`;
    await prisma.workspace.create({ data: { id: otherWs, name: otherWs, slug: `slug-${otherWs}` } });
    const pendingsOther = await service.listPendingDispatches(otherWs);
    expect(pendingsOther.some((a: any) => a.id === approval.id)).toBe(false);
    await prisma.workspace.deleteMany({ where: { id: otherWs } });
  });
});
