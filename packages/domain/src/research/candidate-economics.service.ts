import {
  CandidateEconomics,
  CandidateEconomicsInputs,
  CandidateEconomicsStatus,
  EconomicsScenarioConfig,
  ProvenanceValue,
  ScenarioEconomicsResult,
} from '@crosspilot/shared';
import { ProfitCalculationService } from '../profit/profit-calculation.service.js';

export const CRITICAL_ECONOMICS_INPUTS: (keyof CandidateEconomicsInputs)[] = [
  'sellingPrice',
  'productCost',
  'referralFeeRate',
  'fbaFeePerUnit',
  'freightPerUnit',
];

export const NON_CRITICAL_ECONOMICS_INPUTS: (keyof CandidateEconomicsInputs)[] = [
  'dutyPerUnit',
  'adsCostPerUnit',
  'returnRate',
  'returnLossPerUnit',
  'storageFeePerUnit',
  'otherCostsPerUnit',
];

export const DEFAULT_SCENARIO_CONFIG: EconomicsScenarioConfig = {
  conservative: {
    sellingPriceMultiplier: 0.95,
    productCostMultiplier: 1.05,
    freightMultiplier: 1.10,
    adsCostMultiplier: 1.25,
    returnRateMultiplier: 1.30,
    storageMultiplier: 1.20,
    description: '保守情景: 售价-5%, 采购成本+5%, 头程运费+10%, 广告费+25%, 退货率+30%, 仓储+20%',
  },
  optimistic: {
    sellingPriceMultiplier: 1.00,
    productCostMultiplier: 0.92,
    freightMultiplier: 0.95,
    adsCostMultiplier: 0.85,
    returnRateMultiplier: 0.80,
    storageMultiplier: 1.00,
    description: '乐观情景: 售价保持基准, 采购规模降本-8%, 头程-5%, 广告费-15%, 退货率-20%',
  },
};

