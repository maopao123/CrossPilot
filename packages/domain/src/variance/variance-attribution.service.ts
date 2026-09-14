import { roundMoney } from '../profit/profit-calculation.service';

export interface VarianceAttributionInput {
  currentProfit: number;
  previousProfit: number;
  advertisingImpact: number;
  returnsImpact: number;
  inventoryImpact: number;
  priceImpact: number;
  otherImpact?: number;
}

export interface VarianceAttributionResult {
  previousProfit: number;
  currentProfit: number;
  totalVariance: number;
  calculatedSum?: number;
  isExactMatch: boolean;
  residual: number;
  breakdown: {
    advertising: number;
    returns: number;
    inventory: number;
    price: number;
    other: number;
  };
  relativeContributions: {
    advertisingPercent: number;
    returnsPercent: number;
    inventoryPercent: number;
    pricePercent: number;
    otherPercent: number;
  };
  formulaString: string;
}

export class VarianceAttributionService {
  /**
   * Calculates deterministic profit variance decomposition across the 5 levers:
   * Advertising, Returns, Inventory, Price, and Other.
   *
   * Verifies mathematical closure: Total Variance = Sum(Factors).
   */
  static attributeVariance(input: VarianceAttributionInput): VarianceAttributionResult {
    const previous = roundMoney(input.previousProfit);
    const current = roundMoney(input.currentProfit);
    const totalVariance = roundMoney(current - previous);

    const ads = roundMoney(input.advertisingImpact);
    const returns = roundMoney(input.returnsImpact);
    const inventory = roundMoney(input.inventoryImpact);
    const price = roundMoney(input.priceImpact);
    const other = roundMoney(input.otherImpact ?? 0);

    const calculatedSum = roundMoney(ads + returns + inventory + price + other);
    const residual = roundMoney(totalVariance - calculatedSum);
    const isExactMatch = Math.abs(residual) < 0.001;

    // Magnitude calculations for relative contribution weighting
    const totalAbs = Math.abs(ads) + Math.abs(returns) + Math.abs(inventory) + Math.abs(price) + Math.abs(other);
    const calcRatio = (val: number) => (totalAbs > 0 ? roundMoney((Math.abs(val) / totalAbs) * 100) : 0);

    const formatSigned = (n: number) => (n >= 0 ? `+${n.toFixed(0)}` : `${n.toFixed(0)}`);
    const formulaString = `${totalVariance.toFixed(0)} = ${formatSigned(ads)} ${formatSigned(returns)} ${formatSigned(inventory)} ${formatSigned(price)} ${formatSigned(other)}`;

    return {
      previousProfit: previous,
      currentProfit: current,
      totalVariance,
      calculatedSum,
      isExactMatch,
      residual,
      breakdown: {
        advertising: ads,
        returns,
        inventory,
        price,
        other,
      },
      relativeContributions: {
        advertisingPercent: calcRatio(ads),
        returnsPercent: calcRatio(returns),
        inventoryPercent: calcRatio(inventory),
        pricePercent: calcRatio(price),
        otherPercent: calcRatio(other),
      },
      formulaString,
    };
  }
}
