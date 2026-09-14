import { PrismaClient } from '@prisma/client';
import {
  providerUnavailable,
  writeForbiddenResult,
  type AdapterCapabilities,
  type AdapterWriteResult,
  type BidTarget,
  type CanonicalCampaign,
  type CanonicalInventory,
  type CanonicalOrder,
  type CanonicalProduct,
  type CanonicalProductPatch,
  type CanonicalProfit,
  type CommerceAdapter,
  type CommerceContext,
  type CommercePlatform,
  type OrderQuery,
  type ProfitQuery,
} from '@crosspilot/domain';
import {
  SimulatorStore,
  tickSimulatorWorkspace,
  type SimulatorTickResult,
} from '../simulator/simulator-store.js';

type SimChannel = 'amazon' | 'shopify';

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isoDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function simulatorChannelFromProvider(provider: string | null | undefined): SimChannel | null {
  if (provider === 'simulator-amazon') return 'amazon';
  if (provider === 'simulator-shopify') return 'shopify';
  return null;
}

export class SimulatorAdapterBindError extends Error {
  readonly code = 'RESOURCE_NOT_FOUND';

  constructor(message: string) {
    super(message);
    this.name = 'SimulatorAdapterBindError';
  }
}

/**
 * Simulator as a Commerce Adapter. Tick still uses the frozen engine;
 * API/worker should call this Port, not SimulatorStore directly.
 */
export class SimulatorAdapter implements CommerceAdapter {
  readonly platform: CommercePlatform = 'simulator';

  getCapabilities(): AdapterCapabilities {
    return {
      supportedActions: ['DECREASE_BID', 'STOP_CAMPAIGN'],
      executionMode: 'simulator',
      constraints: {
        minBidUSD: 0.20,
        maxSingleBidChangePct: 0.20,
        maxCumulativeBidChangePct: 0.30,
        cooldownDays: 3,
        maxDailyActionsPerTarget: 3,
        min7DayClicks: 100,
      },
      dataFreshness: 'simulated-daily',
    };
  }

  constructor(
    private readonly prisma: PrismaClient | any,
    private readonly persistence = new SimulatorStore(prisma),
  ) {}

  async tick(workspaceId: string): Promise<SimulatorTickResult> {
    return tickSimulatorWorkspace(this.prisma, workspaceId);
  }

  async reset(workspaceId: string) {
    throw new Error(
      'LEGACY_RESET_DISABLED: 传统模拟器重置已停用以保护未经验证的工作区数据。请创建并使用新的 v2 闭环模拟 Run。',
    );
  }

  async listProducts(ctx: CommerceContext): Promise<CanonicalProduct[]> {
    const bound = await this.bind(ctx);
    const skus = await this.prisma.sku.findMany({
      where: { workspaceId: ctx.workspaceId },
      include: { product: { select: { name: true, category: true } } },
    });
    return skus.map((sku: any) => this.toProduct(ctx, bound.channel, sku));
  }

  async getProduct(ctx: CommerceContext, offerId: string): Promise<CanonicalProduct | null> {
    const bound = await this.bind(ctx);
    const sku = await this.prisma.sku.findFirst({
      where: { id: offerId, workspaceId: ctx.workspaceId },
      include: { product: { select: { name: true, category: true } } },
    });
    return sku ? this.toProduct(ctx, bound.channel, sku) : null;
  }

  async updateProduct(_ctx: CommerceContext, _patch: CanonicalProductPatch): Promise<AdapterWriteResult> {
    return writeForbiddenResult('updateProduct');
  }

