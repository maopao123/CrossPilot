import { PrismaClient } from '@prisma/client';
import {
  ErrorCodes,
  getAutomationTimeoutConfig,
  combineAbortSignals,
  runtimeLogger,
  RuntimeEvents,
  runtimeMetrics,
} from '@crosspilot/shared';
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

export interface ShopifyGraphQLRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  traceId?: string;
  operationId?: string;
  workspaceId?: string;
}

export interface ShopifyGraphQLTransport {
  execute<T = any>(
    shop: string,
    accessToken: string,
    query: string,
    variables?: Record<string, unknown>,
    options?: ShopifyGraphQLRequestOptions,
  ): Promise<ShopifyGraphQLResponse<T>>;
}

export interface ShopifyTokenExchangeResult {
  accessToken: string;
  expiresIn: number;
}

export interface ShopifyTokenExchangeOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

export type ShopifyTokenExchanger = (
  shop: string,
  clientId: string,
  clientSecret: string,
  options?: ShopifyTokenExchangeOptions,
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

/**
 * Strict RFC-compliant validator and normalizer for Shopify shop subdomain.
 * Only alphanumeric characters and hyphens are permitted (e.g. 'crosspilot-dev').
 * Forbids dots, slashes, port numbers, or external hostnames to prevent token leakage.
 */
export function validateAndNormalizeShopSubdomain(raw: string): string {
  if (!raw || typeof raw !== 'string') {
    throw new CommercePortError(
      'CONFIG_ERROR',
      'Shopify shop domain is required (e.g. crosspilot-dev)',
      false,
    );
  }
  const clean = raw
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\.myshopify\.com\/?$/i, '')
    .replace(/\/.*$/, '')
    .trim();

  const SUBDOMAIN_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/;
  if (!SUBDOMAIN_REGEX.test(clean) || clean.includes('.')) {
    throw new CommercePortError(
      'CONFIG_ERROR',
      `Invalid Shopify shop subdomain "${raw}". Shop must be a valid subdomain containing only letters, numbers, and hyphens without dots or arbitrary domains.`,
      false,
    );
  }
  return clean;
}

/**
 * Default live HTTP transport for Shopify Admin GraphQL API (default: 2026-07).
 */
