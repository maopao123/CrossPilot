import { ToolDefinition } from '../../contracts/tool.types.js';
import {
  IntegrationGateway,
  ProviderExecutionResult,
  CompositeTrace,
} from '@crosspilot/integrations';
import {
  MarketProduct,
  MarketOverviewSnapshot,
  KeywordMetric,
  MarketTrend,
  ResearchEvidence,
  EvidenceSourceMode,
  EvidenceType,
  VocProductAnalysisResult,
  ProductReviewHealthResult,
} from '@crosspilot/shared';

function createEvidenceFromExecution(
  result: ProviderExecutionResult<any>,
  type: EvidenceType,
  title: string,
  content: string,
): ResearchEvidence {
  const sourceName =
    result.providerId && result.providerId !== 'NONE'
      ? result.providerId.toUpperCase()
      : 'UNKNOWN';

  return {
    evidenceId: `evi_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    source: sourceName,
    providerId: result.providerId,
    transport: result.transport,
    type,
    title,
    content,
    capturedAt: result.capturedAt || new Date().toISOString(),
    mode: result.mode,
  };
}

export interface MarketProductSearchInput {
  keyword: string;
  category?: string;
  marketplace?: string;
  limit?: number;
  offset?: number;
}

export interface MarketProductSearchResult {
  products: MarketProduct[];
  total: number;
  evidence: ResearchEvidence[];
  mode: EvidenceSourceMode;
  provider: string;
  query?: {
    keyword: string;
    marketplace?: string;
  };
  keywordMetric?: KeywordMetric | null;
  providerInfo?: {
    providerId: string;
    transport?: string;
    mode: EvidenceSourceMode;
  };
  compositeTrace?: CompositeTrace;
}

export const MarketProductSearchTool: ToolDefinition<MarketProductSearchInput, MarketProductSearchResult> = {
  id: 'market.product.search',
  name: '市场商品检索与选品调研',
  description: '通过关键词或类目搜索亚马逊在售商品表现，获取销量、价格、BSR及评分，并关联事实凭证与数据来源。',
  category: 'PRODUCT_RESEARCH',
  version: '1.0.0',
  tags: ['market', 'product', 'search', 'competitor', 'asin'],
  timeoutMs: 15000,
  costEstimate: { amount: 0.01, unit: 'USD' },
  inputSchema: {
    type: 'object',
    properties: {
      keyword: {
        name: 'keyword',
        label: '核心关键词',
        type: 'string',
        required: true,
        placeholder: '例如: wireless earbuds, yoga mat...',
      },
      category: {
        name: 'category',
        label: '商品类目',
        type: 'string',
        required: false,
        placeholder: '例如: Electronics, Sports & Outdoors...',
      },
      marketplace: {
        name: 'marketplace',
        label: '站点代码',
        type: 'select',
        required: false,
        defaultValue: 'AMAZON_US',
        options: [
          { label: 'Amazon US (美国站)', value: 'AMAZON_US' },
          { label: 'Amazon UK (英国站)', value: 'AMAZON_UK' },
          { label: 'Amazon DE (德国站)', value: 'AMAZON_DE' },
          { label: 'Amazon JP (日本站)', value: 'AMAZON_JP' },
        ],
      },
      limit: {
        name: 'limit',
        label: '返回数量上限',
        type: 'number',
        required: false,
        defaultValue: 20,
      },
    },
    required: ['keyword'],
  },
  execute: async (input, ctx) => {
    const gateway = IntegrationGateway.getInstance();
    const result = await gateway.executeCapability<MarketProductSearchInput, any>(
      'market.product.search',
      input,
      {
        traceId: ctx?.traceId || `trace_${Date.now()}`,
        workspaceId: ctx?.workspaceId || 'default',
        marketplace: input.marketplace,
      },
    );

    const rawData = result.data;
    const products: MarketProduct[] = Array.isArray(rawData)
      ? rawData
      : rawData?.products || [];
    const keywordMetric: KeywordMetric | null = rawData?.keywordMetric || null;
    const query = rawData?.query || {
      keyword: input.keyword,
      marketplace: input.marketplace || 'AMAZON_US',
    };

    let evidence: ResearchEvidence[] = [];
    if (Array.isArray(rawData?.evidence) && rawData.evidence.length > 0) {
      evidence = rawData.evidence;
    } else {
      evidence = [
        createEvidenceFromExecution(
          result,
          'MARKET_PRODUCT',
          `Market Search: ${input.keyword}`,
          `Retrieved ${products.length} products for query '${input.keyword}' via ${result.providerId} (${result.mode})`,
        ),
      ];
    }

    return {
      query,
      keywordMetric,
      products,
      total: products.length,
      evidence,
      mode: result.mode,
      provider: result.providerId,
      providerInfo: {
        providerId: result.providerId,
        transport: result.transport,
        mode: result.mode,
      },
      compositeTrace: (result as any).compositeTrace,
    };
  },
};

export interface MarketProductDetailInput {
  asin: string;
  marketplace?: string;
}

export interface MarketProductDetailResult {
  product?: MarketProduct;
  evidence: ResearchEvidence[];
  mode: EvidenceSourceMode;
  provider: string;
}

export const MarketProductDetailTool: ToolDefinition<MarketProductDetailInput, MarketProductDetailResult> = {
  id: 'market.product.detail',
  name: '商品详情与ASIN画像分析',
  description: '通过ASIN查询商品完整市场画像，包含月销量、销售额、BSR排名、品牌及类目归属。',
  category: 'PRODUCT_RESEARCH',
  version: '1.0.0',
  tags: ['market', 'product', 'detail', 'asin', 'pricing'],
  timeoutMs: 15000,
  costEstimate: { amount: 0.01, unit: 'USD' },
  inputSchema: {
    type: 'object',
    properties: {
      asin: {
        name: 'asin',
        label: '标准商品 ASIN',
        type: 'string',
        required: true,
        placeholder: '例如: B0CX123456',
      },
      marketplace: {
        name: 'marketplace',
        label: '站点代码',
        type: 'select',
        required: false,
        defaultValue: 'AMAZON_US',
        options: [
          { label: 'Amazon US (美国站)', value: 'AMAZON_US' },
          { label: 'Amazon UK (英国站)', value: 'AMAZON_UK' },
          { label: 'Amazon DE (德国站)', value: 'AMAZON_DE' },
          { label: 'Amazon JP (日本站)', value: 'AMAZON_JP' },
        ],
      },
    },
    required: ['asin'],
  },
  execute: async (input, ctx) => {
    const gateway = IntegrationGateway.getInstance();
    const result = await gateway.executeCapability<MarketProductDetailInput, MarketProduct>(
      'market.product.detail',
      input,
      {
        traceId: ctx?.traceId || `trace_${Date.now()}`,
        workspaceId: ctx?.workspaceId || 'default',
        marketplace: input.marketplace,
      },
    );

    const product = result.data;
    const evidence: ResearchEvidence[] = [
      createEvidenceFromExecution(
        result,
        'MARKET_PRODUCT',
        `Product Detail: ${input.asin}`,
        `Fetched profile for ASIN ${input.asin} via ${result.providerId} (${result.mode})`,
      ),
    ];

    return {
      product,
      evidence,
      mode: result.mode,
      provider: result.providerId,
    };
  },
};

export interface MarketOverviewInput {
  keyword: string;
  category?: string;
  marketplace?: string;
}

export interface MarketOverviewResult {
  overview?: MarketOverviewSnapshot;
  evidence: ResearchEvidence[];
  mode: EvidenceSourceMode;
  provider: string;
}

export const MarketOverviewTool: ToolDefinition<MarketOverviewInput, MarketOverviewResult> = {
  id: 'market.market.overview',
  name: '市场大盘体量与竞争格局分析',
  description: '输入核心词或类目，输出大盘搜索量、均价、均评分、竞争激烈度、机会指数与Top竞品切片。',
  category: 'PRODUCT_RESEARCH',
  version: '1.0.0',
  tags: ['market', 'overview', 'opportunity', 'competition', 'benchmark'],
  timeoutMs: 20000,
  costEstimate: { amount: 0.02, unit: 'USD' },
  inputSchema: {
    type: 'object',
    properties: {
      keyword: {
        name: 'keyword',
        label: '市场调研主题词',
        type: 'string',
        required: true,
        placeholder: '例如: ergonomic office chair',
      },
      category: {
        name: 'category',
        label: '商品类目',
        type: 'string',
        required: false,
        placeholder: '例如: Office Products',
      },
      marketplace: {
        name: 'marketplace',
        label: '站点代码',
        type: 'select',
        required: false,
        defaultValue: 'AMAZON_US',
        options: [
          { label: 'Amazon US (美国站)', value: 'AMAZON_US' },
          { label: 'Amazon UK (英国站)', value: 'AMAZON_UK' },
          { label: 'Amazon DE (德国站)', value: 'AMAZON_DE' },
          { label: 'Amazon JP (日本站)', value: 'AMAZON_JP' },
        ],
      },
    },
    required: ['keyword'],
  },
  execute: async (input, ctx) => {
    const gateway = IntegrationGateway.getInstance();
    const result = await gateway.executeCapability<MarketOverviewInput, MarketOverviewSnapshot>(
      'market.market.overview',
      input,
      {
        traceId: ctx?.traceId || `trace_${Date.now()}`,
        workspaceId: ctx?.workspaceId || 'default',
        marketplace: input.marketplace,
      },
    );

    const overview = result.data;
    const evidence: ResearchEvidence[] =
      overview?.evidence && overview.evidence.length > 0
        ? overview.evidence
        : [
            createEvidenceFromExecution(
              result,
              'MARKET_METRIC',
              `Market Overview: ${input.keyword}`,
              `Analyzed market dynamics for '${input.keyword}' via ${result.providerId} (${result.mode})`,
            ),
          ];

    return {
      overview,
      evidence,
      mode: result.mode,
      provider: result.providerId,
    };
  },
};

export interface MarketKeywordSearchInput {
  keyword: string;
  marketplace?: string;
  limit?: number;
}

export interface MarketKeywordSearchResult {
  keywords: KeywordMetric[];
  evidence: ResearchEvidence[];
  mode: EvidenceSourceMode;
  provider: string;
}

export const MarketKeywordSearchTool: ToolDefinition<MarketKeywordSearchInput, MarketKeywordSearchResult> = {
  id: 'market.keyword.search',
  name: '市场关键词搜索量与竞争度挖掘',
  description: '检索关键词月度搜索量、点击份额、转化率及竞争强度指标，支持长尾词与高潜力词挖掘。',
  category: 'PRODUCT_RESEARCH',
  version: '1.0.0',
  tags: ['market', 'keyword', 'search-volume', 'competition', 'seo'],
  timeoutMs: 15000,
  costEstimate: { amount: 0.01, unit: 'USD' },
  inputSchema: {
    type: 'object',
    properties: {
      keyword: {
        name: 'keyword',
        label: '种子关键词',
        type: 'string',
        required: true,
        placeholder: '例如: yoga mat non slip',
      },
      marketplace: {
        name: 'marketplace',
        label: '站点代码',
        type: 'select',
        required: false,
        defaultValue: 'AMAZON_US',
        options: [
          { label: 'Amazon US (美国站)', value: 'AMAZON_US' },
          { label: 'Amazon UK (英国站)', value: 'AMAZON_UK' },
          { label: 'Amazon DE (德国站)', value: 'AMAZON_DE' },
          { label: 'Amazon JP (日本站)', value: 'AMAZON_JP' },
        ],
      },
      limit: {
        name: 'limit',
        label: '返回词数量',
        type: 'number',
        required: false,
        defaultValue: 20,
      },
    },
    required: ['keyword'],
  },
  execute: async (input, ctx) => {
    const gateway = IntegrationGateway.getInstance();
    const result = await gateway.executeCapability<MarketKeywordSearchInput, KeywordMetric[]>(
      'market.keyword.search',
      input,
      {
        traceId: ctx?.traceId || `trace_${Date.now()}`,
        workspaceId: ctx?.workspaceId || 'default',
        marketplace: input.marketplace,
      },
    );

    const keywords = result.data || [];
    const evidence: ResearchEvidence[] = [
      createEvidenceFromExecution(
        result,
        'KEYWORD',
        `Keyword Analysis: ${input.keyword}`,
        `Retrieved ${keywords.length} keywords for seed '${input.keyword}' via ${result.providerId} (${result.mode})`,
      ),
    ];

    return {
      keywords,
      evidence,
      mode: result.mode,
      provider: result.providerId,
    };
  },
};

export interface MarketProductTrendInput {
  asin: string;
  metric?: string;
  range?: string;
  marketplace?: string;
}

export interface MarketProductTrendResult {
  trends: MarketTrend[];
  evidence: ResearchEvidence[];
  mode: EvidenceSourceMode;
  provider: string;
}

export const MarketProductTrendTool: ToolDefinition<MarketProductTrendInput, MarketProductTrendResult> = {
  id: 'market.product.trend',
  name: '商品历史趋势与波动分析',
  description: '按ASIN获取历史销售、价格波动或BSR变化曲线，评估生命周期与季节性波动。',
  category: 'PRODUCT_RESEARCH',
  version: '1.0.0',
  tags: ['market', 'trend', 'history', 'sales', 'bsr'],
  timeoutMs: 15000,
  costEstimate: { amount: 0.01, unit: 'USD' },
  inputSchema: {
    type: 'object',
    properties: {
      asin: {
        name: 'asin',
        label: '商品 ASIN',
        type: 'string',
        required: true,
        placeholder: '例如: B0CX123456',
      },
      metric: {
        name: 'metric',
        label: '指标维度',
        type: 'select',
        required: false,
        defaultValue: 'ALL',
        options: [
          { label: '全维综合走势 (All)', value: 'ALL' },
          { label: 'BSR 排名走势 (Rank)', value: 'BSR' },
          { label: '价格走势 (Price)', value: 'PRICE' },
          { label: '星级评分走势 (Rating)', value: 'RATING' },
          { label: '评价数走势 (Reviews)', value: 'REVIEW_COUNT' },
          { label: '销量走势 (Sales)', value: 'SALES' },
        ],
      },
      range: {
        name: 'range',
        label: '时间跨度',
        type: 'select',
        required: false,
        defaultValue: '30d',
        options: [
          { label: '近 30 天', value: '30d' },
          { label: '近 90 天', value: '90d' },
          { label: '近 180 天', value: '180d' },
          { label: '近 365 天', value: '365d' },
        ],
      },
      marketplace: {
        name: 'marketplace',
        label: '站点代码',
        type: 'select',
        required: false,
        defaultValue: 'AMAZON_US',
        options: [
          { label: 'Amazon US (美国站)', value: 'AMAZON_US' },
          { label: 'Amazon UK (英国站)', value: 'AMAZON_UK' },
          { label: 'Amazon DE (德国站)', value: 'AMAZON_DE' },
          { label: 'Amazon JP (日本站)', value: 'AMAZON_JP' },
        ],
      },
    },
    required: ['asin'],
  },
  execute: async (input, ctx) => {
    const gateway = IntegrationGateway.getInstance();
    const result = await gateway.executeCapability<MarketProductTrendInput, MarketTrend | MarketTrend[]>(
      'market.product.trend',
      input,
      {
        traceId: ctx?.traceId || `trace_${Date.now()}`,
        workspaceId: ctx?.workspaceId || 'default',
        marketplace: input.marketplace,
      },
    );

    const trendData = result.data;
    const trends: MarketTrend[] = Array.isArray(trendData)
      ? trendData
      : trendData
        ? [trendData]
        : [];

    const evidence: ResearchEvidence[] =
      Array.isArray(result.metadata?.evidence) && result.metadata.evidence.length > 0
        ? result.metadata.evidence
        : [
            createEvidenceFromExecution(
              result,
              'TREND',
              `Product Trend: ${input.asin}`,
              `Generated ${input.metric || 'ALL'} trend points for ASIN ${input.asin} via ${result.providerId} (${result.mode})`,
            ),
          ];

    return {
      trends,
      evidence,
      mode: result.mode,
      provider: result.providerId,
    };
  },
};

export interface ReviewProductHealthInput {
  asin: string;
  marketplace?: string;
  skipCache?: boolean;
}

export interface ReviewProductHealthResult {
  health?: ProductReviewHealthResult;
  evidence: ResearchEvidence[];
  mode: EvidenceSourceMode;
  provider: string;
}

export const ReviewProductHealthTool: ToolDefinition<
  ReviewProductHealthInput,
  ReviewProductHealthResult
> = {
  id: 'review.product.health',
  name: '商品评价健康度与口碑概览',
  description:
    '查询商品公开星级评分与累计评价总量指标，明确区分文本挖掘与数值统计的事实边界。',
  category: 'PRODUCT_RESEARCH',
  version: '1.0.0',
  tags: ['market', 'review', 'rating', 'health', 'asin'],
  timeoutMs: 15000,
  costEstimate: { amount: 0.01, unit: 'USD' },
  inputSchema: {
    type: 'object',
    properties: {
      asin: {
        name: 'asin',
        label: '商品 ASIN',
        type: 'string',
        required: true,
        placeholder: '例如: B0BFGNSXYL',
      },
      marketplace: {
        name: 'marketplace',
        label: '站点代码',
        type: 'select',
        required: false,
        defaultValue: 'AMAZON_US',
        options: [
          { label: 'Amazon US (美国站)', value: 'AMAZON_US' },
          { label: 'Amazon UK (英国站)', value: 'AMAZON_UK' },
          { label: 'Amazon DE (德国站)', value: 'AMAZON_DE' },
          { label: 'Amazon JP (日本站)', value: 'AMAZON_JP' },
        ],
      },
    },
    required: ['asin'],
  },
  execute: async (input, ctx) => {
    const gateway = IntegrationGateway.getInstance();
    const result = await gateway.executeCapability<
      ReviewProductHealthInput,
      ProductReviewHealthResult
    >('review.product.health', input, {
      traceId: ctx?.traceId || `trace_${Date.now()}`,
      workspaceId: ctx?.workspaceId || 'default',
      marketplace: input.marketplace,
    });

    const health = result.data;
    const evidence: ResearchEvidence[] =
      health?.evidence && health.evidence.length > 0
        ? health.evidence
        : Array.isArray(result.metadata?.evidence) && result.metadata.evidence.length > 0
          ? result.metadata.evidence
          : [
              createEvidenceFromExecution(
                result,
                'REVIEW_METRIC',
                `Review Health: ${input.asin}`,
                `Review health metrics for ASIN ${input.asin} via ${result.providerId} (${result.mode})`,
              ),
            ];

    return {
      health,
      evidence,
      mode: result.mode,
      provider: result.providerId,
    };
  },
};

export interface VocProductAnalyzeInput {
  asin: string;
  marketplace?: string;
  skipCache?: boolean;
}

export interface VocProductAnalyzeResult {
  analysis?: VocProductAnalysisResult;
  evidence: ResearchEvidence[];
  mode: EvidenceSourceMode;
  provider: string;
}

export const VocProductAnalyzeTool: ToolDefinition<
  VocProductAnalyzeInput,
  VocProductAnalyzeResult
> = {
  id: 'voc.product.analyze',
  name: '买家原声与全网讨论深度洞察 (Text VOC)',
  description:
    '基于全网公开讨论（Reddit、垂直论坛、电商评测等）进行真实文本级 VOC 挖掘，包含痛点、使用场景、买家动机与原文 Quote 凭据核验。',
  category: 'PRODUCT_RESEARCH',
  version: '1.0.0',
  tags: ['market', 'voc', 'review', 'painpoint', 'sentiment', 'asin'],
  timeoutMs: 25000,
  costEstimate: { amount: 0.02, unit: 'USD' },
  inputSchema: {
    type: 'object',
    properties: {
      asin: {
        name: 'asin',
        label: '商品 ASIN',
        type: 'string',
        required: true,
        placeholder: '例如: B0BFGNSXYL',
      },
      marketplace: {
        name: 'marketplace',
        label: '站点代码',
        type: 'select',
        required: false,
        defaultValue: 'AMAZON_US',
        options: [
          { label: 'Amazon US (美国站)', value: 'AMAZON_US' },
          { label: 'Amazon UK (英国站)', value: 'AMAZON_UK' },
          { label: 'Amazon DE (德国站)', value: 'AMAZON_DE' },
          { label: 'Amazon JP (日本站)', value: 'AMAZON_JP' },
        ],
      },
    },
    required: ['asin'],
  },
  execute: async (input, ctx) => {
    const gateway = IntegrationGateway.getInstance();
    const result = await gateway.executeCapability<
      VocProductAnalyzeInput,
      VocProductAnalysisResult
    >('voc.product.analyze', input, {
      traceId: ctx?.traceId || `trace_${Date.now()}`,
      workspaceId: ctx?.workspaceId || 'default',
      marketplace: input.marketplace,
    });

    const analysis = result.data;
    const fallbackType = analysis?.vocSourceType || 'EXTERNAL_VOC';
    const evidence: ResearchEvidence[] =
      analysis?.evidence && analysis.evidence.length > 0
        ? analysis.evidence
        : Array.isArray(result.metadata?.evidence) && result.metadata.evidence.length > 0
          ? result.metadata.evidence
          : [
              createEvidenceFromExecution(
                result,
                fallbackType,
                `Text VOC: ${input.asin}`,
                `External VOC analysis for ASIN ${input.asin} via ${result.providerId} (${result.mode})`,
              ),
            ];

    return {
      analysis,
      evidence,
      mode: result.mode,
      provider: result.providerId,
    };
  },
};

