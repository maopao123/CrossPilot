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
 * Optional store-backed Sku360 source. Default diagnosis still uses Scenario.
 * Enable with STORE_SKU360_SOURCE=prisma.
 */
export class StoreSku360DataSource implements ISku360DataSource {
  constructor(private readonly prisma: any) {}

  async getIdentity(params: Sku360LoadParams): Promise<Sku360Identity> {
    const sku = await this.prisma.sku.findFirst({
      where: { workspaceId: params.workspaceId, OR: [{ id: params.skuId }, { skuCode: params.skuId }] },
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
    const sku = await this.findSku(params);
    if (!sku) return this.missing('sales');
    const items = await this.prisma.orderItem.findMany({
      where: { workspaceId: params.workspaceId, skuId: sku.id },
      include: { order: true },
    });
    const inRange = items.filter((it: any) => this.inRange(it.order?.orderedAt, params.currentPeriod));
    const units = inRange.reduce((s: number, it: any) => s + it.quantity, 0);
    const revenue = inRange.reduce((s: number, it: any) => s + Number(it.unitPrice) * it.quantity, 0);
    return {
      availability: inRange.length ? 'AVAILABLE' : 'PARTIAL',
      asOf: new Date().toISOString(),
      data: {
        current: { ordersCount: inRange.length, unitsSold: units, revenue },
      },
    };
  }

  async getAdvertising(_params: Sku360LoadParams): Promise<DomainLoadResult<RawAdvertisingData>> {
    return {
      availability: 'UNAVAILABLE',
      asOf: new Date().toISOString(),
      error: 'Amazon Ads is out of Epic 4 scope',
      data: { current: { spend: 0, sales: 0 } },
    };
  }

  async getInventory(params: Sku360LoadParams): Promise<DomainLoadResult<RawInventoryData>> {
    const sku = await this.findSku(params);
    if (!sku) return this.missing('inventory');
    const balance = await this.prisma.inventoryBalance.findFirst({
      where: { workspaceId: params.workspaceId, skuId: sku.id },
    });
    if (!balance) return this.missing('inventory');
    return {
      availability: 'AVAILABLE',
      asOf: balance.sourceUpdatedAt?.toISOString?.() || new Date().toISOString(),
      data: {
        fulfillableQuantity: balance.fulfillableQuantity,
        inboundQuantity: balance.inboundQuantity,
        reservedQuantity: balance.reservedQuantity,
        avgDailySales: 0,
        leadTimeDays: 15,
      },
    };
  }

  async getReviews(_params: Sku360LoadParams): Promise<DomainLoadResult<RawReviewsData>> {
    return {
      availability: 'UNAVAILABLE',
      asOf: new Date().toISOString(),
      data: { overallRating: 0, totalReviews: 0 },
    };
  }

  async getReturns(params: Sku360LoadParams): Promise<DomainLoadResult<RawReturnsData>> {
    const sku = await this.findSku(params);
    if (!sku) return this.missing('returns');
    const rows = await this.prisma.returnRecord.findMany({
      where: { workspaceId: params.workspaceId, skuId: sku.id },
    });
    return {
      availability: rows.length ? 'AVAILABLE' : 'PARTIAL',
      asOf: new Date().toISOString(),
      data: {
        current: {
          returnCount: rows.length,
          deliveredUnits: 0,
          returnCost: rows.reduce((s: number, r: any) => s + Number(r.refundAmount || 0), 0),
        },
      },
    };
  }

  async getCompetitors(_params: Sku360LoadParams): Promise<DomainLoadResult<RawCompetitorsData>> {
    return { availability: 'UNAVAILABLE', asOf: new Date().toISOString(), data: { items: [] } };
  }

  async getProfit(params: Sku360LoadParams): Promise<DomainLoadResult<RawProfitData>> {
    const sku = await this.findSku(params);
    if (!sku) return this.missing('profit');
    const rows = await this.prisma.profitDaily.findMany({
      where: { workspaceId: params.workspaceId, skuId: sku.id },
    });
    const sum = (field: string) => rows.reduce((s: number, r: any) => s + Number(r[field] || 0), 0);
    return {
      availability: rows.length ? 'AVAILABLE' : 'PARTIAL',
      asOf: new Date().toISOString(),
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

  private async findSku(params: Sku360LoadParams) {
    return this.prisma.sku.findFirst({
      where: { workspaceId: params.workspaceId, OR: [{ id: params.skuId }, { skuCode: params.skuId }] },
    });
  }

  private inRange(date: Date | undefined, period: { from: string; to: string }) {
    if (!date) return false;
    const iso = date.toISOString().slice(0, 10);
    return iso >= period.from.slice(0, 10) && iso <= period.to.slice(0, 10);
  }

  private missing(domain: string): DomainLoadResult<any> {
    return { availability: 'UNAVAILABLE', asOf: new Date().toISOString(), error: `No Prisma ${domain} for SKU` };
  }
}
