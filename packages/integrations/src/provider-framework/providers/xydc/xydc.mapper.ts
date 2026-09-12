import {
  KeywordMetric,
  MarketOverviewSnapshot,
  MarketProduct,
  MarketTrend,
  ResearchEvidence,
  EvidenceSourceMode,
  EvidenceType,
  TrendMetricType,
  TrendSummary,
  TrendDirection,
  VocProductAnalysisResult,
  ProductReviewHealthResult,
  VocPainPoint,
  VocPraisePoint,
  VocBuyerMotivation,
} from '@crosspilot/shared';
import {
  XydcProductEntity,
  XydcRawKeyword,
  XydcRawMarketOverview,
  XydcRawProduct,
  XydcRawTrend,
  XydcSearchTermEntity,
  XydcBsrCategory,
  XydcBsrTrendPoint,
  XydcGetBsrTrendsResponse,
  XydcInfoTrendPoint,
  XydcGetInfoTrendsResponse,
} from './xydc.types.js';

export class XydcMapper {
  /**
   * Map real XYDC get_asin_info entity to CrossPilot MarketProduct contract.
   * Strictly avoids fake defaults (Generic, Home & Kitchen, 0, 999999).
   */
  static toMarketProductFromEntity(
    entity: XydcProductEntity,
    marketplace = 'AMAZON_US',
  ): MarketProduct {
    const asin = entity.asin || 'UNKNOWN';
    let parsedPrice: number | null = null;
    if (typeof entity.price === 'number') {
      parsedPrice = entity.price;
    } else if (typeof entity.price === 'string' && entity.price.trim() !== '') {
      const p = parseFloat(entity.price);
      parsedPrice = isNaN(p) ? null : p;
    }

    let parsedStars: number | null = null;
    if (typeof entity.stars === 'number') {
      parsedStars = entity.stars;
    } else if (typeof entity.stars === 'string' && entity.stars.trim() !== '') {
      const s = parseFloat(entity.stars);
      parsedStars = isNaN(s) ? null : s;
    }

    let parsedRatings: number | null = null;
    if (typeof entity.ratings === 'number') {
      parsedRatings = entity.ratings;
    } else if (typeof entity.ratings === 'string' && (entity.ratings as string).trim() !== '') {
      const r = parseInt(entity.ratings as string, 10);
      parsedRatings = isNaN(r) ? null : r;
    }

    return {
      source: 'XYDC',
      marketplace,
      externalId: asin,
      asin,
      title: entity.title || `Amazon Product (${asin})`,
      brand: null, // get_asin_info does not provide brand; strictly null
      category: null, // get_asin_info does not provide category; strictly null
      price: parsedPrice,
      monthlySales: null, // get_asin_info does not provide monthly sales; strictly null
      monthlyRevenue: null, // get_asin_info does not provide monthly revenue; strictly null
      rating: parsedStars,
      reviewCount: parsedRatings,
      bsr: null, // get_asin_info does not provide BSR; strictly null
      imageUrl: entity.bigPicUrl || entity.smallPicUrl || null,
      sourceUrl: entity.amazonUrl || `https://www.amazon.com/dp/${asin}`,
      capturedAt: new Date().toISOString(),
    };
  }

  static toMarketProductsFromEntities(
    entities: XydcProductEntity[],
    marketplace = 'AMAZON_US',
  ): MarketProduct[] {
    if (!Array.isArray(entities)) return [];
    return entities.map((e) => this.toMarketProductFromEntity(e, marketplace));
  }

