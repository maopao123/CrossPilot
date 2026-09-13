import { ToolDefinition } from '../contracts/tool.types.js';
import { ProfitCalculationService } from '@crosspilot/domain';

export const FinanceProfitCalculateTool: ToolDefinition = {
  id: 'finance.profit.calculate',
  name: '财务利润核算工具 (Profit Calculator)',
  description: '精确核算单件商品或周期的毛利、净利润、亚马逊佣金、FBA配送费与利润率，杜绝浮点数漂移。',
  category: 'DATA',
  version: '1.0.0',
  tags: ['finance', 'profit', 'amazon', 'economics'],
  timeoutMs: 5000,
  costEstimate: { amount: 0, unit: 'USD' },
  inputSchema: {
    type: 'object',
    properties: {
      revenue: {
        name: 'revenue',
        label: '销售收入 ($)',
        type: 'number',
        required: true,
        defaultValue: 29.99,
        placeholder: '例如: 29.99',
      },
      cogs: {
        name: 'cogs',
        label: '商品采购成本 COGS ($)',
        type: 'number',
        required: true,
        defaultValue: 5.80,
        placeholder: '例如: 5.80',
      },
      referralFeeRate: {
        name: 'referralFeeRate',
        label: '亚马逊佣金比例 (小数)',
        type: 'number',
        defaultValue: 0.15,
        placeholder: '例如: 0.15',
      },
      fbaFee: {
        name: 'fbaFee',
        label: 'FBA 履约费 ($)',
        type: 'number',
        defaultValue: 4.5,
        placeholder: '例如: 4.50',
      },
      adSpend: {
        name: 'adSpend',
        label: '平摊 PPC 广告花费 ($)',
        type: 'number',
        defaultValue: 0,
        placeholder: '例如: 3.20',
      },
      returnLoss: {
        name: 'returnLoss',
        label: '预估退货折损 ($)',
        type: 'number',
        defaultValue: 0,
        placeholder: '例如: 1.10',
      },
    },
    required: ['revenue', 'cogs'],
  },
  execute: (input) => {
    const quantity = Math.max(1, input.quantity !== undefined ? Number(input.quantity) || 1 : 1);
    const unitPrice = Number(input.revenue) / quantity;
    const unitCost = Number(input.cogs) / quantity;

    return ProfitCalculationService.calculateProfit({
      orderItems: [
        {
          quantity,
          unitPrice,
          unitCost,
          referralFeeRate:
            input.referralFeeRate !== undefined ? Number(input.referralFeeRate) : 0.15,
          fbaFeePerUnit:
            input.fbaFee !== undefined ? Number(input.fbaFee) / quantity : 4.5,
        },
      ],
      adsCost: input.adSpend !== undefined ? Number(input.adSpend) : 0,
      returns: input.returnLoss ? [{ refundAmount: Number(input.returnLoss) }] : [],
    });
  },
};

