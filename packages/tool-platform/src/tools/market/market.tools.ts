import { ToolDefinition } from '../../contracts/tool.types.js';
import { IntegrationGateway, ProviderExecutionResult } from '@crosspilot/integrations';
import {
  MarketProduct,
  MarketOverviewSnapshot,
  KeywordMetric,
  MarketTrend,
  ResearchEvidence,
  EvidenceSourceMode,
  EvidenceType,
} from '@crosspilot/shared';

function createEvidenceFromExecution(
  result: ProviderExecutionResult<any>,
  type: EvidenceType,
  title: string,
  content: string,
): ResearchEvidence {
  return {
    evidenceId: `evi_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    source: result.transport,
    providerId: result.providerId,
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
    const result = await gateway.executeCapability<MarketProductSearchInput, MarketProduct[]>(
      'market.product.search',
      input,
      {
        traceId: ctx?.traceId || `trace_${Date.now()}`,
        workspaceId: ctx?.workspaceId || 'default',
        marketplace: input.marketplace,
      },
    );

    const products = result.data || [];
    const evidence: ResearchEvidence[] = [
      createEvidenceFromExecution(
        result,
        'MARKET_PRODUCT',
        `Market Search: ${input.keyword}`,
        `Retrieved ${products.length} products for query '${input.keyword}' via ${result.providerId} (${result.mode})`,
      ),
    ];

    return {
      products,
      total: products.length,
      evidence,
      mode: result.mode,
      provider: result.providerId,
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
        defaultValue: 'SALES',
        options: [
          { label: '销量走势 (Sales)', value: 'SALES' },
          { label: '价格走势 (Price)', value: 'PRICE' },
          { label: 'BSR 走势 (Rank)', value: 'BSR' },
          { label: '搜索热度 (Volume)', value: 'SEARCH_VOLUME' },
        ],
      },
      range: {
        name: 'range',
        label: '时间跨度',
        type: 'select',
        required: false,
        defaultValue: '90d',
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
    const result = await gateway.executeCapability<MarketProductTrendInput, MarketTrend>(
      'market.product.trend',
      input,
      {
        traceId: ctx?.traceId || `trace_${Date.now()}`,
        workspaceId: ctx?.workspaceId || 'default',
        marketplace: input.marketplace,
      },
    );

    const trend = result.data;
    const evidence: ResearchEvidence[] = [
      createEvidenceFromExecution(
        result,
        'TREND',
        `Product Trend: ${input.asin}`,
        `Generated ${input.metric || 'SALES'} trend points for ASIN ${input.asin} via ${result.providerId} (${result.mode})`,
      ),
    ];

    return {
      trends: trend ? [trend] : [],
      evidence,
      mode: result.mode,
      provider: result.providerId,
    };
  },
};