  static toProductEvidence(
    product: MarketProduct,
    options: {
      providerId?: string;
      transport?: string;
      mode?: EvidenceSourceMode;
      executionTimeMs?: number;
      costCredits?: number;
    } = {},
  ): ResearchEvidence {
    return {
      evidenceId: `evi_prod_${product.asin}_${Date.now()}`,
      source: 'XYDC',
      providerId: options.providerId || 'xydc',
      transport: options.transport || 'MCP',
      mode: options.mode || 'LIVE',
      type: 'MARKET_PRODUCT',
      sourceId: product.asin,
      title: `Amazon Product (${product.asin})`,
      content: `ASIN: ${product.asin} | Title: ${product.title} | Price: ${product.price != null ? '$' + product.price.toFixed(2) : '—'} | Rating: ${product.rating != null ? product.rating.toFixed(1) : '—'} (${product.reviewCount != null ? product.reviewCount.toLocaleString() : '—'} reviews)`,
      capturedAt: new Date().toISOString(),
      costCredits: options.costCredits,
      executionTimeMs: options.executionTimeMs,
      confidenceScore: 0.98,
    };
  }

  static toMarketProduct(raw: XydcRawProduct, marketplace = 'AMAZON_US'): MarketProduct {
    const asin = raw.asin || raw.id || raw.item_id || 'UNKNOWN';
    return {
      source: 'XYDC',
      marketplace,
      externalId: asin,
      asin,
      title: raw.title || 'Untitled Product',
      brand: raw.brand || raw.brand_name || null,
      category: raw.category_path || null,
      price: typeof raw.price === 'number' ? raw.price : null,
      monthlySales: raw.monthlySales ?? raw.sales_monthly ?? raw.est_sales ?? null,
      monthlyRevenue: raw.monthlyRevenue ?? raw.revenue_monthly ?? raw.est_revenue ?? null,
      rating: raw.customer_rating ?? raw.rating ?? null,
      reviewCount: raw.review_count ?? raw.reviews ?? null,
      bsr: raw.bsr_rank ?? raw.bsr ?? null,
      imageUrl: raw.main_image_url || raw.image_url || null,
      sourceUrl: raw.product_url || raw.url || `https://www.amazon.com/dp/${asin}`,
      capturedAt: new Date().toISOString(),
    };
  }

  static toMarketProducts(rawList: XydcRawProduct[], marketplace = 'AMAZON_US'): MarketProduct[] {
    if (!Array.isArray(rawList)) return [];
    return rawList.map((item) => this.toMarketProduct(item, marketplace));
  }

  static toMarketOverview(
    raw: XydcRawMarketOverview,
    marketplace = 'AMAZON_US',
    mode: EvidenceSourceMode = 'LIVE',
  ): MarketOverviewSnapshot {
    const trendingKeywords = (raw.trending_keywords || []).map((k) => ({
      keyword: k.keyword || k.kw || '',
      volume: k.volume || k.vol || 0,
      growth: k.growth || k.growth_rate || '+0%',
    }));

    const topProducts = (raw.top_asins || []).map((p) => this.toMarketProduct(p, marketplace));

    const evidenceList: ResearchEvidence[] = [
      this.toEvidence(
        'MARKET_METRIC',
        raw.keyword,
        `XYDC 市场大盘指标 - ${raw.keyword}`,
        `月均搜索量 ${raw.monthly_search_volume || raw.search_volume || 0}，平均售价 $${raw.average_price || raw.avg_price || 0}，平均评分 ${raw.average_rating || raw.avg_rating || 0}。`,
        mode,
        raw,
      ),
    ];

    return {
      seedKeyword: raw.keyword,
      category: raw.category || 'Home & Kitchen > Bath',
      marketplace,
      searchVolumeMonthly: raw.monthly_search_volume || raw.search_volume || 48500,
      avgPrice: raw.average_price || raw.avg_price || 30.5,
      avgRating: raw.average_rating || raw.avg_rating || 4.42,
      avgReviewCount: raw.average_reviews || raw.avg_reviews || 1120,
      competitorCount: raw.active_competitors_count || raw.competitors_count || 12,
      opportunityScore: raw.opportunity_index || 8.8,
      competitionScore: raw.competition_intensity || 6.5,
      trendingKeywords,
      topProducts,
      evidence: evidenceList,
      source: 'XYDC',
      mode,
      capturedAt: new Date().toISOString(),
    };
  }

