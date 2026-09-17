import {
  FxSnapshot,
  ProductCandidate,
  SupplierQuote,
  SupplierQuoteBadgeType,
  SupplierQuoteFactBadge,
} from '@crosspilot/shared';
import { ProfitCalculationService } from '../profit/profit-calculation.service.js';

export interface SelectPrimaryQuoteResult {
  candidate: ProductCandidate;
  primaryQuote: SupplierQuote;
  productCostCny: number;
  productCostUsd: number;
  fxRate: number;
  breakdown: {
    unitPrice: number;
    packagingCost: number;
    logoCost: number;
  };
}

export class SupplierQuoteService {
  /**
   * P0-3 & P0-4: 校验报价草稿
   * 允许草稿仅填 unitPrice 和 moq，降低录入摩擦
   */
  static validateDraft(quote: Partial<SupplierQuote>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (quote.unitPrice == null || quote.unitPrice <= 0 || isNaN(quote.unitPrice)) {
      errors.push('单价 (unitPrice) 必须大于 0');
    }
    if (quote.moq == null || quote.moq <= 0 || !Number.isInteger(quote.moq)) {
      errors.push('起订量 (MOQ) 必须为正整数');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * P0-3 & P0-17: 事实标签计算
   * 仅标记事实客观最值（单价最低、MOQ 最低、交期最短）
   * 严禁任何“综合最优”、“推荐选择”等主观隐性评分
   */
  static calculateFactBadges(quotes: SupplierQuote[]): SupplierQuoteFactBadge[] {
    const activeQuotes = quotes.filter((q) => q.status === 'ACTIVE');
    if (activeQuotes.length === 0) return [];

    const badges: SupplierQuoteFactBadge[] = [];

    // 1. 最低单价
    const minPrice = Math.min(...activeQuotes.map((q) => q.unitPrice));
    for (const q of activeQuotes) {
      if (q.unitPrice === minPrice) {
        badges.push({
          quoteId: q.id,
          badgeType: 'LOWEST_PRICE',
          labelZh: '单价最低',
        });
      }
    }

    // 2. 最低 MOQ
    const minMoq = Math.min(...activeQuotes.map((q) => q.moq));
    for (const q of activeQuotes) {
      if (q.moq === minMoq) {
        badges.push({
          quoteId: q.id,
          badgeType: 'LOWEST_MOQ',
          labelZh: 'MOQ 最低',
        });
      }
    }

    // 3. 最短交期（排除未填交期的）
    const quotesWithLeadTime = activeQuotes.filter(
      (q) => q.leadTimeDays != null && q.leadTimeDays > 0,
    );
    if (quotesWithLeadTime.length > 0) {
      const minLeadTime = Math.min(...quotesWithLeadTime.map((q) => q.leadTimeDays!));
      for (const q of quotesWithLeadTime) {
        if (q.leadTimeDays === minLeadTime) {
          badges.push({
            quoteId: q.id,
            badgeType: 'SHORTEST_LEAD_TIME',
            labelZh: '交期最短',
          });
        }
      }
    }

    return badges;
  }

  /**
   * P0-3, P0-5, P0-6: 选定主要算账供应商并推导 ProductCost
   * 1. 严格只消费所选的单个 primaryQuote，严禁跨供应商拼接 (禁止 A厂单价 + B厂包装)
   * 2. 严禁将 UNKNOWN 的包装费/Logo 费偷偷按 0 处理，若未确认需明确阻断
   * 3. 样品费与模具费为一次性投入，严格排除在单件 ProductCost 之外
   * 4. 基于 FX 快照进行确定性汇率折算 (CNY -> USD) 并保留分项
   */
  static selectPrimaryQuote(
    candidate: ProductCandidate,
    quoteId: string,
    confirmedUnknownCharges?: {
      packagingCost?: number;
      logoCost?: number;
    },
  ): SelectPrimaryQuoteResult {
    const quotes = candidate.supplierQuotes ?? [];
    const quote = quotes.find((q) => q.id === quoteId);

    if (!quote) {
      throw new Error(`未找到 ID 为 ${quoteId} 的供应商报价`);
    }

    if (quote.status === 'STALE') {
      throw new Error(
        `该报价针对的是历史规格 (STALE)，核心规格已变更，无法作为当前主要算账依据`,
      );
    }

    // 处理 packagingCost 与 logoCost 的 UNKNOWN 校验，杜绝偷偷按 0 计算
    let finalPackagingCost = quote.packagingCost.value;
    let packagingSource = quote.packagingCost.source;

    if (quote.packagingCost.source === 'UNKNOWN' || quote.packagingCost.value === null) {
      if (
        confirmedUnknownCharges &&
        confirmedUnknownCharges.packagingCost !== undefined &&
        confirmedUnknownCharges.packagingCost !== null
      ) {
        finalPackagingCost = confirmedUnknownCharges.packagingCost;
        packagingSource = 'FACT';
      } else {
        throw new Error(
          '该报价的【包装费用】为 UNKNOWN (未知)。系统禁止隐式按 0 计算，请明确确认是否有额外包装费（输入 0 或具体费用）。',
        );
      }
    }

    let finalLogoCost = quote.logoCost.value;
    let logoSource = quote.logoCost.source;

    if (quote.logoCost.source === 'UNKNOWN' || quote.logoCost.value === null) {
      if (
        confirmedUnknownCharges &&
        confirmedUnknownCharges.logoCost !== undefined &&
        confirmedUnknownCharges.logoCost !== null
      ) {
        finalLogoCost = confirmedUnknownCharges.logoCost;
        logoSource = 'FACT';
      } else {
        throw new Error(
          '该报价的【Logo费用】为 UNKNOWN (未知)。系统禁止隐式按 0 计算，请明确确认是否有额外定制费（输入 0 或具体费用）。',
        );
      }
    }

    // 更新 quote 的确认值
    const updatedQuote: SupplierQuote = {
      ...quote,
      packagingCost: {
        value: finalPackagingCost,
        source: packagingSource,
        basis: 'CONFIRMED_USER_SELECTION',
      },
      logoCost: {
        value: finalLogoCost,
        source: logoSource,
        basis: 'CONFIRMED_USER_SELECTION',
      },
    };

    // productCost = unitPrice + packagingCost + logoCost (均为单件分项)
    const productCostCny = ProfitCalculationService.roundMoney(
      updatedQuote.unitPrice + (finalPackagingCost ?? 0) + (finalLogoCost ?? 0),
    );

    // 确定汇率（优先 Candidate 快照，默认 0.14）
    const fxRate = candidate.fxSnapshot?.rate ?? 0.14;
    const fxSnapshot: FxSnapshot = candidate.fxSnapshot ?? {
      currencyPair: 'CNY_USD',
      rate: fxRate,
      source: 'SYSTEM_DEFAULT',
      capturedAt: new Date().toISOString(),
    };

    // 转换为 USD ProductCost
    const productCostUsd =
      quote.currency === 'USD'
        ? productCostCny
        : ProfitCalculationService.roundMoney(productCostCny * fxRate);

    // 更新 candidate 中的 quotes 列表及主要报价标记
    const updatedQuotes = quotes.map((q) => (q.id === quoteId ? updatedQuote : q));

    // 更新 candidate 的 economics 输入
    const updatedInputs = {
      ...candidate.economics.inputs,
      productCost: {
        value: productCostUsd,
        source: 'FACT' as const,
        basis: `PRIMARY_QUOTE_${updatedQuote.supplierName}_CNY_${productCostCny}`,
      },
    };

    // 刷新 missingInputs
    const updatedMissingInputs = candidate.economics.missingInputs.filter(
      (m) => m !== 'productCost',
    );

    const updatedCandidate: ProductCandidate = {
      ...candidate,
      supplierQuotes: updatedQuotes,
      primaryQuoteId: quoteId,
      fxSnapshot,
      economics: {
        ...candidate.economics,
        inputs: updatedInputs,
        missingInputs: updatedMissingInputs,
      },
    };

    return {
      candidate: updatedCandidate,
      primaryQuote: updatedQuote,
      productCostCny,
      productCostUsd,
      fxRate,
      breakdown: {
        unitPrice: updatedQuote.unitPrice,
        packagingCost: finalPackagingCost ?? 0,
        logoCost: finalLogoCost ?? 0,
      },
    };
  }
}
