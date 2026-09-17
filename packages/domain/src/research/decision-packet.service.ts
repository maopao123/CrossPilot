import {
  CandidateDecision,
  DecisionSensitivityFactor,
  InitialCashStatus,
  OnePageDecisionPacket,
  ProductCandidate,
} from '@crosspilot/shared';
import { NextBestActionEngine } from './next-best-action.engine.js';
import { ProfitCalculationService } from '../profit/profit-calculation.service.js';

export class DecisionPacketService {
  /**
   * P0-15: 组装单产品选品“一页决策结论包” (OnePageDecisionPacket)
   * 贯彻“后台严谨、前台简单”铁律，前台不拆多页，先给结论、2 个关键数字和 1 个下一步，详细参数默认折叠
   */
  static buildDecisionPacket(candidate: ProductCandidate): OnePageDecisionPacket {
    const verdict = candidate.decision ?? 'INSUFFICIENT_DATA';
    const verdictTitleZh = this.getVerdictTitleZh(verdict);

    // 提取 2 大关键数字
    const baseScenario = candidate.economics?.scenarios?.base;
    const conservativeScenario = candidate.economics?.scenarios?.conservative;

    const unitProfitUsd =
      candidate.economics?.status === 'COMPLETE' && baseScenario
        ? baseScenario.contributionProfit
        : null;

    const unitMargin =
      candidate.economics?.status === 'COMPLETE' && baseScenario
        ? baseScenario.contributionMargin
        : null;

    // 启动资金总额格式化 (P0-1 口径闭环)
    const initialCash = candidate.initialCash;
    let formattedCashZh: string;
    let cashStatus: InitialCashStatus = 'INCOMPLETE';
    let cashAmount: number | null = null;
    let missingCashItems: string[] | undefined = undefined;
    const cashCurrency = initialCash?.currency ?? 'CNY';

    if (!initialCash || initialCash.status === 'INCOMPLETE' || initialCash.totalInitialCash == null) {
      cashStatus = 'INCOMPLETE';
      cashAmount = null;
      missingCashItems =
        initialCash?.missingItems && initialCash.missingItems.length > 0
          ? initialCash.missingItems
          : ['样品费', '首批头程'];
      formattedCashZh =
        initialCash?.displaySummaryZh || `首单资金还算不全：缺${missingCashItems.join('/')}`;
    } else {
      cashStatus = 'COMPLETE';
      cashAmount = initialCash.totalInitialCash;
      formattedCashZh = this.formatCashAmountZh(initialCash.totalInitialCash, cashCurrency);
    }

    // 整理已确认 vs 还差清单
    const confirmedChecklistZh: string[] = [];
    const missingChecklistZh: string[] = [];

    // 市场
    if (
      candidate.marketResearch?.searchVolumeMonthly != null ||
      (candidate.evidence &&
        candidate.evidence.some((e) => e.scope === 'KEYWORD' || e.scope === 'MARKET'))
    ) {
      confirmedChecklistZh.push('市场容量与细分方向');
    } else {
      missingChecklistZh.push('市场搜索需求未充分确认');
    }

    // 产品方案
    const activeSpec = candidate.specifications?.find(
      (s) => s.id === candidate.activeSpecVersionId,
    );
    if (activeSpec && activeSpec.material && activeSpec.dimensions) {
      confirmedChecklistZh.push('核心产品规格 (材质/容量/尺寸/售价)');
    } else {
      missingChecklistZh.push('核心规格方案待完善');
    }

    // 工厂报价
    if (
      candidate.primaryQuoteId &&
      candidate.economics?.inputs?.productCost?.source === 'FACT'
    ) {
      confirmedChecklistZh.push('工厂正式报价 (已选定主选供应商)');
    } else {
      missingChecklistZh.push('主选工厂报价未核定');
    }

    // 财务利润
    if (candidate.economics?.status === 'COMPLETE') {
      confirmedChecklistZh.push('单件贡献利润与回本测算');
    } else {
      missingChecklistZh.push('关键费用不全 (无法完成财务闭环)');
    }

    // 首单启动资金
    if (cashStatus === 'COMPLETE') {
      confirmedChecklistZh.push(`首单启动资金已测算完备 (${formattedCashZh})`);
    } else {
      missingChecklistZh.push(formattedCashZh);
    }

    // 风险排查项
    const unverifiedRisks = (candidate.risks ?? []).filter((r) => r.status === 'UNVERIFIED');
    for (const r of unverifiedRisks) {
      if (r.category === 'PATENT') {
        missingChecklistZh.push('专利检索证明 (尚未完成 USPTO 核验)');
      } else if (r.riskId === 'risk-food-contact' || r.title.includes('食品接触')) {
        missingChecklistZh.push('食品接触材料报告 (尚未索取 FDA 符合性声明)');
      } else {
        missingChecklistZh.push(`${r.title} (未验证)`);
      }
    }

    // 生成 Next Best Action
    const nextBestAction = NextBestActionEngine.getNextBestAction(candidate);

    // 生成建议口吻文案 (P0-2 严禁多动作合并)
    const adviceZh = this.deriveAdviceZh(candidate, verdict, unverifiedRisks);

    // 生成决策敏感度分析 (Sensitivity Factors)
    const decisionSensitivities = this.computeSensitivities(candidate, verdict);

    // 完整成本分项
    const costBreakdown = {
      productCost: baseScenario?.productCost ?? 0,
      referralFee: baseScenario?.amazonReferralFee ?? 0,
      fbaFee: baseScenario?.fbaFee ?? 0,
      freightFee: baseScenario?.freight ?? 0,
      duty: baseScenario?.duty ?? 0,
      advertisingCost: baseScenario?.advertisingCost ?? 0,
      expectedReturnLoss: baseScenario?.expectedReturnLoss ?? 0,
      storage: baseScenario?.storage ?? 0,
      otherCosts: baseScenario?.otherCosts ?? 0,
      totalExpenses: baseScenario?.totalExpenses ?? 0,
    };

    // 风险概况
    const risks = candidate.risks ?? [];
    const riskSummary = {
      totalRisks: risks.length,
      unverifiedCount: risks.filter((r) => r.status === 'UNVERIFIED').length,
      passCount: risks.filter((r) => r.status === 'PASS').length,
      failCount: risks.filter((r) => r.status === 'FAIL').length,
      applicableRisks: risks,
    };

    return {
      verdict,
      verdictTitleZh,
      adviceZh,
      unitContributionProfitUsd: unitProfitUsd,
      unitContributionMargin: unitMargin,
      initialCashRequired: {
        status: cashStatus,
        amount: cashAmount,
        currency: cashCurrency,
        formattedTextZh: formattedCashZh,
        missingItems: missingCashItems,
      },
      confirmedChecklistZh,
      missingChecklistZh,
      nextBestAction,
      conservativeScenarioSummary: {
        unitContributionProfitUsd: conservativeScenario?.contributionProfit ?? null,
        unitContributionMargin: conservativeScenario?.contributionMargin ?? null,
        explanationZh: '情况差一点 = 售价降低 5%、采购与头程成本微增、广告费与退货率上浮',
      },
      decisionSensitivities,
      costBreakdown,
      riskAndEvidenceSummary: riskSummary,
      evaluatedAt: new Date().toISOString(),
    };
  }

