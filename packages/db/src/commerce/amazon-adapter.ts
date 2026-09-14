import { PrismaClient } from '@prisma/client';
import { ErrorCodes } from '@crosspilot/shared';
import {
  CommercePortError,
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
  AmazonProvider,
  STORE_CAPABILITIES,
  decryptProviderCredential,
  exchangeLwaRefreshToken,
  type CapabilityBinding,
  type ProviderAdapter,
  type ProviderExecutionContext,
  type ProviderExecutionResult,
} from '@crosspilot/integrations';

type Transport = Pick<ProviderAdapter, 'execute'>;

export interface AmazonAdapterOptions {
  /** Transport seam for tests. Default is the real SP-HTTP AmazonProvider. */
  transport?: Transport;
  /** LWA refresh→access exchange. Default hits https://api.amazon.com/auth/o2/token. */
  exchangeToken?: (refreshToken: string) => Promise<{ accessToken: string }>;
  /** ProviderCredential decryption. Default is the shared AES-GCM implementation. */
  decryptCredential?: (payloadEnc: string) => string;
  /** Persist asin/amazon_sku projections into ChannelIdentity on catalog reads. Default true. */
  persistIdentities?: boolean;
}

interface BoundAmazonStore {
  account: any;
  refreshTokenEnc: string | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Amazon read adapter behind the Commerce Ports. Transport stays the Epic 4
 * GET-allowlisted AmazonProvider; there is no mock fallback here — tests and
 * tooling inject one explicitly via options.transport.
 */
export class AmazonAdapter implements CommerceAdapter {
  readonly platform: CommercePlatform = 'amazon';

  getCapabilities(): AdapterCapabilities {
    return {
      supportedActions: [],
      executionMode: 'live',
      constraints: {},
      dataFreshness: 'real-time',
    };
  }

  private readonly transport: Transport;
  private readonly exchangeToken: (refreshToken: string) => Promise<{ accessToken: string }>;
  private readonly decryptCredential: (payloadEnc: string) => string;
  private readonly persistIdentities: boolean;

  constructor(
    private readonly prisma: PrismaClient | any,
    options: AmazonAdapterOptions = {},
  ) {
    this.transport = options.transport ?? new AmazonProvider();
    this.exchangeToken =
      options.exchangeToken ?? ((refreshToken: string) => exchangeLwaRefreshToken({ refreshToken }));
    this.decryptCredential = options.decryptCredential ?? decryptProviderCredential;
    this.persistIdentities = options.persistIdentities ?? true;
  }

  async listProducts(ctx: CommerceContext): Promise<CanonicalProduct[]> {
    const bound = await this.bind(ctx);
    if (!bound.account.sellingPartnerId) {
      throw new CommercePortError(
        ErrorCodes.AUTH_REQUIRED,
        'Amazon sellingPartnerId is required for listing reads',
      );
    }
    const data = await this.executeCapability(ctx, bound, STORE_CAPABILITIES.listingsSearch, {
      sellingPartnerId: bound.account.sellingPartnerId,
      pageSize: 20,
    });
    const listings = Array.isArray(data) ? data : [];
    const products = listings
      .filter((row: any) => row?.sellerSku)
      .map((row: any) => this.toProduct(ctx, row));
    if (this.persistIdentities) {
      await this.projectIdentities(ctx, products);
    }
    return products;
  }

  async getProduct(ctx: CommerceContext, offerId: string): Promise<CanonicalProduct | null> {
    const bound = await this.bind(ctx);
    if (!bound.account.sellingPartnerId) {
      throw new CommercePortError(
        ErrorCodes.AUTH_REQUIRED,
        'Amazon sellingPartnerId is required for listing reads',
      );
    }
    try {
      const data = await this.executeCapability(ctx, bound, STORE_CAPABILITIES.listingsGet, {
        sellingPartnerId: bound.account.sellingPartnerId,
        sellerSku: offerId,
      });
      const listing = data as any;
      if (!listing || !listing.sellerSku) return null;
      const product = this.toProduct(ctx, listing);
      if (this.persistIdentities) {
        await this.projectIdentities(ctx, [product]);
      }
      return product;
    } catch (err) {
      if (err instanceof CommercePortError && err.code === 'NOT_FOUND') return null;
      throw err;
    }
  }

