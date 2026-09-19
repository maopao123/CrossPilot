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
  decryptProviderCredential,
} from '@crosspilot/integrations';

export interface ShopifyGraphQLResponse<T = any> {
  data?: T;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: string[];
    extensions?: Record<string, unknown>;
  }>;
  extensions?: {
    cost?: {
      requestedQueryCost: number;
      actualQueryCost: number;
      throttleStatus?: {
        maximumAvailable: number;
        currentlyAvailable: number;
        restoreRate: number;
      };
    };
  };
}

export interface ShopifyGraphQLTransport {
  execute<T = any>(
    shop: string,
    accessToken: string,
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<ShopifyGraphQLResponse<T>>;
}

export interface ShopifyTokenExchangeResult {
  accessToken: string;
  expiresIn: number;
}

export type ShopifyTokenExchanger = (
  shop: string,
  clientId: string,
  clientSecret: string,
) => Promise<ShopifyTokenExchangeResult>;

export interface ShopifyAdapterOptions {
  transport?: ShopifyGraphQLTransport;
  exchangeToken?: ShopifyTokenExchanger;
  decryptCredential?: (payloadEnc: string) => string;
  persistIdentities?: boolean;
  apiVersion?: string;
}

interface BoundShopifyStore {
  store: any;
  account: any;
  shop: string;
  clientId: string;
  clientSecret: string;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizeShopDomain(raw: string): string {
  if (!raw) return '';
  return raw
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\.myshopify\.com\/?$/i, '')
    .replace(/\/.*$/, '')
    .trim();
}

/**
 * Default live HTTP transport for Shopify Admin GraphQL API (default: 2026-07).
 */
export class HttpShopifyGraphQLTransport implements ShopifyGraphQLTransport {
  constructor(private readonly apiVersion = '2026-07') {}

  async execute<T = any>(
    shop: string,
    accessToken: string,
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<ShopifyGraphQLResponse<T>> {
    const domain = shop.includes('.') ? shop : `${shop}.myshopify.com`;
    const url = `https://${domain}/admin/api/${this.apiVersion}/graphql.json`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch (err: any) {
      throw new CommercePortError(
        ErrorCodes.PROVIDER_UNAVAILABLE,
        `Failed to reach Shopify GraphQL API: ${err?.message || String(err)}`,
        true,
      );
    }

    if (res.status === 429) {
      throw new CommercePortError('PROVIDER_RATE_LIMIT', 'Shopify rate limit exceeded', true);
    }
    if (res.status === 401 || res.status === 403) {
      throw new CommercePortError(
        ErrorCodes.AUTH_REQUIRED,
        'Shopify authentication failed / access token invalid or expired',
        false,
      );
    }
    if (!res.ok) {
      throw new CommercePortError(
        ErrorCodes.PROVIDER_UNAVAILABLE,
        `Shopify GraphQL returned HTTP ${res.status}: ${res.statusText}`,
        res.status >= 500,
      );
    }

    const json = (await res.json()) as ShopifyGraphQLResponse<T>;
    if (json.errors && json.errors.length > 0 && !json.data) {
      const firstErr = json.errors[0];
      const isThrottled =
        firstErr.message.toLowerCase().includes('throttled') ||
        firstErr.extensions?.code === 'THROTTLED';
      if (isThrottled) {
        throw new CommercePortError('PROVIDER_RATE_LIMIT', firstErr.message, true);
      }
      throw new CommercePortError('COMMERCE_PORT_ERROR', firstErr.message, false);
    }

    return json;
  }
}

/**
 * Default live token exchanger using Shopify OAuth Client Credentials Grant.
 */
export async function defaultShopifyTokenExchanger(
  shop: string,
  clientId: string,
  clientSecret: string,
): Promise<ShopifyTokenExchangeResult> {
  const domain = shop.includes('.') ? shop : `${shop}.myshopify.com`;
  const url = `https://${domain}/admin/oauth/access_token`;

  const bodyParams = new URLSearchParams();
  bodyParams.append('grant_type', 'client_credentials');
  bodyParams.append('client_id', clientId);
  bodyParams.append('client_secret', clientSecret);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: bodyParams.toString(),
    });
  } catch (err: any) {
    throw new CommercePortError(
      ErrorCodes.PROVIDER_UNAVAILABLE,
      `Shopify token exchange network failure: ${err?.message || String(err)}`,
      true,
    );
  }

  if (res.status === 429) {
    throw new CommercePortError('PROVIDER_RATE_LIMIT', 'Shopify OAuth rate limit exceeded', true);
  }
  if (res.status === 401 || res.status === 400 || res.status === 403) {
    throw new CommercePortError(
      ErrorCodes.AUTH_REQUIRED,
      'Shopify client credentials rejected by endpoint',
      false,
    );
  }
  if (!res.ok) {
    throw new CommercePortError(
      ErrorCodes.PROVIDER_UNAVAILABLE,
      `Shopify token exchange HTTP ${res.status}: ${res.statusText}`,
      res.status >= 500,
    );
  }

  const json = (await res.json()) as any;
  if (!json?.access_token) {
    throw new CommercePortError(
      ErrorCodes.AUTH_REQUIRED,
      'Shopify token response missing access_token',
      false,
    );
  }

  return {
    accessToken: String(json.access_token),
    expiresIn: Number(json.expires_in ?? 86399),
  };
}

