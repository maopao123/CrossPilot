export interface ErpScope {
  workspaceId: string;
  connectionId?: string;
  tenantId?: string;
}

export interface ErpOrderLine {
  skuId: string;
  skuName?: string;
  quantity: number;
  unitCostMinor: number;
  expectedDeliveryDate?: string;
}

export interface ErpCreateCommand {
  scope: ErpScope;
  operationId: string;
  idempotencyKey: string;
  supplierId: string;
  warehouseId?: string;
  currency?: string;
  lines: ErpOrderLine[];
  notes?: string;
}

export type ErpPurchaseOrderStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'PARTIALLY_RECEIVED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface ErpPurchaseOrder {
  externalId: string;
  operationId?: string;
  idempotencyKey?: string;
  supplierId: string;
  warehouseId?: string;
  status: ErpPurchaseOrderStatus;
  lines: ErpOrderLine[];
  totalAmountMinor: number;
  currency?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ErpLookup {
  scope: ErpScope;
  externalId?: string;
  operationId?: string;
  idempotencyKey?: string;
}

export interface ErpInventoryItem {
  skuId: string;
  warehouseId?: string;
  available: number;
  inbound: number;
  reserved: number;
  updatedAt?: string;
}

export interface ErpReceiptLine {
  skuId: string;
  receivedQuantity: number;
  rejectedQuantity?: number;
  unitCostMinor?: number;
}

export interface ErpReceiptCommand {
  scope: ErpScope;
  externalReceiptId: string;
  purchaseOrderId: string;
  lines: ErpReceiptLine[];
  receivedAt?: string;
  notes?: string;
}

export interface ErpReceiptRecord {
  externalReceiptId: string;
  purchaseOrderId: string;
  lines: ErpReceiptLine[];
  receivedAt: string;
}

export type ErpErrorCode =
  | 'AUTH_FAILED'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'UNKNOWN_ERROR';

export interface ErpResult<T> {
  success: boolean;
  data?: T;
  errorCode?: ErpErrorCode;
  errorMessage?: string;
  statusCode?: number;
  rawResponse?: unknown;
}
