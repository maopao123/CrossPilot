import {
  DomainLoadResult,
  ISku360DataSource,
  RawAdvertisingData,
  RawCompetitorsData,
  RawInventoryData,
  RawProfitData,
  RawReturnsData,
  RawReviewsData,
  RawSalesData,
  Sku360LoadParams,
} from '@crosspilot/domain';
import { Sku360Identity } from '@crosspilot/shared';

/**
 * Closed-loop v2 Scoped Sku360 Data Source.
 * Strictly scoped to runWorkspaceId, isolating runs and preventing cross-workspace contamination.
 * Guarantees information isolation: internal hidden events / root causes are never leaked into diagnostic signals.
 * Queries are bounded up to completedThrough of the simulation run.
 */
export class V2Sku360DataSource implements ISku360DataSource {
  constructor(private readonly prisma: any) {}

  private async getRunScope(workspaceId: string): Promise<{
    completedThrough: Date | null;
    asOf: string;
  }> {
    if (this.prisma.simulationRun?.findUnique) {
      const run = await this.prisma.simulationRun.findUnique({
        where: { runWorkspaceId: workspaceId },
      });
      if (run?.completedThrough) {
        const dateStr = run.completedThrough.toISOString().slice(0, 10);
        return {
          completedThrough: new Date(`${dateStr}T23:59:59.999Z`),
          asOf: dateStr,
        };
      }
    }
    const todayStr = new Date().toISOString().slice(0, 10);
    return {
      completedThrough: null,
      asOf: todayStr,
    };
  }

  async getIdentity(params: Sku360LoadParams): Promise<Sku360Identity> {
    const sku = await this.prisma.sku.findFirst({
      where: {
        workspaceId: params.workspaceId,
        OR: [{ id: params.skuId }, { skuCode: params.skuId }],
      },
      include: { product: true },
    });

    if (!sku) {
      return {
        workspaceId: params.workspaceId,
        marketplaceId: params.marketplaceId || 'AMAZON_US',
        productId: params.skuId,
        skuId: params.skuId,
        skuCode: params.skuId,
        productName: params.skuId,
        brand: 'Unknown',
        category: 'Unknown',
        status: 'ACTIVE',
      };
    }

    return {
      workspaceId: params.workspaceId,
      marketplaceId: params.marketplaceId || 'AMAZON_US',
      productId: sku.productId,
      skuId: sku.id,
      skuCode: sku.skuCode,
      asin: sku.asin || undefined,
      productName: sku.product?.name || sku.variantName,
      brand: sku.product?.brand || 'Unknown',
      category: sku.product?.category || 'Unknown',
      status: sku.status,
    };
  }

  async getSales(params: Sku360LoadParams): Promise<DomainLoadResult<RawSalesData>> {
    const { completedThrough, asOf } = await this.getRunScope(params.workspaceId);
    const dateFilter = completedThrough ? { lte: completedThrough } : undefined;

    const metrics = await this.prisma.channelDailyMetric.findMany({
      where: {
        workspaceId: params.workspaceId,
        skuId: params.skuId,
        ...(dateFilter ? { metricDate: dateFilter } : {}),
      },
    });

    if (!metrics || metrics.length === 0) {
      return {
        availability: 'PARTIAL',
        asOf,
        data: {
          current: {
            ordersCount: 0,
            unitsSold: 0,
            revenue: 0,
          },
        },
      };
    }

    const revenue = metrics.reduce((acc: number, m: any) => acc + Number(m.revenue || 0), 0);
    const ordersCount = metrics.reduce((acc: number, m: any) => acc + Number(m.orders || 0), 0);
    const unitsSold = ordersCount;

    return {
      availability: 'AVAILABLE',
      asOf,
      data: {
        current: {
          ordersCount,
          unitsSold,
          revenue,
        },
      },
    };
  }

