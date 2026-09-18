import { MarketService } from '../src/modules/market/market.service.js';
import type { ProductCandidate } from '@crosspilot/shared';

describe('Single-Product Research Task Workflow API (Phase 1 & 2)', () => {
  let service: MarketService;
  const mockPrisma: any = {
    marketResearchProject: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    // researchTask 留空以测试内存兜底，也可以 mock 测试 prisma
  };

  beforeEach(() => {
    service = new MarketService(mockPrisma);
  });

  function createSampleCandidate(title: string): ProductCandidate {
    return service.initSingleProductCandidate({ title });
  }

  it('场景 1: 创建新选品任务 (POST /tasks) 并返回合法结构', async () => {
    const candidate = createSampleCandidate('电动牙刷架');
    const task = await service.createResearchTask('ws-test-1', {
      title: '电动牙刷架选品任务',
      currentStage: 'MARKET_RESEARCH',
      candidateData: candidate,
    });

    expect(task.id).toBeDefined();
    expect(task.workspaceId).toBe('ws-test-1');
    expect(task.title).toBe('电动牙刷架选品任务');
    expect(task.currentStage).toBe('MARKET_RESEARCH');
    expect(task.candidateData.title).toBe('电动牙刷架');
    expect(task.createdAt).toBeDefined();
    expect(task.updatedAt).toBeDefined();
  });

  it('场景 2: 查询当前 workspace 选品任务列表 (GET /tasks)', async () => {
    const candidateA = createSampleCandidate('水果保鲜盒');
    const candidateB = createSampleCandidate('车载香薰');

    await service.createResearchTask('ws-tenant-alpha', {
      title: '水果盒任务',
      currentStage: 'SPECIFICATION',
      candidateData: candidateA,
    });

    await service.createResearchTask('ws-tenant-alpha', {
      title: '香薰任务',
      currentStage: 'QUOTE',
      candidateData: candidateB,
    });

    // 跨租户隔离测试
    await service.createResearchTask('ws-tenant-beta', {
      title: '租户B任务',
      currentStage: 'CREATED',
      candidateData: candidateA,
    });

    const alphaTasks = await service.listResearchTasks('ws-tenant-alpha');
    expect(alphaTasks.length).toBe(2);
    expect(alphaTasks.every((t) => t.workspaceId === 'ws-tenant-alpha')).toBe(true);

    const betaTasks = await service.listResearchTasks('ws-tenant-beta');
    expect(betaTasks.length).toBe(1);
    expect(betaTasks[0].title).toBe('租户B任务');
  });

  it('场景 3: 恢复任务详情 (GET /tasks/:id)', async () => {
    const candidate = createSampleCandidate('折叠收纳箱');
    const created = await service.createResearchTask('ws-test-恢复', {
      title: '折叠收纳箱任务',
      candidateData: candidate,
    });

    const restored = await service.getResearchTask('ws-test-恢复', created.id);
    expect(restored.id).toBe(created.id);
    expect(restored.title).toBe('折叠收纳箱任务');
    expect(restored.candidateData.id).toBe(candidate.id);
  });

  it('场景 4: 阶段状态推进与自动同步 (PUT /tasks/:id)', async () => {
    const candidate = createSampleCandidate('咖啡研磨机');
    const created = await service.createResearchTask('ws-test-推进', {
      title: '咖啡研磨机任务',
      currentStage: 'CREATED',
      candidateData: candidate,
    });

    // 1. 冻结规格后更新为 SPECIFICATION
    const updated1 = await service.updateResearchTask('ws-test-推进', created.id, {
      currentStage: 'SPECIFICATION',
    });
    expect(updated1.currentStage).toBe('SPECIFICATION');

    // 2. 选定工厂报价后更新为 QUOTE
    const updated2 = await service.updateResearchTask('ws-test-推进', created.id, {
      currentStage: 'QUOTE',
    });
    expect(updated2.currentStage).toBe('QUOTE');

    // 3. 利润分析后更新为 ECONOMICS
    const updated3 = await service.updateResearchTask('ws-test-推进', created.id, {
      currentStage: 'ECONOMICS',
    });
    expect(updated3.currentStage).toBe('ECONOMICS');

    // 4. 生成决策包后更新为 DECISION
    const updated4 = await service.updateResearchTask('ws-test-推进', created.id, {
      currentStage: 'DECISION',
    });
    expect(updated4.currentStage).toBe('DECISION');
  });

  it('场景 5: Prisma 真实调用支持', async () => {
    const fakePrisma: any = {
      researchTask: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'prisma-task-uuid-1',
            workspaceId: data.workspaceId,
            title: data.title,
            currentStage: data.currentStage,
            candidateData: data.candidateData,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        ),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'prisma-task-uuid-1',
            workspaceId: 'ws-prisma',
            title: 'Prisma任务',
            currentStage: 'DECISION',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
        findFirst: jest.fn().mockResolvedValue({
          id: 'prisma-task-uuid-1',
          workspaceId: 'ws-prisma',
          title: 'Prisma任务',
          currentStage: 'DECISION',
          candidateData: { id: 'cand-1', title: '商品1' },
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        update: jest.fn().mockImplementation(({ where, data }) =>
          Promise.resolve({
            id: where.id,
            workspaceId: 'ws-prisma',
            title: data.title || 'Prisma任务',
            currentStage: data.currentStage || 'DECISION',
            candidateData: data.candidateData || {},
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        ),
      },
    };

    const prismaService = new MarketService(fakePrisma);
    const candidate = createSampleCandidate('商品1');
    const created = await prismaService.createResearchTask('ws-prisma', {
      title: 'Prisma任务',
      candidateData: candidate,
    });

    expect(created.id).toBe('prisma-task-uuid-1');
    expect(fakePrisma.researchTask.create).toHaveBeenCalled();

    const list = await prismaService.listResearchTasks('ws-prisma');
    expect(list.length).toBe(1);
    expect(fakePrisma.researchTask.findMany).toHaveBeenCalled();
  });
});
