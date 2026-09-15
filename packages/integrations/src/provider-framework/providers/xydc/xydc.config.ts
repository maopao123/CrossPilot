import {
  CapabilityBinding,
  IntegrationProviderDefinition,
} from '../../core/provider.types.js';

export const XYDC_PROVIDER_ID = 'xydc';

export const XYDC_PROVIDER_DEFINITION: IntegrationProviderDefinition = {
  id: XYDC_PROVIDER_ID,
  name: '西柚洞察 (XYDC)',
  category: 'MARKET_DATA',
  transport: 'MCP',
  enabled: true,
  priority: 100,
  timeoutMs: 12000,
  retryPolicy: {
    maxAttempts: 2,
    backoffMs: 500,
  },
  authRef: 'XYDC_MCP_TOKEN',
  endpointRef: 'XYDC_MCP_ENDPOINT',
  metadata: {
    website: 'https://www.xiyoudc.com',
    providerType: 'MARKET_INTELLIGENCE_MCP',
    version: '1.0.0',
  },
};

/**
 * PROVISIONAL / PLACEHOLDER Capability Bindings for XYDC.
 * NOTE: The remoteToolName values below are provisional placeholders defined during
 * framework development. They MUST be replaced/confirmed once real credentials are
 * configured and live McpDiscovery.discover('xydc') / tools/list is executed.
 * Status: PENDING_REAL_DISCOVERY (NOT VERIFIED)
 */
export const XYDC_CAPABILITY_BINDINGS: CapabilityBinding[] = [
  {
    capabilityId: 'market.product.search',
    providerId: XYDC_PROVIDER_ID,
    transport: 'MCP',
    remoteToolName: 'get_keyword_info+get_asin_info',
    remoteOperation: 'COMPOSITE',
    enabled: true,
    priority: 100,
    metadata: {
      status: 'COMPOSITE_LIVE',
      type: 'COMPOSITE',
      description: '复合能力：通过 get_keyword_info 提取 ABA Top ASINs，再通过 get_asin_info 批量获取商品详情',
      steps: ['get_keyword_info', 'get_asin_info'],
      estimatedCredits: 4,
    },
  },
  {
    capabilityId: 'market.product.detail',
    providerId: XYDC_PROVIDER_ID,
    transport: 'MCP',
    remoteToolName: 'get_asin_info', // REAL live verified XYDC MCP tool (Phase 1 First Live Call)
    enabled: true,
    priority: 100,
    metadata: {
      status: 'VERIFIED_LIVE',
      description: '根据 ASIN 获取单个商品基础信息、价格与评分 (get_asin_info, 1 Credit)',
      costCredits: 1,
    },
  },
  {
    capabilityId: 'market.market.overview',
    providerId: XYDC_PROVIDER_ID,
    transport: 'MCP',
    remoteToolName: 'PROVISIONAL_xydc_get_market_overview', // PLACEHOLDER: Replace after live tools/list
    enabled: true,
    priority: 100,
    metadata: {
      status: 'PLACEHOLDER_PENDING_DISCOVERY',
      description: '获取类目核心词搜索大盘、均价与竞争度 (待真实 MCP tools/list 确认)',
    },
  },
  {
    capabilityId: 'market.keyword.search',
    providerId: XYDC_PROVIDER_ID,
    transport: 'MCP',
    remoteToolName: 'get_keyword_info', // REAL live verified XYDC MCP tool (Phase 2 Live Tool Call)
    enabled: true,
    priority: 100,
    metadata: {
      status: 'VERIFIED_LIVE',
      description: '查询关键词最近一周基础市场指标 (get_keyword_info, 1 Credit)',
      costCredits: 1,
    },
  },
  {
    capabilityId: 'market.asin.keywords',
    providerId: XYDC_PROVIDER_ID,
    transport: 'MCP',
    remoteToolName: 'get_asin_keywords',
    enabled: true,
    priority: 100,
    metadata: {
      status: 'VERIFIED_LIVE',
      description: 'ASIN 反查近 7 天流量关键词 (get_asin_keywords, 1 Credit; 2026-09-15 live verified on B0BFGNSXYL)',
      direction: 'ASIN_TO_KEYWORDS',
      costCredits: 1,
    },
  },
  {
    capabilityId: 'market.product.trend',
    providerId: XYDC_PROVIDER_ID,
    transport: 'MCP',
    remoteToolName: 'get_asin_bsr_trends+get_asin_info_trends', // Composite capability
    enabled: true,
    priority: 100,
    metadata: {
      status: 'COMPOSITE_LIVE',
      description: '商品多维历史趋势 (BSR、价格、评分、评价数日级走势与确定性指标)',
      compositeSteps: ['get_asin_bsr_trends', 'get_asin_info_trends'],
    },
  },
  {
    capabilityId: 'review.product.health',
    providerId: XYDC_PROVIDER_ID,
    transport: 'MCP',
    remoteToolName: 'get_asin_info',
    enabled: true,
    priority: 100,
    metadata: {
      status: 'VERIFIED_LIVE',
      description: '商品评价健康度与口碑概览 (基于 get_asin_info，获取公开星级与累计评价总数指标)',
      costCredits: 1,
      supportedDimensions: [
        'averageRating',
        'totalReviewCount',
        'ratingTrend',
        'reviewCountTrend',
      ],
      unsupportedDimensions: [
        'painPoints',
        'praisePoints',
        'buyerMotivations',
        'negativeFeedback',
        'reviewTextExtraction',
      ],
    },
  },
  {
    capabilityId: 'voc.product.analyze',
    providerId: XYDC_PROVIDER_ID,
    transport: 'MCP',
    remoteToolName: 'get_asin_info',
    enabled: true,
    priority: 100,
    metadata: {
      status: 'PARTIAL_LIVE',
      description: '买家原声与评价洞察（兼容别名：XYDC 仅支持数值指标，不支持单 ASIN 文本级 VOC 挖掘）',
      costCredits: 1,
      supportedDimensions: [
        'averageRating',
        'totalReviewCount',
        'ratingTrend',
        'reviewCountTrend',
      ],
      unsupportedDimensions: [
        'painPoints',
        'praisePoints',
        'buyerMotivations',
        'negativeFeedback',
        'reviewTextExtraction',
      ],
    },
  },
];
