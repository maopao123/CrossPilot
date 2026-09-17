import { InitialCashItem, InitialCashRequirement, InitialCashStatus } from '@crosspilot/shared';
import { ProfitCalculationService } from '../profit/profit-calculation.service.js';

export class InitialCashService {
  /**
   * P0-11: 启动资金独立模型测算
   * 严格与单件 Unit Economics 分离，单件利润只算单件边际贡献，首单现金回答“第一次做要掏多少真金白银”
   * 严格口径: MOQ × 单件产品成本 + 样品费 + 首批头程运费 + [模具/打样费 + 包装制版费 + 其他一次性杂费]
   *
   * 冻结规约 (P0-1 闭环):
   * 1. 启动资金必须同时具备样品费 (sampleCost) 与首批头程 (firstFreightCost)。
   * 2. 若任一项缺失 (undefined 或 null)，status 标记为 INCOMPLETE，totalInitialCash 为 null，
   *    displaySummaryZh 显示 “首单资金还算不全：缺样品费/首批头程”，杜绝将采购出厂货款充当首单启动资金。
   */
  static calculateInitialCash(params: {
    moq: number;
    productCostPerUnit: number;
    sampleCost?: number | null;
    firstFreightCost?: number | null;
    toolingCost?: number | null;
    packagingSetupCost?: number | null;
    otherOneTimeCosts?: number | null;
    currency?: string;
  }): InitialCashRequirement {
    const {
      moq,
      productCostPerUnit,
      sampleCost,
      firstFreightCost,
      toolingCost = 0,
      packagingSetupCost = 0,
      otherOneTimeCosts = 0,
      currency = 'CNY',
    } = params;

    const inventoryCost = ProfitCalculationService.roundMoney(moq * productCostPerUnit);
    const validTooling = ProfitCalculationService.roundMoney(toolingCost ?? 0);
    const validPackagingSetup = ProfitCalculationService.roundMoney(packagingSetupCost ?? 0);
    const validOther = ProfitCalculationService.roundMoney(otherOneTimeCosts ?? 0);

    const missingItems: string[] = [];
    if (sampleCost === undefined || sampleCost === null) {
      missingItems.push('样品费');
    }
    if (firstFreightCost === undefined || firstFreightCost === null) {
      missingItems.push('首批头程');
    }

    const isIncomplete = missingItems.length > 0;
    const status: InitialCashStatus = isIncomplete ? 'INCOMPLETE' : 'COMPLETE';

    const validSample = sampleCost != null ? ProfitCalculationService.roundMoney(sampleCost) : null;
    const validFreight = firstFreightCost != null ? ProfitCalculationService.roundMoney(firstFreightCost) : null;

    let totalInitialCash: number | null = null;
    let displaySummaryZh: string;

    if (isIncomplete) {
      totalInitialCash = null;
      displaySummaryZh = `首单资金还算不全：缺${missingItems.join('/')}`;
    } else {
      totalInitialCash = ProfitCalculationService.roundMoney(
        inventoryCost +
          (validSample ?? 0) +
          (validFreight ?? 0) +
          validTooling +
          validPackagingSetup +
          validOther,
      );
      if (totalInitialCash >= 10000) {
        const val = totalInitialCash / 10000;
        displaySummaryZh = `¥${Number(val.toFixed(2))} 万 (含货款、样品、头程)`;
      } else {
        displaySummaryZh = `¥${totalInitialCash.toLocaleString()} (含货款、样品、头程)`;
      }
    }

    const breakdown: InitialCashItem[] = [
      {
        item: `首批大货采购款 (${moq} 件 × ${currency} ${productCostPerUnit})`,
        amount: inventoryCost,
        currency,
        description: '大货出厂采购成本',
        isOneTime: false,
      },
    ];

    if (validSample != null && validSample > 0) {
      breakdown.push({
        item: '样品打样及寄送费',
        amount: validSample,
        currency,
        description: '确认产前样支出',
        isOneTime: true,
      });
    }

    if (validFreight != null && validFreight > 0) {
      breakdown.push({
        item: '首批头程物流费',
        amount: validFreight,
        currency,
        description: '国内集运/海运到亚马逊仓费用',
        isOneTime: false,
      });
    }

    if (validTooling > 0) {
      breakdown.push({
        item: '模具与工装费用',
        amount: validTooling,
        currency,
        description: '开模/改模固定投入',
        isOneTime: true,
      });
    }

    if (validPackagingSetup > 0) {
      breakdown.push({
        item: '包装菲林/刀版/印刷制版费',
        amount: validPackagingSetup,
        currency,
        description: '定制包装一次性制版费',
        isOneTime: true,
      });
    }

    if (validOther > 0) {
      breakdown.push({
        item: '其他一次性启动杂费',
        amount: validOther,
        currency,
        description: '第三方质检或检测认证预备金',
        isOneTime: true,
      });
    }

    return {
      status,
      moq,
      productCostPerUnit,
      inventoryCost,
      sampleCost: validSample,
      firstFreightCost: validFreight,
      toolingCost: validTooling,
      packagingSetupCost: validPackagingSetup,
      otherOneTimeCosts: validOther,
      totalInitialCash,
      currency,
      missingItems: isIncomplete ? missingItems : undefined,
      displaySummaryZh,
      breakdown,
    };
  }
}
