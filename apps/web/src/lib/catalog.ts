import { ApiClient } from './api-client';

export interface CatalogSku {
  id: string;
  skuCode: string;
  variantName?: string;
  productName?: string;
  marketplaceId?: string;
}

export async function loadCatalogSkus(): Promise<{
  skus: CatalogSku[];
  marketplaceId?: string;
}> {
  const products = await ApiClient.get<any[]>('/api/v1/products');
  const list = Array.isArray(products) ? products : [];
  const skus: CatalogSku[] = [];
  for (const product of list) {
    for (const sku of product.skus || []) {
      skus.push({
        id: sku.id,
        skuCode: sku.skuCode,
        variantName: sku.variantName,
        productName: product.name,
        marketplaceId: product.marketplaceId,
      });
    }
  }
  return {
    skus,
    marketplaceId: list[0]?.marketplaceId,
  };
}

export function displayAmount(
  value: number | null | undefined,
  digits = 2,
): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return 'N/A';
  }
  return Number(value).toFixed(digits);
}

export function displayCount(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return 'N/A';
  }
  return String(value);
}

export function displayPercentFromRate(
  rate: number | null | undefined,
): string {
  if (rate === null || rate === undefined || Number.isNaN(Number(rate))) {
    return 'N/A';
  }
  return `${(Number(rate) * 100).toFixed(1)}%`;
}
