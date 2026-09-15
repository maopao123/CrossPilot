import type {
  AmazonResearchPlaybookInput,
  CommerceFactRecord,
  EvidenceItemRecord,
  PlaybookRecord,
  PlaybookRunRecord,
} from '@crosspilot/shared';
import { OpportunityScoreEngine } from '../research/opportunity-score.engine.js';
import type { MarketProduct, KeywordMetric, VocProductAnalysisResult } from '@crosspilot/shared';
import { FactEngine } from './fact-engine.js';
import { EvidenceEngine } from './evidence-engine.js';
import { RecommendationEngine } from './recommendation-engine.js';
import { VocIntelligenceEngine } from './voc-intelligence.engine.js';
import type { IIntelligenceStore } from './intelligence.types.js';

export interface ResearchPlaybookResult {
  decision: string;
  listingBrief: string;
  opportunityScore: number | null;
  factIds: string[];
  evidenceIds: string[];
  recommendationId: string;
  voc: ReturnType<VocIntelligenceEngine['analyze']>;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function decide(score: number | null): string {
  if (score === null) return 'INSUFFICIENT_DATA';
  if (score >= 70) return 'SHORTLIST';
  if (score >= 50) return 'WATCH';
  return 'INSUFFICIENT_DATA';
}

export class AmazonProductResearchRunner {
  private readonly facts: FactEngine;
  private readonly evidence: EvidenceEngine;
  private readonly recommendations: RecommendationEngine;
  private readonly voc = new VocIntelligenceEngine();

  constructor(store: IIntelligenceStore) {
    this.facts = new FactEngine(store);
    this.evidence = new EvidenceEngine(store);
    this.recommendations = new RecommendationEngine(store);
  }

  canHandle(playbook: PlaybookRecord): boolean {
    const kind = String(playbook.definition?.kind ?? '');
    return kind === 'amazon-product-research' || playbook.name === 'amazon-product-research';
  }

  async execute(playbook: PlaybookRecord, run: PlaybookRunRecord): Promise<ResearchPlaybookResult> {
    const input = run.input as unknown as AmazonResearchPlaybookInput;
    const workspaceId = run.workspaceId;
    const runId = run.runId;
    const marketplace = input.marketplace || 'AMAZON_US';
    const voc = this.voc.analyze({
      reviews: input.reviews,
      listingText: input.listingText,
      feedback: input.feedback,
    });

    const prices = (input.products ?? [])
      .map((p) => p.price)
      .filter((n): n is number => typeof n === 'number');
    const priceMedian = median(prices);

    const createdFacts: CommerceFactRecord[] = [];
    const createdEvidence: EvidenceItemRecord[] = [];

    const addFact = async (
      factType: string,
      metric: string,
      value: unknown,
      reference: string,
    ) => {
      const fact = await this.facts.createFact(workspaceId, {
        factType,
        metric,
        valueJson: { value },
        sourceProvider: 'playbook:amazon-product-research',
        sourceReference: reference,
        playbookRunId: runId,
      });
      createdFacts.push(fact);
      const ev = await this.evidence.createEvidence(workspaceId, {
        factId: fact.id,
        sourceType: 'FACT',
        sourceId: fact.id,
        quote: `${metric}=${JSON.stringify(value)}`,
        confidence: value === null || value === undefined ? 0.3 : 0.8,
        playbookRunId: runId,
      });
      createdEvidence.push(ev);
      return fact;
    };

    await addFact('KEYWORD', 'seed_keyword', input.keyword, 'input.keyword');
    await addFact('MARKET', 'category', input.category, 'input.category');
    await addFact(
      'MARKET',
      'search_volume',
      input.searchVolume ?? null,
      'input.searchVolume',
    );
    await addFact('PRICE', 'competitor_price_median', priceMedian, 'input.products.price');
    await addFact('COMPETITOR', 'competitor_count', (input.products ?? []).length, 'input.products');
    await addFact('VOC', 'voc_pain_count', voc.painPoints.length, 'voc.painPoints');
    if (voc.painPoints[0]) {
      await addFact('VOC', 'voc_top_pain', voc.painPoints[0], 'voc.painPoints[0]');
    }

    const keywordMetric: KeywordMetric | undefined =
      typeof input.searchVolume === 'number'
        ? {
            source: 'PLAYBOOK_INPUT',
            marketplace,
            keyword: input.keyword,
            searchVolume: input.searchVolume,
            capturedAt: new Date().toISOString(),
          }
        : undefined;

    const products: MarketProduct[] = (input.products ?? []).map((p, i) => ({
      source: 'PLAYBOOK_INPUT',
      marketplace,
      externalId: p.asin || `comp-${i}`,
      asin: p.asin,
      title: p.title || input.keyword,
      price: p.price ?? null,
      rating: p.rating ?? null,
      reviewCount: p.reviewCount ?? null,
      capturedAt: new Date().toISOString(),
    }));

    const vocAnalysis: VocProductAnalysisResult | undefined = voc.cleanedTexts.length
      ? {
          asin: products[0]?.asin || 'CATEGORY',
          marketplace,
          vocSourceType: 'AMAZON_REVIEW_VOC',
          totalReviewCount: voc.cleanedTexts.length,
          analyzedReviewCount: voc.cleanedTexts.length,
          averageRating: null,
          painPoints: voc.painPoints.map((p) => ({
            topic: p.slice(0, 80),
            severity: 'MEDIUM' as const,
            quotes: [{ quoteText: p, sourceType: 'PLAYBOOK_INPUT' }],
          })),
          praisePoints: [],
          buyerMotivations: [],
          summary: voc.outputs.listingImprovement,
          evidenceNotice: 'Deterministic VOC Intelligence from playbook input texts. Not a live Amazon scrape.',
        }
      : undefined;

    const opportunity = OpportunityScoreEngine.evaluate({
      keyword: input.keyword,
      marketplace,
      keywordMetric,
      products,
      vocAnalysis,
    });

    await addFact(
      'OPPORTUNITY',
      'opportunity_score',
      opportunity.overallScore,
      `OpportunityScoreEngine ${opportunity.scoreVersion}`,
    );

    const decision = decide(opportunity.overallScore);
    const listingBrief = [
      `Keyword: ${input.keyword}`,
      `Category: ${input.category}`,
      voc.outputs.listingImprovement,
      voc.outputs.creativeBrief,
    ].join(' | ');

    await addFact('OPPORTUNITY', 'opportunity_decision', decision, 'decision-rule');

    const rec = await this.recommendations.createRecommendation(workspaceId, {
      decision,
      reason: `Opportunity score ${opportunity.overallScore ?? 'n/a'} (${opportunity.evidenceStatus}). ${opportunity.methodologyDisclaimer}`,
      confidence: opportunity.confidenceScore ?? 0.5,
      evidenceIds: createdEvidence.map((e) => e.id),
      playbookRunId: runId,
    });

    void playbook;
    return {
      decision,
      listingBrief,
      opportunityScore: opportunity.overallScore,
      factIds: createdFacts.map((f) => f.id),
      evidenceIds: createdEvidence.map((e) => e.id),
      recommendationId: rec.id,
      voc,
    };
  }
}
