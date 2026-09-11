import { ToolDefinition } from '../contracts/tool.types.js';
import { AdOptimizerService } from '@crosspilot/domain';

export const OperationBidAdjustTool: ToolDefinition = {
  id: 'operation.bid.adjust',
  name: 'PPC 广告出价动态优化器',
  description: '对比当前广告活动实际 ACOS 与目标 ACOS 水位，推荐科学的关键词出价微调幅度，防范预算跑飞。',
  category: 'OPERATION',
  version: '1.0.0',
  tags: ['ads', 'ppc', 'bidding', 'optimization'],
  timeoutMs: 5000,
  costEstimate: { amount: 0, unit: 'USD' },
  inputSchema: {
    type: 'object',
    properties: {
      campaignId: {
        name: 'campaignId',
        label: '广告活动 ID / 名称',
        type: 'string',
        required: true,
        placeholder: '例如: CAMP-MARBLE-SP',
      },
      currentBid: {
        name: 'currentBid',
        label: '当前默认出价 ($)',
        type: 'number',
        required: true,
        placeholder: '例如: 1.50',
      },
      targetAcos: {
        name: 'targetAcos',
        label: '目标 ACOS (小数)',
        type: 'number',
        required: true,
        placeholder: '例如: 0.25 (即 25%)',
      },
      currentAcos: {
        name: 'currentAcos',
        label: '当前实际 ACOS (小数)',
        type: 'number',
        required: true,
        placeholder: '例如: 0.42 (即 42%)',
      },
    },
    required: ['campaignId', 'currentBid', 'targetAcos', 'currentAcos'],
  },
  execute: (input) => {
    const currentBid = Number(input.currentBid);
    const targetAcos = Number(input.targetAcos);
    const currentAcos = Number(input.currentAcos);

    let action: 'REDUCE_BID' | 'INCREASE_BID' | 'MAINTAIN' = 'MAINTAIN';
    let deltaPercent = 0;
    let reason = 'Current ACOS is aligned with performance target.';

    if (currentAcos > targetAcos * 1.3) {
      action = 'REDUCE_BID';
      deltaPercent = -20;
      reason = `Actual ACOS (${(currentAcos * 100).toFixed(1)}%) exceeds target ${(targetAcos * 100).toFixed(0)}%. Lowering bid by 20%.`;
    } else if (currentAcos < targetAcos * 0.7) {
      action = 'INCREASE_BID';
      deltaPercent = 15;
      reason = `Actual ACOS (${(currentAcos * 100).toFixed(1)}%) is well below target ${(targetAcos * 100).toFixed(0)}%. Raising bid by 15% to capture impression share.`;
    }

    const recommendedBid = Math.round(currentBid * (1 + deltaPercent / 100) * 100) / 100;

    return {
      campaignId: input.campaignId,
      currentBid,
      targetAcos,
      currentAcos,
      action,
      deltaPercent,
      recommendedBid,
      changeReason: reason,
    };
  },
};

