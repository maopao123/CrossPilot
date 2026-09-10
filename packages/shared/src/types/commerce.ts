export interface ProfitBreakdown {
  revenue: number;
  cogs: number;
  amazonFees: number;
  fbaFee: number;
  adsCost: number;
  returnLoss: number;
  otherCosts: number;
  netProfit: number;
  margin: number;
}

export type ProductStatus =
  | 'RESEARCHING'
  | 'VALIDATED'
  | 'DEVELOPING'
  | 'ACTIVE'
  | 'PAUSED'
  | 'ARCHIVED';

export type SkuStatus = 'ACTIVE' | 'INACTIVE' | 'DISCONTINUED';

export interface ProductFeatureInfo {
  id: string;
  name: string;
  value: string;
  unit?: string;
  isCore: boolean;
}

export interface SkuInfo {
  id: string;
  workspaceId: string;
  productId: string;
  skuCode: string;
  asin?: string;
  variantName: string;
  color?: string;
  size?: string;
  material?: string;
  weightKg?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  sellingPrice: number;
  currencyCode: string;
  status: SkuStatus;
}

export interface ProductInfo {
  id: string;
  workspaceId: string;
  marketplaceId: string;
  name: string;
  brand: string;
  category: string;
  subCategory?: string;
  status: ProductStatus;
  targetPrice?: number;
  description?: string;
  productBrief?: string;
  skus?: SkuInfo[];
  features?: ProductFeatureInfo[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface SupplierInfo {
  id: string;
  workspaceId: string;
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  leadTimeDays: number;
  status: string;
}

export interface SupplierSkuQuoteInfo {
  id: string;
  workspaceId: string;
  supplierId: string;
  skuId: string;
  unitCost: number;
  moq: number;
  currencyCode: string;
  effectiveDate: Date | string;
}

export interface PurchaseOrderItemInfo {
  id: string;
  purchaseOrderId: string;
  skuId: string;
  quantity: number;
  unitCost: number;
  receivedQuantity: number;
  skuCode?: string;
}

export interface PurchaseOrderInfo {
  id: string;
  workspaceId: string;
  supplierId: string;
  poNumber: string;
  status: string;
  totalAmount: number;
  currencyCode: string;
  orderDate: Date | string;
  expectedDeliveryDate?: Date | string;
  actualDeliveryDate?: Date | string;
  supplierName?: string;
  items?: PurchaseOrderItemInfo[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface OrderItemInfo {
  id: string;
  orderId: string;
  skuId: string;
  quantity: number;
  unitPrice: number;
  itemTax?: number;
  shippingFee?: number;
  skuCode?: string;
}

export interface OrderInfo {
  id: string;
  workspaceId: string;
  marketplaceId: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  currencyCode: string;
  orderedAt: Date | string;
  items?: OrderItemInfo[];
  createdAt: Date | string;
}

export interface InventoryBalanceInfo {
  id: string;
  workspaceId: string;
  skuId: string;
  skuCode?: string;
  warehouseType: string;
  fulfillableQuantity: number;
  reservedQuantity: number;
  inboundQuantity: number;
  unfulfillableQuantity: number;
  updatedAt: Date | string;
}

export interface ReturnRecordInfo {
  id: string;
  workspaceId: string;
  orderItemId: string;
  skuId: string;
  skuCode?: string;
  reason?: string;
  status: string;
  refundAmount: number;
  returnDate: Date | string;
}

export interface Sku360Overview {
  sku: SkuInfo;
  product: {
    id: string;
    name: string;
    brand: string;
    category: string;
  };
  inventory: {
    fulfillableQuantity: number;
    inboundQuantity: number;
    reservedQuantity: number;
    daysCover: number;
    reorderPoint: number;
    riskLevel: string;
  };
  quote?: {
    supplierId: string;
    supplierName?: string;
    unitCost: number;
    leadTimeDays: number;
  };
  salesSummary: {
    ordersCount: number;
    unitsSold: number;
    revenue: number;
  };
  profitSummary: ProfitBreakdown;
  returnsSummary: {
    count: number;
    refundTotal: number;
    returnRate: number;
  };
}
