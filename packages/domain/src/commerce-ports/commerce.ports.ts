import type {
  AdapterWriteResult,
  BidTarget,
  CanonicalCampaign,
  CanonicalInventory,
  CanonicalOrder,
  CanonicalProduct,
  CanonicalProductPatch,
  CanonicalProfit,
  CommerceContext,
  CommercePlatform,
  OrderQuery,
  ProfitQuery,
} from './commerce.types.js';

export interface CatalogPort {
  listProducts(ctx: CommerceContext): Promise<CanonicalProduct[]>;
  getProduct(ctx: CommerceContext, offerId: string): Promise<CanonicalProduct | null>;
  updateProduct(ctx: CommerceContext, patch: CanonicalProductPatch): Promise<AdapterWriteResult>;
}

export interface OrderPort {
  listOrders(ctx: CommerceContext, query?: OrderQuery): Promise<CanonicalOrder[]>;
}

export interface InventoryPort {
  getInventory(ctx: CommerceContext, offerId: string): Promise<CanonicalInventory | null>;
}

export interface AdsPort {
  getCampaigns(ctx: CommerceContext): Promise<CanonicalCampaign[]>;
  decreaseBid(ctx: CommerceContext, target: BidTarget, pct: number): Promise<AdapterWriteResult>;
}

export interface ProfitPort {
  getDailyProfit(ctx: CommerceContext, query?: ProfitQuery): Promise<CanonicalProfit[]>;
}

/** Resource-level commerce adapter. Business code depends on this, not a platform SDK. */
export interface CommerceAdapter extends CatalogPort, OrderPort, InventoryPort, AdsPort, ProfitPort {
  readonly platform: CommercePlatform;
}
