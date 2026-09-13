import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ErrorCodes } from '@crosspilot/shared';
import { ActionLayerService } from '../src/modules/action-layer/action-layer.service.js';
import { OutcomeTrackingService } from '../src/modules/outcome-tracking/outcome-tracking.service.js';
import { ViewerWriteGuard } from '../src/common/guards/viewer-write.guard.js';

const T0 = new Date('2026-09-03T10:00:00.000Z');

function approvedActionRow() {
  return {
    id: 'act-1',
    workspaceId: 'ws-1',
    recommendationId: 'rec-1',
    actionType: 'DECREASE_BID',
    target: { campaignId: 'camp-1', keyword: 'broad' },
    parameters: { percentage: 20 },
    riskLevel: 'medium',
    needApproval: true,
    status: 'APPROVED',
    lastMessage: 'ok',
    createdBy: 'user-1',
    createdAt: T0,
    updatedAt: T0,
  };
}

/** campaign 目标的 execute mock 基座：ad_metric_daily 两个窗口各自返回记录 */
function prismaBaseForExecute() {
  return {
    plannedAction: {
      findFirst: jest.fn().mockResolvedValue(approvedActionRow()),
      update: jest
        .fn()
        .mockResolvedValueOnce({ ...approvedActionRow(), status: 'EXECUTING' })
        .mockResolvedValueOnce({ ...approvedActionRow(), status: 'SUCCESS', lastMessage: 'Mock bid decreased 20%' }),
    },
    actionExecution: {
      create: jest.fn().mockResolvedValue({ timestamp: T0 }),
    },
    campaign: { findFirst: jest.fn().mockResolvedValue({ id: 'camp-1' }) },
    adMetricDaily: {
      findMany: jest.fn().mockImplementation(({ where }: any) => {
        // 基线窗口（<= T0）ACOS 42%；观察窗口 ACOS 31%
        if (where.metricDate.gte <= T0) {
          return Promise.resolve([
            { impressions: 1000, clicks: 100, spend: 42, orders: 10, sales: 100 },
          ]);
        }
        return Promise.resolve([{ impressions: 1000, clicks: 100, spend: 31, orders: 10, sales: 100 }]);
      }),
    },
  };
}