  async updateProduct(_ctx: CommerceContext, _patch: CanonicalProductPatch): Promise<AdapterWriteResult> {
    return writeForbiddenResult('updateProduct');
  }

  async listOrders(ctx: CommerceContext, query: OrderQuery = {}): Promise<CanonicalOrder[]> {
    const bound = await this.bind(ctx);
    const input: Record<string, unknown> = {};
    if (query.from) input.createdAfter = query.from.toISOString();
    const data = await this.executeCapability(ctx, bound, STORE_CAPABILITIES.ordersSearch, input);
    const orders = (Array.isArray(data) ? data : [])
      .filter((row: any) => row?.amazonOrderId)
      .map((row: any) => this.toOrder(ctx, row));
    const filtered = query.status ? orders.filter((row) => row.status === query.status) : orders;
    return typeof query.limit === 'number' ? filtered.slice(0, query.limit) : filtered;
  }

  async getInventory(ctx: CommerceContext, offerId: string): Promise<CanonicalInventory | null> {
    const bound = await this.bind(ctx);
    const data = await this.executeCapability(ctx, bound, STORE_CAPABILITIES.inventorySummaries, {});
    const rows = Array.isArray(data) ? data : [];
    const row = rows.find((r: any) => r?.sellerSku === offerId || (r?.asin && r.asin === offerId));
    if (!row) return null;
    return {
      offerId,
      storeId: ctx.storeId,
      available: Number(row.fulfillableQuantity ?? 0),
      reserved: Number(row.reservedQuantity ?? 0),
      inbound: Number(row.inboundQuantity ?? 0),
      daysOfStock: null,
    };
  }

  async getCampaigns(_ctx: CommerceContext): Promise<CanonicalCampaign[]> {
    // Epic 4 GET allowlist has no Sponsored Ads read endpoints. Ads reads
    // stay empty here until a dedicated read-only ads capability lands.
    return [];
  }

  async decreaseBid(
    _ctx: CommerceContext,
    _target: BidTarget,
    _pct: number,
  ): Promise<AdapterWriteResult> {
    return writeForbiddenResult('decreaseBid');
  }

  async getDailyProfit(_ctx: CommerceContext, _query: ProfitQuery = {}): Promise<CanonicalProfit[]> {
    // Finances transactions carry no seller-sku / cogs split, so an honest
    // CanonicalProfit projection is impossible from the read allowlist.
    return [];
  }

  private async bind(ctx: CommerceContext): Promise<BoundAmazonStore> {
    if (!ctx.workspaceId || !ctx.storeId) {
      throw new CommercePortError(
        ErrorCodes.RESOURCE_NOT_FOUND,
        'CommerceContext requires workspaceId and storeId',
      );
    }
    const store = await this.prisma.store.findUnique({ where: { id: ctx.storeId } });
    if (!store || store.workspaceId !== ctx.workspaceId) {
      throw new CommercePortError(
        ErrorCodes.RESOURCE_NOT_FOUND,
        `Store ${ctx.storeId} is not in workspace ${ctx.workspaceId}`,
      );
    }
    if (store.platform !== 'amazon') {
      providerUnavailable(String(store.platform));
    }
    const account = await this.prisma.commerceAccount.findUnique({
      where: { storeId: ctx.storeId },
    });
    if (!account) {
      throw new CommercePortError(
        ErrorCodes.RESOURCE_NOT_FOUND,
        `Store ${ctx.storeId} has no bound commerce account`,
      );
    }
    const credential = await this.prisma.providerCredential.findUnique({
      where: { accountId_kind: { accountId: account.id, kind: 'LWA_REFRESH' } },
    });
    if (!credential?.payloadEnc) {
      throw new CommercePortError(
        ErrorCodes.AUTH_REQUIRED,
        'Amazon selling partner is not connected (no LWA refresh token)',
      );
    }
    return { account, refreshTokenEnc: credential.payloadEnc };
  }

