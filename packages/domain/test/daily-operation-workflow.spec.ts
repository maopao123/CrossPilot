/**
 * Daily Operation Workflow Service Test Suite (Epic 3 Phase 6)
 *
 * Verifies:
 * 1. 9-Step DAG Orchestration & Execution Lifecycle (VALIDATE -> FINALIZE)
 * 2. Preconditions & Input Validation
 * 3. Dual Execution Modes: SKU Mode & WORKSPACE Mode
 * 4. Fault Isolation & Partial Failure Defense
 * 5. D1 - D10 Workflow Scenario Integration & Mapping
 * 6. Cross-SKU Priority Ranking & Action Aggregation
 * 7. Human-In-The-Loop (HITL) Gate: Checkpointing, Action Approval, Rejection, Dismissal, Resume
 * 8. Strict Zero-Mutation Execution Boundary
 * 9. Checkpoint Store Deep-Cloning Invariant
 */

import {
  DailyOperationWorkflowInput,
  DailyOperationWorkflowResult,
  DailyOperationWorkflowState,
  DailyOperationWorkflowStep,
  DailyOperationEventType,
  DailyOperationWorkflowEvent,
  Sku360BusinessContext,
  BusinessSignal,
  DiagnosisResult,
  RecommendedAction,
} from '@crosspilot/shared';

import {
  DailyOperationWorkflowService,
  InMemoryWorkflowCheckpointStore,
  WorkflowEventEmitter,
  WorkflowAggregator,
  Sku360ContextLoader,
  ScenarioSku360DataSource,
  OperationAnomalyDetector,
  CrossDomainDiagnosisService,
  ActionRecommendationService,
  ISkuResolver,
} from '../src/operations/index.js';

