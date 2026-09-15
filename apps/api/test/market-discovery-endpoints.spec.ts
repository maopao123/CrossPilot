import { MarketService } from '../src/modules/market/market.service.js';

describe('MarketService Auto Discovery Endpoints', () => {
  let service: MarketService;
  const mockPrisma: any = {
    marketResearchProject: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };

  beforeEach(() => {
    service = new MarketService(mockPrisma);
  });

  it('runs demo discovery returning 5+ evidence-backed candidate drafts', async () => {
    const run = await service.getDemoDiscovery();
    expect(['COMPLETED', 'DEGRADED']).toContain(run.status);
    expect(run.candidateDrafts.length).toBeGreaterThanOrEqual(5);

    // Verify draft properties
    const firstDraft = run.candidateDrafts[0];
    expect(firstDraft.evidenceIds.length).toBeGreaterThan(0);
    expect(firstDraft.discoveryReasons.length).toBeGreaterThan(0);
    expect(firstDraft.status).toBe('READY_FOR_ENRICHMENT');
  });

  it('previews discovery dry run costs and planned capabilities', () => {
    const preview = service.previewDiscovery({
      marketplace: 'AMAZON_US',
      seed: { keyword: 'glass food storage' },
    });

    expect(preview.plannedCapabilities.length).toBeGreaterThan(0);
    expect(preview.estimatedCallCount).toBeGreaterThan(0);
  });

  it('hands off candidate drafts to V2 returning NEEDS_VALIDATION skeletons', async () => {
    const run = await service.getDemoDiscovery();
    const candidates = service.handoffDiscovery(run.candidateDrafts.slice(0, 3));

    expect(candidates.length).toBe(3);
    for (const c of candidates) {
      expect(c.decision).toBe('NEEDS_VALIDATION');
      expect(c.economics.status).toBe('INCOMPLETE');
      expect(c.risks.every((r) => r.status === 'UNVERIFIED')).toBe(true);
    }
  });
});