describe('V10 Outcome Tracking — execute 触发创建', () => {
  it('ActionExecution SUCCESS 后创建 7/14/30 天观察窗，T0=执行时刻所在日', async () => {
    const prisma: any = prismaBaseForExecute();
    prisma.actionOutcome = { create: jest.fn().mockResolvedValue({}) };
    const outcomes = new OutcomeTrackingService(prisma);
    const svc = new ActionLayerService(prisma, {} as any, { getCampaigns: jest.fn() } as any, outcomes);

    const result = await svc.execute('ws-1', 'act-1', 'user-1');
    expect(result.status).toBe('SUCCESS');
    expect(prisma.actionOutcome.create).toHaveBeenCalledTimes(3);

    const windows = prisma.actionOutcome.create.mock.calls
      .map((c: any[]) => c[0].data.windowDays as number)
      .sort((a: number, b: number) => a - b);
    expect(windows).toEqual([7, 14, 30]);

    const first = prisma.actionOutcome.create.mock.calls[0][0].data;
    expect(first).toMatchObject({
      workspaceId: 'ws-1',
      actionId: 'act-1',
      targetType: 'campaign',
      targetId: 'camp-1',
      status: 'OBSERVING',
      baselineStart: new Date('2026-08-27T00:00:00.000Z'),
      baselineEnd: new Date('2026-09-03T00:00:00.000Z'),
      observeStart: new Date('2026-09-04T00:00:00.000Z'),
    });
    const byWindow = new Map<number, any>(
      prisma.actionOutcome.create.mock.calls.map((c: any[]) => [c[0].data.windowDays, c[0].data]),
    );
    expect(byWindow.get(7).observeEnd).toEqual(new Date('2026-09-10T00:00:00.000Z'));
    expect(byWindow.get(30).observeEnd).toEqual(new Date('2026-10-03T00:00:00.000Z'));
    // 基线指标已在创建时聚合（ACOS = spend / sales = 0.42）
    expect(byWindow.get(7).metricsBefore.acos).toBe(0.42);
  });

  it('ActionOutcome 创建失败不影响 execute 主流程（error 日志兜底）', async () => {
    const prisma: any = prismaBaseForExecute();
    prisma.actionOutcome = {
      create: jest.fn().mockRejectedValue(new Error('action_outcomes 表不存在')),
    };
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const outcomes = new OutcomeTrackingService(prisma);
    const svc = new ActionLayerService(prisma, {} as any, { getCampaigns: jest.fn() } as any, outcomes);

    const result = await svc.execute('ws-1', 'act-1', 'user-1');
    expect(result.status).toBe('SUCCESS');
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('并发创建撞 @@unique(actionId, windowDays) 跳过重复，不抛错', async () => {
    const prisma: any = prismaBaseForExecute();
    const p2002 = Object.assign(new Error('unique violation'), { code: 'P2002' });
    prisma.actionOutcome = { create: jest.fn().mockRejectedValue(p2002) };
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const outcomes = new OutcomeTrackingService(prisma);
    const svc = new ActionLayerService(prisma, {} as any, { getCampaigns: jest.fn() } as any, outcomes);

    const result = await svc.execute('ws-1', 'act-1', 'user-1');
    expect(result.status).toBe('SUCCESS');
    warnSpy.mockRestore();
  });
});

describe('V10 Outcome Tracking — API 契约', () => {
  function observingOutcomeRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'out-1',
      workspaceId: 'ws-1',
      actionId: 'act-1',
      storeId: null,
      targetType: 'campaign',
      targetId: 'camp-1',
      baselineStart: new Date('2026-08-27T00:00:00.000Z'),
      baselineEnd: new Date('2026-09-03T00:00:00.000Z'),
      observeStart: new Date('2026-09-04T00:00:00.000Z'),
      observeEnd: new Date('2026-09-10T00:00:00.000Z'),
      windowDays: 7,
      metricsBefore: { acos: 0.42 },
      metricsAfter: null,
      delta: null,
      status: 'OBSERVING',
      evaluationReason: null,
      createdAt: T0,
      updatedAt: T0,
      evaluatedAt: null,
      ...overrides,
    };
  }

  it('forAction：跨 workspace 访问返回 404（ACTION_NOT_FOUND）', async () => {
    const prisma: any = {
      plannedAction: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const svc = new OutcomeTrackingService(prisma);
    await expect(svc.forAction('ws-2', 'act-1')).rejects.toMatchObject({
      response: { code: ErrorCodes.ACTION_NOT_FOUND },
    });
    expect(prisma.plannedAction.findFirst).toHaveBeenCalledWith({
      where: { id: 'act-1', workspaceId: 'ws-2' },
      select: { id: true },
    });
  });

  it('forAction：按 workspace 过滤返回 7/14/30 天列表', async () => {
    const prisma: any = {
      plannedAction: { findFirst: jest.fn().mockResolvedValue({ id: 'act-1' }) },
      actionOutcome: {
        findMany: jest.fn().mockResolvedValue([
          observingOutcomeRow({ id: 'out-7', windowDays: 7 }),
          observingOutcomeRow({ id: 'out-30', windowDays: 30 }),
        ]),
      },
    };
    const svc = new OutcomeTrackingService(prisma);
    const rows = await svc.forAction('ws-1', 'act-1');
    expect(rows.map((r) => r.id)).toEqual(['out-7', 'out-30']);
    expect(prisma.actionOutcome.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1', actionId: 'act-1' },
      orderBy: { windowDays: 'asc' },
    });
  });

  it('reevaluate：VIEWER 被 ViewerWriteGuard 拦截（POST 非 GET → 403）', () => {
    const guard = new ViewerWriteGuard({ getAllAndOverride: () => false } as any);
    const context: any = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', workspaceMember: { role: 'VIEWER' } }),
      }),
    };
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    try {
      guard.canActivate(context);
    } catch (err: any) {
      expect(err.response).toMatchObject({ code: ErrorCodes.AUTH_FORBIDDEN });
    }
  });

  it('reevaluate：观察窗未结束返回 409，保持 OBSERVING', async () => {
    const prisma: any = {
      actionOutcome: {
        findFirst: jest.fn().mockResolvedValue(observingOutcomeRow({ observeEnd: new Date('2999-01-01T00:00:00.000Z') })),
      },
      simulationState: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const svc = new OutcomeTrackingService(prisma);
    await expect(svc.reevaluate('ws-1', 'out-1')).rejects.toMatchObject({
      response: { code: ErrorCodes.CONFLICT_ERROR },
    });
    expect(prisma.actionOutcome.update).toBeUndefined();
  });

  it('reevaluate：重新聚合指标并落终态（ACOS 42%→31% = POSITIVE）', async () => {
    const row = observingOutcomeRow();
    const prisma: any = {
      actionOutcome: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(row)
          .mockResolvedValue({ ...row, status: 'POSITIVE' }),
        findUnique: jest.fn().mockResolvedValue({ ...row, action: { actionType: 'DECREASE_BID' } }),
        update: jest.fn().mockResolvedValue({}),
      },
      simulationState: {
        findUnique: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', simDate: new Date('2026-09-20T00:00:00.000Z') }),
      },
      campaign: { findFirst: jest.fn().mockResolvedValue({ id: 'camp-1' }) },
      adMetricDaily: {
        findMany: jest.fn().mockImplementation(({ where }: any) => {
          if (where.metricDate.gte <= new Date('2026-09-03T00:00:00.000Z')) {
            return Promise.resolve([{ impressions: 1000, clicks: 100, spend: 42, orders: 10, sales: 100 }]);
          }
          return Promise.resolve([{ impressions: 1000, clicks: 100, spend: 31, orders: 10, sales: 100 }]);
        }),
      },
    };
    const svc = new OutcomeTrackingService(prisma);
    const updated = await svc.reevaluate('ws-1', 'out-1');

    const updateData = prisma.actionOutcome.update.mock.calls[0][0].data;
    expect(updateData.status).toBe('POSITIVE');
    expect(updateData.metricsAfter.acos).toBe(0.31);
    expect(updateData.delta.acos.changePct).toBeCloseTo(-0.2619, 4);
    expect(updateData.evaluationReason).toContain('ACOS');
    expect(updateData.evaluatedAt).toBeInstanceOf(Date);
    expect(updated.status).toBe('POSITIVE');
    // 时间基准：workspace 有 simulation_states → 用 sim_date 而非宿主机时钟
    expect(prisma.simulationState.findUnique).toHaveBeenCalledWith({ where: { workspaceId: 'ws-1' } });
  });

  it('reevaluate：并发撞 P2002 映射 409（CONFLICT_ERROR）', async () => {
    const row = observingOutcomeRow();
    const p2002 = Object.assign(new Error('unique violation'), { code: 'P2002' });
    const prisma: any = {
      actionOutcome: {
        findFirst: jest.fn().mockResolvedValue(row),
        findUnique: jest.fn().mockResolvedValue({ ...row, action: { actionType: 'DECREASE_BID' } }),
        update: jest.fn().mockRejectedValue(p2002),
      },
      simulationState: { findUnique: jest.fn().mockResolvedValue(null) },
      campaign: { findFirst: jest.fn().mockResolvedValue({ id: 'camp-1' }) },
      adMetricDaily: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const svc = new OutcomeTrackingService(prisma);
    await expect(svc.reevaluate('ws-1', 'out-1')).rejects.toMatchObject({
      response: { code: ErrorCodes.CONFLICT_ERROR },
    });
  });

  it('reevaluate：跨 workspace outcome 返回 404（OUTCOME_NOT_FOUND）', async () => {
    const prisma: any = {
      actionOutcome: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const svc = new OutcomeTrackingService(prisma);
    await expect(svc.reevaluate('ws-2', 'out-1')).rejects.toMatchObject({
      response: { code: ErrorCodes.OUTCOME_NOT_FOUND },
    });
  });

  it('list：status/windowDays 过滤 + 分页 + workspace 隔离', async () => {
    const prisma: any = {
      actionOutcome: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([observingOutcomeRow()]),
      },
    };
    const svc = new OutcomeTrackingService(prisma);
    const res = await svc.list('ws-1', { status: 'OBSERVING', windowDays: '7', page: '1', pageSize: '20' });
    expect(res.total).toBe(1);
    expect(res.items[0]?.status).toBe('OBSERVING');
    expect(prisma.actionOutcome.count).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1', status: 'OBSERVING', windowDays: 7 },
    });
  });

  it('list：非法 windowDays 返回 400', async () => {
    const svc = new OutcomeTrackingService({} as any);
    await expect(svc.list('ws-1', { windowDays: 'abc' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('summary：近 90 天状态计数 + 终态累计 profit delta（按 sim_date 基准）', async () => {
    const prisma: any = {
      simulationState: {
        findUnique: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', simDate: new Date('2026-09-20T00:00:00.000Z') }),
      },
      actionOutcome: {
        findMany: jest.fn().mockResolvedValue([
          { status: 'POSITIVE', delta: { profit: { before: 500, after: 590, changePct: 0.18 } } },
          { status: 'POSITIVE', delta: { profit: { before: 100, after: 120, changePct: 0.2 } } },
          { status: 'NEGATIVE', delta: { profit: { before: 300, after: 270, changePct: -0.1 } } },
          { status: 'OBSERVING', delta: null },
          { status: 'INCONCLUSIVE', delta: null },
        ]),
      },
    };
    const svc = new OutcomeTrackingService(prisma);
    const summary = await svc.summary('ws-1');
    expect(summary.today).toBe('2026-09-20');
    expect(summary.since).toBe('2026-06-22');
    expect(summary.total).toBe(5);
    expect(summary.byStatus).toMatchObject({ POSITIVE: 2, NEGATIVE: 1, OBSERVING: 1, INCONCLUSIVE: 1 });
    expect(summary.profitDelta).toBe(80); // 90 + 20 - 30；OBSERVING / INCONCLUSIVE 不计
  });
});
