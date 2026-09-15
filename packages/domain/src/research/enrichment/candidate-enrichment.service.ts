import type {
  CandidateEnrichmentRequest,
  CandidateEnrichmentRun,
  CompetitorSnapshot,
  EnrichmentBudgetUsage,
  EvidenceItem,
  VocProductAnalysisResult,
} from '@crosspilot/shared';
import { DEFAULT_ENRICHMENT_BUDGET } from '@crosspilot/shared';
import type { CapabilityExecutor } from '../discovery/keyword-expansion.service.js';
import { CompetitorEnrichmentService } from './competitor-enrichment.service.js';
import { CandidateVocService } from './candidate-voc.service.js';
import { PricePositioningService } from './price-positioning.service.js';
import { ProductConceptBuilder } from './product-concept.builder.js';
import { DifferentiationHypothesisBuilder } from './differentiation-hypothesis.builder.js';
import { EnrichmentGate } from './enrichment-gate.js';

function readNum(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function trendDirection(raw: any): 'UP' | 'DOWN' | 'FLAT' | 'UNKNOWN' {
  const value = Array.isArray(raw) ? raw[0]?.direction || raw[0]?.trendDirection : raw?.direction || raw?.trendDirection;
  const upper = String(value || 'UNKNOWN').toUpperCase();
  if (upper.includes('UP') || upper.includes('IMPROV')) return 'UP';
  if (upper.includes('DOWN') || upper.includes('DECLIN')) return 'DOWN';
  if (upper.includes('FLAT') || upper.includes('STABLE')) return 'FLAT';
  return 'UNKNOWN';
}

export class CandidateEnrichmentService {
  constructor(private readonly executor?: CapabilityExecutor) {}

  async enrich(request: CandidateEnrichmentRequest): Promise<CandidateEnrichmentRun> {
    const draft = request.draft;
    const marketplace = request.marketplace || draft.marketplace || 'AMAZON_US';
    const options = request.options || {};
    const selectedAsins = CompetitorEnrichmentService.selectAsins(draft, options.maxCompetitors);
    const requestedSampleSize = selectedAsins.length;

    const budget: EnrichmentBudgetUsage = {
      providerCalls: 0,
      credits: 0,
      expensiveCalls: 0,
      stoppedByBudget: false,
    };
    const maxCalls = request.budget?.maxProviderCalls ?? DEFAULT_ENRICHMENT_BUDGET.maxProviderCalls;
    const maxCredits = request.budget?.maxCredits ?? DEFAULT_ENRICHMENT_BUDGET.maxCredits;
    const maxExpensive = request.budget?.maxExpensiveCalls ?? DEFAULT_ENRICHMENT_BUDGET.maxExpensiveCalls;

    const consume = (credits = 1, expensive = false): boolean => {
      if (budget.providerCalls >= maxCalls) {
        budget.stoppedByBudget = true;
        return false;
      }
      if (expensive && budget.expensiveCalls >= maxExpensive) {
        budget.stoppedByBudget = true;
        return false;
      }
      if (maxCredits != null && (budget.credits ?? 0) + credits > maxCredits) {
        budget.stoppedByBudget = true;
        return false;
      }
      budget.providerCalls += 1;
      budget.credits = (budget.credits ?? 0) + credits;
      if (expensive) budget.expensiveCalls += 1;
      return true;
    };

    const evidence: EvidenceItem[] = [];
    const missingCapabilities: string[] = [];
    const allowedProductSubjects = new Set<string>([draft.id, ...selectedAsins]);

    for (const extra of request.extraEvidence || []) {
      if (extra.scope === 'PRODUCT' && !allowedProductSubjects.has((extra.subjectId || '').trim())) {
        continue;
      }
      if (extra.scope === 'CATEGORY') continue;
      evidence.push(extra);
    }

    const competitors: CompetitorSnapshot[] = [];
    const enableReview = options.enableReviewHealth !== false;
    const enableTrend = options.enableProductTrend === true;
    const enableVoc = options.enableTextVoc !== false;

    const hasDetail = this.executor?.hasCapability('market.product.detail') ?? false;
    if (!hasDetail) missingCapabilities.push('market.product.detail');

    for (const asin of selectedAsins) {
      if (!hasDetail) break;
      if (!consume(1, false)) break;
      const result = await this.executor!.execute('market.product.detail', { asin, marketplace }, marketplace);
      if (!result.success || !result.data) continue;
      const data: any = result.data;
      const eviId = `evi-comp-${asin}-detail`;
      evidence.push({
        id: eviId,
        scope: 'PRODUCT',
        subjectId: asin,
        source: result.providerId || 'UNKNOWN',
        content: `Competitor detail ${asin}: title=${data.title ?? 'UNKNOWN'} price=${data.price ?? 'UNKNOWN'} rating=${data.rating ?? 'UNKNOWN'}`,
        capturedAt: '2026-09-15T00:00:00Z',
      });

      let rating = readNum(data.rating);
      let reviewCount = readNum(data.reviewCount);
      const reviewIds: string[] = [];
      if (enableReview && this.executor?.hasCapability('review.product.health') && consume(1, false)) {
        const health = await this.executor.execute('review.product.health', { asin, marketplace }, marketplace);
        if (health.success && health.data) {
          const h: any = health.data;
          rating = readNum(h.averageRating) ?? rating;
          reviewCount = readNum(h.totalReviewCount) ?? reviewCount;
          const hid = `evi-comp-${asin}-review`;
          reviewIds.push(hid);
          evidence.push({
            id: hid,
            scope: 'PRODUCT',
            subjectId: asin,
            source: health.providerId || 'UNKNOWN',
            content: `Review health ${asin}: rating=${h.averageRating ?? 'UNKNOWN'} reviews=${h.totalReviewCount ?? 'UNKNOWN'} analyzedText=${h.analyzedReviewCount ?? 'null'}`,
            capturedAt: '2026-09-15T00:00:00Z',
          });
        }
      } else if (enableReview && !this.executor?.hasCapability('review.product.health')) {
        if (!missingCapabilities.includes('review.product.health')) missingCapabilities.push('review.product.health');
      }

      let trendDir: 'UP' | 'DOWN' | 'FLAT' | 'UNKNOWN' | undefined;
      const trendIds: string[] = [];
      if (enableTrend && this.executor?.hasCapability('market.product.trend') && consume(1, false)) {
        const trend = await this.executor.execute('market.product.trend', { asin, marketplace }, marketplace);
        if (trend.success) {
          trendDir = trendDirection(trend.data);
          const tid = `evi-comp-${asin}-trend`;
          trendIds.push(tid);
          evidence.push({
            id: tid,
            scope: 'PRODUCT',
            subjectId: asin,
            source: trend.providerId || 'UNKNOWN',
            content: `Trend ${asin}: direction=${trendDir}`,
            capturedAt: '2026-09-15T00:00:00Z',
          });
        }
      } else if (enableTrend && !this.executor?.hasCapability('market.product.trend')) {
        if (!missingCapabilities.includes('market.product.trend')) missingCapabilities.push('market.product.trend');
      }

      competitors.push(
        CompetitorEnrichmentService.toSnapshot({
          asin,
          title: data.title ?? null,
          price: readNum(data.price),
          rating,
          reviewCount,
          trendDirection: trendDir,
          sourceKeywordIds: [draft.primaryKeyword],
          evidenceIds: [eviId, ...reviewIds, ...trendIds],
          trendEvidenceIds: trendIds,
        }),
      );
    }

    let voc = CandidateVocService.unavailable(['textVoc']);
    if (enableVoc) {
      if (!this.executor?.hasCapability('voc.product.analyze')) {
        missingCapabilities.push('voc.product.analyze');
      } else if (!consume(1, true)) {
        voc = CandidateVocService.unavailable(['textVoc']);
      } else {
        const vocAsin = competitors[0]?.asin || selectedAsins[0];
        const vocResult = await this.executor!.execute(
          'voc.product.analyze',
          { asin: vocAsin, marketplace, keyword: draft.primaryKeyword },
          marketplace,
        );
        if (vocResult.success && vocResult.data) {
          voc = CandidateVocService.normalize({
            data: vocResult.data as VocProductAnalysisResult,
            providerId: vocResult.providerId,
            allowedSubjectIds: allowedProductSubjects,
            evidenceSink: evidence,
          });
        }
      }
    } else {
      voc = CandidateVocService.unavailable(['textVoc']);
    }

    const price = PricePositioningService.fromCompetitors(competitors);
    const concept = ProductConceptBuilder.build({ draft, competitors, voc, price });
    const hypotheses = DifferentiationHypothesisBuilder.build({ voc, competitors, price });

    const attachedIds = evidence.map((e) => e.id);
    const vocUnavailable = voc.sourceType === 'UNAVAILABLE';
    const contamination = evidence.some(
      (e) => e.scope === 'PRODUCT' && !allowedProductSubjects.has((e.subjectId || '').trim()),
    );

    const gate = EnrichmentGate.evaluate({
      draft,
      competitors,
      price,
      concept,
      hypotheses,
      evidence,
      vocUnavailable,
      contamination,
    });

    const missingRequirements = [...voc.missingDimensions];
    if (competitors.length === 0) missingRequirements.push('competitors');
    if (price.sampleSize === 0) missingRequirements.push('priceSample');

    const enrichedId = `enriched-${draft.id}`;
    const runStatus =
      gate.status === 'INSUFFICIENT_DATA'
        ? 'INSUFFICIENT_DATA'
        : gate.status === 'DEGRADED_READY' || budget.stoppedByBudget || vocUnavailable
          ? 'DEGRADED'
          : 'COMPLETED';

    return {
      id: `enr-${draft.id}`,
      request,
      status: runStatus,
      missingCapabilities: Array.from(new Set(missingCapabilities)),
      evidence,
      enriched: {
        id: enrichedId,
        draftId: draft.id,
        marketplace,
        title: draft.title,
        productType: draft.productType,
        competitors,
        competitorSample: {
          requestedSampleSize,
          actualSampleSize: competitors.length,
        },
        voc,
        pricePositioning: price,
        concept,
        differentiationHypotheses: hypotheses,
        evidenceIds: attachedIds,
        missingRequirements,
        gate,
        budgetUsage: budget,
      },
    };
  }
}