  private async executeCapability(
    ctx: CommerceContext,
    bound: BoundAmazonStore,
    capabilityId: string,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    let accessToken: string;
    try {
      const refreshToken = this.decryptCredential(String(bound.refreshTokenEnc));
      accessToken = (await this.exchangeToken(refreshToken)).accessToken;
    } catch (err: any) {
      const code = err?.code === 'TOKEN_EXPIRED' ? ErrorCodes.TOKEN_EXPIRED : ErrorCodes.PROVIDER_UNAVAILABLE;
      throw new CommercePortError(code, err?.message || 'Amazon LWA token exchange failed', code === ErrorCodes.TOKEN_EXPIRED);
    }

    const binding: CapabilityBinding = {
      capabilityId,
      providerId: 'amazon',
      transport: 'HTTP',
      enabled: true,
      priority: 100,
    } as CapabilityBinding;
    const context: ProviderExecutionContext = {
      workspaceId: ctx.workspaceId,
      traceId: ctx.traceId,
      marketplace: bound.account.defaultMarketplaceCode || 'AMAZON_US',
      metadata: { amazonAccessToken: accessToken },
    };
    let result: ProviderExecutionResult<any>;
    try {
      result = await this.transport.execute(capabilityId, binding, input, context);
    } catch (err: any) {
      // Well-behaved providers return failure results, but a custom transport
      // may throw — normalize so port callers only ever see CommercePortError.
      throw new CommercePortError(
        err?.code === 'RATE_LIMITED' ? 'PROVIDER_RATE_LIMIT' : String(err?.code || ErrorCodes.PROVIDER_UNAVAILABLE),
        err?.message || `Amazon capability ${capabilityId} failed`,
        Boolean(err?.retryable),
      );
    }
    if (result.success) return result.data;
    const error = result.error;
    const code =
      error?.code === 'RATE_LIMITED'
        ? 'PROVIDER_RATE_LIMIT'
        : String(error?.code || ErrorCodes.PROVIDER_UNAVAILABLE);
    throw new CommercePortError(
      code,
      error?.message || `Amazon capability ${capabilityId} failed`,
      Boolean(error?.retryable),
    );
  }

  private toProduct(ctx: CommerceContext, listing: any): CanonicalProduct {
    const identities = [
      ...(listing.asin ? [{ type: 'asin', id: String(listing.asin) }] : []),
      { type: 'amazon_sku', id: String(listing.sellerSku) },
    ];
    return {
      id: String(listing.sellerSku),
      workspaceId: ctx.workspaceId,
      storeId: ctx.storeId,
      platform: 'amazon',
      title: listing.title || String(listing.sellerSku),
      sku: String(listing.sellerSku),
      category: '',
      price: listing.price != null ? round2(Number(listing.price)) : 0,
      cost: null,
      identities,
    };
  }

  private async projectIdentities(ctx: CommerceContext, products: CanonicalProduct[]): Promise<void> {
    for (const product of products) {
      for (const identity of product.identities) {
        try {
          await this.prisma.channelIdentity.upsert({
            where: {
              storeId_platform_entityType_externalId: {
                storeId: ctx.storeId,
                platform: 'amazon',
                entityType: 'offer',
                externalId: identity.id,
              },
            },
            create: {
              storeId: ctx.storeId,
              platform: 'amazon',
              entityType: 'offer',
              entityId: product.id,
              externalId: identity.id,
            },
            update: { entityId: product.id },
          });
        } catch {
          // Identity projection is best-effort; reads must not fail on it.
        }
      }
    }
  }

  private toOrder(ctx: CommerceContext, order: any): CanonicalOrder {
    const items = (Array.isArray(order.items) ? order.items : [])
      .filter((item: any) => item?.sellerSku || item?.asin)
      .map((item: any) => ({
        offerId: String(item.sellerSku || item.asin),
        quantity: Number(item.quantity ?? 0),
        unitPrice: Number(item.unitPrice ?? 0),
      }));
    const amount =
      order.totalAmount != null
        ? Number(order.totalAmount)
        : round2(items.reduce((sum: number, item: { quantity: number; unitPrice: number }) => sum + item.quantity * item.unitPrice, 0));
    return {
      id: String(order.amazonOrderId),
      storeId: ctx.storeId,
      platform: 'amazon',
      externalOrderId: String(order.amazonOrderId),
      items,
      amount,
      currency: order.currencyCode || 'USD',
      status: order.status || 'UNKNOWN',
      createdAt: new Date(order.purchaseDate || Date.now()).toISOString(),
    };
  }
}
