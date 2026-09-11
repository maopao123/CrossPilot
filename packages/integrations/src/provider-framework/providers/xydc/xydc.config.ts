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

export const XYDC_CAPABILITY_BINDINGS: CapabilityBinding[] = [
  {
    capabilityId: 'market.product.search',
    providerId: XYDC_PROVIDER_ID,
    transport: 'MCP',
    remoteToolName: 'xydc_search_products',
    enabled: true,
    priority: 100,
    metadata: { description: '搜索类目或关键词下的 Amazon 竞品列表' },
  },
  {
    capabilityId: 'market.product.detail',
    providerId: XYDC_PROVIDER_ID,
    transport: 'MCP',
    remoteToolName: 'xydc_get_product_detail',
    enabled: true,
    priority: 100,
    metadata: { description: '根据 ASIN 获取单个竞品规格与月销数据' },
  },
  {
    capabilityId: 'market.market.overview',
    providerId: XYDC_PROVIDER_ID,
    transport: 'MCP',
    remoteToolName: 'xydc_get_market_overview',
    enabled: true,
    priority: 100,
    metadata: { description: '获取类目核心词搜索大盘、均价与竞争度' },
  },
  {
    capabilityId: 'market.keyword.search',
    providerId: XYDC_PROVIDER_ID,
    transport: 'MCP',
    remoteToolName: 'xydc_search_keywords',
    enabled: true,
    priority: 100,
    metadata: { description: '检索核心词及高相关搜索量衍生词' },
  },
  {
    capabilityId: 'market.product.trend',
    providerId: XYDC_PROVIDER_ID,
    transport: 'MCP',
    remoteToolName: 'xydc_get_product_trends',
    enabled: true,
    priority: 100,
    metadata: { description: '获取 ASIN 或关键词的历史销售与价格走势' },
  },
];
