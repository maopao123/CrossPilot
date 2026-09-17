import {
  FxSnapshot,
  MissingRequirement,
  ProductCandidate,
  SupplierQuote,
  SupplierQuoteBadgeType,
  SupplierQuoteFactBadge,
  ValueSource,
} from '@crosspilot/shared';
import { ProfitCalculationService } from '../profit/profit-calculation.service.js';

export interface SelectPrimaryQuoteResult {
  candidate: ProductCandidate;
  primaryQuote: SupplierQuote;
  productCostQuoteCurrency: number;
  productCostCny: number;
  productCostUsd: number | null;
  fxRate: number | null;
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

    // 原始币种单件采购成本 = unitPrice + packagingCost + logoCost
    const productCostOriginal = ProfitCalculationService.roundMoney(
      updatedQuote.unitPrice + (finalPackagingCost ?? 0) + (finalLogoCost ?? 0),
    );
    const productCostCny = updatedQuote.currency === 'CNY' ? productCostOriginal : 0;
    const productCostQuoteCurrency = productCostOriginal;

    const economicsCurrency = candidate.economics?.currency || 'USD';
    const isSameCurrency = updatedQuote.currency === economicsCurrency;

    let fxRate: number | null = null;
    let fxSnapshot: FxSnapshot | undefined = candidate.fxSnapshot;
    let productCostUsd: number | null = null;
    let productCostSource: ValueSource = 'UNKNOWN';
    let productCostBasis = '';

    const FX_MISSING_REQ = '还差人民币兑美元汇率，确认后才能完成成本换算。';

    if (isSameCurrency) {
      // 情况 A: Quote 币种与 Economics 币种一致，不需要 FX，直接使用原始金额
      productCostUsd = productCostOriginal;
      productCostSource = 'FACT';
      productCostBasis = `PRIMARY_QUOTE_${updatedQuote.supplierName}_${updatedQuote.currency}_${productCostOriginal}`;
    } else {
      // 情况 B: Quote 币种与 Economics 币种不同（如 CNY vs USD）
      // P0-2 铁律: 必须存在有效 fxSnapshot，禁止默认 0.14，禁止将缺少 FX 的成本标记为 FACT
      const hasValidFx =
        candidate.fxSnapshot &&
        typeof candidate.fxSnapshot.rate === 'number' &&
        candidate.fxSnapshot.rate > 0;

      if (hasValidFx) {
        fxRate = candidate.fxSnapshot!.rate;
        fxSnapshot = candidate.fxSnapshot;
        productCostUsd = ProfitCalculationService.roundMoney(productCostOriginal * fxRate);
        const fxSource = candidate.fxSnapshot!.source;
        productCostSource =
          fxSource === 'FACT' || (fxSource as string) === 'PBOC_BENCHMARK'
            ? 'FACT'
            : fxSource === 'ASSUMPTION'
            ? 'ASSUMPTION'
            : 'ESTIMATE';
        productCostBasis = `PRIMARY_QUOTE_${updatedQuote.supplierName}_${updatedQuote.currency}_${productCostOriginal}_FX_${fxRate}_${productCostSource}`;
      } else {
        // 无有效汇率快照，禁止使用 0.14 或隐藏默认值，禁止标为 FACT
        fxRate = null;
        fxSnapshot = undefined;
        productCostUsd = null;
        productCostSource = 'UNKNOWN';
        productCostBasis = `MISSING_FX_RATE_${updatedQuote.currency}_${economicsCurrency}`;
      }
    }

    // 更新 candidate 中的 quotes 列表及主要报价标记
    const updatedQuotes = quotes.map((q) => (q.id === quoteId ? updatedQuote : q));

    // 更新 candidate 的 economics 输入
    const updatedInputs = {
      ...candidate.economics.inputs,
      productCost: {
        value: productCostUsd,
        source: productCostSource,
        basis: productCostBasis,
      },
    };

    // 刷新 missingInputs
    let updatedMissingInputs = candidate.economics.missingInputs.filter(
      (m) => m !== 'productCost',
    );
    if (productCostUsd === null) {
      if (!updatedMissingInputs.includes('productCost')) {
        updatedMissingInputs.push('productCost');
      }
    }

    // 刷新 missingRequirements
    const fxMissingReq: MissingRequirement = {
      id: 'req-missing-fx-rate',
      dimension: 'ECONOMICS',
      field: 'fxRate',
      description: '还差人民币兑美元汇率，确认后才能完成成本换算。',
      blockingDecision: true,
    };

    const missingRequirements = [
      ...(candidate.missingRequirements || []).filter(
        (r) =>
          r.id !== 'req-missing-fx-rate' &&
          r.field !== 'fxRate' &&
          !r.description?.includes('汇率'),
      ),
    ];
    if (!isSameCurrency && productCostUsd === null) {
      missingRequirements.push(fxMissingReq);
    }

    const updatedCandidate: ProductCandidate = {
      ...candidate,
      supplierQuotes: updatedQuotes,
      primaryQuoteId: quoteId,
      fxSnapshot,
      missingRequirements,
      economics: {
        ...candidate.economics,
        inputs: updatedInputs,
        missingInputs: updatedMissingInputs,
      },
    };

    return {
      candidate: updatedCandidate,
      primaryQuote: updatedQuote,
      productCostQuoteCurrency,
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
