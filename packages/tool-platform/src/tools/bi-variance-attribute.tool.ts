import { ToolDefinition, ToolErrorEnvelope } from '../contracts/tool.types.js';
import { EvidenceMeta } from '@crosspilot/shared';
import { VarianceAttributionService } from '@crosspilot/domain';

export const BiVarianceAttributeTool: ToolDefinition = {
  id: 'bi.variance.attribute',
  name: '多因子杜邦利润波动瀑布归因分析器',
  description: '对两周期经营净利润的波动（如 -$2,280）进行广告、退货、库存、价格及其他因素的无误差数学分解。',
  category: 'DATA',
  version: '1.0.0',
  tags: ['bi', 'waterfall', 'variance', 'attribution', 'diagnosis'],
  timeoutMs: 5000,
  costEstimate: { amount: 0, unit: 'USD' },
  inputSchema: {
    type: 'object',
    properties: {
      previousProfit: {
        name: 'previousProfit',
        label: '基准期净利润 ($)',
        type: 'number',
        required: true,
        defaultValue: 4120.00,
        placeholder: '例如: 4120.00',
      },
      currentProfit: {
        name: 'currentProfit',
        label: '对比期净利润 ($)',
        type: 'number',
        required: true,
        defaultValue: 1840.00,
        placeholder: '例如: 1840.00',
      },
      advertisingImpact: {
        name: 'advertisingImpact',
        label: '广告费用变动贡献 ($)',
        type: 'number',
        defaultValue: -980.00,
        placeholder: '例如: -980.00',
      },
      returnsImpact: {
        name: 'returnsImpact',
        label: '退货损失变动贡献 ($)',
        type: 'number',
        defaultValue: -620.00,
        placeholder: '例如: -620.00',
      },
      inventoryImpact: {
        name: 'inventoryImpact',
        label: '库存断货损失贡献 ($)',
        type: 'number',
        defaultValue: -510.00,
        placeholder: '例如: -510.00',
      },
      priceImpact: {
        name: 'priceImpact',
        label: '售价调整变动贡献 ($)',
        type: 'number',
        defaultValue: -310.00,
        placeholder: '例如: -310.00',
      },
      otherImpact: {
        name: 'otherImpact',
        label: '其他/佣金变动贡献 ($)',
        type: 'number',
        defaultValue: 140.00,
        placeholder: '例如: 140.00',
      },
    },
    required: ['previousProfit', 'currentProfit'],
  },
  execute: (input) => {
    const prevProfitNum = Number(input.previousProfit);
    const currProfitNum = Number(input.currentProfit);

    if (!Number.isFinite(prevProfitNum) || !Number.isFinite(currProfitNum)) {
      const errorEnvelope: ToolErrorEnvelope = {
        code: 'INVALID_PROFIT_INPUT',
        category: 'VALIDATION',
        message: 'Both previousProfit and currentProfit must be finite numbers.',
        why: 'Variance attribution requires finite numeric values for previous and current period profits.',
        retryable: false,
        suggestedFix: { previousProfit: 'number', currentProfit: 'number' },
      };
      const err: any = new Error(errorEnvelope.message);
      err.code = errorEnvelope.code;
      err.category = errorEnvelope.category;
      err.why = errorEnvelope.why;
      err.retryable = errorEnvelope.retryable;
      err.errorEnvelope = errorEnvelope;
      throw err;
    }

    const attribution = VarianceAttributionService.attributeVariance({
      previousProfit: prevProfitNum,
      currentProfit: currProfitNum,
      advertisingImpact: input.advertisingImpact !== undefined ? Number(input.advertisingImpact) : 0,
      returnsImpact: input.returnsImpact !== undefined ? Number(input.returnsImpact) : 0,
      inventoryImpact: input.inventoryImpact !== undefined ? Number(input.inventoryImpact) : 0,
      priceImpact: input.priceImpact !== undefined ? Number(input.priceImpact) : 0,
      otherImpact: input.otherImpact !== undefined ? Number(input.otherImpact) : 0,
    });

    const evidenceMeta: EvidenceMeta[] = [
      {
        evidenceId: `evi_bi_variance_${Date.now()}`,
        sourceType: 'DERIVED',
        sourceRef: 'VarianceAttributionService.attributeVariance',
        observedAt: null,
        capturedAt: new Date().toISOString(),
        valueStatus: 'DERIVED',
        freshness: 'UNKNOWN',
        confidence: 1.0,
      },
    ];

    return {
      ...attribution,
      evidenceMeta,
    };
  },
};