  async getAdvertising(params: Sku360LoadParams): Promise<DomainLoadResult<RawAdvertisingData>> {
    const { completedThrough, asOf } = await this.getRunScope(params.workspaceId);
    const dateFilter = completedThrough ? { lte: completedThrough } : undefined;

    const rows = await this.prisma.adMetricDaily.findMany({
      where: {
        campaign: { workspaceId: params.workspaceId },
        skuId: params.skuId,
        ...(dateFilter ? { metricDate: dateFilter } : {}),
      },
    });

    if (!rows || rows.length === 0) {
      return {
        availability: 'PARTIAL',
        asOf,
        data: {
          current: {
            spend: 0,
            sales: 0,
          },
        },
      };
    }

    const spend = rows.reduce((s: number, r: any) => s + Number(r.spend || 0), 0);
    const sales = rows.reduce((s: number, r: any) => s + Number(r.sales || 0), 0);
    const orders = rows.reduce((s: number, r: any) => s + Number(r.orders || 0), 0);
    const clicks = rows.reduce((s: number, r: any) => s + Number(r.clicks || 0), 0);
    const impressions = rows.reduce((s: number, r: any) => s + Number(r.impressions || 0), 0);

    return {
      availability: 'AVAILABLE',
      asOf,
      data: {
        current: {
          spend,
          sales,
          orders,
          clicks,
          impressions,
          acos: sales > 0 ? spend / sales : undefined,
          roas: spend > 0 ? sales / spend : undefined,
          ctr: impressions > 0 ? clicks / impressions : undefined,
          cvr: clicks > 0 ? orders / clicks : undefined,
        },
      },
    };
  }

  async getInventory(params: Sku360LoadParams): Promise<DomainLoadResult<RawInventoryData>> {
    const { asOf } = await this.getRunScope(params.workspaceId);
    const balance = await this.prisma.inventoryBalance.findFirst({
      where: {
        workspaceId: params.workspaceId,
        skuId: params.skuId,
      },
    });

    if (!balance) {
      return {
        availability: 'UNAVAILABLE',
        asOf,
        data: {
          fulfillableQuantity: 0,
          inboundQuantity: 0,
          avgDailySales: 0,
          leadTimeDays: 0,
        },
      };
    }

    let leadTimeDays = 0;
    if (this.prisma.simulationRun?.findUnique) {
      const run = await this.prisma.simulationRun.findUnique({
        where: { runWorkspaceId: params.workspaceId },
      });
      const cfg = (run?.config as any) ?? {};
      const skuCfg = (cfg.skus as any[])?.find(
        (s: any) => s.skuId === params.skuId || s.skuCode === params.skuId,
      );
      leadTimeDays = skuCfg?.leadTimeDays ?? skuCfg?.supplierLeadTimeDays ?? cfg.leadTimeDays ?? 0;
    }

    return {
      availability: 'AVAILABLE',
      asOf: balance.sourceUpdatedAt?.toISOString?.() || asOf,
      data: {
        fulfillableQuantity: balance.fulfillableQuantity,
        inboundQuantity: balance.inboundQuantity,
        reservedQuantity: balance.reservedQuantity,
        avgDailySales: 0,
        leadTimeDays,
      },
    };
  }

  async getReviews(params: Sku360LoadParams): Promise<DomainLoadResult<RawReviewsData>> {
    // Strictly isolate internal simulation events: never read or expose hidden simulationEvents table.
    // Query actual reviews from Review table, or return UNAVAILABLE without hardcoded fake ratings.
    const { completedThrough, asOf } = await this.getRunScope(params.workspaceId);
    const dateFilter = completedThrough ? { lte: completedThrough } : undefined;

    let reviews: any[] = [];
    if (this.prisma.review?.findMany) {
      reviews = await this.prisma.review.findMany({
        where: {
          workspaceId: params.workspaceId,
          skuId: params.skuId,
          ...(dateFilter ? { reviewDate: dateFilter } : {}),
        },
      });
    }

    if (reviews.length === 0) {
      return {
        availability: 'UNAVAILABLE',
        asOf,
        data: {
          overallRating: 0,
          totalReviews: 0,
          recentReviewCount: 0,
          topPainPoints: [],
          topPositiveThemes: [],
        },
      };
    }

    const avgRating =
      reviews.reduce((sum: number, r: any) => sum + Number(r.rating || 0), 0) / reviews.length;

    return {
      availability: 'AVAILABLE',
      asOf,
      data: {
        overallRating: Math.round(avgRating * 10) / 10,
        totalReviews: reviews.length,
        recentReviewCount: reviews.length,
        topPainPoints: [],
        topPositiveThemes: [],
      },
    };
  }