  /**
   * Map real XYDC get_keyword_info entity to CrossPilot KeywordMetric contract.
   * Strictly avoids fake defaults (growth, relevance, search volume defaults).
   */
  static toKeywordMetricFromEntity(
    entity: XydcSearchTermEntity,
    marketplace = 'AMAZON_US',
  ): KeywordMetric {
    let cpcVal: number | null = null;
    if (entity.costPerClick?.value) {
      const p = parseFloat(entity.costPerClick.value);
      cpcVal = isNaN(p) ? null : p;
    }

    let compScore: number | null = null;
    if (typeof entity.competitiveDifficulty === 'number') {
      compScore = entity.competitiveDifficulty / 100;
    }

    const topAsinList = (entity.abaReport?.topAsins || [])
      .map((item) => item.asin)
      .filter(Boolean);

    return {
      source: 'XYDC',
      marketplace,
      keyword: entity.searchTerm,
      searchVolume: entity.abaReport?.weeklySearchVolume ?? null,
      abaRank: entity.abaReport?.searchFrequencyRank ?? null,
      competition: compScore,
      relevance: null, // get_keyword_info does not provide relevance score; strictly null
      growth: null, // get_keyword_info does not provide growth rate; strictly null
      cpc: cpcVal,
      topAsins: topAsinList.length > 0 ? topAsinList : null,
      capturedAt: new Date().toISOString(),
    };
  }

  static toKeywordMetrics(
    rawList: Array<XydcSearchTermEntity | XydcRawKeyword>,
    marketplace = 'AMAZON_US',
  ): KeywordMetric[] {
    if (!Array.isArray(rawList)) return [];
    return rawList.map((item: any) => {
      if (item.searchTerm !== undefined) {
        return this.toKeywordMetricFromEntity(item as XydcSearchTermEntity, marketplace);
      }
      return {
        source: 'XYDC',
        marketplace,
        keyword: item.keyword || '',
        searchVolume: item.search_volume ?? item.volume ?? null,
        competition: item.competition_score ?? null,
        relevance: item.relevance_score ?? null,
        cpc: item.cpc_bid ?? null,
        growth: item.growth_rate ?? null,
        abaRank: item.abaRank ?? item.searchFrequencyRank ?? null,
        topAsins: item.topAsins ?? null,
        capturedAt: new Date().toISOString(),
      };
    });
  }

