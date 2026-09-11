import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { ScenarioService } from '../src/modules/scenario/scenario.service.js';
import { MarketService } from '../src/modules/market/market.service.js';
import { ListingService } from '../src/modules/listing/listing.service.js';
import { AdvertisingService } from '../src/modules/advertising/advertising.service.js';
import { AnalystService } from '../src/modules/analyst/analyst.service.js';
import { AgentTaskService } from '../src/modules/agent-task/agent-task.service.js';
import { EvalService } from '../src/modules/eval/eval.service.js';

describe('CrossPilot AI Platform Integration Tests (Milestones 2 - 8)', () => {
  let scenarioService: ScenarioService;
  let marketService: MarketService;
  let listingService: ListingService;
  let advertisingService: AdvertisingService;
  let analystService: AnalystService;
  let agentTaskService: AgentTaskService;
  let evalService: EvalService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      workspace: { findUnique: jest.fn(), create: jest.fn() },
      marketplace: { upsert: jest.fn() },
      product: { create: jest.fn(), findUnique: jest.fn() },
      sku: { create: jest.fn(), findUnique: jest.fn() },
      supplier: { create: jest.fn() },
      inventoryBalance: { createMany: jest.fn() },
      profitDaily: { createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      inventorySnapshot: { createMany: jest.fn() },
      campaign: { create: jest.fn(), findMany: jest.fn() },
      adMetricDaily: { createMany: jest.fn() },
      searchTermMetricDaily: {
        createMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'term_1',
            campaignId: 'c1',
            skuId: 's1',
            searchTerm: 'bathroom organizer',
            impressions: 12500,
            clicks: 280,
            spend: 420.0,
            orders: 2,
            sales: 450.0,
            acos: 0.9333,
          },
          {
            id: 'term_2',
            campaignId: 'c1',
            skuId: 's1',
            searchTerm: 'marble toothbrush holder',
            impressions: 8400,
            clicks: 310,
            spend: 185.0,
            orders: 28,
            sales: 840.0,
            acos: 0.2202,
          },
        ]),
      },
      competitor: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'comp_1',
            asin: 'B08XYZ1234',
            brand: 'LuxStone Home',
            title: 'LuxStone Heavy Natural Resin Toothbrush Caddy',
            category: 'Home & Kitchen',
            imageUrl: null,
            snapshots: [{ price: 27.99, rating: 4.3, reviewCount: 850, estimatedSales: 1100, estimatedRevenue: 30789, bsr: 4200 }],
          },
        ]),
      },
      productCompetitor: { createMany: jest.fn() },
      competitorSnapshot: { deleteMany: jest.fn() },
      vocAnalysisRun: { create: jest.fn() },
      vocTopic: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'voc_1',
            topicName: 'Hole Size Narrow for Electric Handles',
            topicType: 'PAIN_POINT',
            sentiment: 'NEGATIVE',
            reviewCount: 56,
            percentage: 31.10,
            severityScore: 4.5,
            summary: '31% of negative reviews complain hole is too tight for Oral-B handles.',
            topicReviews: [
              {
                reviewId: 'r1',
                evidenceText: 'Oral-B iO handle will not fit into the smaller holes',
                review: { reviewerName: 'Sarah M.', rating: 2 },
              },
            ],
          },
        ]),
        findFirst: jest.fn().mockResolvedValue({
          id: 'voc_1',
          topicName: 'Hole Size Narrow for Electric Handles',
          sentiment: 'NEGATIVE',
          percentage: 31.10,
          topicReviews: [
            {
              reviewId: 'r1',
              evidenceText: 'Oral-B iO handle will not fit into the smaller holes',
              relevanceScore: 0.95,
              review: {
                id: 'r1',
                reviewerName: 'Sarah M.',
                rating: 2,
                reviewDate: new Date('2026-08-01'),
                title: 'Too narrow for Oral-B',
                content: 'My Oral-B iO handle will not fit into the smaller holes. Had to return.',
              },
            },
          ],
        }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'voc_1',
          topicName: 'Hole Size Narrow for Electric Handles',
          sentiment: 'NEGATIVE',
          percentage: 31.10,
          topicReviews: [
            {
              reviewId: 'r1',
              evidenceText: 'Oral-B iO handle will not fit into the smaller holes',
              relevanceScore: 0.95,
              review: {
                id: 'r1',
                reviewerName: 'Sarah M.',
                rating: 2,
                reviewDate: new Date('2026-08-01'),
                title: 'Too narrow for Oral-B',
                content: 'My Oral-B iO handle will not fit into the smaller holes. Had to return.',
              },
            },
          ],
        }),
      },
      vocTopicReview: { create: jest.fn() },
      review: { create: jest.fn() },
      productOpportunity: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'opp_1',
            title: 'Next-Gen Marble Toothbrush Caddy with 1.5" Universal Slots',
            problemSummary: 'Narrow holes cause high return rates.',
            targetCustomer: 'US Urban homeowners',
            recommendedPositioning: 'Universal compatibility luxury marble',
            opportunityScore: 8.8,
            confidenceLevel: 0.92,
            evidenceSummary: 'Derived from verified reviews',
            status: 'APPROVED',
          },
        ]),
      },
      marketResearchProject: { findFirst: jest.fn() },
      listing: { findFirst: jest.fn() },
      listingVersion: { create: jest.fn() },
      listingComplianceCheck: { create: jest.fn() },
      analysisSession: { create: jest.fn() },
      analysisWaterfall: {
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({
          periodStart: new Date('2026-08-15'),
          periodEnd: new Date('2026-08-28'),
          totalVariance: -2280.0,
          advertisingImpact: -980.0,
          returnsImpact: -620.0,
          inventoryImpact: -510.0,
          priceImpact: -310.0,
          otherImpact: 140.0,
          formulaExplained: '-2280 = -980 - 620 - 510 - 310 + 140',
          session: {
            findings: [
              {
                findingType: 'ADVERTISING',
                title: 'Broad Search Term Bleed',
                metricName: 'Ads Spend',
                impactAmount: -980.0,
                direction: 'NEGATIVE',
                confidence: 0.96,
                evidenceJson: '{"searchTerm":"bathroom organizer"}',
                priority: 1,
                recommendation: 'Add Negative Exact',
              },
            ],
          },
        }),
      },
      analysisFinding: { createMany: jest.fn() },
      agentTask: {
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({
          id: 'task_001',
          taskType: 'VARIANCE_ATTRIBUTION',
          status: 'COMPLETED',
          inputJson: '{"question":"Why did profit drop?"}',
          resultJson: '{"variance":-2280}',
          steps: [
            {
              id: 's1',
              stepNumber: 1,
              stepType: 'TOOL_CALL',
              name: 'Query Financial Ledger',
              status: 'COMPLETED',
              inputSummary: 'Query ProfitDaily',
              outputSummary: 'Variance: -2280',
              toolExecutions: [
                {
                  id: 'te1',
                  toolName: 'query_profit_summary',
                  status: 'SUCCESS',
                  latencyMs: 145,
                  inputJson: '{}',
                  outputJson: '{"variance":-2280}',
                  errorMessage: null,
                },
              ],
            },
          ],
        }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'task_001',
          taskType: 'VARIANCE_ATTRIBUTION',
          status: 'COMPLETED',
          inputJson: '{"question":"Why did profit drop?"}',
          resultJson: '{"variance":-2280}',
          steps: [
            {
              id: 's1',
              stepNumber: 1,
              stepType: 'TOOL_CALL',
              name: 'Query Financial Ledger',
              status: 'COMPLETED',
              inputSummary: 'Query ProfitDaily',
              outputSummary: 'Variance: -2280',
              toolExecutions: [
                {
                  id: 'te1',
                  toolName: 'query_profit_summary',
                  status: 'SUCCESS',
                  latencyMs: 145,
                  inputJson: '{}',
                  outputJson: '{"variance":-2280}',
                  errorMessage: null,
                },
              ],
            },
          ],
        }),
      },
      agentStep: { create: jest.fn() },
      toolExecution: { create: jest.fn() },
      approval: { deleteMany: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScenarioService,
        MarketService,
        ListingService,
        AdvertisingService,
        AnalystService,
        AgentTaskService,
        EvalService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    scenarioService = module.get<ScenarioService>(ScenarioService);
    marketService = module.get<MarketService>(MarketService);
    listingService = module.get<ListingService>(ListingService);
    advertisingService = module.get<AdvertisingService>(AdvertisingService);
    analystService = module.get<AnalystService>(AnalystService);
    agentTaskService = module.get<AgentTaskService>(AgentTaskService);
    evalService = module.get<EvalService>(EvalService);
  });

  // Milestone 2 Verification
  it('Milestone 2: Scenario Service returns 90-day trajectory and 10 business events (E01-E10)', () => {
    const timeline = scenarioService.getTimeline();
    expect(timeline).toHaveLength(10);
    expect(timeline[0].code).toBe('E01');
    expect(timeline[9].code).toBe('E10');

    const daily = scenarioService.getDailyAggregates();
    expect(daily.days).toHaveLength(90);
    expect(daily.waterfallWeek11.variance).toBe(-2280);
  });

  // Milestone 3 Verification
  it('Milestone 3: Market & VOC Service returns competitors, VOC topics, and drill-down review evidence', async () => {
    const competitors = await marketService.getCompetitors('ws_default_001');
    expect(competitors).toHaveLength(1);
    expect(competitors[0].brand).toBe('LuxStone Home');

    const topics = await marketService.getVocTopics('ws_default_001');
    expect(topics).toHaveLength(1);
    expect(topics[0].percentage).toBe(31.10);

    const evidence = await marketService.getTopicEvidence('voc_1', 'ws_default_001');
    expect(evidence.evidenceReviews).toHaveLength(1);
    expect(evidence.evidenceReviews[0].highlightedEvidence).toContain('Oral-B iO handle will not fit');
  });

  // Milestone 4 Verification
  it('Milestone 4: Listing Compliance Judge rejects ungrounded claims and passes compliant listings', async () => {
    const rejectResult = await listingService.checkCompliance({
      title: '#1 Best Seller FDA Approved Toothbrush Holder',
      bulletPoints: ['Cures all bathroom bacteria.'],
    });
    expect(rejectResult.status).toBe('BLOCK');
    expect(rejectResult.violations.some((v) => v.ruleCode === 'POL-FDA-001')).toBe(true);

    const passResult = await listingService.checkCompliance({
      title: 'POLEGAS Natural Marble Toothbrush Holder',
      bulletPoints: ['100% Real Natural Stone, 3.57 lbs non-slip base, 1.5 inch slots.'],
    });
    expect(passResult.status).toBe('PASS');
  });

  // Milestone 5 Verification
  it('Milestone 5: Advertising Service flags 93.3% ACOS "bathroom organizer" for negative exact', async () => {
    const recommendations = await advertisingService.getNegativeRecommendations('ws_default_001');
    expect(recommendations.length).toBeGreaterThan(0);
    const badKeyword = recommendations.find((r) => r.searchTerm === 'bathroom organizer');
    expect(badKeyword).toBeDefined();
    expect(badKeyword!.action).toBe('ADD_NEGATIVE_EXACT');
  });

  // Milestone 6 Verification
  it('Milestone 6: Business Analyst Service decomposes -$2,280 profit drop with exact mathematical closure', async () => {
    const waterfall = await analystService.getWaterfall('ws_default_001');
    expect(waterfall.totalVariance).toBe(-2280.0);
    expect(waterfall.attribution.isExactMatch).toBe(true);
    expect(waterfall.attribution.formulaString).toBe('-2280 = -980 -620 -510 -310 +140');
  });

  // Milestone 7 Verification
  it('Milestone 7: Agent Task Service returns structured execution traces and tool call latencies', async () => {
    const trace = await agentTaskService.getTaskTrace('task_001', 'ws_default_001');
    expect(trace.taskId).toBe('task_001');
    expect(trace.steps).toHaveLength(1);
    expect(trace.steps[0].toolExecutions).toHaveLength(1);
    expect(trace.steps[0].toolExecutions[0].toolName).toBe('query_profit_summary');
    expect(trace.steps[0].toolExecutions[0].latencyMs).toBe(145);
  });

  // Milestone 8 Verification
  it('Milestone 8: Eval Service runs golden benchmark suites with 100% pass rate', () => {
    const result = evalService.runBenchmarks();
    expect(result.summary.total).toBe(7);
    expect(result.summary.passed).toBe(7);
    expect(result.summary.failed).toBe(0);
    expect(result.summary.passRate).toBe('100.0%');
  });
});
