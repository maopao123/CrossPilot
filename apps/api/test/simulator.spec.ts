import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { SimulatorService } from '../src/modules/simulator/simulator.service.js';
import {
  SIM_CAMPAIGN_NAME,
  SimulatorPersistenceService,
} from '../src/modules/simulator/simulator.persistence.js';
import { SimulatorController } from '../src/modules/simulator/simulator.controller.js';

const WS_ID = 'ws_sim_test';

const SKU_ROWS = [
  { id: 'sku_white', skuCode: 'MTH-WHITE-001' },
  { id: 'sku_green', skuCode: 'MTH-GREEN-001' },
  { id: 'sku_grey', skuCode: 'MTH-GREY-001' },
];

function createMockPrisma() {
  let simStateRow: any = null;
  let campaignDeleted = false;
  const campaignRow = { id: 'camp_sim', workspaceId: WS_ID, name: SIM_CAMPAIGN_NAME };

  const prisma: any = {
    workspace: {
      findUnique: jest.fn().mockResolvedValue({ id: WS_ID, defaultMarketplaceId: 'mkt_us' }),
    },
    marketplace: {
      upsert: jest.fn().mockResolvedValue({ id: 'mkt_us' }),
    },
    sku: {
      findMany: jest.fn().mockResolvedValue(SKU_ROWS),
    },
    commerceAccount: {
      findFirst: jest.fn((args: any) => {
        const provider = args?.where?.provider;
        if (!provider) return Promise.resolve(null);
        return Promise.resolve({
          id: `acct_${provider}`,
          storeId: `store_${provider}`,
          provider,
          workspaceId: WS_ID,
        });
      }),
      create: jest.fn((args: any) =>
        Promise.resolve({ id: `acct_${args.data.provider}`, storeId: args.data.storeId }),
      ),
      update: jest.fn((args: any) => Promise.resolve({ id: args.where.id })),
    },
    store: {
      create: jest.fn((args: any) =>
        Promise.resolve({ id: `store_${args.data.name}`, ...args.data }),
      ),
    },
    campaign: {
      findFirst: jest.fn(() => Promise.resolve(campaignDeleted ? null : campaignRow)),
      create: jest.fn(() => {
        campaignDeleted = false;
        return Promise.resolve(campaignRow);
      }),
      deleteMany: jest.fn(() => {
        campaignDeleted = true;
        return Promise.resolve({ count: 1 });
      }),
    },
    simulationState: {
      findUnique: jest.fn(() => Promise.resolve(simStateRow)),
      create: jest.fn(({ data }: any) => {
        simStateRow = { id: 'sim_state_1', ...data };
        return Promise.resolve(simStateRow);
      }),
      updateMany: jest.fn(({ where, data }: any) => {
        const matches =
          simStateRow &&
          simStateRow.dayIndex === where.dayIndex &&
          new Date(simStateRow.simDate).getTime() === new Date(where.simDate).getTime();
        if (!matches) return Promise.resolve({ count: 0 });
        simStateRow = { ...simStateRow, ...data };
        return Promise.resolve({ count: 1 });
      }),
      deleteMany: jest.fn(() => {
        simStateRow = null;
        return Promise.resolve({ count: 1 });
      }),
    },
    order: {
      create: jest.fn(({ data }: any) => Promise.resolve({ id: `ord_${data.orderNumber}`, ...data })),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    orderItem: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    review: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    adMetricDaily: {
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    channelDailyMetric: {
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    simulationEvent: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    inventoryBalance: { upsert: jest.fn().mockResolvedValue({}) },
    inventorySnapshot: {
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn((arg: any) =>
      typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
    ),
  };

  return {
    prisma,
    getSimStateRow: () => simStateRow,
    failNextStateUpdate: () => {
      prisma.simulationState.updateMany.mockResolvedValueOnce({ count: 0 });
    },
  };
}

describe('Simulator module (mocked Prisma)', () => {
  let service: SimulatorService;
  let controller: SimulatorController;
  let mocks: ReturnType<typeof createMockPrisma>;
  let prisma: any;

  beforeEach(async () => {
    mocks = createMockPrisma();
    prisma = mocks.prisma;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SimulatorController],
      providers: [
        SimulatorService,
        SimulatorPersistenceService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<SimulatorService>(SimulatorService);
    controller = module.get<SimulatorController>(SimulatorController);
  });

  it('reset -> advance 7 days: state advances to dayIndex 7 and simulator orders are persisted', async () => {
    const resetResult = await service.reset(WS_ID);
    expect(resetResult.success).toBe(true);
    expect(resetResult.simDate).toBe('2026-09-01');
    expect(mocks.getSimStateRow().dayIndex).toBe(0);

    // reset only touches simulator-scoped rows
    expect(prisma.orderItem.deleteMany).toHaveBeenCalledWith({
      where: { workspaceId: WS_ID, order: { sourceProvider: 'simulator' } },
    });
    expect(prisma.order.deleteMany).toHaveBeenCalledWith({
      where: { workspaceId: WS_ID, sourceProvider: 'simulator' },
    });
    expect(prisma.review.deleteMany).toHaveBeenCalledWith({
      where: { workspaceId: WS_ID, reviewerName: { startsWith: 'sim-' } },
    });
    // inventory balances restored to the initial 500/400/300
    const balanceCreates = prisma.inventoryBalance.upsert.mock.calls.map(
      (call: any[]) => call[0].create,
    );
    const whiteReset = balanceCreates.find((row: any) => row.skuId === 'sku_white');
    expect(whiteReset.fulfillableQuantity).toBe(500);

    const result = await service.advance(WS_ID, 7);
    expect(result.advancedDays).toBe(7);
    expect(result.dayIndex).toBe(7);
    expect(result.simDate).toBe('2026-09-08');
    expect(mocks.getSimStateRow().dayIndex).toBe(7);

    // orders persisted with simulator isolation markers
    expect(prisma.order.create.mock.calls.length).toBeGreaterThan(0);
    for (const call of prisma.order.create.mock.calls) {
      const data = call[0].data;
      expect(data.sourceProvider).toBe('simulator');
      expect(data.marketplaceId).toBe('mkt_us');
      expect(data.orderNumber).toMatch(/^SIM-\d{8}-\d{4}$/);
      expect(data.externalOrderId).toBe(data.orderNumber);
      expect(['acct_simulator-amazon', 'acct_simulator-shopify']).toContain(
        data.sourceAccountId,
      );
      expect(data.items.create.length).toBeGreaterThan(0);
    }

    // ad metrics hang off the SIM- campaign; reviews carry the sim- prefix
    expect(prisma.adMetricDaily.upsert).toHaveBeenCalled();
    expect(prisma.adMetricDaily.upsert.mock.calls[0][0].create.campaignId).toBe('camp_sim');
    expect(prisma.channelDailyMetric.upsert).toHaveBeenCalled();
    expect(prisma.inventorySnapshot.upsert).toHaveBeenCalled();
    const reviewCalls = prisma.review.createMany.mock.calls;
    if (reviewCalls.length > 0) {
      for (const row of reviewCalls.flatMap((call: any[]) => call[0].data)) {
        expect(row.reviewerName).toMatch(/^sim-/);
      }
    }
  });

  it('tick is idempotent: a repeated tick for the same day raises 409', async () => {
    await service.reset(WS_ID);
    await service.tick(WS_ID);
    expect(mocks.getSimStateRow().dayIndex).toBe(1);

    // Simulate a concurrent/replayed tick: the conditional state update matches 0 rows.
    mocks.failNextStateUpdate();
    await expect(service.tick(WS_ID)).rejects.toThrow(ConflictException);
  });

  it('advance validates days (1-90)', async () => {
    await expect(service.advance(WS_ID, 0)).rejects.toThrow(BadRequestException);
    await expect(service.advance(WS_ID, 91)).rejects.toThrow(BadRequestException);
    expect(() => controller.advance(WS_ID, { days: 0 })).toThrow(BadRequestException);
    expect(() => controller.advance(WS_ID, {} as any)).toThrow(BadRequestException);
  });

  it('reset is restricted to workspace OWNER / ADMIN', async () => {
    expect(() =>
      controller.reset(WS_ID, { workspaceMember: { role: 'MEMBER' } } as any),
    ).toThrow(ForbiddenException);
    expect(() => controller.reset(WS_ID, {} as any)).toThrow(ForbiddenException);

    const spy = jest
      .spyOn(service, 'reset')
      .mockResolvedValue({ success: true } as any);
    await controller.reset(WS_ID, { workspaceMember: { role: 'ADMIN' } } as any);
    expect(spy).toHaveBeenCalledWith(WS_ID);
  });

  it('getState returns the clock, events and channel funnel summary', async () => {
    await service.reset(WS_ID);
    await service.advance(WS_ID, 3);

    const state = await service.getState(WS_ID);
    expect(state.initialized).toBe(true);
    expect((state as any).dayIndex).toBe(3);
    expect((state as any).simDate).toBe('2026-09-04');
    expect(prisma.simulationEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: WS_ID }, take: 50 }),
    );
    expect(prisma.channelDailyMetric.findMany).toHaveBeenCalled();
  });
});