  static toKeywordEvidence(
    metric: KeywordMetric,
    costCredits = 1,
    mode: EvidenceSourceMode = 'LIVE',
  ): ResearchEvidence {
    const volStr =
      metric.searchVolume != null
        ? `${metric.searchVolume.toLocaleString()} (ABA周搜索量)`
        : '暂无搜索量';
    const rankStr = metric.abaRank != null ? `#${metric.abaRank}` : '暂无排名';
    const cpcStr = metric.cpc != null ? `$${metric.cpc}` : '暂无竞价';
    const topAsinsStr =
      metric.topAsins && metric.topAsins.length > 0 ? metric.topAsins.join(', ') : '无';

    return {
      evidenceId: `ev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      source: 'XYDC',
      providerId: 'xydc',
      transport: 'MCP',
      type: 'KEYWORD',
      sourceId: metric.keyword,
      title: `XYDC 官方关键词大盘指标 (${metric.keyword})`,
      content: `关键词: ${metric.keyword}\nABA搜索量: ${volStr}，ABA排名: ${rankStr}，建议CPC: ${cpcStr}\n头部ASIN: ${topAsinsStr}\n数据来源: XYDC Remote Tool get_keyword_info (耗费: ${costCredits} Credits)`,
      mode,
      capturedAt: new Date().toISOString(),
      metadata: {
        keyword: metric.keyword,
        marketplace: metric.marketplace,
        credits: costCredits,
        abaRank: metric.abaRank,
        searchVolume: metric.searchVolume,
        topAsins: metric.topAsins,
      },
    };
  }

  /**
   * Deterministic mathematical trend summary computation (100% Code-based, Zero LLM).
   * Strict directional semantics:
   * - BSR: rank down = RANK_IMPROVED, rank up = RANK_DECLINED
   * - PRICE: price up = PRICE_UP, price down = PRICE_DOWN
   * - RATING: rating up = RATING_IMPROVED, rating down = RATING_DECLINED
   * - REVIEW_COUNT: review up = REVIEWS_INCREASED, review down = REVIEWS_DECREASED
   */
  static computeTrendSummary(
    points: Array<{ date: string; value: number | null }>,
    metric: TrendMetricType,
  ): TrendSummary | undefined {
    const validPoints = points.filter(
      (p) => p.value !== null && typeof p.value === 'number' && !isNaN(p.value),
    );
    if (validPoints.length === 0) return undefined;

    const startValue = validPoints[0].value!;
    const endValue = validPoints[validPoints.length - 1].value!;
    const values = validPoints.map((p) => p.value!);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const averageValue = Number(
      (values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(2),
    );
    const changeAbsolute = Number((endValue - startValue).toFixed(2));
    const changePercent =
      startValue !== 0
        ? Number(((changeAbsolute / Math.abs(startValue)) * 100).toFixed(2))
        : 0;

    let direction: TrendDirection = 'STABLE';

    if (metric === 'BSR') {
      // Lower BSR rank is superior
      if (changeAbsolute < 0) {
        direction = 'RANK_IMPROVED';
      } else if (changeAbsolute > 0) {
        direction = 'RANK_DECLINED';
      } else {
        direction = 'STABLE';
      }
    } else if (metric === 'PRICE') {
      if (changeAbsolute > 0) {
        direction = 'PRICE_UP';
      } else if (changeAbsolute < 0) {
        direction = 'PRICE_DOWN';
      } else {
        direction = 'STABLE';
      }
    } else if (metric === 'RATING') {
      if (changeAbsolute > 0) {
        direction = 'RATING_IMPROVED';
      } else if (changeAbsolute < 0) {
        direction = 'RATING_DECLINED';
      } else {
        direction = 'STABLE';
      }
    } else if (metric === 'REVIEW_COUNT') {
      if (changeAbsolute > 0) {
        direction = 'REVIEWS_INCREASED';
      } else if (changeAbsolute < 0) {
        direction = 'REVIEWS_DECREASED';
      } else {
        direction = 'STABLE';
      }
    } else {
      if (changeAbsolute > 0) {
        direction = 'IMPROVED';
      } else if (changeAbsolute < 0) {
        direction = 'DECLINED';
      } else {
        direction = 'STABLE';
      }
    }

    return {
      startValue,
      endValue,
      minValue,
      maxValue,
      averageValue,
      changeAbsolute,
      changePercent,
      direction,
    };
  }

  /**
   * Map real XYDC get_asin_bsr_trends response to CrossPilot MarketTrend.
   * Extracts category tree and root / sub-category BSR ranks.
   */
  static toBsrTrend(
    data: XydcGetBsrTrendsResponse['data'],
    marketplace = 'AMAZON_US',
    asin = 'UNKNOWN',
  ): MarketTrend {
    const categoryTree = data?.categoryTree || [];
    const rootCategory = categoryTree.find((c) => c.root) || categoryTree[0];
    const subCategory = categoryTree.find((c) => !c.root);

    const rawTrends = data?.trends || [];
    const points: Array<{ date: string; value: number | null }> = rawTrends.map((t) => {
      const rootVal = t.values?.find((v) => v.categoryId === rootCategory?.categoryId);
      const subVal = t.values?.find((v) => v.categoryId === subCategory?.categoryId);
      const rank = rootVal?.rank ?? subVal?.rank ?? null;
      return {
        date: t.date,
        value: rank !== null && !isNaN(Number(rank)) ? Number(rank) : null,
      };
    });

    const summary = this.computeTrendSummary(points, 'BSR');

    return {
      source: 'XYDC',
      marketplace,
      subjectId: data?.asin || asin,
      metric: 'BSR',
      points,
      summary,
      metadata: {
        categoryTree,
        rootCategoryName: rootCategory?.name || null,
        subCategoryName: subCategory?.name || null,
        dateRangeNotice: data?.dateRangeNotice || null,
      },
    };
  }

  /**
   * Map real XYDC get_asin_info_trends response to CrossPilot MarketTrend (PRICE).
   */
  static toPriceTrend(
    data: XydcGetInfoTrendsResponse['data'],
    marketplace = 'AMAZON_US',
    asin = 'UNKNOWN',
  ): MarketTrend {
    const rawTrends = data?.trends || [];
    const points: Array<{ date: string; value: number | null }> = rawTrends.map((t) => {
      const displayStr =
        t.priceDistribution?.display ||
        t.priceDistribution?.deal ||
        t.priceDistribution?.prime ||
        '';
      const cleanStr = String(displayStr).replace(/[^0-9.]/g, '');
      const parsed = cleanStr ? parseFloat(cleanStr) : NaN;
      return {
        date: t.date,
        value: !isNaN(parsed) && parsed > 0 ? parsed : null,
      };
    });

    const summary = this.computeTrendSummary(points, 'PRICE');

    return {
      source: 'XYDC',
      marketplace,
      subjectId: data?.asin || asin,
      metric: 'PRICE',
      points,
      summary,
      metadata: {
        dateRangeNotice: data?.dateRangeNotice || null,
      },
    };
  }

  /**
   * Map real XYDC get_asin_info_trends response to CrossPilot MarketTrend (RATING).
   */
  static toRatingTrend(
    data: XydcGetInfoTrendsResponse['data'],
    marketplace = 'AMAZON_US',
    asin = 'UNKNOWN',
  ): MarketTrend {
    const rawTrends = data?.trends || [];
    const points: Array<{ date: string; value: number | null }> = rawTrends.map((t) => {
      const starNum = t.stars != null ? parseFloat(String(t.stars).trim()) : NaN;
      return {
        date: t.date,
        value: !isNaN(starNum) && starNum > 0 ? starNum : null,
      };
    });

    const summary = this.computeTrendSummary(points, 'RATING');

    return {
      source: 'XYDC',
      marketplace,
      subjectId: data?.asin || asin,
      metric: 'RATING',
      points,
      summary,
      metadata: {
        dateRangeNotice: data?.dateRangeNotice || null,
      },
    };
  }

  /**
   * Map real XYDC get_asin_info_trends response to CrossPilot MarketTrend (REVIEW_COUNT).
   */
  static toReviewCountTrend(
    data: XydcGetInfoTrendsResponse['data'],
    marketplace = 'AMAZON_US',
    asin = 'UNKNOWN',
  ): MarketTrend {
    const rawTrends = data?.trends || [];
    const points: Array<{ date: string; value: number | null }> = rawTrends.map((t) => {
      const ratingsVal = t.ratings != null ? Number(t.ratings) : null;
      return {
        date: t.date,
        value: ratingsVal !== null && !isNaN(ratingsVal) ? ratingsVal : null,
      };
    });

    const summary = this.computeTrendSummary(points, 'REVIEW_COUNT');

    return {
      source: 'XYDC',
      marketplace,
      subjectId: data?.asin || asin,
      metric: 'REVIEW_COUNT',
      points,
      summary,
      metadata: {
        dateRangeNotice: data?.dateRangeNotice || null,
      },
    };
  }

  /**
   * Backward-compatible fallback for generic raw trend.
   */
  static toMarketTrend(raw: any, marketplace = 'AMAZON_US'): MarketTrend {
    let metricType: TrendMetricType = 'SALES';
    const mLower = (raw?.metric_name || raw?.metric || '').toLowerCase();
    if (mLower.includes('price')) metricType = 'PRICE';
    else if (mLower.includes('bsr') || mLower.includes('rank')) metricType = 'BSR';
    else if (mLower.includes('rating') || mLower.includes('star')) metricType = 'RATING';
    else if (mLower.includes('review')) metricType = 'REVIEW_COUNT';
    else if (mLower.includes('revenue')) metricType = 'REVENUE';
    else if (mLower.includes('search')) metricType = 'SEARCH_INTEREST';

    const points = (raw?.historical_data || raw?.points || []).map((pt: any) => ({
      date: pt.date,
      value: pt.val ?? pt.value ?? null,
    }));

    return {
      source: 'XYDC',
      marketplace,
      subjectId: raw?.asin || raw?.subjectId,
      metric: metricType,
      points,
      summary: this.computeTrendSummary(points, metricType),
    };
  }

  static toTrendEvidence(
    asin: string,
    trends: MarketTrend[],
    costCredits = 0,
    mode: EvidenceSourceMode = 'LIVE',
    categoryTree?: XydcBsrCategory[],
  ): ResearchEvidence {
    const summaryLines = trends.map((t) => {
      const s = t.summary;
      if (!s) return `${t.metric}: 暂无有效趋势点`;
      const chgStr = s.changeAbsolute != null ? `${s.changeAbsolute > 0 ? '+' : ''}${s.changeAbsolute}` : '—';
      const pctStr = s.changePercent != null ? `${s.changePercent > 0 ? '+' : ''}${s.changePercent}%` : '—';
      return `${t.metric}: ${s.startValue ?? '—'} -> ${s.endValue ?? '—'} (变化: ${chgStr}, ${pctStr}, 走向: ${s.direction})`;
    });

    const catStr =
      categoryTree && categoryTree.length > 0
        ? `类目: ${categoryTree.map((c) => `${c.name} (${c.root ? '大类' : '子类'})`).join(' > ')}`
        : '';

    return {
      evidenceId: `ev_trend_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      source: 'XYDC',
      providerId: 'xydc',
      transport: 'MCP',
      type: 'TREND',
      sourceId: asin,
      title: `XYDC 商品趋势多维画像 (${asin})`,
      content: `商品 ASIN: ${asin}\n${catStr ? catStr + '\n' : ''}${summaryLines.join('\n')}\n数据来源: XYDC Remote Tools get_asin_bsr_trends / get_asin_info_trends (消耗额度: ${costCredits} Credits)`,
      mode,
      capturedAt: new Date().toISOString(),
      metadata: {
        asin,
        credits: costCredits,
        trendsCount: trends.length,
        categoryTree,
      },
    };
  }