  private static getVerdictTitleZh(verdict: CandidateDecision): string {
    switch (verdict) {
      case 'SHORTLIST':
        return '建议继续打样';
      case 'WATCH':
        return '建议先观察';
      case 'NEEDS_VALIDATION':
        return '先补这份材料';
      case 'BLOCKED':
        return '不建议做';
      case 'INSUFFICIENT_DATA':
      default:
        return '先补齐核心数据';
    }
  }

  private static deriveAdviceZh(
    candidate: ProductCandidate,
    verdict: CandidateDecision,
    unverifiedRisks: { riskId: string; title: string; category: string }[],
  ): string {
    if (verdict === 'BLOCKED') {
      return '单件测算亏损或存在侵权致命伤，坚决停止推进，避免错把亏损品推向工厂';
    }

    const hasFoodContactUnverified = unverifiedRisks.some(
      (r) => r.riskId === 'risk-food-contact' || r.title.includes('食品接触'),
    );
    const hasPatentUnverified = unverifiedRisks.some((r) => r.category === 'PATENT');

    // 遵循单动作聚焦原则，每次仅推最优先动作，严禁多动作合并
    if (hasFoodContactUnverified) {
      return '财务模型基本可行，建议先向工厂索取食品接触材料合格报告，确认合规后再进入样品制作';
    }

    if (hasPatentUnverified) {
      return '财务模型基本可行，建议先检索目标市场外观与实用新型专利 (USPTO)，确认公模属性后再开模';
    }

    if (verdict === 'WATCH') {
      return '单件利润空间偏薄或悲观情景留存微弱，建议向工厂争取进一步阶梯降价或优化头程包装';
    }

    if (verdict === 'SHORTLIST') {
      return '各项指标全面达标，单件利润与首单启动资金健康，建议立即安排工厂产前样';
    }

    return '先补齐关键工厂报价与运费输入，完成财务闭环测算';
  }

