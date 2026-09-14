import type {
  ErpCreateCommand,
  ErpInventoryItem,
  ErpLookup,
  ErpPurchaseOrder,
  ErpReceiptCommand,
  ErpReceiptRecord,
  ErpResult,
} from '@crosspilot/shared';

export interface ERPPort {
  createPurchaseOrder(cmd: ErpCreateCommand): Promise<ErpResult<ErpPurchaseOrder>>;
  getPurchaseOrder(lookup: ErpLookup): Promise<ErpResult<ErpPurchaseOrder>>;
  getInventory(skuId: string, scope?: Record<string, unknown>): Promise<ErpResult<ErpInventoryItem>>;
  receivePurchaseOrder?(cmd: ErpReceiptCommand): Promise<ErpResult<ErpReceiptRecord>>;
}