  static toProductDetailEvidence(
    product: MarketProduct,
    costCredits = 1,
    mode: EvidenceSourceMode = 'LIVE',
  ): ResearchEvidence {
    const priceDisplay =
      product.price !== null && product.price !== undefined ? `$${product.price}` : '暂无价格';
    const ratingDisplay =
      product.rating !== null && product.rating !== undefined ? `${product.rating}星` : '暂无评分';
    const reviewsDisplay =
      product.reviewCount !== null && product.reviewCount !== undefined
        ? `${product.reviewCount}条评价`
        : '暂无评价';

    return {
      evidenceId: `ev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      source: 'XYDC',
      providerId: 'xydc',
      transport: 'MCP',
      type: 'MARKET_PRODUCT',
      sourceId: product.asin,
      title: `XYDC 官方商品画像 (${product.asin})`,
      content: `商品标题: ${product.title}\n价格: ${priceDisplay}，评分: ${ratingDisplay} (${reviewsDisplay})\n数据来源: XYDC Remote Tool get_asin_info (耗费: ${costCredits} Credits)`,
      mode,
      capturedAt: new Date().toISOString(),
      metadata: {
        asin: product.asin,
        marketplace: product.marketplace,
        credits: costCredits,
        imageUrl: product.imageUrl,
      },
    };
  }

  /**
   * Map real XYDC get_asin_info entity into standard ProductReviewHealthResult contract.
   * Facts vs. Observation boundary:
   * - Ratings and average stars are factual metrics from XYDC.
   * - Unsupported NLP dimensions (pain points, praise points, motivations) are explicitly empty arrays/null,
   *   and recorded in unsupportedDimensions.
   * - Zero LLM fabrication.
   * - totalReviewCount = public total reviews; analyzedReviewCount = null (XYDC provides no review text).
   */
  static toReviewHealthResult(
    asin: string,
    marketplace: string,
    entity?: XydcProductEntity | null,
    _infoTrends?: XydcInfoTrendPoint[] | null,
  ): ProductReviewHealthResult {
    let avgRating: number | null = null;
    if (entity?.stars !== undefined && entity?.stars !== null) {
      const parsed = parseFloat(String(entity.stars));
      if (!isNaN(parsed)) avgRating = parsed;
    }

    let totalReviews: number | null = null;
    if (entity?.ratings !== undefined && entity?.ratings !== null) {
      const parsed = parseInt(String(entity.ratings), 10);
      if (!isNaN(parsed)) totalReviews = parsed;
    }

    const supportedDimensions = [
      'averageRating',
      'totalReviewCount',
      'ratingTrend',
      'reviewCountTrend',
    ];

    const unsupportedDimensions = [
      'painPoints',
      'praisePoints',
      'buyerMotivations',
      'negativeFeedback',
      'reviewTextExtraction',
    ];

    const evidenceNotice =
      '商品评价与口碑指标基于平台公开数据，非物理工程质检结论。当前 XYDC MCP 工具链未提供单品粒度 Review 文本挖掘工具（仅提供星级与评价总量指标）。';

    const starsStr = avgRating !== null ? avgRating.toFixed(1) : '未知';
    const reviewsStr = totalReviews !== null ? totalReviews.toLocaleString() : '未知';

    const summary = `当前公开累计评价数：${reviewsStr}，平均星级：${starsStr}。当前 Provider 未提供单条 Review 文本，因此尚未进行文本级 VOC 分析。`;

    return {
      asin,
      marketplace,
      averageRating: avgRating,
      totalReviewCount: totalReviews,
      analyzedReviewCount: null, // Strictly null: XYDC supplies no review text mining
      ratingDistribution: null,
      summary,
      supportedDimensions,
      unsupportedDimensions,
      evidenceNotice,
    };
  }

  static toReviewMetricEvidence(
    asin: string,
    health: ProductReviewHealthResult,
    costCredits = 1,
    mode: EvidenceSourceMode = 'LIVE',
  ): ResearchEvidence {
    const starsStr = health.averageRating !== null ? `${health.averageRating.toFixed(1)}★` : '—';
    const reviewsStr = health.totalReviewCount !== null ? health.totalReviewCount.toLocaleString() : '—';

    return {
      evidenceId: `ev_rev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      source: 'XYDC',
      providerId: 'xydc',
      transport: 'MCP',
      type: 'REVIEW_METRIC',
      sourceId: asin,
      title: `XYDC 官方商品评价与星级健康度 (${asin})`,
      content: `商品 ASIN: ${asin}\n公开平均评分: ${starsStr}\n公开累计评价总数: ${reviewsStr}\n已分析 Review 文本数: 0 (当前 Provider 未提供单条评论文本)\n数据来源: XYDC Remote Tool get_asin_info (耗费: ${costCredits} Credits)`,
      mode,
      capturedAt: new Date().toISOString(),
      costCredits,
      metadata: {
        asin,
        marketplace: health.marketplace,
        averageRating: health.averageRating,
        totalReviewCount: health.totalReviewCount,
        analyzedReviewCount: health.analyzedReviewCount,
        supportedDimensions: health.supportedDimensions,
        unsupportedDimensions: health.unsupportedDimensions,
      },
    };
  }

