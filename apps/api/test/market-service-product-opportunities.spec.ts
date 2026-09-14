import { Test } from '@nestjs/testing';
import { MarketService } from '../src/modules/market/market.service.js';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';

describe('F-1: MarketService Product Opportunities Truthfulness', () => {
  let service: MarketService;
  let prisma: PrismaService;
  const wsId = `ws-opp-truth-${Date.now()}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        MarketService,
        {
          provide: PrismaService,
          useValue: new PrismaService(),
        },
      ],
    }).compile();

    service = moduleRef.get<MarketService>(MarketService);
    prisma = moduleRef.get<PrismaService>(PrismaService);

    // Clean up test workspace
    await prisma.productOpportunity.deleteMany({ where: { workspaceId: wsId } });
    await prisma.workspace.deleteMany({ where: { id: wsId } });

    // Seed test workspace
    await prisma.workspace.create({
      data: {
        id: wsId,
        slug: `slug-${wsId}`,
        name: 'Opp Truth Test Workspace',
      },
    });
  });

  afterAll(async () => {
    await prisma.productOpportunity.deleteMany({ where: { workspaceId: wsId } });
    await prisma.workspace.deleteMany({ where: { id: wsId } });
    await prisma.$disconnect();
  });

  it('1. returns empty array when no opportunities exist in DB for arbitrary keywords (no fabricated 8.6 cards)', async () => {
    const nonToothbrushKeywords = ['shoes', 'file box', 'leather bag', 'wireless mouse', 'acrylic organizer'];
    for (const kw of nonToothbrushKeywords) {
      const opps = await service.getProductOpportunities(wsId, kw);
      expect(Array.isArray(opps)).toBe(true);
      expect(opps.length).toBe(0);
    }
  });

  it('2. returns real database opportunities when present, without hardcoded scores or fabricated text', async () => {
    // Create 2 real opportunities in DB
    await prisma.productOpportunity.create({
      data: {
        workspaceId: wsId,
        title: '天然大理石电动牙刷架',
        problemSummary: '槽位过窄无法适配大直径电动牙刷手柄',
        targetCustomer: '使用电动牙刷的家庭用户',
        recommendedPositioning: '高质感天然大理石通用宽槽卫浴置物架',
        opportunityScore: 7.5,
        confidenceLevel: 0.85,
        evidenceSummary: '真实 150 条评论分析：25% 抱怨孔径偏小',
        status: 'APPROVED',
      },
    });

    await prisma.productOpportunity.create({
      data: {
        workspaceId: wsId,
        title: '加固型档案整理文件箱',
        problemSummary: '塑料卡扣在重载下易碎裂',
        targetCustomer: '商务办公与财务归档人员',
        recommendedPositioning: '金属包边与双密码锁重型文件箱',
        opportunityScore: 9.1,
        confidenceLevel: 0.94,
        evidenceSummary: '真实 320 条评论分析：38% 提及提手撕裂风险',
        status: 'APPROVED',
      },
    });

    // Query without keyword: should return all 2 ordered by opportunityScore desc
    const allOpps = await service.getProductOpportunities(wsId);
    expect(allOpps.length).toBe(2);
    expect(allOpps[0].title).toBe('加固型档案整理文件箱');
    expect(allOpps[0].opportunityScore).toBe(9.1);
    expect(allOpps[0].confidenceLevel).toBe(0.94);
    expect(allOpps[1].title).toBe('天然大理石电动牙刷架');
    expect(allOpps[1].opportunityScore).toBe(7.5);

    // Query with keyword filter '牙刷': matches only the toothbrush opportunity
    const toothbrushOpps = await service.getProductOpportunities(wsId, '牙刷');
    expect(toothbrushOpps.length).toBe(1);
    expect(toothbrushOpps[0].title).toBe('天然大理石电动牙刷架');

    // Query with keyword filter '文件箱': matches only the file box opportunity
    const fileBoxOpps = await service.getProductOpportunities(wsId, '文件箱');
    expect(fileBoxOpps.length).toBe(1);
    expect(fileBoxOpps[0].title).toBe('加固型档案整理文件箱');

    // Query with keyword filter 'shoes': 0 matches in DB, must return []
    const shoeOpps = await service.getProductOpportunities(wsId, 'shoes');
    expect(shoeOpps.length).toBe(0);
  });
});
