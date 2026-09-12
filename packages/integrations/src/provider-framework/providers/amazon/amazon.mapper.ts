export interface CanonicalMarketplaceParticipation {
  marketplaceId: string;
  countryCode?: string;
  name?: string;
  defaultCurrencyCode?: string;
  defaultLanguageCode?: string;
  isParticipating?: boolean;
}

export interface CanonicalListing {
  sellerSku: string;
  asin?: string;
  title?: string;
  status?: string;
  price?: number;
  currencyCode?: string;
}

export interface CanonicalOrderItem {
  sellerSku?: string;
  asin?: string;
  quantity: number;
  unitPrice?: number;
  title?: string;
}

export interface CanonicalOrder {
  amazonOrderId: string;
  status?: string;
  totalAmount?: number;
  currencyCode?: string;
  purchaseDate: string;
  marketplaceId?: string;
  items: CanonicalOrderItem[];
}

export interface CanonicalInventory {
  sellerSku: string;
  asin?: string;
  fulfillableQuantity: number;
  reservedQuantity: number;
  inboundQuantity: number;
  unfulfillableQuantity: number;
  observedAt: string;
}

export interface CanonicalFinancialEvent {
  postedDate?: string;
  amount: number;
  currencyCode?: string;
  type?: string;
  description?: string;
}

export function mapParticipations(raw: any): CanonicalMarketplaceParticipation[] {
  const list = raw?.payload || raw?.marketplaceParticipations || [];
  return (Array.isArray(list) ? list : []).map((row: any) => ({
    marketplaceId: row.marketplace?.id || row.marketplaceId,
    countryCode: row.marketplace?.countryCode,
    name: row.marketplace?.name,
    defaultCurrencyCode: row.marketplace?.defaultCurrencyCode,
    defaultLanguageCode: row.marketplace?.defaultLanguageCode,
    isParticipating: row.participation?.isParticipating ?? true,
  }));
}

export function mapListingsSearch(raw: any): CanonicalListing[] {
  const items = raw?.items || raw?.payload?.items || [];
  return (Array.isArray(items) ? items : []).map((item: any) => mapListing(item));
}

export function mapListing(item: any): CanonicalListing {
  const summaries = item?.summaries || [];
  const summary = summaries[0] || {};
  const offers = item?.offers || [];
  const price = offers[0]?.price?.amount ?? summary?.price?.amount;
  return {
    sellerSku: item?.sku || item?.sellerSku || summary?.sku,
    asin: summary?.asin || item?.asin,
    title: summary?.itemName || item?.title,
    status: summary?.status || item?.status,
    price: price != null ? Number(price) : undefined,
    currencyCode: offers[0]?.price?.currencyCode || summary?.price?.currencyCode,
  };
}

export function mapCatalogItem(raw: any, asin?: string): CanonicalListing {
  const item = raw?.payload || raw;
  const summaries = item?.summaries || [];
  return {
    sellerSku: item?.sku || '',
    asin: item?.asin || asin,
    title: summaries[0]?.itemName,
    status: 'ACTIVE',
  };
}

export function mapOrders(raw: any): CanonicalOrder[] {
  const orders = raw?.payload?.Orders || raw?.orders || raw?.payload?.orders || [];
  return (Array.isArray(orders) ? orders : []).map((o: any) => mapOrder(o));
}

export function mapOrder(o: any): CanonicalOrder {
  const itemsRaw = o?.OrderItems || o?.items || [];
  return {
    amazonOrderId: o?.AmazonOrderId || o?.amazonOrderId,
    status: o?.OrderStatus || o?.status,
    totalAmount: o?.OrderTotal?.Amount != null ? Number(o.OrderTotal.Amount) : undefined,
    currencyCode: o?.OrderTotal?.CurrencyCode,
    purchaseDate: o?.PurchaseDate || o?.purchaseDate,
    marketplaceId: o?.MarketplaceId || o?.marketplaceId,
    items: (Array.isArray(itemsRaw) ? itemsRaw : []).map((it: any) => ({
      sellerSku: it?.SellerSKU || it?.sellerSku,
      asin: it?.ASIN || it?.asin,
      quantity: Number(it?.QuantityOrdered || it?.quantity || 0),
      unitPrice: it?.ItemPrice?.Amount != null ? Number(it.ItemPrice.Amount) : undefined,
      title: it?.Title || it?.title,
    })),
  };
}

export function mapInventorySummaries(raw: any): CanonicalInventory[] {
  const summaries = raw?.payload?.inventorySummaries || raw?.inventorySummaries || [];
  const observedAt = new Date().toISOString();
  return (Array.isArray(summaries) ? summaries : []).map((row: any) => {
    const details = row?.inventoryDetails || {};
    return {
      sellerSku: row?.sellerSku,
      asin: row?.asin,
      fulfillableQuantity: Number(details?.fulfillableQuantity ?? row?.fulfillableQuantity ?? 0),
      reservedQuantity: Number(details?.reservedQuantity?.totalReservedQuantity ?? 0),
      inboundQuantity: Number(
        (details?.inboundWorkingQuantity || 0) + (details?.inboundShippedQuantity || 0) + (details?.inboundReceivingQuantity || 0),
      ),
      unfulfillableQuantity: Number(details?.unfulfillableQuantity ?? 0),
      observedAt,
    };
  });
}

export function mapFinances(raw: any): CanonicalFinancialEvent[] {
  const txns = raw?.payload?.transactions || raw?.transactions || [];
  return (Array.isArray(txns) ? txns : []).map((t: any) => ({
    postedDate: t?.postedDate || t?.PostedDate,
    amount: Number(t?.totalAmount?.currencyAmount ?? t?.amount ?? 0),
    currencyCode: t?.totalAmount?.currencyCode || t?.currencyCode,
    type: t?.transactionType || t?.description,
    description: t?.description,
  }));
}