/**
 * Shopify read adapter implementing Commerce Ports.
 * Connects to Shopify Admin GraphQL API (2026-07) via Client Credentials Grant.
 * Maps Product GID & Variant GID into identities[] & ChannelIdentity projections.
 */
export class ShopifyAdapter implements CommerceAdapter {
  readonly platform: CommercePlatform = 'shopify';

  // In-memory token cache: `${shop}:${clientId}` -> CachedToken
  private static readonly tokenCache = new Map<string, CachedToken>();

  getCapabilities(): AdapterCapabilities {
    return {
      supportedActions: [],
      executionMode: 'live',
      constraints: {},
      dataFreshness: 'real-time',
    };
  }

  private readonly transport: ShopifyGraphQLTransport;
  private readonly exchangeToken: ShopifyTokenExchanger;
  private readonly decryptCredential: (payloadEnc: string) => string;
  private readonly persistIdentities: boolean;

  constructor(
    private readonly prisma: PrismaClient | any,
    options: ShopifyAdapterOptions = {},
  ) {
    this.transport = options.transport ?? new HttpShopifyGraphQLTransport(options.apiVersion ?? '2026-07');
    this.exchangeToken = options.exchangeToken ?? defaultShopifyTokenExchanger;
    this.decryptCredential = options.decryptCredential ?? decryptProviderCredential;
    this.persistIdentities = options.persistIdentities ?? true;
  }

  /** Clears static in-memory token cache (useful for tests) */
  static clearTokenCache(): void {
    ShopifyAdapter.tokenCache.clear();
  }

  async listProducts(ctx: CommerceContext): Promise<CanonicalProduct[]> {
    const bound = await this.bind(ctx);
    const token = await this.getAccessToken(bound.shop, bound.clientId, bound.clientSecret);

    const query = `
      query ListProducts($first: Int!) {
        products(first: $first) {
          nodes {
            id
            title
            handle
            status
            productType
            variants(first: 20) {
              nodes {
                id
                title
                sku
                price
                inventoryItem {
                  id
                }
              }
            }
          }
        }
      }
    `;

    const res = await this.executeGraphQL<any>(bound.shop, token, query, { first: 50 });
    const productNodes = Array.isArray(res.data?.products?.nodes) ? res.data.products.nodes : [];

    const products: CanonicalProduct[] = [];
    for (const node of productNodes) {
      products.push(...this.toProducts(ctx, node));
    }

    if (this.persistIdentities && products.length > 0) {
      await this.projectIdentities(ctx, products);
    }

    return products;
  }

