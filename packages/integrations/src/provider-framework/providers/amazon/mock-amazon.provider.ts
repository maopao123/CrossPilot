import {
  CapabilityBinding,
  ProviderAdapter,
  ProviderExecutionContext,
  ProviderExecutionResult,
} from '../../core/provider.types.js';
import { MOCK_AMAZON_PROVIDER_ID, STORE_CAPABILITIES } from './amazon.config.js';
import { MOCK_AMAZON_FIXTURES } from './amazon.fixtures.js';
import {
  mapCatalogItem,
  mapFinances,
  mapInventorySummaries,
  mapListing,
  mapListingsSearch,
  mapOrders,
  mapParticipations,
} from './amazon.mapper.js';

export class MockAmazonProvider implements ProviderAdapter {
  readonly providerId = MOCK_AMAZON_PROVIDER_ID;
  readonly transport = 'NATIVE' as const;

  async execute(
    capabilityId: string,
    _binding: CapabilityBinding,
    _input: any,
    _context: ProviderExecutionContext,
  ): Promise<ProviderExecutionResult<any>> {
    const started = Date.now();
    const data = this.fixtureFor(capabilityId);
    return {
      success: true,
      data,
      providerId: this.providerId,
      transport: this.transport,
      capabilityId,
      durationMs: Date.now() - started,
      mode: 'MOCK',
      capturedAt: new Date().toISOString(),
      metadata: { isMock: true, recordCount: Array.isArray(data) ? data.length : 1 },
    };
  }

  private fixtureFor(capabilityId: string): any {
    switch (capabilityId) {
      case STORE_CAPABILITIES.participations:
        return mapParticipations(MOCK_AMAZON_FIXTURES.participations);
      case STORE_CAPABILITIES.listingsSearch:
        return mapListingsSearch(MOCK_AMAZON_FIXTURES.listings);
      case STORE_CAPABILITIES.listingsGet:
        // Mirror AmazonProvider: single listing, not an array.
        return mapListing(MOCK_AMAZON_FIXTURES.listings.items[0]);
      case STORE_CAPABILITIES.catalogGet:
        // Mirror AmazonProvider: single catalog item, not an array.
        return mapCatalogItem(MOCK_AMAZON_FIXTURES.listings.items[0]);
      case STORE_CAPABILITIES.ordersSearch:
      case STORE_CAPABILITIES.ordersGet:
        return mapOrders(MOCK_AMAZON_FIXTURES.orders);
      case STORE_CAPABILITIES.inventorySummaries:
        return mapInventorySummaries(MOCK_AMAZON_FIXTURES.inventory);
      case STORE_CAPABILITIES.financesTransactions:
        return mapFinances(MOCK_AMAZON_FIXTURES.finances);
      default:
        return [];
    }
  }
}
