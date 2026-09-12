/**
 * Commerce Simulator — shared types.
 *
 * Pure domain data structures: no NestJS, no Prisma, no I/O.
 * Row types (`Sim*Row`) mirror the Prisma models one-to-one by field name;
 * SKU references use `skuCode` (the persistence layer resolves it to `skuId`).
 */

export type SimChannel = 'amazon' | 'shopify';
export type SimEventSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type SimEventStatus = 'ACTIVE' | 'RESOLVED' | 'COMPLETED';
export type SimOrderStatus = 'PENDING' | 'UNSHIPPED' | 'PARTIALLY_SHIPPED' | 'SHIPPED' | 'CANCELLED';
export type SimReviewSourceType = 'AMAZON' | 'SHOPIFY';

// ==========================================
// Configuration
// ==========================================

export interface SimSkuConfig {
  skuCode: string;
  asin?: string;
  baseDailySales: number;
  price: number;
  /** Reference price for elasticity; priceFactor = (price / referencePrice) ^ priceElasticity. */
  referencePrice: number;
  priceElasticity: number;
  /** Channel split of units sold; amazon + shopify must sum to 1. */
  channelMix: { amazon: number; shopify: number };
  /** Average listing rating, 1..5. */
  rating: number;
  /** Product quality 0..1; drives negative review probability. */
  qualityScore: number;
  leadTimeDays: number;
  reorderPoint: number;
  reorderQuantity: number;
  initialInventory: number;
}

export interface SimConfig {
  skus: SimSkuConfig[];
  /** Length 7, index 0 = Sunday (Date.getDay()). */
  weekdayFactors: number[];
  seasonAmplitude: number;
  seasonPeriodDays: number;
  /** Symmetric uniform noise on daily demand, e.g. 0.15 = ±15%. */
  noiseAmplitude: number;
  /** Global scale on per-template daily spawn probability (0 disables random events). */
  eventDailyProbability: number;
  /** Probability that a single order produces a review. */
  reviewProbability: number;
}

// ==========================================
// Runtime world state (JSON-serializable)
// ==========================================

export interface SimInboundShipment {
  quantity: number;
  arriveDayIndex: number;
}

export interface SimSkuState {
  skuCode: string;
  fulfillable: number;
  inboundShipments: SimInboundShipment[];
  cumulativeUnitsSold: number;
  cumulativeUnitsReceived: number;
  /** Exponential moving average of units sold per day. */
  avgDailySales: number;
  lowStockActive: boolean;
  stockoutActive: boolean;
}

/** Multiplicative effects applied to the sales / ads / review engines. */
export interface EventMultipliers {
  sales: number;
  adsSpend: number;
  adConversion: number;
  negativeReview: number;
}

export interface ActiveSimEvent {
  code: string;
  skuCode?: string;
  severity: SimEventSeverity;
  title: string;
  description: string;
  startDayIndex: number;
  endDayIndex: number;
  multipliers: EventMultipliers;
  /** Whether the 'ACTIVE' SimulationEvent row has been emitted. */
  emitted: boolean;
}

export interface SimWorldState {
  /** Current simulated date, 'YYYY-MM-DD' (UTC). */
  simDate: string;
  dayIndex: number;
  rngSeed: number;
  skus: SimSkuState[];
  activeEvents: ActiveSimEvent[];
}

// ==========================================
// Output rows ("待写入数据集", map 1:1 onto Prisma models)
// ==========================================

/** → Order + OrderItem */
export interface SimOrderItemRow {
  skuCode: string;
  quantity: number;
  unitPrice: number;
}

export interface SimOrderRow {
  /** Format: SIM-{yyyymmdd}-{seq, 4 digits}, unique within the day. */
  orderNumber: string;
  channel: SimChannel;
  status: SimOrderStatus;
  totalAmount: number;
  currencyCode: string;
  orderedAt: Date;
  items: SimOrderItemRow[];
}

/** → InventorySnapshot */
export interface SimInventorySnapshotRow {
  skuCode: string;
  snapshotDate: Date;
  fulfillable: number;
  reserved: number;
  inbound: number;
  unfulfillable: number;
  daysCover: number;
}

/** → InventoryBalance (latest values, upsert target) */
export interface SimInventoryBalanceRow {
  skuCode: string;
  warehouseType: 'FBA';
  fulfillableQuantity: number;
  reservedQuantity: number;
  inboundQuantity: number;
  unfulfillableQuantity: number;
}

/** → Review */
export interface SimReviewRow {
  skuCode: string;
  asin?: string;
  rating: number;
  title?: string;
  content: string;
  reviewerName?: string;
  reviewDate: Date;
  isVerified: boolean;
  sourceType: SimReviewSourceType;
}

/** → AdMetricDaily (campaignId is assigned by the persistence layer) */
export interface SimAdMetricRow {
  skuCode: string;
  metricDate: Date;
  impressions: number;
  clicks: number;
  spend: number;
  orders: number;
  sales: number;
}

/** → ChannelDailyMetric */
export interface SimChannelMetricRow {
  skuCode: string;
  channel: SimChannel;
  metricDate: Date;
  sessions: number;
  addToCart: number;
  checkout: number;
  orders: number;
  conversionRate: number;
  bounceRate: number;
  revenue: number;
}

/** → SimulationEvent */
export interface SimEventRow {
  skuCode?: string;
  simDate: Date;
  code: string;
  severity: SimEventSeverity;
  title: string;
  description: string;
  status: SimEventStatus;
}

/** Per-SKU channel order counts for the day; input to inventory/review/ads/funnel engines. */
export interface SkuChannelSales {
  skuCode: string;
  amazonOrders: number;
  shopifyOrders: number;
  /** Units actually sold (after stockout capping). */
  unitsSold: number;
  /** Units the market wanted before stockout capping. */
  unitsDemanded: number;
}

export interface DaySimulationOutput {
  simDate: string;
  dayIndex: number;
  orders: SimOrderRow[];
  inventorySnapshots: SimInventorySnapshotRow[];
  inventoryBalances: SimInventoryBalanceRow[];
  reviews: SimReviewRow[];
  adMetrics: SimAdMetricRow[];
  channelMetrics: SimChannelMetricRow[];
  events: SimEventRow[];
  salesSummary: SkuChannelSales[];
  activeEvents: ActiveSimEvent[];
}

// ==========================================
// Sim date helpers (UTC, 'YYYY-MM-DD')
// ==========================================

export function parseSimDate(simDate: string): { year: number; month: number; day: number } {
  const [year, month, day] = simDate.split('-').map((part) => Number.parseInt(part, 10));
  return { year, month, day };
}

export function simDateToUtcDate(simDate: string, hour = 0, minute = 0): Date {
  const { year, month, day } = parseSimDate(simDate);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
}

export function addDaysToSimDate(simDate: string, days: number): string {
  const date = simDateToUtcDate(simDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

export function simDateCompact(simDate: string): string {
  return simDate.replace(/-/g, '');
}

export function dayOfWeek(simDate: string): number {
  return simDateToUtcDate(simDate).getUTCDay();
}