  async listOrders(ctx: CommerceContext, query: OrderQuery = {}): Promise<CanonicalOrder[]> {
    const bound = await this.bind(ctx);
    if (!bound.accountId) return [];
    const rows = await this.prisma.order.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        sourceProvider: 'simulator',
        sourceAccountId: bound.accountId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.from || query.to
          ? {
              orderedAt: {
                ...(query.from ? { gte: query.from } : {}),
                ...(query.to ? { lte: query.to } : {}),
              },
            }
          : {}),
      },
      include: { items: true },
      orderBy: { orderedAt: 'desc' },
      take: query.limit ?? 100,
    });
    return rows.map((row: any) => ({
      id: row.id,
      storeId: ctx.storeId,
      platform: this.platform,
      externalOrderId: String(row.externalOrderId || row.orderNumber),
      items: (row.items || []).map((item: any) => ({
        offerId: item.skuId,
        quantity: num(item.quantity),
        unitPrice: num(item.unitPrice),
      })),
      amount: num(row.totalAmount),
      currency: row.currencyCode || 'USD',
      status: row.status,
      createdAt: (row.orderedAt instanceof Date ? row.orderedAt : new Date(row.orderedAt)).toISOString(),
    }));
  }

  async getInventory(ctx: CommerceContext, offerId: string): Promise<CanonicalInventory | null> {
    await this.bind(ctx);
    const balance = await this.prisma.inventoryBalance.findFirst({
      where: { workspaceId: ctx.workspaceId, skuId: offerId, warehouseType: 'FBA' },
    });
    if (!balance) return null;
    const snapshot = await this.prisma.inventorySnapshot.findFirst({
      where: { skuId: offerId },
      orderBy: { snapshotDate: 'desc' },
    });
    return {
      offerId,
      storeId: ctx.storeId,
      available: num(balance.fulfillableQuantity),
      reserved: num(balance.reservedQuantity),
      inbound: num(balance.inboundQuantity),
      daysOfStock: snapshot?.daysCover != null ? num(snapshot.daysCover) : null,
    };
  }

  async getCampaigns(ctx: CommerceContext): Promise<CanonicalCampaign[]> {
    const bound = await this.bind(ctx);
    if (bound.channel !== 'amazon') return [];
    const campaign = await this.prisma.campaign.findFirst({
      where: {
        workspaceId: ctx.workspaceId,
        OR: [
          { name: { startsWith: 'SIM - ' } },
          { name: { startsWith: 'SIM-' } },
        ],
      },
    });
    if (!campaign) return [];
    const metrics = await this.prisma.adMetricDaily.findMany({
      where: { campaignId: campaign.id },
    });
    let spend = 0;
    let impressions = 0;
    let clicks = 0;
    let conversions = 0;
    let sales = 0;
    for (const row of metrics) {
      spend += num(row.spend);
      impressions += num(row.impressions);
      clicks += num(row.clicks);
      conversions += num(row.orders);
      sales += num(row.sales);
    }
    return [
      {
        id: campaign.id,
        storeId: ctx.storeId,
        platform: this.platform,
        name: campaign.name,
        spend: round2(spend),
        impressions,
        clicks,
        conversions,
        acos: sales > 0 ? round4(spend / sales) : null,
        roas: spend > 0 ? round4(sales / spend) : null,
      },
    ];
  }

  async decreaseBid(
    _ctx: CommerceContext,
    _target: BidTarget,
    _pct: number,
  ): Promise<AdapterWriteResult> {
    return writeForbiddenResult('decreaseBid');
  }

  async getDailyProfit(ctx: CommerceContext, query: ProfitQuery = {}): Promise<CanonicalProfit[]> {
    await this.bind(ctx);
    const rows = await this.prisma.profitDaily.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        ...(query.offerId ? { skuId: query.offerId } : {}),
        ...(query.from || query.to
          ? {
              date: {
                ...(query.from ? { gte: query.from } : {}),
                ...(query.to ? { lte: query.to } : {}),
              },
            }
          : {}),
      },
      orderBy: { date: 'asc' },
    });
    return rows.map((row: any) => {
      const fees = num(row.amazonFees) + num(row.fbaFee) + num(row.otherCosts) + num(row.returnLoss);
      return {
        offerId: row.skuId,
        storeId: ctx.storeId,
        period: isoDate(row.date),
        revenue: num(row.revenue),
        cogs: num(row.cogs),
        advertisingCost: num(row.adsCost),
        fees: round2(fees),
        profit: num(row.netProfit),
        margin: row.margin != null ? num(row.margin) : null,
      };
    });
  }

  private async bind(ctx: CommerceContext): Promise<{ channel: SimChannel; accountId: string | null }> {
    if (!ctx.workspaceId || !ctx.storeId) {
      throw new SimulatorAdapterBindError('CommerceContext requires workspaceId and storeId');
    }
    const store = await this.prisma.store.findUnique({ where: { id: ctx.storeId } });
    if (!store || store.workspaceId !== ctx.workspaceId) {
      throw new SimulatorAdapterBindError(`Store ${ctx.storeId} is not in workspace ${ctx.workspaceId}`);
    }
    if (store.platform !== 'simulator') {
      providerUnavailable(String(store.platform));
    }
    const account = await this.prisma.commerceAccount.findUnique({
      where: { storeId: ctx.storeId },
    });
    const channel = simulatorChannelFromProvider(account?.provider) || 'amazon';
    return { channel, accountId: account?.id ?? null };
  }

  private toProduct(ctx: CommerceContext, channel: SimChannel, sku: any): CanonicalProduct {
    const identities =
      channel === 'amazon'
        ? [
            ...(sku.asin ? [{ type: 'asin', id: String(sku.asin) }] : []),
            { type: 'amazon_sku', id: String(sku.skuCode) },
          ]
        : [{ type: 'sku', id: String(sku.skuCode) }];
    return {
      id: sku.id,
      workspaceId: ctx.workspaceId,
      storeId: ctx.storeId,
      platform: 'simulator',
      title: sku.product?.name || sku.variantName || sku.skuCode,
      sku: sku.skuCode,
      category: sku.product?.category || '',
      price: num(sku.sellingPrice),
      cost: null,
      identities,
    };
  }
}