  /**
   * Map real XYDC entity into standard VocProductAnalysisResult (PARTIAL_LIVE).
   * Strictly avoids misleading "5147 reviews analyzed" claims.
   */
  static toVocAnalysisResult(
    asin: string,
    marketplace: string,
    entity?: XydcProductEntity | null,
    _infoTrends?: XydcInfoTrendPoint[] | null,
  ): VocProductAnalysisResult {
    let avgRating: number | null = null;
    if (entity?.stars !== undefined && entity?.stars !== null) {
      const parsed = parseFloat(String(entity.stars));
      if (!isNaN(parsed)) avgRating = parsed;
    }

    let totalReviews: number | null = null;
    if (entity?.ratings !== undefined && entity?.ratings !== null) {
      const parsed = parseInt(String(entity.ratings), 10);
      if (!isNaN(parsed)) totalReviews = parsed;
    }

    const ratingDistribution: Record<string, number> | null = null;

    const supportedDimensions = [
      'averageRating',
      'totalReviewCount',
      'ratingTrend',
      'reviewCountTrend',
    ];

    const unsupportedDimensions = [
      'painPoints',
      'praisePoints',
      'buyerMotivations',
      'negativeFeedback',
      'reviewTextExtraction',
    ];

    const evidenceNotice =
      '买家原声与评价洞察基于用户公开评价观察数据，非物理工程质检结论。当前 XYDC MCP 工具链未开放单品粒度 Review 文本挖掘接口（仅提供星级与评价总量指标）。';

    const starsStr = avgRating !== null ? avgRating.toFixed(1) : '未知';
    const reviewsStr = totalReviews !== null ? totalReviews.toLocaleString() : '未知';

    const summary = `当前公开累计评价数：${reviewsStr}，平均星级：${starsStr}。当前 Provider 未提供单条 Review 文本，因此尚未进行文本级 VOC 分析。`;

    return {
      asin,
      marketplace,
      totalReviewCount: totalReviews,
      analyzedReviewCount: null,
      totalReviewsAnalyzed: null,
      averageRating: avgRating,
      ratingDistribution,
      painPoints: [],
      praisePoints: [],
      buyerMotivations: [],
      summary,
      evidenceNotice,
      supportedDimensions,
      unsupportedDimensions,
    };
  }