  async getProduct(ctx: CommerceContext, offerId: string): Promise<CanonicalProduct | null> {
    const bound = await this.bind(ctx);
    const token = await this.getAccessToken(bound.shop, bound.clientId, bound.clientSecret);

    // 1. Direct variant GID lookup
    if (offerId.startsWith('gid://shopify/ProductVariant/')) {
      const query = `
        query GetProductVariant($id: ID!) {
          productVariant(id: $id) {
            id
            title
            sku
            price
            product {
              id
              title
              handle
              status
              productType
            }
          }
        }
      `;
      try {
        const res = await this.executeGraphQL<any>(bound.shop, token, query, { id: offerId });
        const variant = res.data?.productVariant;
        if (!variant) return null;
        const product = this.variantToCanonicalProduct(ctx, variant.product, variant);
        if (this.persistIdentities) {
          await this.projectIdentities(ctx, [product]);
        }
        return product;
      } catch (err: any) {
        if (err instanceof CommercePortError && err.code === 'NOT_FOUND') return null;
        throw err;
      }
    }

    // 2. Direct product GID lookup
    if (offerId.startsWith('gid://shopify/Product/')) {
      const query = `
        query GetProduct($id: ID!) {
          product(id: $id) {
            id
            title
            handle
            status
            productType
            variants(first: 20) {
              nodes {
                id
                title
                sku
                price
              }
            }
          }
        }
      `;
      try {
        const res = await this.executeGraphQL<any>(bound.shop, token, query, { id: offerId });
        const productNode = res.data?.product;
        if (!productNode) return null;
        const products = this.toProducts(ctx, productNode);
        if (products.length === 0) return null;
        if (this.persistIdentities) {
          await this.projectIdentities(ctx, products);
        }
        return products[0];
      } catch (err: any) {
        if (err instanceof CommercePortError && err.code === 'NOT_FOUND') return null;
        throw err;
      }
    }

    // 3. Search variant by SKU or secondary identifier
    const searchQuery = `
      query FindVariant($query: String!) {
        productVariants(first: 1, query: $query) {
          nodes {
            id
            title
            sku
            price
            product {
              id
              title
              handle
              status
              productType
            }
          }
        }
      }
    `;

    try {
      const res = await this.executeGraphQL<any>(bound.shop, token, searchQuery, {
        query: `sku:${offerId}`,
      });
      const matchedVariant = res.data?.productVariants?.nodes?.[0];
      if (matchedVariant) {
        const product = this.variantToCanonicalProduct(ctx, matchedVariant.product, matchedVariant);
        if (this.persistIdentities) {
          await this.projectIdentities(ctx, [product]);
        }
        return product;
      }
    } catch {
      // Fall through to numeric ID probe
    }

    // 4. Try numeric variant ID fallback
    if (/^\d+$/.test(offerId)) {
      try {
        const numericRes = await this.getProduct(ctx, `gid://shopify/ProductVariant/${offerId}`);
        if (numericRes) return numericRes;
        const numericProductRes = await this.getProduct(ctx, `gid://shopify/Product/${offerId}`);
        if (numericProductRes) return numericProductRes;
      } catch {
        return null;
      }
    }

    return null;
  }

  async updateProduct(_ctx: CommerceContext, _patch: CanonicalProductPatch): Promise<AdapterWriteResult> {
    return writeForbiddenResult('updateProduct');
  }

  async listOrders(ctx: CommerceContext, query: OrderQuery = {}): Promise<CanonicalOrder[]> {
    const bound = await this.bind(ctx);
    const token = await this.getAccessToken(bound.shop, bound.clientId, bound.clientSecret);

    const filterParts: string[] = [];
    if (query.from) {
      filterParts.push(`created_at:>=${query.from.toISOString()}`);
    }
    const queryString = filterParts.length > 0 ? filterParts.join(' AND ') : undefined;

    const graphql = `
      query ListOrders($first: Int!, $query: String) {
        orders(first: $first, query: $query) {
          nodes {
            id
            name
            createdAt
            displayFinancialStatus
            displayFulfillmentStatus
            currentTotalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            lineItems(first: 20) {
              nodes {
                id
                title
                quantity
                originalUnitPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                variant {
                  id
                  sku
                }
              }
            }
          }
        }
      }
    `;

    const first = typeof query.limit === 'number' && query.limit > 0 ? Math.min(query.limit, 100) : 50;
    const res = await this.executeGraphQL<any>(bound.shop, token, graphql, {
      first,
      query: queryString,
    });

    const orderNodes = Array.isArray(res.data?.orders?.nodes) ? res.data.orders.nodes : [];
    const orders = orderNodes.map((row: any) => this.toOrder(ctx, row));

    const filtered = query.status ? orders.filter((o: CanonicalOrder) => o.status === query.status) : orders;
    return typeof query.limit === 'number' ? filtered.slice(0, query.limit) : filtered;
  }

