export interface OrderItemFinancials {
  quantity: number;
  unitPrice: number;
  unitCost: number;
  fbaFeePerUnit?: number;
  referralFeeRate?: number; // default 15%
}

export interface ReturnRecordFinancials {
  refundAmount: number;
  returnProcessingFee?: number;
}

export interface ProfitCalculationInput {
  orderItems: OrderItemFinancials[];
  adsCost?: number;
  returns?: ReturnRecordFinancials[];
  storageFee?: number;
  otherCosts?: number;
}

export interface ProfitBreakdown {
  revenue: number;
  cogs: number;
  amazonFees: number;
  fbaFee: number;
  adsCost: number;
  returnLoss: number;
  otherCosts: number;
  netProfit: number;
  margin: number;
}

export class ProfitCalculationService {
  /**
   * High-precision financial arithmetic avoiding IEEE 754 float drift
   */
  private static roundMoney(amount: number): number {
    return Math.round((amount + Number.EPSILON) * 100) / 100;
  }

  private static roundMargin(rate: number): number {
    return Math.round((rate + Number.EPSILON) * 10000) / 10000;
  }

  public static calculateProfit(input: ProfitCalculationInput): ProfitBreakdown {
    let revenue = 0;
    let cogs = 0;
    let amazonFees = 0;
    let fbaFee = 0;

    for (const item of input.orderItems) {
      const itemRev = item.quantity * item.unitPrice;
      const itemCost = item.quantity * item.unitCost;
      const referralRate = item.referralFeeRate ?? 0.15;
      const itemRefFee = itemRev * referralRate;
      const itemFbaFee = item.quantity * (item.fbaFeePerUnit ?? 4.5);

      revenue += itemRev;
      cogs += itemCost;
      amazonFees += itemRefFee;
      fbaFee += itemFbaFee;
    }

    const adsCost = input.adsCost ?? 0;
    const storageFee = input.storageFee ?? 0;
    const extraCosts = input.otherCosts ?? 0;
    const otherCosts = storageFee + extraCosts;

    let returnLoss = 0;
    if (input.returns && input.returns.length > 0) {
      for (const ret of input.returns) {
        returnLoss += ret.refundAmount + (ret.returnProcessingFee ?? 0);
      }
    }

    const netRevenue = revenue;
    const totalExpenses = cogs + amazonFees + fbaFee + adsCost + returnLoss + otherCosts;
    const netProfit = this.roundMoney(netRevenue - totalExpenses);
    const margin =
      netRevenue > 0 ? this.roundMargin(netProfit / netRevenue) : 0;

    return {
      revenue: this.roundMoney(revenue),
      cogs: this.roundMoney(cogs),
      amazonFees: this.roundMoney(amazonFees),
      fbaFee: this.roundMoney(fbaFee),
      adsCost: this.roundMoney(adsCost),
      returnLoss: this.roundMoney(returnLoss),
      otherCosts: this.roundMoney(otherCosts),
      netProfit,
      margin,
    };
  }

  /**
   * AC 3: Return -> Profit Recalculate
   * Ingests a new return into an existing daily profit snapshot and updates net profit.
   */
  public static recalculateWithReturn(
    current: ProfitBreakdown,
    newReturn: ReturnRecordFinancials,
  ): ProfitBreakdown {
    const additionalLoss =
      newReturn.refundAmount + (newReturn.returnProcessingFee ?? 0);
    const updatedReturnLoss = this.roundMoney(current.returnLoss + additionalLoss);
    const updatedNetProfit = this.roundMoney(current.netProfit - additionalLoss);
    const updatedMargin =
      current.revenue > 0 ? this.roundMargin(updatedNetProfit / current.revenue) : 0;

    return {
      ...current,
      returnLoss: updatedReturnLoss,
      netProfit: updatedNetProfit,
      margin: updatedMargin,
    };
  }
}
