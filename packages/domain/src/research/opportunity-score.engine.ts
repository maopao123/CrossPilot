import {
  ConfidenceLevel,
  EvidenceGateStatus,
  MarketProduct,
  MarketSignal,
  OpportunityExplanation,
  ProductOpportunity,
  ProductReviewHealthResult,
  ResearchCostBudget,
  ResearchEvidence,
  StructuredFact,
  TrendDirection,
  TrendSummary,
  VocContentKind,
  VocProductAnalysisResult,
  KeywordMetric,
  DemandSignalMetrics,
  CompetitionSignalMetrics,
  CommercialSignalMetrics,
  TrendSignalMetrics,
  ReviewHealthSignalMetrics,
  VocOpportunitySignalMetrics,
  OpportunityScoreConfig,
  OpportunityScopeDisclosure,
} from '@crosspilot/shared';
import { DEFAULT_OPPORTUNITY_SCORE_CONFIG } from './opportunity-score.config.js';

export interface RawResearchInputs {
  keyword: string;
  marketplace: string;
  representativeAsin?: string;
  keywordMetric?: KeywordMetric | null;
  products?: MarketProduct[];
  topAsinTrend?: TrendSummary | null;
  productReviewHealth?: ProductReviewHealthResult | null;
  vocAnalysis?: VocProductAnalysisResult | null;
  customWeights?: Partial<Record<'demand' | 'competition' | 'commercial' | 'trend' | 'reviewHealth' | 'voc', number>>;
  evidences?: ResearchEvidence[];
  costBudget?: Partial<ResearchCostBudget>;
  config?: OpportunityScoreConfig;
}

export const OPPORTUNITY_SCORE_VERSION = 'v1.0.0';
export const OPPORTUNITY_SCORE_CONFIG_VERSION = DEFAULT_OPPORTUNITY_SCORE_CONFIG.scoreConfigVersion;