export class CandidateEconomicsService {
  /**
   * Deterministic calculation of product candidate economics without hidden default constants.
   * Leverages ProfitCalculationService financial rounding (2 decimal places) for monetary consistency.
   * UNKNOWN ≠ 0; non-provided inputs are explicitly audited into missingInputs or excludedInputs.
   */
  static calculateEconomics(
    inputs: Partial<CandidateEconomicsInputs>,
    currency = 'USD',
    config: EconomicsScenarioConfig = DEFAULT_SCENARIO_CONFIG,
  ): CandidateEconomics {
    const defaultUnknown: ProvenanceValue<number> = { value: null, source: 'UNKNOWN' };
    const normalizedInputs: CandidateEconomicsInputs = {
      sellingPrice: inputs.sellingPrice ?? defaultUnknown,
      productCost: inputs.productCost ?? defaultUnknown,
      referralFeeRate: inputs.referralFeeRate ?? defaultUnknown,
      fbaFeePerUnit: inputs.fbaFeePerUnit ?? defaultUnknown,
      freightPerUnit: inputs.freightPerUnit ?? defaultUnknown,
      dutyPerUnit: inputs.dutyPerUnit ?? defaultUnknown,
      adsCostPerUnit: inputs.adsCostPerUnit ?? defaultUnknown,
      returnRate: inputs.returnRate ?? defaultUnknown,
      returnLossPerUnit: inputs.returnLossPerUnit ?? defaultUnknown,
      storageFeePerUnit: inputs.storageFeePerUnit ?? defaultUnknown,
      otherCostsPerUnit: inputs.otherCostsPerUnit ?? defaultUnknown,
    };

    const missingInputs: string[] = [];
    const criticalMissing: string[] = [];
    const excludedInputs: string[] = [];

    // 1. Audit critical inputs for truthfulness & provenance
    for (const key of CRITICAL_ECONOMICS_INPUTS) {
      const field = normalizedInputs[key];
      const isMissing = !field || field.source === 'UNKNOWN' || field.value == null;
      if (isMissing) {
        missingInputs.push(key);
        criticalMissing.push(key);
      }
    }

    // 2. Audit non-critical inputs (missing values are treated as EXCLUDED_FROM_CALCULATION, not real zero)
    for (const key of NON_CRITICAL_ECONOMICS_INPUTS) {
      const field = normalizedInputs[key];
      const isMissing = !field || field.source === 'UNKNOWN' || field.value == null;
      if (isMissing) {
        excludedInputs.push(key);
      }
    }

    // Determine completion status:
    // Any critical input missing -> INCOMPLETE
    // Otherwise -> COMPLETE (with non-critical excludedInputs tracked)
    let status: CandidateEconomicsStatus = 'COMPLETE';
    if (criticalMissing.length > 0) {
      status = 'INCOMPLETE';
    }

    // If critical inputs missing, return un-evaluated/zero scenarios with honest INCOMPLETE flag
    if (status === 'INCOMPLETE') {
      const emptyScenario: ScenarioEconomicsResult = {
        sellingPrice: normalizedInputs.sellingPrice.value ?? 0,
        productCost: normalizedInputs.productCost.value ?? 0,
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
        inputs: normalizedInputs,
        scenarios: {
          conservative: { ...emptyScenario },
          base: { ...emptyScenario },
          optimistic: { ...emptyScenario },
        },
        missingInputs,
        criticalInputs: CRITICAL_ECONOMICS_INPUTS as string[],
        excludedInputs,
        scenarioAssumptions: {
          conservative: config.conservative.description,
          optimistic: config.optimistic.description,
        },
      };
    }

    // 3. Compute Base Scenario (strictly using provided numbers; NO HIDDEN CONSTANTS)
    const baseSellingPrice = normalizedInputs.sellingPrice.value!;
    const baseProductCost = normalizedInputs.productCost.value!;
    const referralRate = normalizedInputs.referralFeeRate.value ?? 0;
    const fbaFee = normalizedInputs.fbaFeePerUnit.value ?? 0;
    const freight = normalizedInputs.freightPerUnit.value ?? 0;
    const duty = normalizedInputs.dutyPerUnit.value ?? 0;
    const adsCost = normalizedInputs.adsCostPerUnit.value ?? 0;
    const returnRate = normalizedInputs.returnRate.value ?? 0;
    const returnLossPerUnit = normalizedInputs.returnLossPerUnit.value ?? 0;
    const storage = normalizedInputs.storageFeePerUnit.value ?? 0;
    const otherCosts = normalizedInputs.otherCostsPerUnit.value ?? 0;

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

    // 4. Compute Conservative Scenario based on explicit multipliers
    const conservative = this.computeScenario({
      sellingPrice: ProfitCalculationService.roundMoney(
        baseSellingPrice * config.conservative.sellingPriceMultiplier,
      ),
      productCost: ProfitCalculationService.roundMoney(
        baseProductCost * config.conservative.productCostMultiplier,
      ),
      referralRate,
      fbaFee,
      freight: ProfitCalculationService.roundMoney(freight * config.conservative.freightMultiplier),
      duty,
      adsCost: ProfitCalculationService.roundMoney(adsCost * config.conservative.adsCostMultiplier),
      returnRate: Math.min(0.25, returnRate * config.conservative.returnRateMultiplier),
      returnLossPerUnit,
      storage: ProfitCalculationService.roundMoney(storage * config.conservative.storageMultiplier),
      otherCosts,
    });

    // 5. Compute Optimistic Scenario based on explicit multipliers
    const optimistic = this.computeScenario({
      sellingPrice: ProfitCalculationService.roundMoney(
        baseSellingPrice * config.optimistic.sellingPriceMultiplier,
      ),
      productCost: ProfitCalculationService.roundMoney(
        baseProductCost * config.optimistic.productCostMultiplier,
      ),
      referralRate,
      fbaFee,
      freight: ProfitCalculationService.roundMoney(freight * config.optimistic.freightMultiplier),
      duty,
      adsCost: ProfitCalculationService.roundMoney(adsCost * config.optimistic.adsCostMultiplier),
      returnRate: Math.max(0.02, returnRate * config.optimistic.returnRateMultiplier),
      returnLossPerUnit,
      storage: ProfitCalculationService.roundMoney(storage * config.optimistic.storageMultiplier),
      otherCosts,
    });

    return {
      status,
      currency,
      inputs: normalizedInputs,
      scenarios: {
        conservative,
        base,
        optimistic,
      },
      missingInputs,
      criticalInputs: CRITICAL_ECONOMICS_INPUTS as string[],
      excludedInputs,
      scenarioAssumptions: {
        conservative: config.conservative.description,
        optimistic: config.optimistic.description,
      },
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