  async getReturns(params: Sku360LoadParams): Promise<DomainLoadResult<RawReturnsData>> {
    const { completedThrough, asOf } = await this.getRunScope(params.workspaceId);
    const dateFilter = completedThrough ? { lte: completedThrough } : undefined;

    let returns: any[] = [];
    if (this.prisma.returnRecord?.findMany) {
      returns = await this.prisma.returnRecord.findMany({
        where: {
          workspaceId: params.workspaceId,
          skuId: params.skuId,
          ...(dateFilter ? { returnDate: dateFilter } : {}),
        },
      });
    }

    if (returns.length === 0) {
      return {
        availability: 'UNAVAILABLE',
        asOf,
        data: {
          current: {
            returnCount: 0,
            deliveredUnits: 0,
            returnCost: 0,
            returnRate: 0,
          },
        },
      };
    }

    const returnCount = returns.reduce((acc: number, r: any) => acc + Number(r.quantity || 1), 0);
    const returnCost = returns.reduce((acc: number, r: any) => acc + Number(r.refundAmount || 0), 0);

    let deliveredUnits = 0;
    if (this.prisma.profitDaily?.findMany) {
      const profits = await this.prisma.profitDaily.findMany({
        where: {
          workspaceId: params.workspaceId,
          skuId: params.skuId,
          ...(dateFilter ? { date: dateFilter } : {}),
        },
      });
      deliveredUnits = profits.reduce((acc: number, p: any) => acc + Number(p.unitsSold || 0), 0);
    }
    const returnRate = deliveredUnits > 0 ? returnCount / deliveredUnits : 0;

    return {
      availability: 'AVAILABLE',
      asOf,
      data: {
        current: {
          returnCount,
          deliveredUnits,
          returnCost,
          returnRate,
        },
      },
    };
  }

  async getCompetitors(_params: Sku360LoadParams): Promise<DomainLoadResult<RawCompetitorsData>> {
    const { asOf } = await this.getRunScope(_params.workspaceId);
    return {
      availability: 'UNAVAILABLE',
      asOf,
      data: { items: [] },
    };
  }

  async getProfit(params: Sku360LoadParams): Promise<DomainLoadResult<RawProfitData>> {
    const { completedThrough, asOf } = await this.getRunScope(params.workspaceId);
    const dateFilter = completedThrough ? { lte: completedThrough } : undefined;

    const rows = await this.prisma.profitDaily.findMany({
      where: {
        workspaceId: params.workspaceId,
        skuId: params.skuId,
        ...(dateFilter ? { date: dateFilter } : {}),
      },
    });

    const sum = (field: string) => rows.reduce((s: number, r: any) => s + Number(r[field] || 0), 0);

    return {
      availability: rows.length ? 'AVAILABLE' : 'PARTIAL',
      asOf,
      data: {
        current: {
          revenue: sum('revenue'),
          cogs: sum('cogs'),
          amazonFees: sum('amazonFees'),
          fbaFee: sum('fbaFee'),
          adsCost: sum('adsCost'),
          returnLoss: sum('returnLoss'),
          otherCosts: sum('otherCosts'),
          netProfit: sum('netProfit'),
        },
      },
    };
  }
}
