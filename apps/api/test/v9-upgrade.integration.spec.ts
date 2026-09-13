import { Test, TestingModule } from '@nestjs/testing';
import { setCreativeImageProvider } from '@crosspilot/tool-platform';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { ToolCenterService } from '../src/modules/tool-center/tool-center.service.js';
import { CreativeService } from '../src/modules/creative/creative.service.js';
import { OperationAutomationService } from '../src/modules/operation-automation/operation-automation.service.js';

const stubImageBackend = {
  generateImage: async () => ({
    imageUrl: 'https://stub.example.com/generated.png',
    taskId: 'task_stub',
    model: 'stub-image-model',
    finishedAt: new Date().toISOString(),
  }),
  editImage: async () => ({
    imageUrl: 'https://stub.example.com/edited.png',
    taskId: 'task_stub_edit',
    model: 'stub-image-model',
    finishedAt: new Date().toISOString(),
  }),
};

describe('V9 Incremental Upgrade Integration Tests', () => {
  let toolCenterService: ToolCenterService;
  let creativeService: CreativeService;
  let automationService: OperationAutomationService;
  let prisma: any;

  beforeEach(async () => {
    setCreativeImageProvider(stubImageBackend);
    prisma = {
      sku: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'sku_marble_001',
          skuCode: 'MTH-GREEN-001',
          product: {
            name: 'POLEGAS Natural Marble Toothbrush Holder',
          },
        }),
      },
      agentTask: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      toolExecution: {
        create: jest.fn().mockResolvedValue({ id: 'te_01' }),
      },
      approval: {
        create: jest.fn().mockResolvedValue({ id: 'appr_01' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'appr_01', status: 'PENDING' }),
        update: jest.fn().mockResolvedValue({ id: 'appr_01', status: 'APPROVED' }),
      },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: PrismaService, useValue: prisma },
        ToolCenterService,
        CreativeService,
        OperationAutomationService,
      ],
    }).compile();

    toolCenterService = moduleRef.get<ToolCenterService>(ToolCenterService);
    creativeService = moduleRef.get<CreativeService>(CreativeService);
    automationService = moduleRef.get<OperationAutomationService>(OperationAutomationService);
  });

  describe('1. Tool Center & Platform Engine', () => {
    it('should list all registered tools with metadata', () => {
      const tools = toolCenterService.listTools();
      expect(tools.length).toBeGreaterThanOrEqual(14);
      const ids = tools.map((t) => t.id);
      expect(ids).toContain('finance.profit.calculate');
      expect(ids).toContain('compliance.listing.check');
      expect(ids).toContain('creative.image.generate');
      expect(ids).toContain('operation.keyword.combine');
    });

    it('should execute finance calculation tool with zero float error', async () => {
      const res = await toolCenterService.executeTool(
        'finance.profit.calculate',
        {
          revenue: 29.99,
          cogs: 5.8,
          referralFeeRate: 0.15,
          fbaFee: 4.5,
          adSpend: 3.2,
        },
        'ws_test_001',
      );

      expect(res.success).toBe(true);
      expect(res.data.netProfit).toBeCloseTo(11.99, 1);
      expect(res.traceId).toBeDefined();
    });

    it('should track executed runs in execution history', async () => {
      await toolCenterService.executeTool(
        'finance.profit.calculate',
        { revenue: 29.99, cogs: 5.8 },
        'ws_test_001',
      );
      const history = await toolCenterService.listExecutions(20, 'ws_test_001');
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].toolId).toBe('finance.profit.calculate');
      expect(history[0].status).toBe('SUCCESS');
    });
  });

  describe('2. P0 Creative Studio (WF-Creative-01)', () => {
    it('should generate complete Amazon Creative Pack for SKU', async () => {
      const pack = await creativeService.generateCreativePack(
        'MTH-GREEN-001',
        'ws_test_001',
      );

      expect(pack.skuCode).toBe('MTH-GREEN-001');
      expect(pack.mainImage).toBeDefined();
      expect(pack.lifestyleImage).toBeDefined();
      expect(pack.infographic).toBeDefined();
      expect(pack.resizedVariants.length).toBeGreaterThan(0);
      expect(pack.videoShowcase).toBeDefined();
      expect(pack.totalCostUsd).toBeGreaterThan(0);
      expect(pack.totalDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('3. P0 Operation Automation & Human Approval Gate (WF-Operation-01)', () => {
    it('should pause workflow at Human Approval Gate when autoApprove is false', async () => {
      const run = await automationService.startListingPublishWorkflow(
        {
          skuCode: 'MTH-GREEN-001',
          targetPrice: 29.99,
          autoApprove: false,
        },
        'ws_test_001',
      );

      expect(run.status).toBe('WAITING_APPROVAL');
      expect(run.approvalId).toBeDefined();
      expect(run.steps.length).toBe(4);

      const humanStep = run.steps.find((s) => s.runtime === 'HUMAN');
      expect(humanStep).toBeDefined();
      expect(humanStep?.status).toBe('WAITING');
    });

    it('should execute RPA publish after human operator approves', async () => {
      // First start the workflow
      const run = await automationService.startListingPublishWorkflow(
        {
          skuCode: 'MTH-GREEN-001',
          targetPrice: 29.99,
          autoApprove: false,
        },
        'ws_test_001',
      );

      // Now approve it
      const completed = await automationService.approveAndExecute(
        run.approvalId!,
        'ws_test_001',
      );

      expect(completed.status).toBe('SUCCEEDED');
      expect(completed.steps.length).toBe(6);

      const rpaStep = completed.steps.find((s) => s.runtime === 'RPA');
      expect(rpaStep).toBeDefined();
      expect(rpaStep?.status).toBe('COMPLETED');
      expect(completed.result.feedId).toBe('8192049102');
    });
  });
});