// Helper to create valid mock Sku360BusinessContext
function buildMockContext(overrides?: Partial<Sku360BusinessContext>): Sku360BusinessContext {
  const defaultContext: Sku360BusinessContext = {
    identity: {
      workspaceId: 'ws_demo',
      marketplaceId: 'AMAZON_US',
      productId: 'prod_mth_001',
      skuId: 'sku_white_001',
      skuCode: 'MTH-WHITE-001',
      asin: 'B0BFGNSXYL',
      productName: 'Natural Marble Toothbrush Holder',
      status: 'ACTIVE',
    },
    currentPeriod: { from: '2026-03-08', to: '2026-03-14', daysCount: 7 },
    baselinePeriod: { from: '2026-03-01', to: '2026-03-07', daysCount: 7 },
    sales: {
      ordersCount: { current: 280, baseline: 300, delta: -20, deltaPct: -0.067 },
      unitsSold: { current: 310, baseline: 330, delta: -20, deltaPct: -0.061 },
      revenue: { current: 8990.0, baseline: 9570.0, delta: -580.0, deltaPct: -0.061 },
      averageSellingPrice: { current: 29.0, baseline: 29.0, delta: 0, deltaPct: 0 },
      availability: 'AVAILABLE',
    },
    advertising: {
      spend: { current: 2000.0, baseline: 1020.0, delta: 980.0, deltaPct: 0.961 },
      sales: { current: 5100.0, baseline: 4250.0, delta: 850.0, deltaPct: 0.20 },
      orders: { current: 175, baseline: 146, delta: 29, deltaPct: 0.199 },
      clicks: { current: 2200, baseline: 1100, delta: 1100, deltaPct: 1.0 },
      impressions: { current: 45000, baseline: 25000, delta: 20000, deltaPct: 0.8 },
      acos: { current: 0.392, baseline: 0.24, delta: 0.152, deltaPct: 0.633 },
      roas: { current: 2.55, baseline: 4.17, delta: -1.62, deltaPct: -0.388 },
      ctr: { current: 0.049, baseline: 0.044, delta: 0.005, deltaPct: 0.114 },
      cvr: { current: 0.08, baseline: 0.133, delta: -0.053, deltaPct: -0.398 },
      targetAcos: 0.30,
      searchTerms: [
        {
          searchTerm: 'bathroom organizer',
          spend: 420.0,
          sales: 0,
          orders: 0,
          clicks: 315,
          impressions: 4500,
          acos: 0,
        },
      ],
      availability: 'AVAILABLE',
    },
    inventory: {
      fulfillableQuantity: 450,
      inboundQuantity: 200,
      reservedQuantity: 50,
      avgDailySales: 44.3,
      daysCover: 10.2,
      leadTimeDays: 21,
      safetyStockDays: 14,
      reorderPoint: 1551,
      inventoryHealth: 'LOW_STOCK',
      recommendedQuantity: 420,
      availability: 'AVAILABLE',
    },
    reviews: {
      overallRating: 4.3,
      totalReviews: 128,
      recentReviewCount: 14,
      negativeReviewCount: 2,
      negativeReviewRatio: 0.1429,
      topPainPoints: [],
      availability: 'AVAILABLE',
    },
    returns: {
      returnCount: { current: 12, baseline: 10, delta: 2, deltaPct: 0.20 },
      deliveredUnits: { current: 310, baseline: 330, delta: -20, deltaPct: -0.061 },
      returnRate: { current: 0.0387, baseline: 0.0303, delta: 0.0084, deltaPct: 0.277 },
      returnCost: { current: 348.0, baseline: 290.0, delta: 58.0, deltaPct: 0.20 },
      availability: 'AVAILABLE',
    },
    competitors: {
      items: [
        {
          competitorId: 'comp_01',
          asin: 'B0COMP001',
          name: 'Competitor Marble Holder',
          relationType: 'DIRECT',
          isPrimary: true,
          currentPrice: 24.99,
          currentRating: 4.5,
          reviewCount: 350,
        },
      ],
      availability: 'AVAILABLE',
    },
    profit: {
      revenue: { current: 8990.0, baseline: 9570.0, delta: -580.0, deltaPct: -0.061 },
      cogs: { current: 2790.0, baseline: 2970.0, delta: -180.0, deltaPct: -0.061 },
      amazonFees: { current: 1348.5, baseline: 1435.5, delta: -87.0, deltaPct: -0.061 },
      fbaFee: { current: 1550.0, baseline: 1650.0, delta: -100.0, deltaPct: -0.061 },
      adsCost: { current: 2000.0, baseline: 1020.0, delta: 980.0, deltaPct: 0.961 },
      returnLoss: { current: 348.0, baseline: 290.0, delta: 58.0, deltaPct: 0.20 },
      otherCosts: { current: 0, baseline: 0, delta: 0, deltaPct: 0 },
      netProfit: { current: 953.5, baseline: 2204.5, delta: -1251.0, deltaPct: -0.567 },
      netMargin: { current: 0.1061, baseline: 0.2304, delta: -0.1243, deltaPct: -0.5395 },
      availability: 'AVAILABLE',
    },
    availability: {
      sales: 'AVAILABLE',
      advertising: 'AVAILABLE',
      inventory: 'AVAILABLE',
      reviews: 'AVAILABLE',
      returns: 'AVAILABLE',
      competitors: 'AVAILABLE',
      profit: 'AVAILABLE',
      overall: 'AVAILABLE',
    },
    freshness: {
      sales: { asOf: '2026-03-14', status: 'FRESH' },
      advertising: { asOf: '2026-03-14', status: 'FRESH' },
      inventory: { asOf: '2026-03-14', status: 'FRESH' },
      reviews: { asOf: '2026-03-14', status: 'FRESH' },
      returns: { asOf: '2026-03-14', status: 'FRESH' },
      competitors: { asOf: '2026-03-14', status: 'FRESH' },
      profit: { asOf: '2026-03-14', status: 'FRESH' },
      overall: 'FRESH',
      loadedAt: '2026-03-15T00:00:00.000Z',
    },
    evidence: [],
    loadedAt: '2026-03-15T00:00:00.000Z',
  };

  return {
    ...defaultContext,
    ...overrides,
    identity: { ...defaultContext.identity, ...(overrides?.identity ?? {}) },
    sales: { ...defaultContext.sales, ...(overrides?.sales ?? {}) },
    advertising: { ...defaultContext.advertising, ...(overrides?.advertising ?? {}) },
    inventory: { ...defaultContext.inventory, ...(overrides?.inventory ?? {}) },
    reviews: { ...defaultContext.reviews, ...(overrides?.reviews ?? {}) },
    returns: { ...defaultContext.returns, ...(overrides?.returns ?? {}) },
    competitors: { ...defaultContext.competitors, ...(overrides?.competitors ?? {}) },
    profit: { ...defaultContext.profit, ...(overrides?.profit ?? {}) },
  };
}

