import {
  aggregateCampaignMetrics,
  assessInventoryHealth,
  buildHeadline,
  buildHealth,
  insightsFromDiagnosis,
  mapSimEventToInsight,
  pickCritical,
} from '../src/modules/operations-today/operations-today.mapper.js';
import { OperationsTodayService } from '../src/modules/operations-today/operations-today.service.js';
import { DailyOperationTaskSummaryDto } from '@crosspilot/shared';

describe('V9.2.1 operations today mapper', () => {
  it('flags inventory watch when fulfillable is thin', () => {
    const result = assessInventoryHealth([
      { fulfillableQuantity: 379, skuCode: 'MTH-WHITE-001' },
      { fulfillableQuantity: 42, skuCode: 'MTH-GREEN-001' },
    ]);
    expect(result.inventoryHealth).toBe('WATCH');
    expect(result.inventoryNote).toContain('MTH-GREEN-001');
  });

  it('computes ACOS and ROAS from campaign spend/sales, not a stored average', () => {
    const ads = aggregateCampaignMetrics([
      { metrics30d: { spend: 100, sales: 400, orders: 10 } },
      { metrics30d: { spend: 50, sales: 50, orders: 2 } },
    ]);
    expect(ads.spend).toBe(150);
    expect(ads.sales).toBe(450);
    expect(ads.acos).toBe(0.33);
    expect(ads.roas).toBe(3);
  });

  it('turns a WF-05 diagnosis into problem/evidence/impact/recommendation', () => {
    const summary = {
      diagnoses: [
        {
          diagnosisId: 'd1',
          workspaceId: 'ws',
          title: 'Advertising efficiency declined',
          summary: 'ACOS increased while conversion fell',
          primaryDriver: {
            domain: 'ADVERTISING',
            metric: 'acos',
            impactAmount: -820,
            direction: 'UP',
            description: 'ACOS 0.28 → 0.45',
          },
          secondaryDrivers: [],
          confidence: 0.8,
          evidence: [
            { evidenceId: 'e1', category: 'CALCULATED_METRIC', title: 'Campaign A', content: 'Spend +35%', source: 'ads', capturedAt: '' },
            { evidenceId: 'e2', category: 'CALCULATED_METRIC', title: 'Campaign A', content: 'Conversion -20%', source: 'ads', capturedAt: '' },
          ],
          affectedDomains: ['ADVERTISING'],
          affectedSkus: [],
          calculatedAt: '',
        },
      ],
      actions: [
        {
          actionId: 'a1',
          workspaceId: 'ws',
          sourceSignalIds: [],
          sourceDiagnosisIds: ['d1'],
          category: 'ADVERTISING',
          priority: 'P2',
          riskLevel: 'LOW',
          executionMode: 'ADVISORY',
          status: 'PROPOSED',
          title: 'Review keyword bidding',
          reason: 'Review keyword bidding',
          evidence: [],
          createdAt: '',
        },
      ],
    } as unknown as DailyOperationTaskSummaryDto;

    const cards = insightsFromDiagnosis(summary);
    expect(cards).toHaveLength(1);
    expect(cards[0].problem).toMatch(/ACOS/i);
    expect(cards[0].evidence.join(' ')).toMatch(/Spend/);
    expect(cards[0].impact).toMatch(/820/);
    expect(cards[0].recommendation).toMatch(/keyword bidding/i);
  });

  it('maps simulator events without changing WF-05', () => {
    const card = mapSimEventToInsight({
      id: 'ev1',
      code: 'ACOS_SPIKE',
      severity: 'WARNING',
      title: 'ACOS Spike on Broad Search Terms',
      description: 'Broad terms drain budget',
      sku: { skuCode: 'MTH-GREEN-001' },
    });
    expect(card.source).toBe('SIMULATOR');
    expect(card.recommendation).toMatch(/keyword/i);
    expect(card.evidence[0]).toContain('MTH-GREEN-001');
  });

  it('headline prefers the most severe issue', () => {
    const health = buildHealth({
      revenue: 100,
      profit: 10,
      margin: 0.1,
      adsCost: 20,
      orderCount: 3,
      ads: { acos: 0.4, roas: 2.5 },
      inventory: { inventoryHealth: 'HEALTHY', inventoryNote: 'ok' },
    });
    const headline = buildHeadline(
      pickCritical([
        {
          id: '1',
          source: 'SIMULATOR',
          severity: 'INFO',
          title: 'Quiet',
          problem: 'n',
          evidence: [],
          impact: 'n',
          recommendation: 'n',
        },
        {
          id: '2',
          source: 'WF05',
          severity: 'CRITICAL',
          title: 'Return spike',
          problem: 'n',
          evidence: [],
          impact: 'n',
          recommendation: 'n',
        },
      ]),
      health,
      '2026-09-10',
    );
    expect(headline).toContain('Return spike');
  });
});

