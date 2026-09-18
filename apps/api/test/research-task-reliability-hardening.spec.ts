import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { MarketService } from '../src/modules/market/market.service.js';
import type { ProductCandidate } from '@crosspilot/shared';

describe('ResearchTask Workflow Reliability Hardening (Part 1 & Part 2)', () => {
  let service: MarketService;
  const mockPrisma: any = {
    marketResearchProject: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };

  beforeEach(() => {
    service = new MarketService(mockPrisma);
  });

  function createSampleCandidate(title: string): ProductCandidate {
    return service.initSingleProductCandidate({ title });
  }

  describe('Part 1: 状态流严格迁移校验 (ResearchTaskStageTransitionGuard)', () => {
    it('Case 1: CREATED -> MARKET_RESEARCH 应通过 (PASS)', async () => {
      const candidate = createSampleCandidate('智能保温杯');
      const task = await service.createResearchTask('ws-1', {
        title: '智能保温杯任务',
        currentStage: 'CREATED',
        candidateData: candidate,
      });

      const updated = await service.updateResearchTask('ws-1', task.id, {
        currentStage: 'MARKET_RESEARCH',
      });
      expect(updated.currentStage).toBe('MARKET_RESEARCH');
    });

    it('Case 2: MARKET_RESEARCH -> SPECIFICATION 应通过 (PASS)', async () => {
      const candidate = createSampleCandidate('露营帐篷');
      const task = await service.createResearchTask('ws-1', {
        title: '露营帐篷任务',
        currentStage: 'MARKET_RESEARCH',
        candidateData: candidate,
      });

      const updated = await service.updateResearchTask('ws-1', task.id, {
        currentStage: 'SPECIFICATION',
      });
      expect(updated.currentStage).toBe('SPECIFICATION');
    });

    it('Case 3: CREATED -> DECISION 越级跳转应抛出 400 (FAIL)', async () => {
      const candidate = createSampleCandidate('降噪耳机');
      const task = await service.createResearchTask('ws-1', {
        title: '降噪耳机任务',
        currentStage: 'CREATED',
        candidateData: candidate,
      });

      await expect(
        service.updateResearchTask('ws-1', task.id, {
          currentStage: 'DECISION',
        }),
      ).rejects.toThrow(
        new BadRequestException('Invalid research task stage transition: CREATED -> DECISION'),
      );
    });

    it('Case 4: QUOTE -> COMPLETED 越级跳转应抛出 400 (FAIL)', async () => {
      const candidate = createSampleCandidate('机械键盘');
      // 先正常推进至 QUOTE
      const task = await service.createResearchTask('ws-1', {
        title: '机械键盘任务',
        currentStage: 'CREATED',
        candidateData: candidate,
      });
      await service.updateResearchTask('ws-1', task.id, { currentStage: 'MARKET_RESEARCH' });
      await service.updateResearchTask('ws-1', task.id, { currentStage: 'SPECIFICATION' });
      await service.updateResearchTask('ws-1', task.id, { currentStage: 'QUOTE' });

      // 尝试直接跨越 ECONOMICS 与 DECISION 跳至 COMPLETED
      await expect(
        service.updateResearchTask('ws-1', task.id, {
          currentStage: 'COMPLETED',
        }),
      ).rejects.toThrow(
        new BadRequestException('Invalid research task stage transition: QUOTE -> COMPLETED'),
      );
    });

    it('允许当前阶段更新为自己: SPECIFICATION -> SPECIFICATION (PASS)', async () => {
      const candidate = createSampleCandidate('人体工学椅');
      const task = await service.createResearchTask('ws-1', {
        title: '工学椅任务',
        currentStage: 'MARKET_RESEARCH',
        candidateData: candidate,
      });
      const specTask = await service.updateResearchTask('ws-1', task.id, {
        currentStage: 'SPECIFICATION',
      });
      expect(specTask.currentStage).toBe('SPECIFICATION');

      const reUpdated = await service.updateResearchTask('ws-1', task.id, {
        currentStage: 'SPECIFICATION',
      });
      expect(reUpdated.currentStage).toBe('SPECIFICATION');
    });

    it('创建任务时若传入非法初始阶段应校验拦截 (如 CREATED -> DECISION)', async () => {
      const candidate = createSampleCandidate('宠物喂食器');
      await expect(
        service.createResearchTask('ws-1', {
          title: '宠物喂食器任务',
          currentStage: 'DECISION',
          candidateData: candidate,
        }),
      ).rejects.toThrow(
        new BadRequestException('Invalid research task stage transition: CREATED -> DECISION'),
      );
    });
  });

  describe('Part 2: 限制 InMemory Fallback (生产环境禁止回退，必须抛出 500)', () => {
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('生产环境 (NODE_ENV=production) 下 Prisma 异常应抛出 500，严禁静默 fallback', async () => {
      process.env.NODE_ENV = 'production';

      const failingPrisma: any = {
        researchTask: {
          create: jest.fn().mockRejectedValue(new Error('PostgreSQL connection timeout')),
          findMany: jest.fn().mockRejectedValue(new Error('PostgreSQL read error')),
          findFirst: jest.fn().mockRejectedValue(new Error('PostgreSQL read error')),
          update: jest.fn().mockRejectedValue(new Error('PostgreSQL write error')),
          deleteMany: jest.fn().mockRejectedValue(new Error('PostgreSQL delete error')),
        },
      };
      const prodService = new MarketService(failingPrisma);
      const candidate = createSampleCandidate('防风夹克');

      // 1. 创建任务失败
      await expect(
        prodService.createResearchTask('ws-prod', {
          title: '防风夹克任务',
          candidateData: candidate,
        }),
      ).rejects.toThrow(
        new InternalServerErrorException('Research task persistence unavailable'),
      );

      // 2. 列表查询失败
      await expect(prodService.listResearchTasks('ws-prod')).rejects.toThrow(
        new InternalServerErrorException('Research task persistence unavailable'),
      );

      // 3. 单任务获取异常
      await expect(prodService.getResearchTask('ws-prod', 'task-123')).rejects.toThrow(
        new InternalServerErrorException('Research task persistence unavailable'),
      );

      // 4. 更新任务异常
      await expect(
        prodService.updateResearchTask('ws-prod', 'task-123', { title: '新标题' }),
      ).rejects.toThrow(
        new InternalServerErrorException('Research task persistence unavailable'),
      );

      // 5. 删除任务异常
      await expect(prodService.deleteResearchTask('ws-prod', 'task-123')).rejects.toThrow(
        new InternalServerErrorException('Research task persistence unavailable'),
      );
    });

    it('生产环境 (NODE_ENV=production) 下缺失 Prisma delegate 时也严禁 fallback，直接抛出 500', async () => {
      process.env.NODE_ENV = 'production';
      const noDelegatePrisma: any = {};
      const prodService = new MarketService(noDelegatePrisma);
      const candidate = createSampleCandidate('骑行手套');

      await expect(
        prodService.createResearchTask('ws-prod', {
          title: '骑行手套任务',
          candidateData: candidate,
        }),
      ).rejects.toThrow(
        new InternalServerErrorException('Research task persistence unavailable'),
      );
    });

    it('开发/测试环境 (NODE_ENV=test) 下 Prisma 异常或缺失时允许优雅 fallback 至内存', async () => {
      process.env.NODE_ENV = 'test';
      const candidate = createSampleCandidate('测试内存商品');

      const task = await service.createResearchTask('ws-test', {
        title: '测试内存任务',
        candidateData: candidate,
      });
      expect(task.id).toBeDefined();

      const retrieved = await service.getResearchTask('ws-test', task.id);
      expect(retrieved.title).toBe('测试内存任务');
    });
  });
});
