import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateReturnInput,
  ErrorCodes,
  ProfitBreakdown,
  ReturnRecordInfo,
} from '@crosspilot/shared';
import { ProfitCalculationService } from '@crosspilot/domain';

@Injectable()
export class ProfitService {
  constructor(private prisma: PrismaService) {}

  async getDailyProfit(
    workspaceId: string,
    query?: { skuId?: string; startDate?: string; endDate?: string },
  ) {
    const where: any = { workspaceId };
    if (query?.skuId) {
      where.skuId = query.skuId;
    }
    if (query?.startDate || query?.endDate) {
      where.date = {};
      if (query.startDate) where.date.gte = new Date(query.startDate);
      if (query.endDate) where.date.lte = new Date(query.endDate);
    }

    const records = await this.prisma.profitDaily.findMany({
      where,
      include: { sku: true },
      orderBy: { date: 'desc' },
    });

    return records.map((r) => this.mapProfitDaily(r));
  }

  async getProfitSummary(
    workspaceId: string,
    query?: { skuId?: string; startDate?: string; endDate?: string },
  ) {
    const dailyRecords = await this.getDailyProfit(workspaceId, query);

    let revenue = 0;
    let cogs = 0;
    let amazonFees = 0;
    let fbaFee = 0;
    let adsCost = 0;
    let returnLoss = 0;
    let otherCosts = 0;
    let netProfit = 0;

    for (const r of dailyRecords) {
      revenue += r.revenue;
      cogs += r.cogs;
      amazonFees += r.amazonFees;
      fbaFee += r.fbaFee;
      adsCost += r.adsCost;
      returnLoss += r.returnLoss;
      otherCosts += r.otherCosts;
      netProfit += r.netProfit;
    }

    const round2 = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;
    const margin =
      revenue > 0
        ? Math.round((netProfit / revenue + Number.EPSILON) * 10000) / 10000
        : 0;
    const totalDirectCost = cogs + adsCost;
    const roi =
      totalDirectCost > 0
        ? Math.round((netProfit / totalDirectCost + Number.EPSILON) * 10000) /
          10000
        : 0;

    return {
      revenue: round2(revenue),
      cogs: round2(cogs),
      amazonFees: round2(amazonFees),
      fbaFee: round2(fbaFee),
      adsCost: round2(adsCost),
      returnLoss: round2(returnLoss),
      otherCosts: round2(otherCosts),
      netProfit: round2(netProfit),
      margin,
      roi,
    };
  }