  static toVocEvidence(
    asin: string,
    voc: VocProductAnalysisResult,
    costCredits = 1,
    mode: EvidenceSourceMode = 'LIVE',
  ): ResearchEvidence {
    return {
      evidenceId: `ev_voc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      source: 'XYDC',
      providerId: 'xydc',
      transport: 'MCP',
      type: 'REVIEW_METRIC',
      sourceId: asin,
      title: `XYDC 买家评价与原声概览 (${asin})`,
      content: `商品 ASIN: ${asin}\n公开平均评分: ${voc.averageRating ?? '—'}★\n公开累计评价总数: ${voc.totalReviewCount != null ? voc.totalReviewCount.toLocaleString() : '—'}\n已分析 Review 文本数: 0 (当前 Provider 未提供单条评论文本)\n数据提示: ${voc.evidenceNotice}`,
      mode,
      capturedAt: new Date().toISOString(),
      costCredits,
      metadata: {
        asin,
        marketplace: voc.marketplace,
        averageRating: voc.averageRating,
        totalReviewCount: voc.totalReviewCount,
        analyzedReviewCount: voc.analyzedReviewCount,
        unsupportedDimensions: voc.unsupportedDimensions,
      },
    };
  }

  static toEvidence(
    type: EvidenceType,
    sourceId: string,
    title: string,
    content: string,
    mode: EvidenceSourceMode = 'LIVE',
    rawObj?: any,
  ): ResearchEvidence {
    return {
      evidenceId: `ev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      source: 'XYDC',
      providerId: 'xydc',
      transport: 'MCP',
      type,
      sourceId,
      title,
      content,
      mode,
      capturedAt: new Date().toISOString(),
      metadata: rawObj ? { keys: Object.keys(rawObj) } : undefined,
    };
  }
}
