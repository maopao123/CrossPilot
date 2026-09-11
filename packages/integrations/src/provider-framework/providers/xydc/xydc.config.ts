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
    remoteToolName: 'PROVISIONAL_xydc_search_products', // PLACEHOLDER: Replace after live tools/list
    enabled: true,
    priority: 100,
    metadata: {
      status: 'PLACEHOLDER_PENDING_DISCOVERY',
      description: '搜索类目或关键词下的 Amazon 竞品列表 (待真实 MCP tools/list 确认)',
    },
  },
  {
    capabilityId: 'market.product.detail',
    providerId: XYDC_PROVIDER_ID,
    transport: 'MCP',
    remoteToolName: 'PROVISIONAL_xydc_get_product_detail', // PLACEHOLDER: Replace after live tools/list
    enabled: true,
    priority: 100,
    metadata: {
      status: 'PLACEHOLDER_PENDING_DISCOVERY',
      description: '根据 ASIN 获取单个竞品规格与月销数据 (待真实 MCP tools/list 确认)',
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
    remoteToolName: 'PROVISIONAL_xydc_search_keywords', // PLACEHOLDER: Replace after live tools/list
    enabled: true,
    priority: 100,
    metadata: {
      status: 'PLACEHOLDER_PENDING_DISCOVERY',
      description: '检索核心词及高相关搜索量衍生词 (待真实 MCP tools/list 确认)',
    },
  },
  {
    capabilityId: 'market.product.trend',
    providerId: XYDC_PROVIDER_ID,
    transport: 'MCP',
    remoteToolName: 'PROVISIONAL_xydc_get_product_trends', // PLACEHOLDER: Replace after live tools/list
    enabled: true,
    priority: 100,
    metadata: {
      status: 'PLACEHOLDER_PENDING_DISCOVERY',
      description: '获取 ASIN 或关键词的历史销售与价格走势 (待真实 MCP tools/list 确认)',
    },
  },
];
