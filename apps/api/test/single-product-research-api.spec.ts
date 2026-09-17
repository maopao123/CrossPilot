import { MarketService } from '../src/modules/market/market.service.js';
import type { ProductCandidate, SupplierQuote } from '@crosspilot/shared';

describe('Single-Product Research API & Analytics Truthfulness', () => {
  let service: MarketService;
  const mockPrisma: any = {
    marketResearchProject: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };

  beforeEach(() => {
    service = new MarketService(mockPrisma);
  });

  describe('P0-3: evaluateSingleProduct UNKNOWN cost guard', () => {
    function createCandidateWithQuote(quote: Partial<SupplierQuote>): ProductCandidate {
      const fullQuote: SupplierQuote = {
        id: 'quote-test-1',
        candidateId: 'cand-test-1',
        specVersionId: 'spec-v1',
        supplierName: '工厂A',
        status: 'ACTIVE',
        unitPrice: 40,
        packagingCost: { value: null, source: 'UNKNOWN' },
        logoCost: { value: null, source: 'UNKNOWN' },
        moq: 500,
        captureMethod: 'MANUAL',
        sourceChannel: '1688',
        currency: 'CNY',
        capturedAt: new Date().toISOString(),
        ...quote,
      };

      return {
        id: 'cand-test-1',
        title: '测试商品',
        marketplace: 'amazon-us',
        concept: { productType: '测试' },
        economics: {
          status: 'INCOMPLETE',
          currency: 'USD',
          inputs: {
            sellingPrice: { value: 29.99, source: 'FACT' },
            productCost: { value: null, source: 'UNKNOWN' },
          } as any,
          scenarios: {} as any,
          missingInputs: ['productCost'],
          excludedInputs: [],
        },
        risks: [],
        evidence: [],
        assumptions: [],
        missingRequirements: [],
        decision: 'NEEDS_VALIDATION',
        supplierQuotes: [fullQuote],
        primaryQuoteId: fullQuote.id,
      };
    }

    it('当主选工厂的包装费或 Logo 费为 UNKNOWN 时，evaluateSingleProduct 严禁将 unitCost 算作 0，必须保持 productCost 为 null', async () => {
      const candidate = createCandidateWithQuote({
        packagingCost: { value: null, source: 'UNKNOWN' },
        logoCost: { value: null, source: 'UNKNOWN' },
      });

      const evaluated = await service.evaluateSingleProduct(candidate);

      // productCost 必须仍为 null 与 UNKNOWN，禁止隐式默认当 0
      expect(evaluated.economics.inputs.productCost.value).toBeNull();
      expect(evaluated.economics.inputs.productCost.source).toBe('UNKNOWN');
      expect(evaluated.economics.status).toBe('INCOMPLETE');
    });

    it('当包装费与 Logo 费确认为真实 0 时 (FACT 0)，evaluateSingleProduct 正常以出厂价折算入账', async () => {
      const candidate = createCandidateWithQuote({
        packagingCost: { value: 0, source: 'FACT' },
        logoCost: { value: 0, source: 'FACT' },
      });
      candidate.fxSnapshot = {
        currencyPair: 'CNY_USD',
        rate: 0.14,
        source: 'PBOC',
        capturedAt: new Date().toISOString(),
      };

      const evaluated = await service.evaluateSingleProduct(candidate);

      // 40 CNY * 0.14 = 5.60 USD
      expect(evaluated.economics.inputs.productCost.value).toBe(5.6);
      expect(evaluated.economics.inputs.productCost.source).toBe('FACT');
    });
  });

  describe('P1-1 & P1-2: 漏斗埋点租户隔离 (Analytics Workspace Isolation)', () => {
    it('workspace A 的埋点数据与 workspace B 严格物理隔离', () => {
      const workspaceA = 'ws-tenant-alpha';
      const workspaceB = 'ws-tenant-beta';

      // 在 A 租户上报事件
      service.trackAnalyticsEvent(workspaceA, {
        eventName: 'RFQ_GENERATED',
        candidateId: 'cand-001',
        timestamp: new Date().toISOString(),
      });

      service.trackAnalyticsEvent(workspaceA, {
        eventName: 'QUOTE_ENTERED',
        candidateId: 'cand-001',
        timestamp: new Date().toISOString(),
      });

      // 在 B 租户上报事件
      service.trackAnalyticsEvent(workspaceB, {
        eventName: 'DECISION_PACKET_VIEWED',
        candidateId: 'cand-002',
        timestamp: new Date().toISOString(),
      });

      // 读取 A 租户事件
      const eventsA = service.getAnalyticsEvents(workspaceA);
      expect(eventsA.length).toBe(2);
      expect(eventsA.every((e) => e.workspaceId === workspaceA)).toBe(true);
      expect(eventsA.map((e) => e.eventName)).toEqual(['RFQ_GENERATED', 'QUOTE_ENTERED']);

      // 读取 B 租户事件
      const eventsB = service.getAnalyticsEvents(workspaceB);
      expect(eventsB.length).toBe(1);
      expect(eventsB[0].workspaceId).toBe(workspaceB);
      expect(eventsB[0].eventName).toBe('DECISION_PACKET_VIEWED');

      // 未知租户事件严格为空数组
      const eventsC = service.getAnalyticsEvents('ws-tenant-empty');
      expect(eventsC).toEqual([]);
    });
  });
});
