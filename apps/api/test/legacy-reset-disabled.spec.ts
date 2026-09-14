import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { SimulatorService } from '../src/modules/simulator/simulator.service.js';
import { SimulatorController } from '../src/modules/simulator/simulator.controller.js';
import { SimulatorPersistenceService } from '../src/modules/simulator/simulator.persistence.js';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { V2RunStore } from '@crosspilot/db';

describe('Batch A: Legacy Reset Disabled Acceptance Test', () => {
  let service: SimulatorService;
  let controller: SimulatorController;

  const mockPrisma = {
    simulationRun: {
      findFirst: jest.fn(),
    },
    order: { deleteMany: jest.fn() },
    orderItem: { deleteMany: jest.fn() },
    channelDailyMetric: { deleteMany: jest.fn() },
    inventorySnapshot: { deleteMany: jest.fn() },
    simulationState: { deleteMany: jest.fn(), create: jest.fn() },
    campaign: { deleteMany: jest.fn() },
  };

  const mockPersistence = {
    resetWorld: jest.fn().mockResolvedValue({
      config: {},
      worldState: { simDate: '2026-09-01', dayIndex: 0 },
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SimulatorController],
      providers: [
        SimulatorService,
        { provide: SimulatorPersistenceService, useValue: mockPersistence },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SimulatorService>(SimulatorService);
    controller = module.get<SimulatorController>(SimulatorController);
  });

  it('Case 1: Standard workspace with real or unverified data must be rejected with LEGACY_RESET_DISABLED and zero writes', async () => {
    // 模拟普通非 v2 工作区
    jest.spyOn(V2RunStore.prototype, 'isRunWorkspace').mockResolvedValue(false);

    const normalWsId = 'ws-standard-123';

    await expect(service.reset(normalWsId)).rejects.toThrow(BadRequestException);
    await expect(service.reset(normalWsId)).rejects.toThrow(/LEGACY_RESET_DISABLED/);

    // 关键验证：在发生任何删除或写入前直接阻断，persistence.resetWorld 绝不被调用
    expect(mockPersistence.resetWorld).not.toHaveBeenCalled();
    expect(mockPrisma.channelDailyMetric.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.inventorySnapshot.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.simulationState.deleteMany).not.toHaveBeenCalled();
  });

  it('Case 2: Controller entrypoint rejects legacy reset and propagates LEGACY_RESET_DISABLED', async () => {
    jest.spyOn(V2RunStore.prototype, 'isRunWorkspace').mockResolvedValue(false);

    const req = { user: { sub: 'u1' }, workspaceMember: { role: 'OWNER' } } as any;
    await expect(controller.reset('ws-standard-456', req)).rejects.toThrow(BadRequestException);
    await expect(controller.reset('ws-standard-456', req)).rejects.toThrow(/LEGACY_RESET_DISABLED/);

    expect(mockPersistence.resetWorld).not.toHaveBeenCalled();
  });

  it('Case 3: v2 Run workspace continues to be rejected with RESET_REQUIRES_NEW_RUN ConflictException', async () => {
    // 模拟 v2 运行工作区
    jest.spyOn(V2RunStore.prototype, 'isRunWorkspace').mockResolvedValue(true);

    const v2WsId = 'ws-v2-run-789';

    await expect(service.reset(v2WsId)).rejects.toThrow(ConflictException);
    await expect(service.reset(v2WsId)).rejects.toThrow(/RESET_REQUIRES_NEW_RUN/);

    expect(mockPersistence.resetWorld).not.toHaveBeenCalled();
  });
});