export class HttpShopifyGraphQLTransport implements ShopifyGraphQLTransport {
  constructor(
    private readonly apiVersion = '2026-07',
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async execute<T = any>(
    shop: string,
    accessToken: string,
    query: string,
    variables?: Record<string, unknown>,
    options?: ShopifyGraphQLRequestOptions,
  ): Promise<ShopifyGraphQLResponse<T>> {
    const startTime = Date.now();
    try {
      const res = await this.doExecute<T>(shop, accessToken, query, variables, options, startTime);
      runtimeMetrics.recordAdapterRequest({
        provider: 'shopify',
        status: 'success',
        errorClass: 'none',
        durationSeconds: (Date.now() - startTime) / 1000,
      });
      return res;
    } catch (err: any) {
      const durationSeconds = (Date.now() - startTime) / 1000;
      let status: 'failed' | 'timeout' | 'cancelled' = 'failed';
      let errorClass = 'PROVIDER_ERROR';

      if (err?.code === 'CANCELLED' || options?.signal?.aborted) {
        status = 'cancelled';
        errorClass = 'TIMEOUT';
      } else if (err?.code === 'TIMEOUT' || err?.name === 'TimeoutError') {
        status = 'timeout';
        errorClass = 'TIMEOUT';
        runtimeMetrics.recordTimeout({ provider: 'shopify' });
      } else if (err?.code === ErrorCodes.AUTH_REQUIRED) {
        errorClass = 'AUTH';
      } else if (err?.code === 'PROVIDER_RATE_LIMIT') {
        errorClass = 'RATE_LIMIT';
      }

      runtimeMetrics.recordAdapterRequest({
        provider: 'shopify',
        status,
        errorClass,
        durationSeconds,
      });

      throw err;
    }
  }

  private async doExecute<T = any>(
    shop: string,
    accessToken: string,
    query: string,
    variables: Record<string, unknown> | undefined,
    options: ShopifyGraphQLRequestOptions | undefined,
    startTime: number,
  ): Promise<ShopifyGraphQLResponse<T>> {
    const subdomain = validateAndNormalizeShopSubdomain(shop);
    const url = `https://${subdomain}.myshopify.com/admin/api/${this.apiVersion}/graphql.json`;
    const timeoutConfig = getAutomationTimeoutConfig();
    const timeoutMs = options?.timeoutMs ?? timeoutConfig.httpTimeoutMs;

    const combined = combineAbortSignals([options?.signal], timeoutMs);
    const shopifyLogger = runtimeLogger.child({
      service: 'shopify-adapter',
      provider: 'shopify',
      shopSubdomain: subdomain,
      traceId: options?.traceId,
      operationId: options?.operationId,
      workspaceId: options?.workspaceId,
    });

    shopifyLogger.debug({
      event: RuntimeEvents.ADAPTER_REQUEST_STARTED,
    });

    try {
      const res = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({ query, variables }),
        signal: combined.signal,
      });

      if (res.status === 429) {
        shopifyLogger.warn({
          event: RuntimeEvents.ADAPTER_REQUEST_FAILED,
          durationMs: Date.now() - startTime,
          errorClass: 'RATE_LIMIT',
          errorCode: 'PROVIDER_RATE_LIMIT',
        });
        throw new CommercePortError('PROVIDER_RATE_LIMIT', 'Shopify rate limit exceeded', true);
      }
      if (res.status === 401 || res.status === 403) {
        shopifyLogger.warn({
          event: RuntimeEvents.ADAPTER_REQUEST_FAILED,
          durationMs: Date.now() - startTime,
          errorClass: 'AUTH',
          errorCode: ErrorCodes.AUTH_REQUIRED,
        });
        throw new CommercePortError(
          ErrorCodes.AUTH_REQUIRED,
          'Shopify authentication failed / access token invalid or expired',
          false,
        );
      }
      if (!res.ok) {
        shopifyLogger.warn({
          event: RuntimeEvents.ADAPTER_REQUEST_FAILED,
          statusCode: res.status,
          durationMs: Date.now() - startTime,
        });
        throw new CommercePortError(
          ErrorCodes.PROVIDER_UNAVAILABLE,
          `Shopify GraphQL returned HTTP ${res.status}: ${res.statusText}`,
          res.status >= 500,
        );
      }

      const json = (await res.json()) as ShopifyGraphQLResponse<T>;
      if (json.errors && json.errors.length > 0) {
        const firstErr = json.errors[0];
        const errMsg = firstErr.message || 'Shopify GraphQL Error';
        const code = String(firstErr.extensions?.code || '').toUpperCase();
        const isThrottled =
          errMsg.toLowerCase().includes('throttled') ||
          code === 'THROTTLED';
        if (isThrottled) {
          shopifyLogger.warn({
            event: RuntimeEvents.ADAPTER_REQUEST_FAILED,
            durationMs: Date.now() - startTime,
            errorClass: 'RATE_LIMIT',
            errorCode: 'PROVIDER_RATE_LIMIT',
          });
          throw new CommercePortError('PROVIDER_RATE_LIMIT', errMsg, true);
        }
        const isAuth =
          errMsg.toLowerCase().includes('access denied') ||
          errMsg.toLowerCase().includes('unauthorized') ||
          code === 'ACCESS_DENIED' ||
          code === 'UNAUTHORIZED';
        if (isAuth) {
          shopifyLogger.warn({
            event: RuntimeEvents.ADAPTER_REQUEST_FAILED,
            durationMs: Date.now() - startTime,
            errorClass: 'AUTH',
            errorCode: ErrorCodes.AUTH_REQUIRED,
          });
          throw new CommercePortError(ErrorCodes.AUTH_REQUIRED, errMsg, false);
        }
        shopifyLogger.warn({
          event: RuntimeEvents.ADAPTER_REQUEST_FAILED,
          durationMs: Date.now() - startTime,
        });
        throw new CommercePortError('COMMERCE_PORT_ERROR', errMsg, false);
      }

      shopifyLogger.debug({
        event: RuntimeEvents.ADAPTER_REQUEST_COMPLETED,
        durationMs: Date.now() - startTime,
      });

      return json;
    } catch (err: any) {
      if (err instanceof CommercePortError) {
        throw err;
      }
      if (combined.isTimedOut() || err?.name === 'TimeoutError') {
        shopifyLogger.warn({
          event: RuntimeEvents.ADAPTER_REQUEST_TIMEOUT,
          timeoutMs,
          durationMs: Date.now() - startTime,
          errorClass: 'TIMEOUT',
          errorCode: 'TIMEOUT',
          retryable: false,
          effect: 'UNKNOWN',
          recovery: 'QUERY',
        });
        throw new CommercePortError(
          'TIMEOUT',
          `Shopify GraphQL request timed out after ${timeoutMs}ms`,
          false,
        );
      }
      if (combined.isCancelled() || err?.name === 'AbortError') {
        shopifyLogger.warn({
          event: RuntimeEvents.ADAPTER_REQUEST_CANCELLED,
          durationMs: Date.now() - startTime,
          errorClass: 'TIMEOUT',
          errorCode: 'CANCELLED',
          retryable: false,
        });
        throw new CommercePortError(
          'CANCELLED',
          'Shopify GraphQL request was cancelled by caller',
          false,
        );
      }
      shopifyLogger.error({
        event: RuntimeEvents.ADAPTER_REQUEST_FAILED,
        durationMs: Date.now() - startTime,
        error: err,
      });
      throw new CommercePortError(
        ErrorCodes.PROVIDER_UNAVAILABLE,
        `Failed to reach Shopify GraphQL API: ${err?.message || String(err)}`,
        true,
      );
    } finally {
      combined.cleanup();
    }
  }
}

