import {
  CapabilityBinding,
  ProviderAdapter,
  ProviderExecutionContext,
  ProviderExecutionResult,
} from '../../core/provider.types.js';
import { SecretProvider } from '../../secrets/secret-provider.js';
import {
  AMAZON_MARKETPLACE_IDS,
  AMAZON_PROVIDER_ID,
  AmazonRegion,
  STORE_CAPABILITIES,
} from './amazon.config.js';
import { amazonAuthRequired } from './amazon.errors.js';
import { AmazonHttpClient } from './amazon.http.js';
import {
  mapCatalogItem,
  mapFinances,
  mapInventorySummaries,
  mapListing,
  mapListingsSearch,
  mapOrder,
  mapOrders,
  mapParticipations,
} from './amazon.mapper.js';

export interface AmazonTokenSource {
  getAccessToken(context: ProviderExecutionContext): Promise<string>;
}

export class AmazonProvider implements ProviderAdapter {
  readonly providerId = AMAZON_PROVIDER_ID;
  readonly transport = 'HTTP' as const;

  constructor(
    private readonly tokenSource?: AmazonTokenSource,
    private readonly fetchImpl?: typeof fetch,
  ) {}

  async execute(
    capabilityId: string,
    binding: CapabilityBinding,
    input: any,
    context: ProviderExecutionContext,
  ): Promise<ProviderExecutionResult<any>> {
    const started = Date.now();
    const fail = (error: { code: string; message: string; retryable?: boolean }): ProviderExecutionResult => ({
      success: false,
      error,
      providerId: this.providerId,
      transport: this.transport,
      capabilityId,
      durationMs: Date.now() - started,
      mode: 'DEGRADED',
      capturedAt: new Date().toISOString(),
    });

    const resolveToken = async (): Promise<string> => {
      if (this.tokenSource) return this.tokenSource.getAccessToken(context);
      const fromCtx = context.metadata && (context.metadata as any).amazonAccessToken;
      if (typeof fromCtx === 'string' && fromCtx.length > 0) return fromCtx;
      const err: any = new Error(amazonAuthRequired().message);
      err.code = 'AUTH_REQUIRED';
      throw err;
    };

    try {
      await resolveToken();
      const region = this.resolveRegion(input, context);
      const marketplaceId = this.resolveMarketplaceId(input, context);
      const client = new AmazonHttpClient({
        region,
        fetchImpl: this.fetchImpl,
        timeoutMs: 20000,
        getAccessToken: resolveToken,
      });

      const data = await this.dispatch(client, capabilityId, input, marketplaceId);
      return {
        success: true,
        data,
        providerId: this.providerId,
        transport: this.transport,
        capabilityId,
        durationMs: Date.now() - started,
        mode: 'LIVE',
        capturedAt: new Date().toISOString(),
        metadata: {
          region,
          marketplaceId,
          recordCount: Array.isArray(data) ? data.length : 1,
        },
      };
    } catch (err: any) {
      return fail({
        code: err.code || 'PROVIDER_EXECUTION_ERROR',
        message: SecretProvider.redact(err.message || 'Amazon provider failed'),
        retryable: Boolean(err.retryable),
      });
    }
  }

  private resolveRegion(input: any, context: ProviderExecutionContext): AmazonRegion {
    if (input?.region === 'NA' || input?.region === 'EU' || input?.region === 'FE') return input.region;
    const code = input?.marketplaceCode || context.marketplace || 'AMAZON_US';
    return AMAZON_MARKETPLACE_IDS[String(code).toUpperCase()]?.region || 'NA';
  }

  private resolveMarketplaceId(input: any, context: ProviderExecutionContext): string {
    if (input?.marketplaceId) return input.marketplaceId;
    const code = input?.marketplaceCode || context.marketplace || 'AMAZON_US';
    return AMAZON_MARKETPLACE_IDS[String(code).toUpperCase()]?.id || 'ATVPDKIKX0DER';
  }

  private async dispatch(
    client: AmazonHttpClient,
    capabilityId: string,
    input: any,
    marketplaceId: string,
  ): Promise<any> {
    switch (capabilityId) {
      case STORE_CAPABILITIES.participations:
        return mapParticipations(await client.getJson('/sellers/v1/marketplaceParticipations'));
      case STORE_CAPABILITIES.listingsSearch: {
        const sellerId = input?.sellingPartnerId;
        if (!sellerId) throw Object.assign(new Error('sellingPartnerId is required'), { code: 'INVALID_REQUEST' });
        const qs = new URLSearchParams({ marketplaceIds: marketplaceId, sellerId, pageSize: String(input?.pageSize || 20) });
        if (input?.nextToken) qs.set('pageToken', input.nextToken);
        return mapListingsSearch(await client.getJson(`/listings/2021-08-01/items?${qs.toString()}`));
      }
      case STORE_CAPABILITIES.listingsGet: {
        const sellerId = input?.sellingPartnerId;
        if (!sellerId) throw Object.assign(new Error('sellingPartnerId is required'), { code: 'INVALID_REQUEST' });
        const sku = encodeURIComponent(input?.sellerSku);
        return mapListing(
          await client.getJson(
            `/listings/2021-08-01/items/${sellerId}/${sku}?marketplaceIds=${marketplaceId}&includedData=summaries,offers,fulfillmentAvailability`,
          ),
        );
      }
      case STORE_CAPABILITIES.catalogGet:
        return mapCatalogItem(
          await client.getJson(`/catalog/2022-04-01/items/${input.asin}?marketplaceIds=${marketplaceId}`),
          input.asin,
        );
      case STORE_CAPABILITIES.ordersSearch: {
        const qs = new URLSearchParams({
          MarketplaceIds: marketplaceId,
          CreatedAfter: input?.createdAfter || new Date(Date.now() - 7 * 86400000).toISOString(),
        });
        if (input?.nextToken) qs.set('NextToken', input.nextToken);
        return mapOrders(await client.getJson(`/orders/2026-01-01/orders?${qs.toString()}`));
      }
      case STORE_CAPABILITIES.ordersGet:
        return mapOrder(await client.getJson(`/orders/2026-01-01/orders/${input.amazonOrderId}`));
      case STORE_CAPABILITIES.inventorySummaries: {
        const qs = new URLSearchParams({
          marketplaceIds: marketplaceId,
          granularityType: 'Marketplace',
          granularityId: marketplaceId,
        });
        return mapInventorySummaries(await client.getJson(`/fba/inventory/v1/summaries?${qs.toString()}`));
      }
      case STORE_CAPABILITIES.financesTransactions: {
        const qs = new URLSearchParams({
          postedAfter: input?.postedAfter || new Date(Date.now() - 7 * 86400000).toISOString(),
        });
        return mapFinances(await client.getJson(`/finances/2024-06-19/transactions?${qs.toString()}`));
      }
      default: {
        const err: any = new Error(`Unsupported Amazon capability ${capabilityId}`);
        err.code = 'WRITE_FORBIDDEN';
        throw err;
      }
    }
  }
}
