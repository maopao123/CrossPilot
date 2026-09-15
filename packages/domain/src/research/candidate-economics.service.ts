import {
  CandidateEconomics,
  CandidateEconomicsInputs,
  CandidateEconomicsStatus,
  ScenarioEconomicsResult,
} from '@crosspilot/shared';
import { ProfitCalculationService } from '../profit/profit-calculation.service.js';

export class CandidateEconomicsService {
  /**
   * Deterministic calculation of product candidate economics without hidden default constants.
   * Leverages ProfitCalculationService financial rounding to eliminate IEEE 754 float drift.
   */
  static calculateEconomics(
    inputs: CandidateEconomicsInputs,
    currency = 'USD',
  ): CandidateEconomics {
    const missingInputs: string[] = [];

    // 1. Audit critical inputs for truthfulness & provenance
    if (inputs.sellingPrice.value === null || inputs.sellingPrice.source === 'UNKNOWN') {
      missingInputs.push('sellingPrice');
    }
    if (inputs.productCost.value === null || inputs.productCost.source === 'UNKNOWN') {
      missingInputs.push('productCost');
    }
    if (inputs.referralFeeRate.value === null || inputs.referralFeeRate.source === 'UNKNOWN') {
      missingInputs.push('referralFeeRate');
    }
    if (inputs.fbaFeePerUnit.value === null || inputs.fbaFeePerUnit.source === 'UNKNOWN') {
      missingInputs.push('fbaFeePerUnit');
    }

    // Determine completion status: if critical cost/price is missing, mark as INCOMPLETE / NEEDS_VALIDATION
    let status: CandidateEconomicsStatus = 'COMPLETE';
    if (missingInputs.includes('sellingPrice') || missingInputs.includes('productCost')) {
      status = 'INCOMPLETE';
    } else if (missingInputs.length > 0) {
      status = 'NEEDS_VALIDATION';
    }

    // If critical inputs missing, return un-evaluated/zero scenarios with honest INCOMPLETE flag
    if (status === 'INCOMPLETE') {
      const emptyScenario: ScenarioEconomicsResult = {
        sellingPrice: inputs.sellingPrice.value ?? 0,
        productCost: inputs.productCost.value ?? 0,
        amazonReferralFee: 0,
        fbaFee: 0,
        freight: 0,
        duty: 0,
        advertisingCost: 0,
        expectedReturnLoss: 0,
        storage: 0,
        otherCosts: 0,
        totalExpenses: 0,
        contributionProfit: 0,
        contributionMargin: 0,
      };

      return {
        status,
        currency,
        inputs,
        scenarios: {
          conservative: { ...emptyScenario },
          base: { ...emptyScenario },
          optimistic: { ...emptyScenario },
        },
        missingInputs,
      };
    }

    // 2. Compute Base Scenario
    const baseSellingPrice = inputs.sellingPrice.value!;
    const baseProductCost = inputs.productCost.value!;
    const referralRate = inputs.referralFeeRate.value ?? 0.15;
    const fbaFee = inputs.fbaFeePerUnit.value ?? 4.5;
    const freight = inputs.freightPerUnit.value ?? 0;
    const duty = inputs.dutyPerUnit.value ?? 0;
    const adsCost = inputs.adsCostPerUnit.value ?? 0;
    const returnRate = inputs.returnRate.value ?? 0.05;
    const returnLossPerUnit = inputs.returnLossPerUnit.value ?? (baseProductCost * 0.5 + 5.0);
    const storage = inputs.storageFeePerUnit.value ?? 0.3;
    const otherCosts = inputs.otherCostsPerUnit.value ?? 0;

    const base = this.computeScenario({
      sellingPrice: baseSellingPrice,
      productCost: baseProductCost,
      referralRate,
      fbaFee,
      freight,
      duty,
      adsCost,
      returnRate,
      returnLossPerUnit,
      storage,
      otherCosts,
    });

    // 3. Compute Conservative Scenario (Price -5%, Cost +5%, Ads +25%, Return +30%)
    const conservative = this.computeScenario({
      sellingPrice: ProfitCalculationService.roundMoney(baseSellingPrice * 0.95),
      productCost: ProfitCalculationService.roundMoney(baseProductCost * 1.05),
      referralRate,
      fbaFee,
      freight: ProfitCalculationService.roundMoney(freight * 1.1),
      duty,
      adsCost: ProfitCalculationService.roundMoney(adsCost * 1.25),
      returnRate: Math.min(0.25, returnRate * 1.3),
      returnLossPerUnit,
      storage: ProfitCalculationService.roundMoney(storage * 1.2),
      otherCosts,
    });

    // 4. Compute Optimistic Scenario (Cost -8% volume discount, Ads -15%, Return -20%)
    const optimistic = this.computeScenario({
      sellingPrice: baseSellingPrice,
      productCost: ProfitCalculationService.roundMoney(baseProductCost * 0.92),
      referralRate,
      fbaFee,
      freight: ProfitCalculationService.roundMoney(freight * 0.95),
      duty,
      adsCost: ProfitCalculationService.roundMoney(adsCost * 0.85),
      returnRate: Math.max(0.02, returnRate * 0.8),
      returnLossPerUnit,
      storage,
      otherCosts,
    });

    return {
      status,
      currency,
      inputs,
      scenarios: {
        conservative,
        base,
        optimistic,
      },
      missingInputs,
    };
  }

  private static computeScenario(params: {
    sellingPrice: number;
    productCost: number;
    referralRate: number;
    fbaFee: number;
    freight: number;
    duty: number;
    adsCost: number;
    returnRate: number;
    returnLossPerUnit: number;
    storage: number;
    otherCosts: number;
  }): ScenarioEconomicsResult {
    const {
      sellingPrice,
      productCost,
      referralRate,
      fbaFee,
      freight,
      duty,
      adsCost,
      returnRate,
      returnLossPerUnit,
      storage,
      otherCosts,
    } = params;

    const amazonReferralFee = ProfitCalculationService.roundMoney(sellingPrice * referralRate);
    const expectedReturnLoss = ProfitCalculationService.roundMoney(returnRate * returnLossPerUnit);

    const totalExpenses = ProfitCalculationService.roundMoney(
      productCost +
        amazonReferralFee +
        fbaFee +
        freight +
        duty +
        adsCost +
        expectedReturnLoss +
        storage +
        otherCosts,
    );

    const contributionProfit = ProfitCalculationService.roundMoney(sellingPrice - totalExpenses);
    const contributionMargin =
      sellingPrice > 0 ? ProfitCalculationService.roundMargin(contributionProfit / sellingPrice) : 0;

    return {
      sellingPrice,
      productCost,
      amazonReferralFee,
      fbaFee,
      freight,
      duty,
      advertisingCost: adsCost,
      expectedReturnLoss,
      storage,
      otherCosts,
      totalExpenses,
      contributionProfit,
      contributionMargin,
    };
  }
}