/**
 * Default live token exchanger using Shopify OAuth Client Credentials Grant.
 */
export async function defaultShopifyTokenExchanger(
  shop: string,
  clientId: string,
  clientSecret: string,
  options?: ShopifyTokenExchangeOptions,
): Promise<ShopifyTokenExchangeResult> {
  const subdomain = validateAndNormalizeShopSubdomain(shop);
  const url = `https://${subdomain}.myshopify.com/admin/oauth/access_token`;
  const timeoutConfig = getAutomationTimeoutConfig();
  const timeoutMs = options?.timeoutMs ?? timeoutConfig.httpTimeoutMs;

  const combined = combineAbortSignals([options?.signal], timeoutMs);

  const bodyParams = new URLSearchParams();
  bodyParams.append('grant_type', 'client_credentials');
  bodyParams.append('client_id', clientId);
  bodyParams.append('client_secret', clientSecret);

  const fetchFn = options?.fetchFn ?? fetch;
  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: bodyParams.toString(),
      signal: combined.signal,
    });

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
  } catch (err: any) {
    if (err instanceof CommercePortError) {
      throw err;
    }
    if (combined.isTimedOut() || err?.name === 'TimeoutError') {
      throw new CommercePortError(
        'TIMEOUT',
        `Shopify token exchange timed out after ${timeoutMs}ms`,
        false,
      );
    }
    if (combined.isCancelled() || err?.name === 'AbortError') {
      throw new CommercePortError(
        'CANCELLED',
        'Shopify token exchange was cancelled by caller',
        false,
      );
    }
    throw new CommercePortError(
      ErrorCodes.PROVIDER_UNAVAILABLE,
      `Shopify token exchange network failure: ${err?.message || String(err)}`,
      true,
    );
  } finally {
    combined.cleanup();
  }
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
    const options: ShopifyGraphQLRequestOptions = {
      signal: ctx?.signal,
      timeoutMs: ctx?.timeoutMs,
      traceId: ctx?.traceId,
      workspaceId: ctx?.workspaceId,
    };
    const token = await this.getAccessToken(bound.shop, bound.clientId, bound.clientSecret, options);

    const query = `
      query ListProducts($first: Int!, $after: String) {
        products(first: $first, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            title
            handle
            status
            productType
            variants(first: 100) {
              pageInfo {
                hasNextPage
                endCursor
              }
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

    const productNodes: any[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;

    while (hasNextPage) {
      const res: ShopifyGraphQLResponse<any> = await this.executeGraphQL<any>(
        bound.shop,
        token,
        query,
        {
          first: 50,
          after: cursor,
        },
        options,
      );
      const page: any = res.data?.products;
      const nodes = Array.isArray(page?.nodes) ? page.nodes : (Array.isArray(page) ? page : []);
      for (const node of nodes) {
        if (node.variants?.pageInfo?.hasNextPage) {
          const allVariants = await this.fetchAllVariants(
            bound.shop,
            token,
            node.id,
            node.variants.nodes || [],
            node.variants.pageInfo.endCursor,
            options,
          );
          node.variants = {
            ...node.variants,
            nodes: allVariants,
          };
        }
        productNodes.push(node);
      }

      hasNextPage = Boolean(page?.pageInfo?.hasNextPage);
      cursor = page?.pageInfo?.endCursor || null;
      if (!cursor) break;
    }

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
    const options: ShopifyGraphQLRequestOptions = {
      signal: ctx?.signal,
      timeoutMs: ctx?.timeoutMs,
      traceId: ctx?.traceId,
      workspaceId: ctx?.workspaceId,
    };
    const token = await this.getAccessToken(bound.shop, bound.clientId, bound.clientSecret, options);

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
        const res = await this.executeGraphQL<any>(bound.shop, token, query, { id: offerId }, options);
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
            variants(first: 100) {
              pageInfo {
                hasNextPage
                endCursor
              }
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
        const res = await this.executeGraphQL<any>(bound.shop, token, query, { id: offerId }, options);
        const productNode = res.data?.product;
        if (!productNode) return null;
        if (productNode.variants?.pageInfo?.hasNextPage) {
          const allVariants = await this.fetchAllVariants(
            bound.shop,
            token,
            productNode.id,
            productNode.variants.nodes || [],
            productNode.variants.pageInfo.endCursor,
            options,
          );
          productNode.variants = {
            ...productNode.variants,
            nodes: allVariants,
          };
        }
        const canonicalProduct = this.productNodeToCanonicalProduct(ctx, productNode);
        const allVariantProducts = this.toProducts(ctx, productNode);
        if (this.persistIdentities) {
          await this.projectIdentities(ctx, [canonicalProduct, ...allVariantProducts]);
        }
        return canonicalProduct;
      } catch (err: any) {
        if (err instanceof CommercePortError && err.code === 'NOT_FOUND') return null;
        throw err;
      }
    }

    // 3. Search variant by SKU or secondary identifier (do not swallow auth/rate limit errors!)
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

    const res = await this.executeGraphQL<any>(bound.shop, token, searchQuery, {
      query: `sku:${offerId}`,
    }, options);
    const matchedVariant = res.data?.productVariants?.nodes?.[0];
    if (matchedVariant) {
      const product = this.variantToCanonicalProduct(ctx, matchedVariant.product, matchedVariant);
      if (this.persistIdentities) {
        await this.projectIdentities(ctx, [product]);
      }
      return product;
    }

    // 4. Try numeric variant ID fallback
    if (/^\d+$/.test(offerId)) {
      const numericRes = await this.getProduct(ctx, `gid://shopify/ProductVariant/${offerId}`);
      if (numericRes) return numericRes;
      const numericProductRes = await this.getProduct(ctx, `gid://shopify/Product/${offerId}`);
      if (numericProductRes) return numericProductRes;
    }

    return null;
  }

  async updateProduct(_ctx: CommerceContext, _patch: CanonicalProductPatch): Promise<AdapterWriteResult> {
    return writeForbiddenResult('updateProduct');
  }

  async listOrders(ctx: CommerceContext, query: OrderQuery = {}): Promise<CanonicalOrder[]> {
    const bound = await this.bind(ctx);
    const options: ShopifyGraphQLRequestOptions = {
      signal: ctx?.signal,
      timeoutMs: ctx?.timeoutMs,
      traceId: ctx?.traceId,
      workspaceId: ctx?.workspaceId,
    };
    const token = await this.getAccessToken(bound.shop, bound.clientId, bound.clientSecret, options);

    const filterParts: string[] = [];
    if (query.from) {
      filterParts.push(`created_at:>=${query.from.toISOString()}`);
    }
    if (query.to) {
      filterParts.push(`created_at:<=${query.to.toISOString()}`);
    }
    const queryString = filterParts.length > 0 ? filterParts.join(' AND ') : undefined;

    const graphql = `
      query ListOrders($first: Int!, $after: String, $query: String) {
        orders(first: $first, after: $after, query: $query) {
          pageInfo {
            hasNextPage
            endCursor
          }
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
            lineItems(first: 100) {
              pageInfo {
                hasNextPage
                endCursor
              }
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

    if (typeof query.limit === 'number' && query.limit <= 0) {
      return [];
    }

    const targetLimit = typeof query.limit === 'number' ? query.limit : Infinity;
    const pageSize = typeof query.limit === 'number' ? Math.min(query.limit, 100) : 50;

    const matchedOrders: CanonicalOrder[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;

    while (hasNextPage && matchedOrders.length < targetLimit) {
      const res: ShopifyGraphQLResponse<any> = await this.executeGraphQL<any>(bound.shop, token, graphql, {
        first: pageSize,
        after: cursor,
        query: queryString,
      }, options);

      const orderPage: any = res.data?.orders;
      const orderNodes = Array.isArray(orderPage?.nodes) ? orderPage.nodes : (Array.isArray(orderPage) ? orderPage : []);

      for (const row of orderNodes) {
        if (row.lineItems?.pageInfo?.hasNextPage) {
          const allLines = await this.fetchAllOrderLineItems(
            bound.shop,
            token,
            row.id,
            row.lineItems.nodes || [],
            row.lineItems.pageInfo.endCursor,
            options,
          );
          row.lineItems = {
            ...row.lineItems,
            nodes: allLines,
          };
        }
        const canonical = this.toOrder(ctx, row);

        // Explicit date bound filtering
        if (query.from && new Date(canonical.createdAt).getTime() < query.from.getTime()) {
          continue;
        }
        if (query.to && new Date(canonical.createdAt).getTime() > query.to.getTime()) {
          continue;
        }

        // Status filter applies BEFORE taking limit
        if (query.status && canonical.status !== query.status) {
          continue;
        }

        matchedOrders.push(canonical);
        if (matchedOrders.length >= targetLimit) {
          break;
        }
      }

      hasNextPage = Boolean(orderPage?.pageInfo?.hasNextPage);
      cursor = orderPage?.pageInfo?.endCursor || null;
      if (!cursor) break;
    }

    return matchedOrders;
  }

  async getInventory(ctx: CommerceContext, offerId: string): Promise<CanonicalInventory | null> {
    const bound = await this.bind(ctx);
    const options: ShopifyGraphQLRequestOptions = {
      signal: ctx?.signal,
      timeoutMs: ctx?.timeoutMs,
      traceId: ctx?.traceId,
      workspaceId: ctx?.workspaceId,
    };
    const token = await this.getAccessToken(bound.shop, bound.clientId, bound.clientSecret, options);

    // 1. Variant GID lookup
    if (offerId.startsWith('gid://shopify/ProductVariant/')) {
      const query = `
        query GetVariantInventory($id: ID!) {
          productVariant(id: $id) {
            id
            inventoryItem {
              id
              inventoryLevels(first: 50) {
                pageInfo {
                  hasNextPage
                  endCursor
                }
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
      const res = await this.executeGraphQL<any>(bound.shop, token, query, { id: offerId }, options);
      const variant = res.data?.productVariant;
      if (!variant?.inventoryItem) return null;
      let levels = Array.isArray(variant.inventoryItem.inventoryLevels?.nodes)
        ? variant.inventoryItem.inventoryLevels.nodes
        : (Array.isArray(variant.inventoryItem.inventoryLevels) ? variant.inventoryItem.inventoryLevels : []);
      if (variant.inventoryItem.inventoryLevels?.pageInfo?.hasNextPage) {
        levels = await this.fetchAllInventoryLevels(
          bound.shop,
          token,
          variant.inventoryItem.id,
          levels,
          variant.inventoryItem.inventoryLevels.pageInfo.endCursor,
          options,
        );
      }
      return this.toInventory(ctx, offerId, levels);
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
                  inventoryLevels(first: 50) {
                    pageInfo {
                      hasNextPage
                      endCursor
                    }
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
      const res = await this.executeGraphQL<any>(bound.shop, token, query, { id: offerId }, options);
      const variant = res.data?.product?.variants?.nodes?.[0];
      if (!variant?.inventoryItem) return null;
      let levels = Array.isArray(variant.inventoryItem.inventoryLevels?.nodes)
        ? variant.inventoryItem.inventoryLevels.nodes
        : (Array.isArray(variant.inventoryItem.inventoryLevels) ? variant.inventoryItem.inventoryLevels : []);
      if (variant.inventoryItem.inventoryLevels?.pageInfo?.hasNextPage) {
        levels = await this.fetchAllInventoryLevels(
          bound.shop,
          token,
          variant.inventoryItem.id,
          levels,
          variant.inventoryItem.inventoryLevels.pageInfo.endCursor,
          options,
        );
      }
      return this.toInventory(ctx, offerId, levels);
    }

    // 3. Search variant by SKU
    const searchQuery = `
      query SearchVariantInventory($query: String!) {
        productVariants(first: 1, query: $query) {
          nodes {
            id
            inventoryItem {
              id
              inventoryLevels(first: 50) {
                pageInfo {
                  hasNextPage
                  endCursor
                }
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
    const res = await this.executeGraphQL<any>(bound.shop, token, searchQuery, {
      query: `sku:${offerId}`,
    }, options);
    const variant = res.data?.productVariants?.nodes?.[0];
    if (variant?.inventoryItem) {
      let levels = Array.isArray(variant.inventoryItem.inventoryLevels?.nodes)
        ? variant.inventoryItem.inventoryLevels.nodes
        : (Array.isArray(variant.inventoryItem.inventoryLevels) ? variant.inventoryItem.inventoryLevels : []);
      if (variant.inventoryItem.inventoryLevels?.pageInfo?.hasNextPage) {
        levels = await this.fetchAllInventoryLevels(
          bound.shop,
          token,
          variant.inventoryItem.id,
          levels,
          variant.inventoryItem.inventoryLevels.pageInfo.endCursor,
          options,
        );
      }
      return this.toInventory(ctx, offerId, levels);
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
    const shop = validateAndNormalizeShopSubdomain(rawShop);

    return { store, account, shop, clientId, clientSecret };
  }

  private async getAccessToken(
    shop: string,
    clientId: string,
    clientSecret: string,
    options?: ShopifyTokenExchangeOptions,
  ): Promise<string> {
    const cacheKey = `${shop}:${clientId}`;
    const now = Date.now();
    const cached = ShopifyAdapter.tokenCache.get(cacheKey);

    // Use cached token if valid for more than 5 minutes
    if (cached && cached.expiresAt > now + 5 * 60 * 1000) {
      return cached.accessToken;
    }

    let exchanged: ShopifyTokenExchangeResult;
    try {
      exchanged = await this.exchangeToken(shop, clientId, clientSecret, options);
    } catch (err: any) {
      if (err instanceof CommercePortError) {
        throw err;
      }
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
    options?: ShopifyGraphQLRequestOptions,
  ): Promise<ShopifyGraphQLResponse<T>> {
    let res: ShopifyGraphQLResponse<T>;
    try {
      res = await this.transport.execute<T>(shop, accessToken, query, variables, options);
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

    if (res?.errors && res.errors.length > 0) {
      const firstErr = res.errors[0];
      const errMsg = firstErr.message || 'Shopify GraphQL capability execution error';
      const code = String(firstErr.extensions?.code || '').toUpperCase();
      const isThrottled =
        errMsg.toLowerCase().includes('throttled') ||
        code === 'THROTTLED';
      if (isThrottled) {
        throw new CommercePortError('PROVIDER_RATE_LIMIT', errMsg, true);
      }
      const isAuth =
        errMsg.toLowerCase().includes('access denied') ||
        errMsg.toLowerCase().includes('unauthorized') ||
        code === 'ACCESS_DENIED' ||
        code === 'UNAUTHORIZED';
      if (isAuth) {
        throw new CommercePortError(ErrorCodes.AUTH_REQUIRED, errMsg, false);
      }
      throw new CommercePortError('COMMERCE_PORT_ERROR', errMsg, false);
    }

    return res;
  }

  private async fetchAllVariants(
    shop: string,
    token: string,
    productId: string,
    initialVariants: any[],
    initialCursor?: string,
    options?: ShopifyGraphQLRequestOptions,
  ): Promise<any[]> {
    const allVariants = [...initialVariants];
    let cursor = initialCursor || null;
    let hasNext = true;

    const moreVariantsQuery = `
      query GetProductMoreVariants($id: ID!, $after: String) {
        product(id: $id) {
          variants(first: 100, after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
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
    `;

    while (hasNext && cursor) {
      const res: ShopifyGraphQLResponse<any> = await this.executeGraphQL<any>(
        shop,
        token,
        moreVariantsQuery,
        {
          id: productId,
          after: cursor,
        },
        options,
      );
      const page: any = res.data?.product?.variants;
      const nodes = Array.isArray(page?.nodes) ? page.nodes : [];
      allVariants.push(...nodes);
      hasNext = Boolean(page?.pageInfo?.hasNextPage);
      cursor = page?.pageInfo?.endCursor || null;
    }

    return allVariants;
  }

  private async fetchAllOrderLineItems(
    shop: string,
    token: string,
    orderId: string,
    initialLines: any[],
    initialCursor?: string,
    options?: ShopifyGraphQLRequestOptions,
  ): Promise<any[]> {
    const allLines = [...initialLines];
    let cursor = initialCursor || null;
    let hasNext = true;

    const moreLinesQuery = `
      query GetOrderMoreLineItems($id: ID!, $after: String) {
        order(id: $id) {
          lineItems(first: 100, after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
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
    `;

    while (hasNext && cursor) {
      const res: ShopifyGraphQLResponse<any> = await this.executeGraphQL<any>(
        shop,
        token,
        moreLinesQuery,
        {
          id: orderId,
          after: cursor,
        },
        options,
      );
      const page: any = res.data?.order?.lineItems;
      const nodes = Array.isArray(page?.nodes) ? page.nodes : [];
      allLines.push(...nodes);
      hasNext = Boolean(page?.pageInfo?.hasNextPage);
      cursor = page?.pageInfo?.endCursor || null;
    }

    return allLines;
  }

  private async fetchAllInventoryLevels(
    shop: string,
    token: string,
    inventoryItemId: string,
    initialLevels: any[],
    initialCursor?: string,
    options?: ShopifyGraphQLRequestOptions,
  ): Promise<any[]> {
    const allLevels = [...initialLevels];
    let cursor = initialCursor || null;
    let hasNext = true;

    const moreLevelsQuery = `
      query GetMoreInventoryLevels($id: ID!, $after: String) {
        inventoryItem(id: $id) {
          inventoryLevels(first: 50, after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              quantities(names: ["available", "incoming", "reserved", "on_hand", "committed"]) {
                name
                quantity
              }
            }
          }
        }
      }
    `;

    while (hasNext && cursor) {
      const res: ShopifyGraphQLResponse<any> = await this.executeGraphQL<any>(
        shop,
        token,
        moreLevelsQuery,
        {
          id: inventoryItemId,
          after: cursor,
        },
        options,
      );
      const page: any = res.data?.inventoryItem?.inventoryLevels;
      const nodes = Array.isArray(page?.nodes) ? page.nodes : [];
      allLevels.push(...nodes);
      hasNext = Boolean(page?.pageInfo?.hasNextPage);
      cursor = page?.pageInfo?.endCursor || null;
    }

    return allLevels;
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

  private productNodeToCanonicalProduct(ctx: CommerceContext, node: any): CanonicalProduct {
    const variants = Array.isArray(node?.variants?.nodes) ? node.variants.nodes : [];
    const firstVariant = variants[0];
    const price = firstVariant?.price != null ? round2(Number(firstVariant.price)) : 0;
    const sku = firstVariant?.sku || node.handle || String(node.id);

    const identities = [
      { type: 'shopify_product_id', id: String(node.id) },
      ...variants.flatMap((v: any) => [
        { type: 'shopify_variant_id', id: String(v.id) },
        ...(v.sku ? [{ type: 'shopify_sku', id: String(v.sku) }] : []),
      ]),
    ];

    return {
      id: String(node.id),
      workspaceId: ctx.workspaceId,
      storeId: ctx.storeId,
      platform: 'shopify',
      title: node.title || String(node.id),
      sku: String(sku),
      category: node.productType || '',
      price,
      cost: null,
      identities,
    };
  }

  private async projectIdentities(ctx: CommerceContext, products: CanonicalProduct[]): Promise<void> {
    for (const product of products) {
      for (const identity of product.identities) {
        const isProductLevel =
          identity.type === 'shopify_product_id' ||
          identity.id.startsWith('gid://shopify/Product/');

        const entityType = isProductLevel ? 'product' : 'offer';
        const entityId = isProductLevel
          ? (identity.type === 'shopify_product_id' ? identity.id : product.id)
          : (product.id.startsWith('gid://shopify/ProductVariant/') ? product.id : identity.id);

        try {
          await this.prisma.channelIdentity.upsert({
            where: {
              storeId_platform_entityType_externalId: {
                storeId: ctx.storeId,
                platform: 'shopify',
                entityType,
                externalId: identity.id,
              },
            },
            create: {
              storeId: ctx.storeId,
              platform: 'shopify',
              entityType,
              entityId,
              externalId: identity.id,
            },
            update: { entityId },
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
    let totalAvailable = 0;
    let totalReserved = 0;
    let totalInbound = 0;

    const levelRows = Array.isArray(levels) ? levels : [];
    for (const lvl of levelRows) {
      const quantities = Array.isArray(lvl?.quantities) ? lvl.quantities : [];
      const qtyMap = new Map<string, number>();
      for (const q of quantities) {
        if (q?.name) {
          qtyMap.set(String(q.name).toLowerCase(), Number(q.quantity || 0));
        }
      }

      // 1. Available: strictly prioritize 'available'. Only fallback to 'on_hand' if 'available' is not reported.
      // Never add available and on_hand together, because on_hand includes available plus committed.
      if (qtyMap.has('available')) {
        totalAvailable += qtyMap.get('available')!;
      } else if (qtyMap.has('on_hand')) {
        totalAvailable += qtyMap.get('on_hand')!;
      }

      // 2. Reserved: In Shopify, 'committed' (orders awaiting fulfillment) and 'reserved' (holds/drafts)
      // are distinct non-overlapping buckets. Sum both for canonical reserved inventory.
      const committed = qtyMap.get('committed') || 0;
      const reserved = qtyMap.get('reserved') || 0;
      totalReserved += committed + reserved;

      // 3. Inbound: Shopify uses 'incoming'
      if (qtyMap.has('incoming')) {
        totalInbound += qtyMap.get('incoming')!;
      }
    }

    return {
      offerId,
      storeId: ctx.storeId,
      available: totalAvailable,
      reserved: totalReserved,
      inbound: totalInbound,
      daysOfStock: null,
    };
  }
}