  /**
   * AC 3: Return -> Profit Recalculate
   * Ingests return record and recalculates daily profit with exact arithmetic.
   */
  async createReturn(
    workspaceId: string,
    input: CreateReturnInput,
  ): Promise<{ returnRecord: ReturnRecordInfo; updatedProfit: ProfitBreakdown }> {
    const returnDate = input.returnDate ? new Date(input.returnDate) : new Date();
    const dateKey = new Date(returnDate.toISOString().slice(0, 10));

    return await this.prisma.$transaction(async (tx) => {
      // 0. Validate orderItem and sku belong to the workspace
      const orderItem = await tx.orderItem.findFirst({
        where: {
          id: input.orderItemId,
          workspaceId,
        },
      });
      if (!orderItem) {
        throw new NotFoundException({
          code: ErrorCodes.RESOURCE_NOT_FOUND,
          message: `Order item '${input.orderItemId}' not found in workspace`,
        });
      }

      const sku = await tx.sku.findFirst({
        where: {
          id: input.skuId,
          workspaceId,
        },
      });
      if (!sku) {
        throw new NotFoundException({
          code: ErrorCodes.RESOURCE_NOT_FOUND,
          message: `SKU '${input.skuId}' not found in workspace`,
        });
      }

      if (orderItem.skuId !== input.skuId) {
        throw new BadRequestException({
          code: ErrorCodes.VALIDATION_ERROR,
          message: `Order item '${input.orderItemId}' does not match SKU '${input.skuId}'`,
        });
      }

      // 0.1 Check idempotency: a return for this order item in this workspace must not already exist
      const existingReturn = await tx.returnRecord.findFirst({
        where: {
          workspaceId,
          orderItemId: input.orderItemId,
        },
      });
      if (existingReturn) {
        throw new BadRequestException({
          code: ErrorCodes.CONFLICT_ERROR,
          message: `A return for order item '${input.orderItemId}' has already been processed`,
        });
      }

      // 1. Create ReturnRecord
      const returnRecord = await tx.returnRecord.create({
        data: {
          workspaceId,
          orderItemId: input.orderItemId,
          skuId: input.skuId,
          refundAmount: input.refundAmount,
          reason: input.reason || 'Customer Return',
          status: 'COMPLETED',
          returnDate,
        },
      });

      // 2. Fetch or create ProfitDaily for this SKU and Date
      let dailyProfit = await tx.profitDaily.findUnique({
        where: {
          workspaceId_skuId_date: {
            workspaceId,
            skuId: input.skuId,
            date: dateKey,
          },
        },
      });

      if (!dailyProfit) {
        dailyProfit = await tx.profitDaily.create({
          data: {
            workspaceId,
            skuId: input.skuId,
            date: dateKey,
            revenue: 0,
            cogs: 0,
            amazonFees: 0,
            fbaFee: 0,
            adsCost: 0,
            returnLoss: 0,
            otherCosts: 0,
            netProfit: 0,
            margin: 0,
          },
        });
      }

      // 3. Recalculate using pure domain service
      const currentBreakdown: ProfitBreakdown = {
        revenue: Number(dailyProfit.revenue),
        cogs: Number(dailyProfit.cogs),
        amazonFees: Number(dailyProfit.amazonFees),
        fbaFee: Number(dailyProfit.fbaFee),
        adsCost: Number(dailyProfit.adsCost),
        returnLoss: Number(dailyProfit.returnLoss),
        otherCosts: Number(dailyProfit.otherCosts),
        netProfit: Number(dailyProfit.netProfit),
        margin: Number(dailyProfit.margin),
      };

      const updatedProfit = ProfitCalculationService.recalculateWithReturn(
        currentBreakdown,
        {
          refundAmount: input.refundAmount,
          returnProcessingFee: 0,
        },
      );

      // 4. Update ProfitDaily with updated numbers
      await tx.profitDaily.update({
        where: { id: dailyProfit.id },
        data: {
          returnLoss: updatedProfit.returnLoss,
          netProfit: updatedProfit.netProfit,
          margin: updatedProfit.margin,
        },
      });

      return {
        returnRecord: {
          id: returnRecord.id,
          workspaceId: returnRecord.workspaceId,
          orderItemId: returnRecord.orderItemId,
          skuId: returnRecord.skuId,
          reason: returnRecord.reason ?? undefined,
          status: returnRecord.status,
          refundAmount: Number(returnRecord.refundAmount),
          returnDate: returnRecord.returnDate,
        },
        updatedProfit,
      };
    });
  }

  async listSkuReturns(
    workspaceId: string,
    skuId: string,
  ): Promise<ReturnRecordInfo[]> {
    const records = await this.prisma.returnRecord.findMany({
      where: { workspaceId, skuId },
      orderBy: { returnDate: 'desc' },
    });

    return records.map((r) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      orderItemId: r.orderItemId,
      skuId: r.skuId,
      reason: r.reason ?? undefined,
      status: r.status,
      refundAmount: Number(r.refundAmount),
      returnDate: r.returnDate,
    }));
  }

  async getSkuReturnSummary(workspaceId: string, skuId: string) {
    const returns = await this.prisma.returnRecord.findMany({
      where: { workspaceId, skuId },
    });

    const orderItems = await this.prisma.orderItem.findMany({
      where: { workspaceId, skuId },
    });

    const count = returns.length;
    const refundTotal = returns.reduce(
      (sum, r) => sum + Number(r.refundAmount),
      0,
    );
    const totalUnitsSold = orderItems.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );
    const returnRate =
      totalUnitsSold > 0
        ? Math.round((count / totalUnitsSold + Number.EPSILON) * 10000) / 10000
        : 0;

    return {
      count,
      refundTotal: Math.round((refundTotal + Number.EPSILON) * 100) / 100,
      returnRate,
    };
  }

  private mapProfitDaily(r: any) {
    return {
      id: r.id,
      workspaceId: r.workspaceId,
      skuId: r.skuId,
      skuCode: r.sku?.skuCode,
      date:
        r.date instanceof Date
          ? r.date.toISOString().slice(0, 10)
          : String(r.date),
      revenue: Number(r.revenue),
      cogs: Number(r.cogs),
      adsCost: Number(r.adsCost),
      amazonFees: Number(r.amazonFees),
      fbaFee: Number(r.fbaFee),
      returnLoss: Number(r.returnLoss),
      otherCosts: Number(r.otherCosts),
      netProfit: Number(r.netProfit),
      margin: Number(r.margin),
    };
  }
}