  async getInventory(ctx: CommerceContext, offerId: string): Promise<CanonicalInventory | null> {
    const bound = await this.bind(ctx);
    const token = await this.getAccessToken(bound.shop, bound.clientId, bound.clientSecret);

    // 1. Variant GID lookup
    if (offerId.startsWith('gid://shopify/ProductVariant/')) {
      const query = `
        query GetVariantInventory($id: ID!) {
          productVariant(id: $id) {
            id
            inventoryItem {
              id
              inventoryLevels(first: 10) {
                nodes {
                  quantities(names: ["available", "incoming", "reserved", "on_hand", "committed"]) {
                    name
                    quantity
                  }
                }
              }
            }
          }
        }
      `;
      try {
        const res = await this.executeGraphQL<any>(bound.shop, token, query, { id: offerId });
        const variant = res.data?.productVariant;
        if (!variant?.inventoryItem) return null;
        return this.toInventory(ctx, offerId, variant.inventoryItem.inventoryLevels?.nodes);
      } catch {
        return null;
      }
    }

    // 2. Product GID lookup -> check primary variant
    if (offerId.startsWith('gid://shopify/Product/')) {
      const query = `
        query GetProductFirstVariantInventory($id: ID!) {
          product(id: $id) {
            id
            variants(first: 1) {
              nodes {
                id
                inventoryItem {
                  id
                  inventoryLevels(first: 10) {
                    nodes {
                      quantities(names: ["available", "incoming", "reserved", "on_hand", "committed"]) {
                        name
                        quantity
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;
      try {
        const res = await this.executeGraphQL<any>(bound.shop, token, query, { id: offerId });
        const variant = res.data?.product?.variants?.nodes?.[0];
        if (!variant?.inventoryItem) return null;
        return this.toInventory(ctx, offerId, variant.inventoryItem.inventoryLevels?.nodes);
      } catch {
        return null;
      }
    }

    // 3. Search variant by SKU
    const searchQuery = `
      query SearchVariantInventory($query: String!) {
        productVariants(first: 1, query: $query) {
          nodes {
            id
            inventoryItem {
              id
              inventoryLevels(first: 10) {
                nodes {
                  quantities(names: ["available", "incoming", "reserved", "on_hand", "committed"]) {
                    name
                    quantity
                  }
                }
              }
            }
          }
        }
      }
    `;

    try {
      const res = await this.executeGraphQL<any>(bound.shop, token, searchQuery, {
        query: `sku:${offerId}`,
      });
      const variant = res.data?.productVariants?.nodes?.[0];
      if (variant?.inventoryItem) {
        return this.toInventory(ctx, offerId, variant.inventoryItem.inventoryLevels?.nodes);
      }
    } catch {
      // Fall through to numeric probe
    }

    // 4. Numeric fallback
    if (/^\d+$/.test(offerId)) {
      const variantRes = await this.getInventory(ctx, `gid://shopify/ProductVariant/${offerId}`);
      if (variantRes) return variantRes;
      const productRes = await this.getInventory(ctx, `gid://shopify/Product/${offerId}`);
      if (productRes) return productRes;
    }

    return null;
  }

  async getCampaigns(_ctx: CommerceContext): Promise<CanonicalCampaign[]> {
    // Shopify Admin API has no native Sponsored Ads campaigns capability.
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
    // Honest CanonicalProfit requires cogs / fee breakdown, which is not available in read API scope.
    return [];
  }