  private static computeSensitivities(
    candidate: ProductCandidate,
    currentVerdict: CandidateDecision,
  ): DecisionSensitivityFactor[] {
    const sensitivities: DecisionSensitivityFactor[] = [];
    const baseScenario = candidate.economics?.scenarios?.base;
    if (!baseScenario) return sensitivities;

    const currentPrice = baseScenario.sellingPrice;
    const currentMargin = baseScenario.contributionMargin;
    const currentFreight = baseScenario.freight;

    // 1. 售价敏感度: 售价下调 7% 对结论的影响
    if (currentPrice > 0) {
      const dropPrice = ProfitCalculationService.roundMoney(currentPrice * 0.93);
      const newProfit = ProfitCalculationService.roundMoney(
        baseScenario.contributionProfit - (currentPrice - dropPrice),
      );
      const newMargin = ProfitCalculationService.roundMargin(newProfit / dropPrice);
      const projectedVerdict: CandidateDecision =
        newProfit <= 0 ? 'BLOCKED' : newMargin < 0.12 ? 'WATCH' : currentVerdict;

      sensitivities.push({
        factorName: '零售售价波动',
        currentValue: `$${currentPrice.toFixed(2)}`,
        triggerThreshold: `$${dropPrice.toFixed(2)} (-7%)`,
        projectedVerdict,
        explanation: `若价格战或大促导致售价降至 $${dropPrice.toFixed(
          2,
        )}，单件边际贡献将缩减至 $${newProfit.toFixed(
          2,
        )} (利润率 ${(newMargin * 100).toFixed(1)}%)，结论将转为【${this.getVerdictTitleZh(
          projectedVerdict,
        )}】`,
      });
    }

    // 2. 头程运费敏感度: 头程上涨 $1.20
    if (currentFreight > 0) {
      const highFreight = ProfitCalculationService.roundMoney(currentFreight + 1.2);
      const newProfit = ProfitCalculationService.roundMoney(
        baseScenario.contributionProfit - 1.2,
      );
      const newMargin = ProfitCalculationService.roundMargin(
        newProfit / (currentPrice || 1),
      );
      const projectedVerdict: CandidateDecision =
        newProfit <= 0 ? 'BLOCKED' : newMargin < 0.12 ? 'WATCH' : currentVerdict;

      sensitivities.push({
        factorName: '头程运费上涨',
        currentValue: `$${currentFreight.toFixed(2)} / 件`,
        triggerThreshold: `$${highFreight.toFixed(2)} / 件 (+$1.20)`,
        projectedVerdict,
        explanation: `若旺季海运附加费或尺寸体积重上浮 $1.20，单件利润将降至 $${newProfit.toFixed(
          2,
        )}，抗风险缓冲减弱`,
      });
    }

    // 3. 专利风险触发 FAIL
    sensitivities.push({
      factorName: '专利排查结果',
      currentValue: '待排查 (UNVERIFIED)',
      triggerThreshold: '专利侵权 (FAIL)',
      projectedVerdict: 'BLOCKED',
      explanation: '若发现目标市场存在有效外观或发明专利权利限制，门禁将硬阻断 (BLOCKED)，绝对不建议推进',
    });

    return sensitivities;
  }

  private static formatCashAmountZh(amount: number, currency: string): string {
    if (amount <= 0) return `${currency} 0`;
    if (currency === 'CNY') {
      if (amount >= 10000) {
        const val = amount / 10000;
        return `¥${Number(val.toFixed(2))} 万`;
      }
      return `¥${amount.toLocaleString()}`;
    }
    if (currency === 'USD') {
      if (amount >= 10000) {
        const val = amount / 10000;
        return `$${Number(val.toFixed(2))} 万`;
      }
      return `$${amount.toLocaleString()}`;
    }
    return `${currency} ${amount.toLocaleString()}`;
  }
}
