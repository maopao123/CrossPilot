import { ToolDefinition } from '../contracts/tool.types.js';
import { InventoryPlanningService } from '@crosspilot/domain';

export const InventoryReplenishmentCalculateTool: ToolDefinition = {
  id: 'inventory.replenishment.calculate',
  name: 'FBA 补货计划与断货风险测算器',
  description: '综合可售库存、在途库存、日均销量、生产物流提前期与安全库存天数，科学推演补货点与建议补货量。',
  category: 'DATA',
  version: '1.0.0',
  tags: ['inventory', 'fba', 'planning', 'replenishment', 'stockout'],
  timeoutMs: 5000,
  costEstimate: { amount: 0, unit: 'USD' },
  inputSchema: {
    type: 'object',
    properties: {
      skuCode: {
        name: 'skuCode',
        label: '商品 SKU 编码',
        type: 'string',
        required: true,
        placeholder: '例如: MTH-GREEN-001',
      },
      availableStock: {
        name: 'availableStock',
        label: 'FBA 可售库存 (Units)',
        type: 'number',
        required: true,
        placeholder: '例如: 420',
      },
      inTransitStock: {
        name: 'inTransitStock',
        label: '在途采购与入库中库存 (Units)',
        type: 'number',
        defaultValue: 0,
        placeholder: '例如: 500',
      },
      dailyVelocity: {
        name: 'dailyVelocity',
        label: '日均消耗速度 (Units/Day)',
        type: 'number',
        required: true,
        placeholder: '例如: 35',
      },
      leadTimeDays: {
        name: 'leadTimeDays',
        label: '供应链提前期 (天)',
        type: 'number',
        defaultValue: 15,
        placeholder: '例如: 15',
      },
      safetyStockDays: {
        name: 'safetyStockDays',
        label: '安全库存缓冲天数 (天)',
        type: 'number',
        defaultValue: 14,
        placeholder: '例如: 14',
      },
    },
    required: ['skuCode', 'availableStock', 'dailyVelocity'],
  },
  execute: (input) => {
    return InventoryPlanningService.calculatePlanning({
      fulfillableQuantity: Number(input.availableStock),
      inboundQuantity: input.inTransitStock !== undefined ? Number(input.inTransitStock) : 0,
      avgDailySales: Number(input.dailyVelocity),
      leadTimeDays: input.leadTimeDays !== undefined ? Number(input.leadTimeDays) : 15,
      safetyStockDays: input.safetyStockDays !== undefined ? Number(input.safetyStockDays) : 14,
    });
  },
};