describe('V9.2.1 OperationsTodayService', () => {
  it('assembles a read-only cockpit payload and never starts WF-05', async () => {
    const profit = {
      getProfitSummary: jest.fn().mockResolvedValue({
        revenue: 98700.04,
        netProfit: 24909.44,
        adsCost: 17306.98,
        margin: 0.2524,
      }),
    };
    const ads = {
      getCampaigns: jest.fn().mockResolvedValue([
        { metrics30d: { spend: 5721.05, sales: 12567, orders: 379 } },
      ]),
    };
    const inventory = {
      listInventory: jest.fn().mockResolvedValue([
        { fulfillableQuantity: 379, skuCode: 'MTH-WHITE-001' },
      ]),
    };
    const simulator = {
      getState: jest.fn().mockResolvedValue({
        initialized: true,
        simDate: '2026-09-10',
        dayIndex: 9,
        status: 'RUNNING',
        events: [
          {
            id: 'e1',
            code: 'RETURN_SPIKE',
            severity: 'WARNING',
            title: 'Return Rate Spike',
            description: 'Hole diameter complaints',
            sku: { skuCode: 'MTH-GREEN-001' },
          },
        ],
      }),
    };
    const diagnosis = {
      getTaskSummary: jest.fn(),
    };
    const intel = {
      listRecommendations: jest.fn().mockResolvedValue([
        {
          id: 'rec-1',
          decision: 'ENTER_MARKET',
          reason: 'Score supports entry',
          confidence: 0.8,
          evidenceIds: ['ev-1'],
          status: 'WAITING_APPROVAL',
          playbookRunId: 'run-1',
          executionDispatched: false,
          createdAt: '2026-09-12T00:00:00.000Z',
          updatedAt: '2026-09-12T00:00:00.000Z',
        },
      ]),
      listEvidence: jest.fn().mockResolvedValue([
        { id: 'ev-1', quote: 'Insert is flimsy and broke', factId: 'f1' },
      ]),
      listFacts: jest.fn().mockResolvedValue([
        {
          id: 'fact-voc',
          factType: 'VOC',
          valueJson: {
            value: 1,
            outputs: {
              listingImprovement: 'Lead with durability. Answer hole size.',
              productImprovement: 'Widen the handle hole',
            },
          },
          observedAt: '2026-09-12T00:00:00.000Z',
        },
      ]),
    };
    const prisma = {
      order: { count: jest.fn().mockResolvedValue(262) },
      agentTask: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      review: {
        findMany: jest.fn().mockResolvedValue([
          { content: 'The insert is flimsy and broke', rating: 2 },
          { content: 'Great quality holder', rating: 5 },
        ]),
      },
    };

    const service = new OperationsTodayService(
      prisma as any,
      profit as any,
      ads as any,
      inventory as any,
      simulator as any,
      diagnosis as any,
      intel as any,
    );

    const dto = await service.getToday('ws-1');
    expect(diagnosis.getTaskSummary).not.toHaveBeenCalled();
    expect(dto.health.orders).toBe(262);
    expect(dto.health.acos).toBe(0.46);
    expect(dto.criticalIssues[0].title).toMatch(/Return/i);
    expect(dto.recommendations[0].status).toBe('WAITING_APPROVAL');
    expect(dto.recommendations[0].evidenceQuotes[0]).toMatch(/flimsy/);
    expect(dto.voc?.painPoints.length).toBeGreaterThan(0);
    expect(dto.headline).toMatch(/Return/i);
  });
});
