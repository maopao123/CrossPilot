import { ToolDefinition } from '../contracts/tool.types.js';
import { ComplianceJudgeService } from '@crosspilot/domain';

export const ComplianceListingCheckTool: ToolDefinition = {
  id: 'compliance.listing.check',
  name: 'Listing 合规与宣称真实性判决器',
  description: '严格审计亚马逊商品标题、五点描述与商品详情，自动拦截医疗/FDA虚假宣称、极值排行夸大与孔径尺寸隐患。',
  category: 'OPERATION',
  version: '1.0.0',
  tags: ['listing', 'compliance', 'amazon', 'audit'],
  timeoutMs: 8000,
  costEstimate: { amount: 0, unit: 'USD' },
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        name: 'title',
        label: '商品标题 (Title)',
        type: 'string',
        required: true,
        placeholder: '输入待审计的 Listing Title',
      },
      bulletPoints: {
        name: 'bulletPoints',
        label: '五点描述 (Bullet Points)',
        type: 'array',
        required: true,
      },
      description: {
        name: 'description',
        label: '商品长描述 (Description)',
        type: 'textarea',
        placeholder: '可选输入商品长描述内容',
      },
    },
    required: ['title', 'bulletPoints'],
  },
  execute: (input) => {
    return ComplianceJudgeService.evaluateListing({
      title: input.title,
      bulletPoints: Array.isArray(input.bulletPoints) ? input.bulletPoints : [input.bulletPoints],
      description: input.description,
    });
  },
};
