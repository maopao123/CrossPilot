import {
  CapabilityBinding,
  IntegrationProviderDefinition,
} from '../../core/provider.types.js';

export const AMAZON_PROVIDER_ID = 'amazon';
export const MOCK_AMAZON_PROVIDER_ID = 'mock-amazon';

export const AMAZON_SP_API_ENDPOINTS = {
  NA: 'https://sellingpartnerapi-na.amazon.com',
  EU: 'https://sellingpartnerapi-eu.amazon.com',
  FE: 'https://sellingpartnerapi-fe.amazon.com',
} as const;

export type AmazonRegion = keyof typeof AMAZON_SP_API_ENDPOINTS;

export const AMAZON_MARKETPLACE_IDS: Record<string, { id: string; region: AmazonRegion }> = {
  AMAZON_US: { id: 'ATVPDKIKX0DER', region: 'NA' },
  AMAZON_CA: { id: 'A2EUQ1WTGCTBG2', region: 'NA' },
  AMAZON_UK: { id: 'A1F83G8C2ARO7P', region: 'EU' },
  AMAZON_DE: { id: 'A1PA6795UKMFR9', region: 'EU' },
  AMAZON_JP: { id: 'A1VC38T7YXB528', region: 'FE' },
};

export const STORE_CAPABILITIES = {
  participations: 'store.account.participations',
  listingsSearch: 'store.listings.search',
  listingsGet: 'store.listings.get',
  catalogGet: 'store.catalog.get',
  ordersSearch: 'store.orders.search',
  ordersGet: 'store.orders.get',
  inventorySummaries: 'store.inventory.summaries',
  financesTransactions: 'store.finances.transactions',
} as const;

export const AMAZON_PROVIDER_DEFINITION: IntegrationProviderDefinition = {
  id: AMAZON_PROVIDER_ID,
  name: 'Amazon Selling Partner (SP-API)',
  category: 'STORE_COMMERCE',
  transport: 'HTTP',
  enabled: true,
  priority: 100,
  timeoutMs: 20000,
  retryPolicy: { maxAttempts: 2, backoffMs: 800 },
  authRef: 'AMAZON_LWA_CLIENT_ID',
  metadata: {
    readOnly: true,
    officialDocs: 'https://developer-docs.amazon.com/sp-api/',
  },
};

export const MOCK_AMAZON_PROVIDER_DEFINITION: IntegrationProviderDefinition = {
  id: MOCK_AMAZON_PROVIDER_ID,
  name: 'Amazon Store Mock (fixtures)',
  category: 'STORE_COMMERCE',
  transport: 'NATIVE',
  enabled: true,
  priority: 10,
  timeoutMs: 1000,
  metadata: { isMock: true, readOnly: true },
};

const STORE_CAPABILITY_IDS = Object.values(STORE_CAPABILITIES);

export const AMAZON_CAPABILITY_BINDINGS: CapabilityBinding[] = STORE_CAPABILITY_IDS.map(
  (capabilityId) => ({
    capabilityId,
    providerId: AMAZON_PROVIDER_ID,
    transport: 'HTTP' as const,
    enabled: true,
    priority: 100,
    metadata: { readOnly: true },
  }),
);

export const MOCK_AMAZON_CAPABILITY_BINDINGS: CapabilityBinding[] = STORE_CAPABILITY_IDS.map(
  (capabilityId) => ({
    capabilityId,
    providerId: MOCK_AMAZON_PROVIDER_ID,
    transport: 'NATIVE' as const,
    enabled: true,
    priority: 10,
    metadata: { isMock: true, readOnly: true },
  }),
);
