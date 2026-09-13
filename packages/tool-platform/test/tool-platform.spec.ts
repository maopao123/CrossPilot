import {
  createDefaultToolRegistry,
  ToolExecutor,
  ToolRegistry,
  FinanceProfitCalculateTool,
  setCreativeImageProvider,
} from '../src/index.js';

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

describe('ToolPlatform Core Unit Tests', () => {
  let registry: ToolRegistry;
  let executor: ToolExecutor;

  beforeEach(() => {
    setCreativeImageProvider(stubImageBackend);
    registry = createDefaultToolRegistry();
    executor = new ToolExecutor(registry);
  });

  describe('ToolRegistry', () => {
    it('should register and index all default tools', () => {
      const allTools = registry.getAll();
      expect(allTools.length).toBeGreaterThanOrEqual(13);
      expect(registry.has('finance.profit.calculate')).toBe(true);
      expect(registry.has('compliance.listing.check')).toBe(true);
      expect(registry.has('creative.image.generate')).toBe(true);
      expect(registry.has('operation.keyword.combine')).toBe(true);
    });

    it('should filter tools by category', () => {
      const creativeTools = registry.getByCategory('CREATIVE');
      expect(creativeTools.length).toBe(6);
      expect(creativeTools.map((t) => t.id)).toContain('creative.image.generate');

      const dataTools = registry.getByCategory('DATA');
      expect(dataTools.map((t) => t.id)).toContain('finance.profit.calculate');
    });

    it('should list metadata without leaking execute function', () => {
      const meta = registry.listMetadata();
      expect(meta.length).toBeGreaterThanOrEqual(13);
      expect((meta[0] as any).execute).toBeUndefined();
      expect(meta[0].id).toBeDefined();
      expect(meta[0].inputSchema).toBeDefined();
    });
  });

  describe('ToolExecutor Validation & Execution', () => {
    it('should return error if tool not found', async () => {
      const result = await executor.execute('non.existent.tool', {}, { workspaceId: 'ws_test' });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TOOL_NOT_FOUND');
    });

    it('should reject missing required fields with VALIDATION_ERROR', async () => {
      const result = await executor.execute(
        'finance.profit.calculate',
        { revenue: 29.99 }, // missing required cogs
        { workspaceId: 'ws_test' },
      );
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
      expect(result.error?.message).toContain('cogs');
    });

    it('should execute FinanceProfitCalculateTool successfully with deterministic math', async () => {
      const result = await executor.execute(
        'finance.profit.calculate',
        {
          revenue: 29.99,
          cogs: 5.8,
          referralFeeRate: 0.15,
          fbaFee: 4.5,
          adSpend: 3.2,
          returnLoss: 0,
        },
        { workspaceId: 'ws_test', source: 'TOOL_CENTER' },
      );

      expect(result.success).toBe(true);
      expect(result.traceId).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.data).toBeDefined();
      expect(result.data.netProfit).toBeCloseTo(11.99, 1);
    });

    it('should execute ComplianceListingCheckTool and intercept FDA claims', async () => {
      const result = await executor.execute(
        'compliance.listing.check',
        {
          title: 'FDA Approved Antimicrobial Marble Toothbrush Holder',
          bulletPoints: ['Guaranteed to cure bacteria.'],
        },
        { workspaceId: 'ws_test' },
      );

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('BLOCK');
      expect(result.data.violations.some((v: any) => v.ruleCode === 'POL-FDA-001')).toBe(true);
    });

    it('should execute CreativeImageGenerateTool and return rendered assets', async () => {
      const result = await executor.execute(
        'creative.image.generate',
        {
          prompt: 'Carrara marble toothbrush holder, luxury bathroom, morning sun',
          style: 'luxury_minimalist',
          aspectRatio: '1:1',
        },
        { workspaceId: 'ws_test' },
      );

      expect(result.success).toBe(true);
      expect(result.data.imageUrl).toBeDefined();
      expect(result.data.dimensions).toEqual({ width: 1024, height: 1024 });
      expect(result.cost?.amount).toBe(0.04);
    });

    it('should map aspectRatio 16:9 to 1280x720 dimensions for CreativeImageGenerateTool', async () => {
      const result = await executor.execute(
        'creative.image.generate',
        {
          prompt: 'Carrara marble toothbrush holder wide banner',
          aspectRatio: '16:9',
        },
        { workspaceId: 'ws_test' },
      );

      expect(result.success).toBe(true);
      expect(result.data.dimensions).toEqual({ width: 1280, height: 720 });
    });

    it('should execute OperationKeywordCombineTool and return matrix keywords', async () => {
      const result = await executor.execute(
        'operation.keyword.combine',
        {
          seedKeywords: 'toothbrush holder, toothbrush stand',
          modifiers: 'marble, heavy stone, wide slot',
        },
        { workspaceId: 'ws_test' },
      );

      expect(result.success).toBe(true);
      expect(result.data.totalGenerated).toBe(6);
      expect(result.data.searchTermsField).toBeDefined();
      expect(result.data.compliantWith250Bytes).toBe(true);
    });

    it('should gracefully coerce string inputs for array, number, and object types', async () => {
      const complianceResult = await executor.execute(
        'compliance.listing.check',
        {
          title: 'Test Title',
          bulletPoints: 'Bullet 1\nBullet 2', // string textarea representation
        },
        { workspaceId: 'ws_test' },
      );
      expect(complianceResult.success).toBe(true);

      const financeResult = await executor.execute(
        'finance.profit.calculate',
        {
          revenue: '29.99' as any, // numeric string
          cogs: '5.80' as any,
        },
        { workspaceId: 'ws_test' },
      );
      expect(financeResult.success).toBe(true);
      expect(financeResult.data.revenue).toBe(29.99);
    });

    it('should successfully execute all 28 registered tools with their default form data', async () => {
      const allTools = registry.getAll();
      expect(allTools.length).toBe(28);

      for (const tool of allTools) {
        const defaultInput: Record<string, any> = {};
        if (tool.inputSchema?.properties) {
          for (const [k, v] of Object.entries(tool.inputSchema.properties)) {
            if (v.defaultValue !== undefined) {
              defaultInput[k] = v.defaultValue;
            }
          }
        }

        const res = await executor.execute(tool.id, defaultInput, { workspaceId: 'default' });
        expect(res.success).toBe(true);
      }
    });
  });
});