  private async bind(ctx: CommerceContext): Promise<BoundShopifyStore> {
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

    if (store.platform !== 'shopify') {
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

    // Locate Shopify credentials: check SHOPIFY_CLIENT_CREDENTIALS or SHOPIFY_APP
    let credential = await this.prisma.providerCredential.findUnique({
      where: { accountId_kind: { accountId: account.id, kind: 'SHOPIFY_CLIENT_CREDENTIALS' } },
    });
    if (!credential) {
      credential = await this.prisma.providerCredential.findUnique({
        where: { accountId_kind: { accountId: account.id, kind: 'SHOPIFY_APP' } },
      });
    }

    if (!credential?.payloadEnc) {
      throw new CommercePortError(
        ErrorCodes.AUTH_REQUIRED,
        'Shopify store is not connected (no client credentials found)',
      );
    }

    let clientId = '';
    let clientSecret = '';
    let shopInPayload: string | undefined;

    try {
      const decrypted = this.decryptCredential(String(credential.payloadEnc));
      if (decrypted.trim().startsWith('{')) {
        const parsed = JSON.parse(decrypted);
        clientId = parsed.clientId || parsed.client_id || '';
        clientSecret = parsed.clientSecret || parsed.client_secret || '';
        shopInPayload = parsed.shop || parsed.shopName || parsed.myshopifyDomain;
      } else if (decrypted.includes(':')) {
        const [cid, csec] = decrypted.split(':');
        clientId = cid || '';
        clientSecret = csec || '';
      } else {
        clientId = decrypted;
      }
    } catch (err: any) {
      throw new CommercePortError(
        ErrorCodes.AUTH_REQUIRED,
        `Shopify credential decryption or parsing failed: ${err?.message || String(err)}`,
      );
    }

    if (!clientId || !clientSecret) {
      throw new CommercePortError(
        ErrorCodes.AUTH_REQUIRED,
        'Shopify credentials incomplete (missing clientId or clientSecret)',
      );
    }

    const rawShop =
      shopInPayload ||
      account.defaultMarketplaceCode ||
      account.sellingPartnerId ||
      store.name ||
      '';
    const shop = normalizeShopDomain(rawShop);
    if (!shop) {
      throw new CommercePortError(
        ErrorCodes.AUTH_REQUIRED,
        'Shopify shop domain is required (e.g. crosspilot-dev)',
      );
    }

    return { store, account, shop, clientId, clientSecret };
  }

  private async getAccessToken(shop: string, clientId: string, clientSecret: string): Promise<string> {
    const cacheKey = `${shop}:${clientId}`;
    const now = Date.now();
    const cached = ShopifyAdapter.tokenCache.get(cacheKey);

    // Use cached token if valid for more than 5 minutes
    if (cached && cached.expiresAt > now + 5 * 60 * 1000) {
      return cached.accessToken;
    }

    let exchanged: ShopifyTokenExchangeResult;
    try {
      exchanged = await this.exchangeToken(shop, clientId, clientSecret);
    } catch (err: any) {
      const isAuth = err?.code === ErrorCodes.AUTH_REQUIRED || err?.code === 'TOKEN_EXPIRED';
      const code = isAuth ? ErrorCodes.AUTH_REQUIRED : (err?.code || ErrorCodes.PROVIDER_UNAVAILABLE);
      throw new CommercePortError(
        code,
        err?.message || 'Shopify token exchange failed',
        Boolean(err?.retryable),
      );
    }

    ShopifyAdapter.tokenCache.set(cacheKey, {
      accessToken: exchanged.accessToken,
      expiresAt: now + (exchanged.expiresIn * 1000),
    });

    return exchanged.accessToken;
  }

  private async executeGraphQL<T = any>(
    shop: string,
    accessToken: string,
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<ShopifyGraphQLResponse<T>> {
    let res: ShopifyGraphQLResponse<T>;
    try {
      res = await this.transport.execute<T>(shop, accessToken, query, variables);
    } catch (err: any) {
      if (err instanceof CommercePortError) {
        throw err;
      }
      throw new CommercePortError(
        err?.code === 'RATE_LIMITED' ? 'PROVIDER_RATE_LIMIT' : String(err?.code || ErrorCodes.PROVIDER_UNAVAILABLE),
        err?.message || 'Shopify GraphQL capability execution failed',
        Boolean(err?.retryable),
      );
    }

    if (res?.errors && res.errors.length > 0 && !res.data) {
      const firstErr = res.errors[0];
      const isThrottled =
        firstErr.message?.toLowerCase().includes('throttled') ||
        firstErr.extensions?.code === 'THROTTLED';
      if (isThrottled) {
        throw new CommercePortError('PROVIDER_RATE_LIMIT', firstErr.message, true);
      }
      throw new CommercePortError('COMMERCE_PORT_ERROR', firstErr.message, false);
    }

    return res;
  }

  private toProducts(ctx: CommerceContext, node: any): CanonicalProduct[] {
    const variants = Array.isArray(node?.variants?.nodes) ? node.variants.nodes : [];
    if (variants.length === 0) {
      return [
        {
          id: String(node.id),
          workspaceId: ctx.workspaceId,
          storeId: ctx.storeId,
          platform: 'shopify',
          title: node.title || String(node.id),
          sku: node.handle || String(node.id),
          category: node.productType || '',
          price: 0,
          cost: null,
          identities: [
            { type: 'shopify_product_id', id: String(node.id) },
          ],
        },
      ];
    }

    return variants.map((variant: any) => this.variantToCanonicalProduct(ctx, node, variant));
  }

  private variantToCanonicalProduct(ctx: CommerceContext, node: any, variant: any): CanonicalProduct {
    const title =
      variant.title && variant.title !== 'Default Title'
        ? `${node?.title || ''} - ${variant.title}`
        : (node?.title || String(variant.id));
    const sku = variant.sku || variant.id;
    const price = variant.price != null ? round2(Number(variant.price)) : 0;
    const identities = [
      ...(node?.id ? [{ type: 'shopify_product_id', id: String(node.id) }] : []),
      { type: 'shopify_variant_id', id: String(variant.id) },
      ...(variant.sku ? [{ type: 'shopify_sku', id: String(variant.sku) }] : []),
    ];

    return {
      id: String(variant.id),
      workspaceId: ctx.workspaceId,
      storeId: ctx.storeId,
      platform: 'shopify',
      title,
      sku: String(sku),
      category: node?.productType || '',
      price,
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
                platform: 'shopify',
                entityType: 'offer',
                externalId: identity.id,
              },
            },
            create: {
              storeId: ctx.storeId,
              platform: 'shopify',
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
    const lineNodes = Array.isArray(order?.lineItems?.nodes) ? order.lineItems.nodes : [];
    const items = lineNodes.map((item: any) => ({
      offerId: String(item.variant?.id || item.variant?.sku || item.id),
      quantity: Number(item.quantity ?? 0),
      unitPrice: round2(Number(item.originalUnitPriceSet?.shopMoney?.amount ?? 0)),
    }));

    const amount =
      order?.currentTotalPriceSet?.shopMoney?.amount != null
        ? round2(Number(order.currentTotalPriceSet.shopMoney.amount))
        : round2(
            items.reduce(
              (sum: number, it: { quantity: number; unitPrice: number }) =>
                sum + it.quantity * it.unitPrice,
              0,
            ),
          );

    const currency = order?.currentTotalPriceSet?.shopMoney?.currencyCode || 'USD';
    const status = order.displayFinancialStatus || order.displayFulfillmentStatus || 'OPEN';

    return {
      id: String(order.id),
      storeId: ctx.storeId,
      platform: 'shopify',
      externalOrderId: order.name || String(order.id),
      items,
      amount,
      currency,
      status,
      createdAt: new Date(order.createdAt || Date.now()).toISOString(),
    };
  }

  private toInventory(
    ctx: CommerceContext,
    offerId: string,
    levels: any[] = [],
  ): CanonicalInventory {
    let available = 0;
    let reserved = 0;
    let inbound = 0;

    const levelRows = Array.isArray(levels) ? levels : [];
    for (const lvl of levelRows) {
      const quantities = Array.isArray(lvl?.quantities) ? lvl.quantities : [];
      for (const q of quantities) {
        const name = String(q?.name || '').toLowerCase();
        const qty = Number(q?.quantity || 0);
        if (name === 'available' || name === 'on_hand') {
          available += qty;
        } else if (name === 'reserved' || name === 'committed') {
          reserved += qty;
        } else if (name === 'incoming') {
          inbound += qty;
        }
      }
    }

    return {
      offerId,
      storeId: ctx.storeId,
      available,
      reserved,
      inbound,
      daysOfStock: null,
    };
  }
}
