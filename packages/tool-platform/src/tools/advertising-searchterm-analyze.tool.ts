import { ToolDefinition } from '../contracts/tool.types.js';
import { AdOptimizerService } from '@crosspilot/domain';

export const AdvertisingSearchTermAnalyzeTool: ToolDefinition = {
  id: 'advertising.searchterm.analyze',
  name: 'PPC 搜索词过滤与否定推荐器',
  description: '分析买家真实搜索词漏斗（曝光、点击、花费、订单、销售额），识别高ACOS低转化词并产出精准否定建议。',
  category: 'OPERATION',
  version: '1.0.0',
  tags: ['ads', 'ppc', 'amazon', 'searchterm', 'negative'],
  timeoutMs: 5000,
  costEstimate: { amount: 0, unit: 'USD' },
  inputSchema: {
    type: 'object',
    properties: {
      searchTerm: {
        name: 'searchTerm',
        label: '买家搜索词 (Search Term)',
        type: 'string',
        required: true,
        defaultValue: 'cheap plastic toothbrush holder',
        placeholder: '例如: bathroom organizer',
      },
      impressions: {
        name: 'impressions',
        label: '曝光量 (Impressions)',
        type: 'number',
        required: true,
        defaultValue: 4500,
        placeholder: '例如: 4500',
      },
      clicks: {
        name: 'clicks',
        label: '点击量 (Clicks)',
        type: 'number',
        required: true,
        defaultValue: 180,
        placeholder: '例如: 180',
      },
      spend: {
        name: 'spend',
        label: '花费 ($)',
        type: 'number',
        required: true,
        defaultValue: 120.00,
        placeholder: '例如: 420.00',
      },
      orders: {
        name: 'orders',
        label: '订单量 (Orders)',
        type: 'number',
        required: true,
        defaultValue: 1,
        placeholder: '例如: 2',
      },
      sales: {
        name: 'sales',
        label: '销售额 ($)',
        type: 'number',
        required: true,
        defaultValue: 29.99,
        placeholder: '例如: 450.00',
      },
    },
    required: ['searchTerm', 'impressions', 'clicks', 'spend', 'orders', 'sales'],
  },
  execute: (input) => {
    return AdOptimizerService.analyzeSearchTerm({
      searchTerm: input.searchTerm,
      impressions: Number(input.impressions),
      clicks: Number(input.clicks),
      spend: Number(input.spend),
      orders: Number(input.orders),
      sales: Number(input.sales),
    });
  },
};