describe('Epic 3 Phase 6: Daily Operation Workflow Service (WF-05 DAG & HITL)', () => {
  let checkpointStore: InMemoryWorkflowCheckpointStore;
  let eventEmitter: WorkflowEventEmitter;
  let workflowService: DailyOperationWorkflowService;

  beforeEach(() => {
    checkpointStore = new InMemoryWorkflowCheckpointStore();
    eventEmitter = new WorkflowEventEmitter();
    workflowService = new DailyOperationWorkflowService({
      checkpointStore,
      eventEmitter,
    });
  });

  // ==========================================================================
  // 1. DAG Orchestration & Execution Lifecycle
  // ==========================================================================
  describe('1. DAG Orchestration & Lifecycle', () => {
    it('should execute full 9-step DAG in SKU mode without crashing', async () => {
      const input: DailyOperationWorkflowInput = {
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        mode: 'SKU',
        skuId: 'MTH-WHITE-001',
        dateRange: { from: '2026-03-08', to: '2026-03-14' },
        baselinePeriod: { from: '2026-03-01', to: '2026-03-07' },
      };

      const result = await workflowService.execute(input);

      expect(result).toBeDefined();
      expect(result.taskId).toBeDefined();
      expect(result.workflowRunId).toBeDefined();
      expect(result.mode).toBe('SKU');

      // Status should be WAITING_APPROVAL (if actions require approval) or COMPLETED
      expect(['WAITING_APPROVAL', 'COMPLETED']).toContain(result.status);

      // Verify Step Traces
      expect(result.stepTraces.length).toBeGreaterThanOrEqual(7);
      const traceSteps = result.stepTraces.map((t) => t.step);
      expect(traceSteps).toContain('VALIDATE_INPUT');
      expect(traceSteps).toContain('RESOLVE_SKUS');
      expect(traceSteps).toContain('LOAD_CONTEXT');
      expect(traceSteps).toContain('DETECT_SIGNALS');
      expect(traceSteps).toContain('DIAGNOSE');
      expect(traceSteps).toContain('RECOMMEND');
      expect(traceSteps).toContain('AGGREGATE');

      // Verify Duration and Non-empty summary
      result.stepTraces.forEach((trace) => {
        expect(trace.durationMs).toBeGreaterThanOrEqual(0);
        expect(trace.status).toBe('COMPLETED');
      });
    });

    it('should emit structured SSE events throughout DAG lifecycle without private LLM tokens', async () => {
      const emittedEvents: DailyOperationWorkflowEvent[] = [];

      const input: DailyOperationWorkflowInput = {
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        mode: 'SKU',
        skuId: 'MTH-WHITE-001',
        dateRange: { from: '2026-03-08', to: '2026-03-14' },
      };

      await workflowService.execute(input, {
        onEvent: (event) => emittedEvents.push(event),
      });

      expect(emittedEvents.length).toBeGreaterThan(0);
      const types = emittedEvents.map((e) => e.type);

      expect(types).toContain('workflow.started');
      expect(types).toContain('step.started');
      expect(types).toContain('step.completed');
      expect(types).toContain('sku.started');
      expect(types).toContain('sku.completed');

      // Security check: ensure NO raw internal prompts or private reasoning tokens leak
      emittedEvents.forEach((evt) => {
        const str = JSON.stringify(evt).toLowerCase();
        expect(str).not.toContain('system_prompt');
        expect(str).not.toContain('chain-of-thought');
        expect(str).not.toContain('internal reasoning');
      });
    });
  });

  // ==========================================================================
  // 2. Preconditions & Input Validation
  // ==========================================================================
  describe('2. Preconditions & Input Validation', () => {
    it('should reject missing workspaceId with FAILED status and error trace', async () => {
      const input = {
        workspaceId: '',
        marketplaceId: 'AMAZON_US',
        mode: 'SKU' as const,
        skuId: 'MTH-WHITE-001',
        dateRange: { from: '2026-03-08', to: '2026-03-14' },
      };

      const result = await workflowService.execute(input);

      expect(result.status).toBe('FAILED');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('workspaceId is required');
      expect(result.stepTraces.some((t) => t.status === 'FAILED')).toBe(true);
    });

    it('should reject missing marketplaceId', async () => {
      const input = {
        workspaceId: 'ws_demo',
        marketplaceId: '',
        mode: 'SKU' as const,
        skuId: 'MTH-WHITE-001',
        dateRange: { from: '2026-03-08', to: '2026-03-14' },
      };

      const result = await workflowService.execute(input);

      expect(result.status).toBe('FAILED');
      expect(result.errors[0]).toContain('marketplaceId is required');
    });

    it('should reject inverted date range (from > to)', async () => {
      const input: DailyOperationWorkflowInput = {
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        mode: 'SKU',
        skuId: 'MTH-WHITE-001',
        dateRange: { from: '2026-03-20', to: '2026-03-10' },
      };

      const result = await workflowService.execute(input);

      expect(result.status).toBe('FAILED');
      expect(result.errors[0]).toContain('dateRange.from cannot be greater than dateRange.to');
    });

    it('should reject SKU mode without skuId or skuIds', async () => {
      const input: DailyOperationWorkflowInput = {
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        mode: 'SKU',
        dateRange: { from: '2026-03-08', to: '2026-03-14' },
      };

      const result = await workflowService.execute(input);

      expect(result.status).toBe('FAILED');
      expect(result.errors[0]).toContain('skuId is required when mode is SKU');
    });
  });

  // ==========================================================================
  // 3. Dual Execution Modes (SKU vs WORKSPACE)
  // ==========================================================================
  describe('3. Dual Execution Modes', () => {
    it('should run in SKU Mode targeting a single SKU', async () => {
      const input: DailyOperationWorkflowInput = {
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        mode: 'SKU',
        skuId: 'MTH-WHITE-001',
        dateRange: { from: '2026-03-08', to: '2026-03-14' },
      };

      const result = await workflowService.execute(input);

      expect(result.skuSummary.total).toBe(1);
      expect(result.skuSummary.evaluated).toBe(1);
      expect(result.skuSummary.failed).toBe(0);
      expect(result.actions.every((a) => a.skuId === 'MTH-WHITE-001' || a.skuId === 'sku_white_001')).toBe(true);
    });

    it('should run in WORKSPACE Mode across multiple SKUs and aggregate action list', async () => {
      const customResolver: ISkuResolver = {
        resolveActiveSkus: async () => ['MTH-WHITE-001', 'MTH-GREEN-001', 'MTH-GREY-001'],
      };

      const service = new DailyOperationWorkflowService({
        checkpointStore,
        eventEmitter,
        skuResolver: customResolver,
      });

      const input: DailyOperationWorkflowInput = {
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        mode: 'WORKSPACE',
        dateRange: { from: '2026-08-10', to: '2026-08-16' },
        baselinePeriod: { from: '2026-08-03', to: '2026-08-09' },
      };

      const result = await service.execute(input);

      expect(result.skuSummary.total).toBe(3);
      expect(result.skuSummary.evaluated).toBe(3);
      expect(result.skuSummary.failed).toBe(0);
      expect(result.actions.length).toBeGreaterThan(0);
      expect(result.healthStatus).toBeDefined();
    });
  });

  // ==========================================================================
  // 4. Fault Isolation & Partial Failure Defense
  // ==========================================================================
  describe('4. Fault Isolation & Partial Failure Defense', () => {
    it('should isolate failure of single SKU in workspace mode and return PARTIAL_SUCCESS', async () => {
      // Mock ContextLoader where one SKU throws
      const mockLoader = {
        loadSku360: async (params: any) => {
          if (params.skuId === 'SKU-FAILING-001') {
            throw new Error('Database connection timeout for SKU-FAILING-001');
          }
          return buildMockContext({
            identity: {
              workspaceId: params.workspaceId,
              marketplaceId: params.marketplaceId,
              productId: `prod_${params.skuId}`,
              skuId: params.skuId,
              skuCode: params.skuId,
              status: 'ACTIVE',
            },
          });
        },
      } as unknown as Sku360ContextLoader;

      const service = new DailyOperationWorkflowService({
        contextLoader: mockLoader,
        checkpointStore,
        eventEmitter,
      });

      const input: DailyOperationWorkflowInput = {
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        mode: 'WORKSPACE',
        skuIds: ['MTH-WHITE-001', 'SKU-FAILING-001'],
        dateRange: { from: '2026-03-08', to: '2026-03-14' },
        options: { autoApproveAdvisory: true },
      };

      const result = await service.execute(input);

      expect(result.status).toBe('PARTIAL_SUCCESS');
      expect(result.skuSummary.total).toBe(2);
      expect(result.skuSummary.evaluated).toBe(1);
      expect(result.skuSummary.failed).toBe(1);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('Database connection timeout');
    });

    it('should abort immediately when failFast is true on SKU load failure', async () => {
      const mockLoader = {
        loadSku360: async (params: any) => {
          if (params.skuId === 'SKU-FAILING-001') {
            throw new Error('Fatal network error');
          }
          return buildMockContext();
        },
      } as unknown as Sku360ContextLoader;

      const service = new DailyOperationWorkflowService({
        contextLoader: mockLoader,
        checkpointStore,
        eventEmitter,
      });

      const input: DailyOperationWorkflowInput = {
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        mode: 'WORKSPACE',
        skuIds: ['SKU-FAILING-001', 'MTH-WHITE-001'],
        dateRange: { from: '2026-03-08', to: '2026-03-14' },
        options: { failFast: true },
      };

      const result = await service.execute(input);

      expect(result.status).toBe('FAILED');
      expect(result.errors.some((e) => e.includes('Fail-fast triggered'))).toBe(true);
    });
  });

  // ==========================================================================
  // 5. D1 - D10 Workflow Scenario Integration & Mapping
  // ==========================================================================
  describe('5. D1 - D10 Workflow Scenario Integration', () => {
    it('D1: Profit Drop workflow should detect PROFIT_DROP, diagnose Ads driver, and recommend REVIEW_AD_SPEND', async () => {
      const input: DailyOperationWorkflowInput = {
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        mode: 'SKU',
        skuId: 'MTH-WHITE-001',
        dateRange: { from: '2026-08-10', to: '2026-08-16' },
        baselinePeriod: { from: '2026-08-03', to: '2026-08-09' },
      };

      const result = await workflowService.execute(input);

      expect(result.signals.some((s) => s.code === 'PROFIT_DROP' || s.code === 'NET_MARGIN_DEGRADATION')).toBe(true);
      expect(result.diagnoses.some((d) => d.primaryDriver.domain === 'PROFIT' || d.primaryDriver.domain === 'ADVERTISING')).toBe(true);
      expect(result.actions.some((a) => a.actionType === 'REVIEW_AD_SPEND' || a.actionType === 'REVIEW_NEGATIVE_KEYWORD')).toBe(true);
    });

    it('D2: Stockout Imminent workflow should detect STOCKOUT_IMMINENT, diagnose inventory, and recommend replenishment', async () => {
      const input: DailyOperationWorkflowInput = {
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        mode: 'SKU',
        skuId: 'MTH-GREEN-001',
        dateRange: { from: '2026-07-16', to: '2026-07-22' },
        baselinePeriod: { from: '2026-07-09', to: '2026-07-15' },
      };

      const result = await workflowService.execute(input);

      expect(result.signals.some((s) => s.domain === 'INVENTORY')).toBe(true);
      expect(result.diagnoses.some((d) => d.primaryDriver.domain === 'INVENTORY')).toBe(true);
      expect(
        result.actions.some((a) => a.actionType === 'PREPARE_REPLENISHMENT' || a.actionType === 'REVIEW_REORDER_PLAN' || a.actionType === 'REVIEW_AD_SPEND')
      ).toBe(true);
      expect(result.actions.some((a) => a.priority === 'P1')).toBe(true);
    });

    it('D4: Quality Defect workflow should recommend product return reason review and listing specification check', async () => {
      const input: DailyOperationWorkflowInput = {
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        mode: 'SKU',
        skuId: 'MTH-GREY-001',
        dateRange: { from: '2026-07-20', to: '2026-07-26' },
        baselinePeriod: { from: '2026-07-13', to: '2026-07-19' },
      };

      const result = await workflowService.execute(input);

      expect(result.signals.some((s) => s.domain === 'RETURNS' || s.domain === 'REVIEWS')).toBe(true);
      expect(result.diagnoses.some((d) => d.primaryDriver.domain === 'RETURNS' || d.primaryDriver.domain === 'REVIEWS')).toBe(true);
      expect(
        result.actions.some(
          (a) =>
            a.actionType === 'REVIEW_RETURN_REASON' ||
            a.actionType === 'REVIEW_LISTING_SPECIFICATION' ||
            a.actionType === 'INVESTIGATE_PRODUCT_FIT'
        )
      ).toBe(true);
    });

    it('D8: Zero Anomalies / Clean State should bypass diagnosis and return HEALTHY status', async () => {
      // Mock ContextLoader with perfect healthy metrics
      const healthyContext = buildMockContext({
        sales: {
          ordersCount: { current: 300, baseline: 300, delta: 0, deltaPct: 0 },
          unitsSold: { current: 330, baseline: 330, delta: 0, deltaPct: 0 },
          revenue: { current: 9570.0, baseline: 9570.0, delta: 0, deltaPct: 0 },
          averageSellingPrice: { current: 29.0, baseline: 29.0, delta: 0, deltaPct: 0 },
          availability: 'AVAILABLE',
        },
        advertising: {
          spend: { current: 1020.0, baseline: 1020.0, delta: 0, deltaPct: 0 },
          sales: { current: 3400.0, baseline: 3400.0, delta: 0, deltaPct: 0 },
          orders: { current: 120, baseline: 120, delta: 0, deltaPct: 0 },
          impressions: { current: 35000, baseline: 35000, delta: 0, deltaPct: 0 },
          clicks: { current: 1100, baseline: 1100, delta: 0, deltaPct: 0 },
          ctr: { current: 0.031, baseline: 0.031, delta: 0, deltaPct: 0 },
          cvr: { current: 0.10, baseline: 0.10, delta: 0, deltaPct: 0 },
          acos: { current: 0.30, baseline: 0.30, delta: 0, deltaPct: 0 },
          roas: { current: 3.33, baseline: 3.33, delta: 0, deltaPct: 0 },
          searchTerms: [],
          availability: 'AVAILABLE',
        },
        inventory: {
          fulfillableQuantity: 1500,
          inboundQuantity: 500,
          reservedQuantity: 50,
          avgDailySales: 40.0,
          daysCover: 37.5,
          leadTimeDays: 21,
          safetyStockDays: 14,
          reorderPoint: 1400,
          inventoryHealth: 'HEALTHY',
          recommendedQuantity: 0,
          availability: 'AVAILABLE',
        },
        returns: {
          returnCount: { current: 5, baseline: 5, delta: 0, deltaPct: 0 },
          deliveredUnits: { current: 300, baseline: 300, delta: 0, deltaPct: 0 },
          returnRate: { current: 0.0167, baseline: 0.0167, delta: 0, deltaPct: 0 },
          returnCost: { current: 145.0, baseline: 145.0, delta: 0, deltaPct: 0 },
          availability: 'AVAILABLE',
        },
        reviews: {
          overallRating: 4.8,
          totalReviews: 250,
          recentReviewCount: 20,
          negativeReviewCount: 0,
          negativeReviewRatio: 0,
          availability: 'AVAILABLE',
        },
        competitors: {
          items: [
            {
              competitorId: 'comp_01',
              asin: 'B0COMP001',
              name: 'Competitor Marble Holder',
              relationType: 'DIRECT',
              isPrimary: true,
              currentPrice: 29.0,
              currentRating: 4.5,
              reviewCount: 300,
            },
          ],
          availability: 'AVAILABLE',
        },
        profit: {
          revenue: { current: 9570.0, baseline: 9570.0, delta: 0, deltaPct: 0 },
          cogs: { current: 2970.0, baseline: 2970.0, delta: 0, deltaPct: 0 },
          amazonFees: { current: 1435.5, baseline: 1435.5, delta: 0, deltaPct: 0 },
          fbaFee: { current: 1650.0, baseline: 1650.0, delta: 0, deltaPct: 0 },
          adsCost: { current: 1020.0, baseline: 1020.0, delta: 0, deltaPct: 0 },
          returnLoss: { current: 145.0, baseline: 145.0, delta: 0, deltaPct: 0 },
          otherCosts: { current: 0, baseline: 0, delta: 0, deltaPct: 0 },
          netProfit: { current: 2349.5, baseline: 2349.5, delta: 0, deltaPct: 0 },
          netMargin: { current: 0.2455, baseline: 0.2455, delta: 0, deltaPct: 0 },
          availability: 'AVAILABLE',
        },
      });

      const mockLoader = {
        loadSku360: async () => healthyContext,
      } as unknown as Sku360ContextLoader;

      const service = new DailyOperationWorkflowService({
        contextLoader: mockLoader,
        checkpointStore,
        eventEmitter,
      });

      const input: DailyOperationWorkflowInput = {
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        mode: 'SKU',
        skuId: 'MTH-CLEAN-001',
        dateRange: { from: '2026-03-08', to: '2026-03-14' },
      };

      const result = await service.execute(input);

      expect(result.signals.length).toBe(0);
      expect(result.diagnoses.length).toBe(0);
      expect(result.actions.length).toBe(0);
      expect(result.summary.healthStatus).toBe('HEALTHY');
      expect(result.summary.noActionRequired).toBe(true);
      expect(result.status).toBe('COMPLETED');
    });
  });

  // ==========================================================================
  // 6. Cross-SKU Priority Ranking & Action Aggregation
  // ==========================================================================
  describe('6. Cross-SKU Priority Ranking & Action Aggregation', () => {
    it('should sort actions deterministically by P1 > P2 > P3 then by financial impact', () => {
      const mockSignals: BusinessSignal[] = [
        {
          signalId: 'SIG-1',
          workspaceId: 'ws_demo',
          skuId: 'SKU-A',
          domain: 'PROFIT',
          code: 'PROFIT_DROP',
          metric: 'netProfit',
          currentValue: -500,
          severity: 'CRITICAL',
          direction: 'DOWN',
          detectedBy: 'RULE',
          title: 'Profit Drop',
          description: 'Net profit dropped',
          evidence: [],
          detectedAt: new Date().toISOString(),
        },
      ];

      const mockActions: RecommendedAction[] = [
        {
          actionId: 'ACT-P2-LOW',
          workspaceId: 'ws_demo',
          skuId: 'SKU-B',
          sourceSignalIds: ['SIG-1'],
          category: 'ADVERTISING',
          actionType: 'REVIEW_NEGATIVE_KEYWORD',
          title: 'Optimize search terms',
          reason: 'Negate wasted terms',
          priority: 'P2',
          executionMode: 'APPROVAL_REQUIRED',
          status: 'PROPOSED',
          impactAmount: 200,
          riskLevel: 'LOW',
          evidence: [],
          createdAt: new Date().toISOString(),
        },
        {
          actionId: 'ACT-P1-HIGH',
          workspaceId: 'ws_demo',
          skuId: 'SKU-A',
          sourceSignalIds: ['SIG-1'],
          category: 'INVENTORY',
          actionType: 'PREPARE_REPLENISHMENT',
          title: 'Urgent Restock',
          reason: 'Place replenishment order',
          priority: 'P1',
          executionMode: 'APPROVAL_REQUIRED',
          status: 'PROPOSED',
          impactAmount: 1500,
          riskLevel: 'MEDIUM',
          evidence: [],
          createdAt: new Date().toISOString(),
        },
        {
          actionId: 'ACT-P1-LOW',
          workspaceId: 'ws_demo',
          skuId: 'SKU-C',
          sourceSignalIds: ['SIG-1'],
          category: 'ADVERTISING',
          actionType: 'REVIEW_AD_SPEND',
          title: 'Throttle Ad Budget',
          reason: 'Prevent stockout acceleration',
          priority: 'P1',
          executionMode: 'ADVISORY',
          status: 'PROPOSED',
          impactAmount: 300,
          riskLevel: 'LOW',
          evidence: [],
          createdAt: new Date().toISOString(),
        },
        {
          actionId: 'ACT-P3-MED',
          workspaceId: 'ws_demo',
          skuId: 'SKU-A',
          sourceSignalIds: ['SIG-1'],
          category: 'LISTING',
          actionType: 'REVIEW_LISTING_SPECIFICATION',
          title: 'Update listing copy',
          reason: 'Clarify specs',
          priority: 'P3',
          executionMode: 'APPROVAL_REQUIRED',
          status: 'PROPOSED',
          impactAmount: 100,
          riskLevel: 'LOW',
          evidence: [],
          createdAt: new Date().toISOString(),
        },
      ];

      const { rankedActions, summary, healthStatus } = WorkflowAggregator.aggregate({
        totalSkuCount: 3,
        evaluatedSkuCount: 3,
        failedSkuCount: 0,
        signals: mockSignals,
        actions: mockActions,
      });

      expect(rankedActions[0].actionId).toBe('ACT-P1-HIGH'); // P1 with higher impact 1500
      expect(rankedActions[1].actionId).toBe('ACT-P1-LOW');  // P1 with impact 300
      expect(rankedActions[2].actionId).toBe('ACT-P2-LOW');  // P2
      expect(rankedActions[3].actionId).toBe('ACT-P3-MED');  // P3

      expect(healthStatus).toBe('CRITICAL');
      expect(summary.p1ActionCount).toBe(2);
      expect(summary.p2ActionCount).toBe(1);
      expect(summary.p3ActionCount).toBe(1);
      expect(summary.approvalRequiredCount).toBe(3);
      expect(summary.advisoryCount).toBe(1);
      expect(summary.affectedSkuCount).toBe(3);
      expect(summary.topRisks.length).toBe(1);
      expect(summary.topRisks[0].skuId).toBe('SKU-A');
    });
  });

  // ==========================================================================
  // 7. Human-In-The-Loop (HITL) Gate & Action Approvals
  // ==========================================================================
  describe('7. Human-In-The-Loop (HITL) Gate & Approvals', () => {
    it('should pause at APPROVAL_GATE with WAITING_APPROVAL status when approval-required actions exist', async () => {
      const input: DailyOperationWorkflowInput = {
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        mode: 'SKU',
        skuId: 'MTH-WHITE-001',
        dateRange: { from: '2026-03-08', to: '2026-03-14' },
      };

      const result = await workflowService.execute(input);

      if (result.approvalSummary.pendingCount > 0) {
        expect(result.status).toBe('WAITING_APPROVAL');

        // Checkpoint must be saved
        const checkpoint = await checkpointStore.get(result.taskId);
        expect(checkpoint).not.toBeNull();
        expect(checkpoint?.taskId).toBe(result.taskId);
        expect(checkpoint?.status).toBe('WAITING_APPROVAL');
        expect(checkpoint?.currentStep).toBe('APPROVAL_GATE');
      }
    });

    it('should approve an action, update state to APPROVED, record decision, and complete when all approved', async () => {
      const input: DailyOperationWorkflowInput = {
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        mode: 'SKU',
        skuId: 'MTH-WHITE-001',
        dateRange: { from: '2026-03-08', to: '2026-03-14' },
      };

      const initialResult = await workflowService.execute(input);
      const checkpoint = await checkpointStore.get(initialResult.taskId);
      const pendingIds = checkpoint ? [...checkpoint.approvalState.pendingActionIds] : [];

      if (pendingIds.length > 0) {
        const firstActionId = pendingIds[0];

        const updatedState = await workflowService.approveAction(
          initialResult.taskId,
          firstActionId,
          'OPERATOR_ALICE',
          'Approved budget increase'
        );

        const updatedAction = updatedState.recommendedActions.find((a) => a.actionId === firstActionId);
        expect(updatedAction?.status).toBe('APPROVED');
        expect(updatedState.approvalState.approvedActionIds).toContain(firstActionId);
        expect(updatedState.approvalState.pendingActionIds).not.toContain(firstActionId);

        const decision = updatedState.approvalState.decisions.find((d) => d.actionId === firstActionId);
        expect(decision).toBeDefined();
        expect(decision?.decision).toBe('APPROVED');
        expect(decision?.decidedBy).toBe('OPERATOR_ALICE');
        expect(decision?.note).toBe('Approved budget increase');

        // Approve remaining actions
        for (let i = 1; i < pendingIds.length; i++) {
          await workflowService.approveAction(
            initialResult.taskId,
            pendingIds[i],
            'OPERATOR_ALICE'
          );
        }

        const finalResume = await workflowService.resume(initialResult.taskId);
        expect(finalResume.status).toBe('COMPLETED');
        expect(finalResume.approvalSummary.pendingCount).toBe(0);
      }
    });

    it('should reject an action and track in rejectedActionIds', async () => {
      const input: DailyOperationWorkflowInput = {
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        mode: 'SKU',
        skuId: 'MTH-WHITE-001',
        dateRange: { from: '2026-03-08', to: '2026-03-14' },
      };

      const initialResult = await workflowService.execute(input);
      const checkpoint = await checkpointStore.get(initialResult.taskId);
      const pendingIds = checkpoint?.approvalState.pendingActionIds ?? [];

      if (pendingIds.length > 0) {
        const actionId = pendingIds[0];
        const state = await workflowService.rejectAction(
          initialResult.taskId,
          actionId,
          'OPERATOR_BOB',
          'Too risky for current cash flow'
        );

        const action = state.recommendedActions.find((a) => a.actionId === actionId);
        expect(action?.status).toBe('REJECTED');
        expect(state.approvalState.rejectedActionIds).toContain(actionId);
        expect(state.approvalState.pendingActionIds).not.toContain(actionId);
      }
    });

    it('should dismiss an action and track in dismissedActionIds', async () => {
      const input: DailyOperationWorkflowInput = {
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        mode: 'SKU',
        skuId: 'MTH-WHITE-001',
        dateRange: { from: '2026-03-08', to: '2026-03-14' },
      };

      const initialResult = await workflowService.execute(input);
      const checkpoint = await checkpointStore.get(initialResult.taskId);
      const pendingIds = checkpoint?.approvalState.pendingActionIds ?? [];

      if (pendingIds.length > 0) {
        const actionId = pendingIds[0];
        const state = await workflowService.dismissAction(
          initialResult.taskId,
          actionId,
          'OPERATOR_CHARLIE',
          'Handled out of band'
        );

        const action = state.recommendedActions.find((a) => a.actionId === actionId);
        expect(action?.status).toBe('DISMISSED');
        expect(state.approvalState.dismissedActionIds).toContain(actionId);
      }
    });

    it('should resume paused workflow without re-running earlier steps', async () => {
      const input: DailyOperationWorkflowInput = {
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        mode: 'SKU',
        skuId: 'MTH-WHITE-001',
        dateRange: { from: '2026-03-08', to: '2026-03-14' },
      };

      const result = await workflowService.execute(input);
      const tracesCountBefore = result.stepTraces.length;

      const resumedResult = await workflowService.resume(result.taskId);
      expect(resumedResult.taskId).toBe(result.taskId);
      expect(resumedResult.stepTraces.length).toBe(tracesCountBefore);
    });
  });

  // ==========================================================================
  // 8. Strict Zero-Mutation Execution Boundary
  // ==========================================================================
  describe('8. Strict Zero-Mutation Execution Boundary', () => {
    it('all recommended actions must remain in non-executed state (PROPOSED, APPROVED, REJECTED, DISMISSED)', async () => {
      const input: DailyOperationWorkflowInput = {
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        mode: 'WORKSPACE',
        skuIds: ['MTH-WHITE-001', 'MTH-GREEN-001'],
        dateRange: { from: '2026-03-08', to: '2026-03-14' },
      };

      const result = await workflowService.execute(input);

      result.actions.forEach((action) => {
        expect(['PROPOSED', 'APPROVED', 'REJECTED', 'DISMISSED']).toContain(action.status);
        // Explicit check: NO executed or applied status
        expect((action as any).status).not.toBe('EXECUTED');
        expect((action as any).status).not.toBe('APPLIED');
      });
    });
  });

  // ==========================================================================
  // 9. Checkpoint Store Deep-Cloning Invariant
  // ==========================================================================
  describe('9. Checkpoint Store Deep-Cloning Invariant', () => {
    it('mutating a retrieved state object must not mutate store contents unless explicitly saved', async () => {
      const mockState: DailyOperationWorkflowState = {
        taskId: 'task-test-clone',
        workflowRunId: 'run-1',
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        mode: 'SKU',
        skuIds: ['MTH-WHITE-001'],
        dateRange: { from: '2026-03-08', to: '2026-03-14' },
        contexts: {},
        signals: [],
        diagnoses: [],
        recommendedActions: [],
        approvalState: {
          pendingActionIds: ['ACT-001'],
          approvedActionIds: [],
          rejectedActionIds: [],
          dismissedActionIds: [],
          decisions: [],
        },
        currentStep: 'APPROVAL_GATE',
        completedSteps: ['VALIDATE_INPUT', 'RESOLVE_SKUS', 'LOAD_CONTEXT'],
        stepTraces: [],
        errors: [],
        warnings: [],
        status: 'WAITING_APPROVAL',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await checkpointStore.save(mockState);

      const retrieved1 = await checkpointStore.get('task-test-clone');
      expect(retrieved1).not.toBeNull();

      // Mutate retrieved object in-place
      retrieved1!.status = 'COMPLETED';
      retrieved1!.approvalState.pendingActionIds.pop();

      // Fetch again: must remain original
      const retrieved2 = await checkpointStore.get('task-test-clone');
      expect(retrieved2!.status).toBe('WAITING_APPROVAL');
      expect(retrieved2!.approvalState.pendingActionIds.length).toBe(1);
    });
  });
});
