export type CommercePlatform = 'amazon' | 'shopify' | 'simulator';

export interface CommerceContext {
  workspaceId: string;
  storeId: string;
  traceId: string;
}

export interface ChannelIdentityView {
  type: string;
  id: string;
}

export interface CanonicalProduct {
  id: string;
  workspaceId: string;
  storeId: string;
  platform: CommercePlatform;
  title: string;
  sku: string;
  category: string;
  price: number;
  cost: number | null;
  identities: ChannelIdentityView[];
}

export interface CanonicalProductPatch {
  title?: string;
  price?: number;
}

export interface CanonicalOrderItem {
  offerId: string;
  quantity: number;
  unitPrice: number;
}

export interface CanonicalOrder {
  id: string;
  storeId: string;
  platform: CommercePlatform;
  externalOrderId: string;
  items: CanonicalOrderItem[];
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
}

export interface OrderQuery {
  from?: Date;
  to?: Date;
  status?: string;
  limit?: number;
}

export interface CanonicalInventory {
  offerId: string;
  storeId: string;
  available: number;
  reserved: number;
  inbound: number;
  daysOfStock: number | null;
}

export interface CanonicalCampaign {
  id: string;
  storeId: string;
  platform: CommercePlatform;
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  acos: number | null;
  roas: number | null;
}

export interface BidTarget {
  campaignId: string;
  keyword?: string;
}

export interface AdapterWriteResult {
  ok: boolean;
  code: string;
  message: string;
  retryable: boolean;
}

export interface CanonicalProfit {
  offerId: string;
  storeId: string;
  period: string;
  revenue: number;
  cogs: number;
  advertisingCost: number;
  fees: number;
  profit: number;
  margin: number | null;
}

export interface ProfitQuery {
  from?: Date;
  to?: Date;
  offerId?: string;
}

export function createCommerceContext(
  workspaceId: string,
  storeId: string,
  traceId = 'trace',
): CommerceContext {
  return { workspaceId, storeId, traceId };
}

export interface AdapterCapabilities {
  supportedActions: string[];
  executionMode: 'mock' | 'simulator' | 'live';
  constraints: Record<string, unknown>;
  dataFreshness: string;
}