export class OpportunityScoreEngine {
  /**
   * Main entry point: pure deterministic evaluation of research signals
   */
  static evaluate(inputs: RawResearchInputs): ProductOpportunity {
    const {
      keyword,
      marketplace,
      representativeAsin,
      keywordMetric,
      products = [],
      topAsinTrend,
      productReviewHealth,
      vocAnalysis,
      evidences = [],
      costBudget,
      config = DEFAULT_OPPORTUNITY_SCORE_CONFIG,
    } = inputs;

    const opportunityId = `opp_${marketplace.toLowerCase()}_${keyword.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}_${Date.now()}`;
    const allEvidenceIds = evidences.map((e) => e.evidenceId);

    // 1. Calculate the 6 Market Signals with explicit scopes
    const demandSignal = this.calculateDemandSignal(keywordMetric, evidences, config);
    const competitionSignal = this.calculateCompetitionSignal(products, keywordMetric, representativeAsin, evidences, config);
    const commercialSignal = this.calculateCommercialSignal(products, representativeAsin, evidences, config);
    const trendSignal = this.calculateTrendSignal(topAsinTrend, representativeAsin, products, evidences, config);
    const reviewHealthSignal = this.calculateReviewHealthSignal(productReviewHealth, representativeAsin, products, evidences, config);
    const vocSignal = this.calculateVocSignal(vocAnalysis, representativeAsin, keyword, evidences, config);

    const signals = {
      demand: demandSignal,
      competition: competitionSignal,
      commercial: commercialSignal,
      trend: trendSignal,
      reviewHealth: reviewHealthSignal,
      voc: vocSignal,
    };

    // 2. Evaluate Evidence Gate with Critical Signals Rule
    const evidenceStatus = this.evaluateEvidenceGate(signals, config);

    // 3. Dynamic Weight Re-normalization (Missing != Zero)
    const baseWeights = {
      demand: inputs.customWeights?.demand ?? config.weights.demand,
      competition: inputs.customWeights?.competition ?? config.weights.competition,
      commercial: inputs.customWeights?.commercial ?? config.weights.commercial,
      trend: inputs.customWeights?.trend ?? config.weights.trend,
      reviewHealth: inputs.customWeights?.reviewHealth ?? config.weights.reviewHealth,
      voc: inputs.customWeights?.voc ?? config.weights.voc,
    };

    const availableSignalKeys = (Object.keys(signals) as Array<keyof typeof signals>).filter(
      (k) => signals[k].status !== 'MISSING' && signals[k].normalizedScore !== null,
    );

    const missingSignals = (Object.keys(signals) as Array<keyof typeof signals>).filter(
      (k) => signals[k].status === 'MISSING' || signals[k].normalizedScore === null,
    );

    let sumAvailableBaseWeights = availableSignalKeys.reduce((sum, k) => sum + baseWeights[k], 0);
    if (sumAvailableBaseWeights <= 0) sumAvailableBaseWeights = 1.0;

    const normalizedWeights: Record<string, number> = {};
    let calculatedOverallScore: number | null = null;

    if (evidenceStatus !== 'INSUFFICIENT' && availableSignalKeys.length > 0) {
      let weightedSum = 0;
      for (const k of Object.keys(signals) as Array<keyof typeof signals>) {
        const signal = signals[k];
        if (availableSignalKeys.includes(k) && signal.normalizedScore !== null) {
          const effectiveWeight = Number((baseWeights[k] / sumAvailableBaseWeights).toFixed(4));
          normalizedWeights[k] = effectiveWeight;
          signal.weight = effectiveWeight;
          signal.contribution = Number((signal.normalizedScore * effectiveWeight).toFixed(2));
          weightedSum += signal.contribution;
        } else {
          normalizedWeights[k] = 0;
          signal.weight = 0;
          signal.contribution = null;
        }
      }
      calculatedOverallScore = Math.min(100, Math.max(0, Math.round(weightedSum)));
    } else {
      // Evidence is INSUFFICIENT -> do not calculate overall score
      for (const k of Object.keys(signals) as Array<keyof typeof signals>) {
        signals[k].weight = 0;
        signals[k].contribution = null;
        normalizedWeights[k] = 0;
      }
      calculatedOverallScore = null;
    }

    // 4. Determine Confidence Level (Decoupled from Opportunity Score)
    const { confidenceLevel, confidenceScore } = this.calculateConfidence(
      evidenceStatus,
      availableSignalKeys.length,
      evidences,
      vocAnalysis,
    );

    // 5. Generate Structured Facts & Explanation
    const { strengths, risks, opportunities } = this.generateStructuredFacts(signals, evidences, vocAnalysis);

    const explanation = this.generateDeterministicExplanation(
      keyword,
      calculatedOverallScore,
      signals,
      strengths,
      risks,
      opportunities,
    );

    // 6. Cost Budget Aggregation (Null USD if no live rate API contract)
    const finalCostBudget: ResearchCostBudget = {
      xydcCredits: costBudget?.xydcCredits ?? 2,
      firecrawlCredits: costBudget?.firecrawlCredits ?? (vocAnalysis ? 5 : 0),
      totalRequests: costBudget?.totalRequests ?? 4,
      cacheHits: costBudget?.cacheHits ?? 1,
      estimatedCostUsd: null,
      costDisclaimer: '当前 Provider (XYDC / Firecrawl) 尚未接入官方实时计费账单接口，不虚构估算美元金额。',
    };

    // 7. Scope Disclosure Assembly
    const targetRepresentativeAsin = representativeAsin ?? (products[0]?.asin ?? null);
    const scopeDisclosure: OpportunityScopeDisclosure = {
      decisionScope: 'KEYWORD_CATEGORY_OPPORTUNITY',
      representativeAsin: targetRepresentativeAsin,
      keyword,
      marketplace,
      productSampleSize: products.length,
      trendSampleSize: topAsinTrend ? 1 : 0,
      vocScope: vocAnalysis?.analysisScope?.type ?? 'CATEGORY',
      vocContentKind: (vocAnalysis?.analysisScope?.searchSnippetCount ?? 0) > 0 ? 'SEARCH_SNIPPET' : 'FULL_TEXT',
      vocSampleSize: vocAnalysis?.analysisScope?.totalAnalyzedItems ?? 0,
      targetEntityNotice: '本评分评估的是目标关键词/品类级市场机会，结合了代表性 ASIN 与品类外部讨论作为参照，非该 ASIN 单品独立评级。',
    };

    return {
      opportunityId,
      keyword,
      marketplace,
      representativeAsin: targetRepresentativeAsin ?? undefined,
      overallScore: calculatedOverallScore,
      scoreVersion: OPPORTUNITY_SCORE_VERSION,
      scoreConfigVersion: config.scoreConfigVersion,
      methodology: 'HEURISTIC',
      calibrationStatus: 'UNCALIBRATED',
      decisionScope: 'KEYWORD_CATEGORY_OPPORTUNITY',
      methodologyDisclaimer:
        '本评分基于启发式规则模型 (Heuristic Rule-based Model) 进行多维相对排序，未经过真实销售转化概率校准 (Uncalibrated)，不代表实际销量、销售额或推新成功率的绝对保证。',
      scopeDisclosure,
      evidenceStatus,
      confidence: confidenceLevel,
      confidenceScore,
      signals,
      weights: normalizedWeights,
      strengths,
      risks,
      opportunities,
      missingSignals,
      evidenceIds: allEvidenceIds,
      explanation,
      costBudget: finalCostBudget,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * 1. Demand Signal Normalization
   */
  private static calculateDemandSignal(
    keywordMetric?: KeywordMetric | null,
    evidences: ResearchEvidence[] = [],
    config: OpportunityScoreConfig = DEFAULT_OPPORTUNITY_SCORE_CONFIG,
  ): MarketSignal<DemandSignalMetrics> {
    const demandEvidences = evidences.filter((e) => e.type === 'KEYWORD' || e.type === 'MARKET_METRIC');
    const evidenceIds = demandEvidences.map((e) => e.evidenceId);

    const weeklySearchVolume =
      keywordMetric?.searchVolume !== undefined && keywordMetric?.searchVolume !== null && !isNaN(keywordMetric.searchVolume)
        ? Math.max(0, keywordMetric.searchVolume)
        : null;
    const abaRank =
      keywordMetric?.abaRank !== undefined && keywordMetric?.abaRank !== null && !isNaN(keywordMetric.abaRank)
        ? Math.max(1, keywordMetric.abaRank)
        : null;
    const volumeGrowth = keywordMetric?.growth ?? null;

    if (weeklySearchVolume === null && abaRank === null) {
      return {
        signalId: 'demand',
        label: '市场需求信号 (Demand)',
        status: 'MISSING',
        scope: 'KEYWORD_MARKET',
        subjectId: keywordMetric?.keyword ?? 'KEYWORD_QUERY',
        sampleSize: 0,
        rawMetrics: { weeklySearchVolume: null, abaRank: null, volumeGrowth: null },
        normalizedScore: null,
        weight: config.weights.demand,
        contribution: null,
        confidence: 0,
        evidenceIds: [],
        findings: ['缺失关键词真实搜索量与 ABA 排名数据'],
      };
    }

    let score = 50;
    const findings: string[] = [];

    // Piecewise evaluation of weeklySearchVolume with explicit intervals
    if (weeklySearchVolume !== null) {
      if (weeklySearchVolume >= 50000) {
        score = 90 + Math.min(10, Math.round((weeklySearchVolume - 50000) / 10000));
        findings.push(`周搜索量 ${weeklySearchVolume.toLocaleString()} 处于高爆发区间 (Top Tier)`);
      } else if (weeklySearchVolume >= 20000 && weeklySearchVolume < 50000) {
        score = 80 + Math.round(((weeklySearchVolume - 20000) / 30000) * 10);
        findings.push(`周搜索量 ${weeklySearchVolume.toLocaleString()} 具备充足需求体量`);
      } else if (weeklySearchVolume >= 5000 && weeklySearchVolume < 20000) {
        score = 65 + Math.round(((weeklySearchVolume - 5000) / 15000) * 15);
        findings.push(`周搜索量 ${weeklySearchVolume.toLocaleString()} 属于稳健利基需求`);
      } else if (weeklySearchVolume >= 1000 && weeklySearchVolume < 5000) {
        score = 45 + Math.round(((weeklySearchVolume - 1000) / 4000) * 20);
        findings.push(`周搜索量 ${weeklySearchVolume.toLocaleString()} 需求体量较小`);
      } else {
        score = Math.max(10, Math.round((weeklySearchVolume / 1000) * 45));
        findings.push(`周搜索量 ${weeklySearchVolume.toLocaleString()} 需求偏冷`);
      }
    }

    // Piecewise evaluation of ABA Rank with explicit boundaries
    if (abaRank !== null) {
      if (abaRank <= 5000) {
        score = Math.min(100, score + 8);
        findings.push(`ABA 综合排名第 ${abaRank.toLocaleString()} 名，处于头部高频词流`);
      } else if (abaRank > 5000 && abaRank <= 25000) {
        score = Math.min(100, score + 4);
        findings.push(`ABA 综合排名第 ${abaRank.toLocaleString()} 名，具备稳定曝光`);
      } else if (abaRank > 100000) {
        score = Math.max(10, score - 8);
        findings.push(`ABA 排名第 ${abaRank.toLocaleString()} 名偏后`);
      }
    }

    const confidence = demandEvidences.some((e) => e.mode === 'LIVE') ? 0.95 : 0.85;

    return {
      signalId: 'demand',
      label: '市场需求信号 (Demand)',
      status: weeklySearchVolume !== null && abaRank !== null ? 'AVAILABLE' : 'PARTIAL',
      scope: 'KEYWORD_MARKET',
      subjectId: keywordMetric?.keyword ?? 'KEYWORD_QUERY',
      sampleSize: 1,
      rawMetrics: { weeklySearchVolume, abaRank, volumeGrowth },
      normalizedScore: Math.min(100, Math.max(0, score)),
      weight: config.weights.demand,
      contribution: null,
      confidence,
      evidenceIds,
      findings,
    };
  }

  /**
   * 2. Competition Signal Normalization
   * NOTE: Inverted contribution! Higher barrier = Lower Opportunity Score!
   */
  private static calculateCompetitionSignal(
    products: MarketProduct[] = [],
    keywordMetric?: KeywordMetric | null,
    representativeAsin?: string,
    evidences: ResearchEvidence[] = [],
    config: OpportunityScoreConfig = DEFAULT_OPPORTUNITY_SCORE_CONFIG,
  ): MarketSignal<CompetitionSignalMetrics> {
    const compEvidences = evidences.filter((e) => e.type === 'MARKET_PRODUCT');
    const evidenceIds = compEvidences.map((e) => e.evidenceId);

    const validReviews = products
      .map((p) => p.reviewCount)
      .filter((r): r is number => r !== null && r !== undefined && !isNaN(r) && r >= 0);
    const validRatings = products
      .map((p) => p.rating)
      .filter((r): r is number => r !== null && r !== undefined && !isNaN(r) && r > 0);

    const topAsinsCount = products.length > 0 ? products.length : null;
    const topAsinAvgReviews =
      validReviews.length > 0 ? Math.round(validReviews.reduce((a, b) => a + b, 0) / validReviews.length) : null;
    const topAsinAvgRating =
      validRatings.length > 0 ? Number((validRatings.reduce((a, b) => a + b, 0) / validRatings.length).toFixed(1)) : null;
    const cpc =
      keywordMetric?.cpc !== undefined && keywordMetric?.cpc !== null && !isNaN(keywordMetric.cpc)
        ? Math.max(0, keywordMetric.cpc)
        : null;

    if (topAsinAvgReviews === null && topAsinsCount === null) {
      return {
        signalId: 'competition',
        label: '竞争壁垒信号 (Competition)',
        status: 'MISSING',
        scope: 'TOP_PRODUCTS',
        subjectId: 'TOP_PRODUCTS',
        sampleSize: 0,
        representativeAsin,
        rawMetrics: {
          competitiveDifficulty: null,
          topAsinsCount: null,
          topAsinAvgReviews: null,
          topAsinAvgRating: null,
          cpc: null,
        },
        normalizedScore: null,
        weight: config.weights.competition,
        contribution: null,
        confidence: 0,
        evidenceIds: [],
        findings: ['缺失头部竞品评价体量与竞争壁垒数据'],
      };
    }

    let difficulty = 50;
    const findings: string[] = [];

    // Explicit piecewise coverage for topAsinAvgReviews
    if (topAsinAvgReviews !== null) {
      if (topAsinAvgReviews <= 150) {
        difficulty = 20;
        findings.push(`竞品平均评价数仅 ${topAsinAvgReviews} 条，新品进入壁垒低`);
      } else if (topAsinAvgReviews > 150 && topAsinAvgReviews <= 500) {
        difficulty = 35;
        findings.push(`竞品平均评价数 ${topAsinAvgReviews} 条，壁垒适中`);
      } else if (topAsinAvgReviews > 500 && topAsinAvgReviews <= 1500) {
        difficulty = 55;
        findings.push(`竞品平均评价数 ${topAsinAvgReviews} 条，需要一定评价积累`);
      } else if (topAsinAvgReviews > 1500 && topAsinAvgReviews <= 4000) {
        difficulty = 75;
        findings.push(`竞品平均评价数 ${topAsinAvgReviews} 条，头部护城河较深`);
      } else {
        difficulty = 90;
        findings.push(`竞品平均评价数超 ${topAsinAvgReviews} 条，属于成熟高壁垒红海`);
      }
    }

    // Explicit piecewise coverage for CPC
    if (cpc !== null) {
      if (cpc > 2.5) {
        difficulty = Math.min(95, difficulty + 10);
        findings.push(`竞价 CPC $${cpc.toFixed(2)} 偏高，推新获客成本较高`);
      } else if (cpc < 1.0) {
        difficulty = Math.max(10, difficulty - 10);
        findings.push(`竞价 CPC $${cpc.toFixed(2)} 较低，广告获客成本友好`);
      }
    }

    // Crucial inverted mapping: Opportunity Score = 100 - Competitive Difficulty
    const opportunityScore = Math.min(100, Math.max(0, 100 - difficulty));

    return {
      signalId: 'competition',
      label: '竞争友好度信号 (Competition Barrier Inverted)',
      status: topAsinAvgReviews !== null ? 'AVAILABLE' : 'PARTIAL',
      scope: 'TOP_PRODUCTS',
      subjectId: 'TOP_PRODUCTS',
      sampleSize: products.length,
      representativeAsin,
      rawMetrics: {
        competitiveDifficulty: difficulty,
        topAsinsCount,
        topAsinAvgReviews,
        topAsinAvgRating,
        cpc,
      },
      normalizedScore: opportunityScore,
      weight: config.weights.competition,
      contribution: null,
      confidence: compEvidences.length > 0 ? 0.9 : 0.7,
      evidenceIds,
      findings,
    };
  }

  /**
   * 3. Commercial / Price Signal Normalization
   * Strictly avoids fake COGS / profit margins. Focuses on retail price sweet spot & spread.
   */
  private static calculateCommercialSignal(
    products: MarketProduct[] = [],
    representativeAsin?: string,
    evidences: ResearchEvidence[] = [],
    config: OpportunityScoreConfig = DEFAULT_OPPORTUNITY_SCORE_CONFIG,
  ): MarketSignal<CommercialSignalMetrics> {
    const commEvidences = evidences.filter((e) => e.type === 'MARKET_PRODUCT');
    const evidenceIds = commEvidences.map((e) => e.evidenceId);

    const validPrices = products
      .map((p) => p.price)
      .filter((p): p is number => p !== null && p !== undefined && !isNaN(p) && p > 0);

    if (validPrices.length === 0) {
      return {
        signalId: 'commercial',
        label: '商业价格信号 (Commercial / Price)',
        status: 'MISSING',
        scope: 'TOP_PRODUCTS',
        subjectId: 'TOP_PRODUCTS',
        sampleSize: 0,
        representativeAsin,
        rawMetrics: { avgPrice: null, minPrice: null, maxPrice: null, priceStability: 'UNKNOWN' },
        normalizedScore: null,
        weight: config.weights.commercial,
        contribution: null,
        confidence: 0,
        evidenceIds: [],
        findings: ['缺失品类真实商品价格数据'],
      };
    }

    const avgPrice = Number((validPrices.reduce((a, b) => a + b, 0) / validPrices.length).toFixed(2));
    const minPrice = Math.min(...validPrices);
    const maxPrice = Math.max(...validPrices);
    const priceSpread = maxPrice - minPrice;
    const priceStability = priceSpread / avgPrice < 0.6 ? 'STABLE' : 'VOLATILE';

    let score = 50;
    const findings: string[] = [];

    // Explicit piecewise coverage for Retail Price Sweet Spot
    if (avgPrice >= 25 && avgPrice <= 45) {
      score = 90;
      findings.push(`均价 $${avgPrice} 处于跨境电商黄金客单价区间 ($25-$45)，留足毛利与广告预算`);
    } else if (avgPrice >= 20 && avgPrice < 25) {
      score = 80;
      findings.push(`均价 $${avgPrice} 价格带良好，具一定运营空间`);
    } else if (avgPrice > 45 && avgPrice <= 80) {
      score = 80;
      findings.push(`均价 $${avgPrice} 偏中高客单价，单件利润丰厚但转化漏斗较长`);
    } else if (avgPrice >= 15 && avgPrice < 20) {
      score = 65;
      findings.push(`均价 $${avgPrice} 处于大众入门区间，竞争相对激烈`);
    } else if (avgPrice < 15) {
      score = 45;
      findings.push(`均价 $${avgPrice} 偏低，受 FBA 基础运费与 CPC 挤压，价格战风险高`);
    } else {
      score = 65;
      findings.push(`均价 $${avgPrice} 需考察退货率与售前答疑成本`);
    }

    if (priceStability === 'STABLE') {
      score = Math.min(100, score + 5);
      findings.push(`价格区间 [$${minPrice} - $${maxPrice}] 分布集中，市场价格认知稳定`);
    } else {
      findings.push(`价格区间 [$${minPrice} - $${maxPrice}] 跨度较大，存在多层级细分材质`);
    }

    return {
      signalId: 'commercial',
      label: '商业价格信号 (Commercial / Price)',
      status: 'AVAILABLE',
      scope: 'TOP_PRODUCTS',
      subjectId: 'TOP_PRODUCTS',
      sampleSize: products.length,
      representativeAsin,
      rawMetrics: { avgPrice, minPrice, maxPrice, priceStability },
      normalizedScore: score,
      weight: config.weights.commercial,
      contribution: null,
      confidence: 0.9,
      evidenceIds,
      findings,
    };
  }

  /**
   * 4. Trend Signal Normalization
   * Correctly maps RANK_IMPROVED (rank number went down = sales up) to positive score
   */
  private static calculateTrendSignal(
    topAsinTrend?: TrendSummary | null,
    representativeAsin?: string,
    products: MarketProduct[] = [],
    evidences: ResearchEvidence[] = [],
    config: OpportunityScoreConfig = DEFAULT_OPPORTUNITY_SCORE_CONFIG,
  ): MarketSignal<TrendSignalMetrics> {
    const trendEvidences = evidences.filter((e) => e.type === 'TREND');
    const evidenceIds = trendEvidences.map((e) => e.evidenceId);
    const targetAsin = representativeAsin ?? (products[0]?.asin ?? undefined);

    if (!topAsinTrend) {
      return {
        signalId: 'trend',
        label: '趋势动量信号 (Trend)',
        status: 'MISSING',
        scope: 'REPRESENTATIVE_PRODUCT',
        subjectId: targetAsin ?? 'NO_REPRESENTATIVE_ASIN',
        sampleSize: 0,
        representativeAsin: targetAsin,
        rawMetrics: {
          bsrDirection: null,
          priceDirection: null,
          ratingDirection: null,
          reviewGrowthDirection: null,
        },
        normalizedScore: null,
        weight: config.weights.trend,
        contribution: null,
        confidence: 0,
        evidenceIds: [],
        findings: ['缺失竞品历史销量与 BSR 趋势跟踪数据'],
      };
    }

    const bsrDirection = topAsinTrend.direction;
    const priceDirection: TrendDirection = 'STABLE';
    const ratingDirection: TrendDirection = 'STABLE';
    const reviewGrowthDirection: TrendDirection = 'REVIEWS_INCREASED';

    let score = 50;
    const findings: string[] = [];

    // Note: On Amazon BSR, RANK_IMPROVED or IMPROVED means rank number went down (sales climbing!)
    if (bsrDirection === 'RANK_IMPROVED' || bsrDirection === 'IMPROVED') {
      score += config.trend.bsrImprovedBonus;
      findings.push(`标杆竞品 BSR 销售排名呈上升态势 (${bsrDirection})，品类动量活跃`);
    } else if (bsrDirection === 'RANK_DECLINED' || bsrDirection === 'DECLINED') {
      score -= config.trend.bsrDeclinedPenalty;
      findings.push(`标杆竞品 BSR 销售排名呈走弱态势 (${bsrDirection})，需防范需求回落`);
    } else {
      score += config.trend.bsrStableBonus;
      findings.push(`标杆竞品 BSR 排名保持平稳 (${bsrDirection})`);
    }

    if (topAsinTrend.changePercent !== null && topAsinTrend.changePercent !== undefined) {
      findings.push(`BSR 变动幅度: ${topAsinTrend.changePercent > 0 ? '+' : ''}${topAsinTrend.changePercent}%`);
    }

    return {
      signalId: 'trend',
      label: '趋势动量信号 (Trend)',
      status: 'AVAILABLE',
      scope: 'REPRESENTATIVE_PRODUCT',
      subjectId: targetAsin,
      sampleSize: 1,
      representativeAsin: targetAsin,
      rawMetrics: {
        bsrDirection,
        priceDirection,
        ratingDirection,
        reviewGrowthDirection,
        bsrChangeAbsolute: topAsinTrend.changeAbsolute ?? null,
      },
      normalizedScore: Math.min(100, Math.max(10, score)),
      weight: config.weights.trend,
      contribution: null,
      confidence: trendEvidences.some((e) => e.mode === 'LIVE') ? 0.9 : 0.8,
      evidenceIds,
      findings,
    };
  }

  /**
   * 5. Review Health Signal Normalization
   * Quantitative stars & ratings only. Strictly separated from NLP VOC pain points.
   */
  private static calculateReviewHealthSignal(
    healthResult?: ProductReviewHealthResult | null,
    representativeAsin?: string,
    products: MarketProduct[] = [],
    evidences: ResearchEvidence[] = [],
    config: OpportunityScoreConfig = DEFAULT_OPPORTUNITY_SCORE_CONFIG,
  ): MarketSignal<ReviewHealthSignalMetrics> {
    const healthEvidences = evidences.filter((e) => e.type === 'REVIEW_METRIC');
    const evidenceIds = healthEvidences.map((e) => e.evidenceId);
    const targetAsin = representativeAsin ?? (products[0]?.asin ?? undefined);

    const averageRating =
      healthResult?.averageRating !== undefined && healthResult?.averageRating !== null && !isNaN(healthResult.averageRating)
        ? Math.min(5.0, Math.max(1.0, healthResult.averageRating))
        : null;
    const totalReviewCount =
      healthResult?.totalReviewCount !== undefined && healthResult?.totalReviewCount !== null && !isNaN(healthResult.totalReviewCount)
        ? Math.max(0, healthResult.totalReviewCount)
        : null;

    if (averageRating === null && totalReviewCount === null) {
      return {
        signalId: 'reviewHealth',
        label: '评价健康度信号 (Review Health)',
        status: 'MISSING',
        scope: 'REPRESENTATIVE_PRODUCT',
        subjectId: targetAsin ?? 'NO_REPRESENTATIVE_ASIN',
        sampleSize: 0,
        representativeAsin: targetAsin,
        rawMetrics: { averageRating: null, totalReviewCount: null, ratingHealthStatus: 'UNKNOWN' },
        normalizedScore: null,
        weight: config.weights.reviewHealth,
        contribution: null,
        confidence: 0,
        evidenceIds: [],
        findings: ['缺失评价星级与评论健康度指标'],
      };
    }

    let score = 60;
    let ratingHealthStatus: 'STRONG' | 'MODERATE' | 'WEAK' | 'UNKNOWN' = 'MODERATE';
    const findings: string[] = [];

    // Explicit piecewise rating bands
    if (averageRating !== null) {
      if (averageRating >= 3.8 && averageRating <= 4.3) {
        score = 88;
        ratingHealthStatus = 'MODERATE';
        findings.push(`当前主流星级 ${averageRating} 星处于典型“有需求但有痛点”区间，新品改良空间大`);
      } else if (averageRating > 4.3 && averageRating <= 4.6) {
        score = 75;
        ratingHealthStatus = 'STRONG';
        findings.push(`当前主流星级 ${averageRating} 星，整体口碑良好，需在特定功能点突破`);
      } else if (averageRating > 4.6) {
        score = 60;
        ratingHealthStatus = 'STRONG';
        findings.push(`当前主流星级达 ${averageRating} 星，竞品成熟度极高，颠覆阻力较大`);
      } else {
        score = 50;
        ratingHealthStatus = 'WEAK';
        findings.push(`主流星级低于 3.8 星，可能存在品类级设计短板或材质易损`);
      }
    }

    if (totalReviewCount !== null) {
      findings.push(`标杆竞品累计评价 ${totalReviewCount.toLocaleString()} 条`);
    }

    return {
      signalId: 'reviewHealth',
      label: '评价健康度信号 (Review Health)',
      status: 'AVAILABLE',
      scope: 'REPRESENTATIVE_PRODUCT',
      subjectId: targetAsin,
      sampleSize: totalReviewCount ? 1 : 0,
      representativeAsin: targetAsin,
      rawMetrics: { averageRating, totalReviewCount, ratingHealthStatus },
      normalizedScore: score,
      weight: config.weights.reviewHealth,
      contribution: null,
      confidence: 0.95,
      evidenceIds,
      findings,
    };
  }

  /**
   * 6. VOC Opportunity Signal Normalization
   * Calibrated by scope (CATEGORY vs EXACT_PRODUCT) and contentKind (SEARCH_SNIPPET vs FULL_TEXT)
   */
  private static calculateVocSignal(
    vocAnalysis?: VocProductAnalysisResult | null,
    representativeAsin?: string,
    keyword?: string,
    evidences: ResearchEvidence[] = [],
    config: OpportunityScoreConfig = DEFAULT_OPPORTUNITY_SCORE_CONFIG,
  ): MarketSignal<VocOpportunitySignalMetrics> {
    const vocEvidences = evidences.filter((e) => e.type === 'EXTERNAL_VOC' || e.type === 'VOC');
    const evidenceIds = vocEvidences.map((e) => e.evidenceId);

    if (!vocAnalysis || vocAnalysis.painPoints.length === 0) {
      return {
        signalId: 'voc',
        label: 'VOC 用户心声机会信号 (VOC Opportunity)',
        status: 'MISSING',
        scope: 'CATEGORY_EXTERNAL_VOC',
        subjectId: keyword ?? 'CATEGORY',
        sampleSize: 0,
        representativeAsin,
        rawMetrics: {
          painPointCount: 0,
          topPainPointFrequency: 0,
          topPainPointPercentage: 0,
          desiredFeaturesCount: 0,
          scope: 'CATEGORY',
          contentKind: 'UNKNOWN',
          sampleSize: 0,
        },
        normalizedScore: null,
        weight: config.weights.voc,
        contribution: null,
        confidence: 0,
        evidenceIds: [],
        findings: ['未获取到有效 VOC 痛点或买家真实反馈'],
      };
    }

    const painPoints = vocAnalysis.painPoints;
    const desiredFeatures = vocAnalysis.desiredFeatures || [];
    const scope = vocAnalysis.analysisScope?.type || 'CATEGORY';
    const sampleSize = vocAnalysis.analysisScope?.totalAnalyzedItems || painPoints[0]?.sampleSize || 0;
    const contentKind: VocContentKind =
      (vocAnalysis.analysisScope?.searchSnippetCount ?? 0) > 0 ? 'SEARCH_SNIPPET' : 'FULL_TEXT';

    const topPainPoint = painPoints[0];
    const topPainPointFrequency = topPainPoint?.frequency || 0;
    const topPainPointPercentage = topPainPoint?.percentage || 0;

    let score = 50;
    const findings: string[] = [];

    // High frequency pain points mean clear user frustration and differentiation space
    if (topPainPointPercentage >= config.voc.topPainPointHighThreshold) {
      score += config.voc.topPainPointHighBonus;
      findings.push(
        sampleSize > 0
          ? `本次采集的 ${sampleSize} 条相关公开讨论中，核心痛点“${topPainPoint.topic}”涉及频次达 ${topPainPointFrequency} 次（占样本 ${topPainPointPercentage}%），指向明确改进方向`
          : `核心痛点“${topPainPoint.topic}”高频集中（样本占比 ${topPainPointPercentage}%），指向明确改进方向`,
      );
    } else if (topPainPointPercentage >= config.voc.topPainPointMediumThreshold && topPainPointPercentage < config.voc.topPainPointHighThreshold) {
      score += config.voc.topPainPointMediumBonus;
      findings.push(
        sampleSize > 0
          ? `本次采集的 ${sampleSize} 条相关公开讨论中，核心痛点“${topPainPoint.topic}”涉及频次 ${topPainPointFrequency} 次（占样本 ${topPainPointPercentage}%），存在结构性改良空间`
          : `核心痛点“${topPainPoint.topic}”占比 ${topPainPointPercentage}%，存在结构性改良空间`,
      );
    } else {
      score += 5;
      findings.push(
        sampleSize > 0
          ? `痛点分布较为分散（最高提及率占样本 ${topPainPointPercentage}%，共采集 ${sampleSize} 条讨论）`
          : `痛点分布较为分散（最高提及率样本占比 ${topPainPointPercentage}%）`,
      );
    }

    if (desiredFeatures.length > 0) {
      score = Math.min(100, score + Math.min(config.voc.maxDesiredFeatureBonus, desiredFeatures.length * config.voc.desiredFeatureMultiplier));
      findings.push(`买家明确期待 ${desiredFeatures.length} 项具体功能特征 (如：${desiredFeatures[0].feature})`);
    }

    // Gate 0 calibration: Calibrate confidence & penalty if search snippets or small sample
    let confidence = 0.85;
    if (contentKind === 'SEARCH_SNIPPET') {
      confidence = config.voc.searchSnippetConfidenceCap;
      findings.push('注：当前 VOC 文本基于真实搜索引擎讨论摘要 (Search Snippet)，可信度适度折减');
    }
    if (sampleSize < config.voc.smallSampleThreshold && sampleSize > 0) {
      confidence = Math.max(0.5, confidence - config.voc.smallSampleConfidencePenalty);
      findings.push(`样本量 ${sampleSize} 条偏小，建议后续补充完整文本`);
    }

    return {
      signalId: 'voc',
      label: 'VOC 用户心声机会信号 (VOC Opportunity)',
      status: 'AVAILABLE',
      scope: 'CATEGORY_EXTERNAL_VOC',
      subjectId: vocAnalysis.analysisScope?.query ?? keyword ?? 'CATEGORY',
      sampleSize,
      representativeAsin,
      rawMetrics: {
        painPointCount: painPoints.length,
        topPainPointFrequency,
        topPainPointPercentage,
        desiredFeaturesCount: desiredFeatures.length,
        scope,
        contentKind,
        sampleSize,
      },
      normalizedScore: Math.min(100, Math.max(10, score)),
      weight: config.weights.voc,
      contribution: null,
      confidence,
      evidenceIds,
      findings,
    };
  }

  /**
   * Evidence Gate Evaluation
   * Rule:
   * - SUFFICIENT: total available signals >= 4 AND both demand and competition are available
   * - DEGRADED_PASS: total available signals >= 3 AND at least one of demand or competition is available
   * - INSUFFICIENT: available < 3 OR both critical signals (demand and competition) are missing
   */
  private static evaluateEvidenceGate(
    signals: Record<'demand' | 'competition' | 'commercial' | 'trend' | 'reviewHealth' | 'voc', MarketSignal<any>>,
    config: OpportunityScoreConfig = DEFAULT_OPPORTUNITY_SCORE_CONFIG,
  ): EvidenceGateStatus {
    const availableCount = Object.values(signals).filter((s) => s.status === 'AVAILABLE' || s.status === 'PARTIAL').length;
    const isDemandAvailable = signals.demand.status === 'AVAILABLE' || signals.demand.status === 'PARTIAL';
    const isCompetitionAvailable = signals.competition.status === 'AVAILABLE' || signals.competition.status === 'PARTIAL';

    if (availableCount >= config.gate.sufficientMinSignals && isDemandAvailable && isCompetitionAvailable) {
      return 'SUFFICIENT';
    }
    if (availableCount >= config.gate.degradedMinSignals && (isDemandAvailable || isCompetitionAvailable)) {
      return 'DEGRADED_PASS';
    }
    return 'INSUFFICIENT';
  }

  /**
   * Confidence Calculation (Decoupled from Opportunity Score)
   */
  private static calculateConfidence(
    gateStatus: EvidenceGateStatus,
    availableSignalCount: number,
    evidences: ResearchEvidence[],
    vocAnalysis?: VocProductAnalysisResult | null,
  ): { confidenceLevel: ConfidenceLevel; confidenceScore: number } {
    if (gateStatus === 'INSUFFICIENT') {
      return { confidenceLevel: 'LOW', confidenceScore: 0.3 };
    }

    let score = 0.5;
    score += (availableSignalCount / 6) * 0.3; // +0.15 to +0.30

    // Provider diversity
    const providers = new Set(evidences.map((e) => e.providerId));
    if (providers.size >= 2) score += 0.1;

    // Freshness & live mode
    const liveCount = evidences.filter((e) => e.mode === 'LIVE').length;
    if (liveCount / Math.max(1, evidences.length) > 0.7) score += 0.05;

    // VOC Snippet penalty
    if (vocAnalysis?.analysisScope?.searchSnippetCount && vocAnalysis.analysisScope.searchSnippetCount > 0) {
      score = Math.min(score, 0.85); // Cap if snippets
    }

    const confidenceScore = Number(Math.min(0.98, Math.max(0.3, score)).toFixed(2));
    let confidenceLevel: ConfidenceLevel = 'MEDIUM';
    if (confidenceScore >= 0.8) confidenceLevel = 'HIGH';
    else if (confidenceScore >= 0.6) confidenceLevel = 'MEDIUM';
    else confidenceLevel = 'LOW';

    return { confidenceLevel, confidenceScore };
  }

  /**
   * Generate Structured Facts separated by Boundary Levels
   */
  private static generateStructuredFacts(
    signals: Record<'demand' | 'competition' | 'commercial' | 'trend' | 'reviewHealth' | 'voc', MarketSignal<any>>,
    evidences: ResearchEvidence[],
    vocAnalysis?: VocProductAnalysisResult | null,
  ): { strengths: StructuredFact[]; risks: StructuredFact[]; opportunities: StructuredFact[] } {
    const strengths: StructuredFact[] = [];
    const risks: StructuredFact[] = [];
    const opportunities: StructuredFact[] = [];

    // Demand
    const demand = signals.demand;
    if (demand.rawMetrics.weeklySearchVolume !== null && demand.rawMetrics.weeklySearchVolume !== undefined) {
      strengths.push({
        code: 'FACT_DEMAND_VOLUME',
        level: 'FACT',
        statement: `品类关键词真实周搜索量为 ${demand.rawMetrics.weeklySearchVolume.toLocaleString()} 次${demand.rawMetrics.abaRank ? `，全站 ABA 综合排名 #${demand.rawMetrics.abaRank.toLocaleString()}` : ''}。`,
        evidenceIds: demand.evidenceIds,
        metricName: 'weeklySearchVolume',
        metricValue: demand.rawMetrics.weeklySearchVolume,
      });
    }

    // Commercial / Price
    const comm = signals.commercial;
    if (comm.rawMetrics.avgPrice !== null && comm.rawMetrics.avgPrice !== undefined) {
      strengths.push({
        code: 'FACT_PRICE_DISTRIBUTION',
        level: 'FACT',
        statement: `主流商品均价 $${comm.rawMetrics.avgPrice.toFixed(2)}${comm.rawMetrics.minPrice !== null ? `，价格区间 [$${comm.rawMetrics.minPrice} - $${comm.rawMetrics.maxPrice}]` : ''}。`,
        evidenceIds: comm.evidenceIds,
        metricName: 'avgPrice',
        metricValue: comm.rawMetrics.avgPrice,
      });
    }

    // Trend
    const trend = signals.trend;
    if (trend.rawMetrics.bsrDirection === 'RANK_IMPROVED' || trend.rawMetrics.bsrDirection === 'IMPROVED') {
      strengths.push({
        code: 'FACT_BSR_MOMENTUM',
        level: 'FACT',
        statement: `标杆竞品 BSR 销售排名呈上升态势 (${trend.rawMetrics.bsrDirection})，显示品类动量活跃。`,
        evidenceIds: trend.evidenceIds,
        metricName: 'bsrDirection',
        metricValue: trend.rawMetrics.bsrDirection,
      });
    }

    // Review Health
    const reviewHealth = signals.reviewHealth;
    if (reviewHealth.rawMetrics.averageRating !== null && reviewHealth.rawMetrics.averageRating !== undefined) {
      strengths.push({
        code: 'FACT_RATING_HEALTH',
        level: 'FACT',
        statement: `标杆竞品平均评分为 ⭐${reviewHealth.rawMetrics.averageRating}${reviewHealth.rawMetrics.totalReviewCount ? ` (累计 ${reviewHealth.rawMetrics.totalReviewCount.toLocaleString()} 条真实评价)` : ''}。`,
        evidenceIds: reviewHealth.evidenceIds,
        metricName: 'averageRating',
        metricValue: reviewHealth.rawMetrics.averageRating,
      });
    }

    // Competition Barrier
    const comp = signals.competition;
    if (comp.rawMetrics.topAsinAvgReviews && comp.rawMetrics.topAsinAvgReviews <= 500) {
      opportunities.push({
        code: 'SIGNAL_LOW_REVIEW_BARRIER',
        level: 'SIGNAL',
        statement: `竞品平均评价体量仅 ${comp.rawMetrics.topAsinAvgReviews} 条，新品冷启动评价护城河壁垒适中。`,
        evidenceIds: comp.evidenceIds,
        metricName: 'topAsinAvgReviews',
        metricValue: comp.rawMetrics.topAsinAvgReviews,
      });
    } else if (comp.rawMetrics.topAsinAvgReviews && comp.rawMetrics.topAsinAvgReviews > 2000) {
      risks.push({
        code: 'SIGNAL_HIGH_REVIEW_MOAT',
        level: 'SIGNAL',
        statement: `头部成熟竞品评价已累积 ${comp.rawMetrics.topAsinAvgReviews} 条，自然排位存在评价马太效应。`,
        evidenceIds: comp.evidenceIds,
        metricName: 'topAsinAvgReviews',
        metricValue: comp.rawMetrics.topAsinAvgReviews,
      });
    }

    // VOC Pain Points & Actionable Recommendations (Grounding: Strictly driven by candidate VOC evidence)
    const voc = signals.voc;
    if (voc.rawMetrics.painPointCount > 0) {
      const sampleSize = voc.rawMetrics.sampleSize || 0;
      const freq = voc.rawMetrics.topPainPointFrequency || 0;
      const pct = voc.rawMetrics.topPainPointPercentage || 0;
      const topTopic = vocAnalysis?.painPoints?.[0]?.topic || '相关使用痛点';

      const sampleDesc = sampleSize > 0
        ? `本次采集的 ${sampleSize} 条相关公开讨论中，有 ${freq} 条涉及“${topTopic}”（占样本 ${pct}%）`
        : `VOC 讨论中涉及“${topTopic}”（占样本 ${pct}%）`;

      opportunities.push({
        code: 'INFERENCE_VOC_DIFFERENTIATION',
        level: 'INFERENCE',
        statement: `${sampleDesc}，若能针对性改进可形成差异化竞争优势。`,
        evidenceIds: voc.evidenceIds,
        metricName: 'topPainPointPercentage',
        metricValue: pct,
      });

      // Product design recommendation MUST be grounded in actual evidence (e.g. desired features or specific pain points)
      // Without relevant concrete feature evidence, DO NOT fabricate physical structure recommendations!
      const desiredFeatures = vocAnalysis?.desiredFeatures || [];
      if (desiredFeatures.length > 0) {
        for (const feat of desiredFeatures.slice(0, 2)) {
          const featEvidenceIds = feat.evidenceIds && feat.evidenceIds.length > 0
            ? feat.evidenceIds
            : voc.evidenceIds;
          opportunities.push({
            code: 'RECOMMENDATION_PRODUCT_DESIGN',
            level: 'RECOMMENDATION',
            statement: `基于真实买家诉求证据，建议在新品设计中重点评估“${feat.feature}”的可行性与工艺公差。`,
            evidenceIds: featEvidenceIds,
          });
        }
      }
    }

    // Evidence Quality Risk
    if (voc.rawMetrics.contentKind === 'SEARCH_SNIPPET') {
      risks.push({
        code: 'FACT_EVIDENCE_SNIPPET_KIND',
        level: 'FACT',
        statement: '当前 VOC 文本由检索摘要 (SEARCH_SNIPPET) 提取，尚未进行整页全篇评论回溯，可信度评级受限。',
        evidenceIds: voc.evidenceIds,
      });
    }

    return { strengths, risks, opportunities };
  }

  /**
   * Deterministic Natural Language Explanation
   */
  private static generateDeterministicExplanation(
    keyword: string,
    overallScore: number | null,
    signals: Record<string, MarketSignal<any>>,
    strengths: StructuredFact[],
    risks: StructuredFact[],
    opportunities: StructuredFact[],
  ): OpportunityExplanation {
    const scoreStr = overallScore !== null ? `${overallScore}/100` : '暂未评分 (数据不足)';

    const summary =
      overallScore !== null && overallScore >= 75
        ? `【候选入围 (SHORTLIST)】关键词 "${keyword}" 规则型机会评分 ${scoreStr}。该类目具备强劲搜索需求与健康客单价，且头部竞品存在清晰的买家痛点断层，具备入围深入验证价值。`
        : overallScore !== null && overallScore >= 60
        ? `【持续观察 (WATCH)】关键词 "${keyword}" 规则型机会评分 ${scoreStr}。需求基本盘存在，但在竞争壁垒或产品工艺改良上需平衡成本。`
        : `【数据不足或暂缓 (INSUFFICIENT_DATA)】关键词 "${keyword}" 规则型机会评分 ${scoreStr}。当前数据维度不足或壁垒过高。`;

    const demandAnalysis = signals.demand.findings.join('；') || '市场需求数据暂缺。';
    const competitionAnalysis = signals.competition.findings.join('；') || '竞争格局数据暂缺。';
    const differentiationOpportunity = signals.voc.findings.join('；') || '未发现显著 VOC 差异化断层。';

    const actionableRecommendations = opportunities
      .filter((o) => o.level === 'RECOMMENDATION')
      .map((o) => o.statement);

    if (actionableRecommendations.length === 0) {
      actionableRecommendations.push('建议持续监测标杆竞品 BSR 波动并补充深层整页 VOC 评测。');
    }

    return {
      summary,
      demandAnalysis,
      competitionAnalysis,
      differentiationOpportunity,
      actionableRecommendations,
    };
  }
}
