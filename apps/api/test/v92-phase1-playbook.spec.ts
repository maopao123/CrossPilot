import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ErrorCodes } from '@crosspilot/shared';
import { ViewerWriteGuard } from '../src/common/guards/viewer-write.guard.js';
import { PlaybookService } from '../src/modules/playbook/playbook.service.js';
import { PlaybookController } from '../src/modules/playbook/playbook.controller.js';

const inputSchema = {
  type: 'object' as const,
  properties: { keyword: { type: 'string' as const } },
  required: ['keyword'],
};
const outputSchema = {
  type: 'object' as const,
  properties: { decision: { type: 'string' as const } },
  required: ['decision'],
};

function mockContext(method: string, role?: string) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
  const guard = new ViewerWriteGuard(reflector as any);
  const ctx = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        workspaceMember: role ? { role } : undefined,
        user: role ? { role } : undefined,
      }),
    }),
  };
  return { guard, ctx };
}

function prismaRow(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-09-12T00:00:00.000Z');
  return {
    id: 'pb-1',
    workspaceId: 'ws-1',
    name: 'amazon-product-research',
    version: '1.0.0',
    status: 'REGISTERED',
    inputSchema,
    outputSchema,
    definition: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function runRow(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-09-12T00:00:00.000Z');
  return {
    id: 'pk-run-1',
    workspaceId: 'ws-1',
    playbookId: 'pb-1',
    runId: 'run-abc',
    status: 'CREATED',
    input: { keyword: 'mug' },
    output: null,
    createdBy: 'user-1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('V9.2 Phase 1 Playbook API', () => {
  it('returns 403 AUTH_FORBIDDEN for VIEWER POST', () => {
    const { guard, ctx } = mockContext('POST', 'VIEWER');
    try {
      guard.canActivate(ctx as any);
      throw new Error('expected ForbiddenException');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      const body = (err as ForbiddenException).getResponse() as any;
      expect(body.code).toBe(ErrorCodes.AUTH_FORBIDDEN);
    }
  });

  it('POST playbook → POST run → GET run (CREATED, output null)', async () => {
    const created = prismaRow();
    const createdRun = runRow({ runId: 'run-independent' });
    const prisma: any = {
      playbook: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(created),
        findMany: jest.fn(),
        create: jest.fn().mockResolvedValue(created),
      },
      playbookRun: {
        findFirst: jest.fn().mockResolvedValue(createdRun),
        create: jest.fn().mockResolvedValue(createdRun),
      },
    };
    const svc = new PlaybookService(prisma);
    const pb = await svc.create('ws-1', {
      name: 'amazon-product-research',
      version: '1.0.0',
      inputSchema,
      outputSchema,
    });
    expect(pb.id).toBe('pb-1');
    expect(pb.status).toBe('REGISTERED');

    const started = await svc.startRun('ws-1', pb.id, { input: { keyword: 'mug' } }, 'user-1');
    expect(started.runId).toBe('run-independent');
    expect(started.status).toBe('CREATED');
    expect(started.playbookId).toBe('pb-1');

    const run = await svc.getRun('ws-1', started.runId);
    expect(run.status).toBe('CREATED');
    expect(run.output).toBeNull();
    expect(prisma.playbookRun.create).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid run input with PLAYBOOK_INPUT_INVALID', async () => {
    const created = prismaRow();
    const prisma: any = {
      playbook: {
        findFirst: jest.fn().mockResolvedValue(created),
        create: jest.fn(),
      },
      playbookRun: {
        create: jest.fn(),
        findFirst: jest.fn(),
      },
    };
    const svc = new PlaybookService(prisma);
    await expect(svc.startRun('ws-1', 'pb-1', { input: {} }, 'user-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    try {
      await svc.startRun('ws-1', 'pb-1', { input: {} }, 'user-1');
    } catch (err) {
      const body = (err as BadRequestException).getResponse() as any;
      expect(body.code).toBe(ErrorCodes.PLAYBOOK_INPUT_INVALID);
    }
    expect(prisma.playbookRun.create).not.toHaveBeenCalled();
  });

  it('returns PLAYBOOK_NOT_FOUND for another workspace', async () => {
    const prisma: any = {
      playbook: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const svc = new PlaybookService(prisma);
    await expect(svc.get('ws-other', 'pb-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('controller startRun only returns runId contract', async () => {
    const svc = {
      startRun: jest.fn().mockResolvedValue({
        runId: 'run-1',
        playbookId: 'pb-1',
        status: 'CREATED',
      }),
    };
    const controller = new PlaybookController(svc as any);
    const result = await controller.startRun(
      'ws-1',
      { sub: 'user-1' } as any,
      'pb-1',
      { input: { keyword: 'mug' } },
    );
    expect(result).toEqual({ runId: 'run-1', playbookId: 'pb-1', status: 'CREATED' });
    expect(svc.startRun).toHaveBeenCalledWith('ws-1', 'pb-1', { input: { keyword: 'mug' } }, 'user-1');
  });
});
