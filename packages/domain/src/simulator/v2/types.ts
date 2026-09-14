import { createHash } from 'crypto';

export type V2ActionType = 'DECREASE_BID' | 'STOP_CAMPAIGN';

export interface V2CampaignState {
  id: string;
  skuId: string;
  status: 'ACTIVE' | 'PAUSED';
  bidCents: number;
  dailyBudgetCents: number;
  targetVersion: number;
}

export interface V2SkuState {
  id: string;
  skuCode: string;
  priceCents: number;
  unitCostCents: number;
  available: number;
  reserved: number;
  unsellable: number;
}

export interface V2PendingOrder {
  id: string;
  skuId: string;
  skuCode: string;
  orderDate: string;
  shipDate: string;
  deliveryDate: string;
  priceCents: number;
  unitCostCents: number;
  channel: 'amazon' | 'shopify';
  source: 'organic' | 'ad';
  campaignId?: string;
  status: 'ORDERED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'RETURNED';
  refundDueDate?: string;
  refundAmountCents?: number;
  isRestockable?: boolean;
}

export interface V2PendingShipment {
  id: string;
  skuId: string;
  skuCode: string;
  quantity: number;
  arrivalDate: string;
  unitCostCents: number;
}

export interface V2PendingRefund {
  orderId: string;
  skuId: string;
  skuCode: string;
  refundDate: string;
  refundAmountCents: number;
  isRestockable: boolean;
  unitCostCents: number;
}

export interface V2WorldState {
  modelVersion: 'closed-loop-v2';
  runId: string;
  workspaceId: string;
  storeId: string;
  nextDate: string; // UTC YYYY-MM-DD
  completedThrough: string | null;
  stateVersion: number;
  seed: number;
  skus: V2SkuState[];
  campaigns: V2CampaignState[];
  pendingOrders: V2PendingOrder[];
  pendingShipments: V2PendingShipment[];
  pendingRefunds: V2PendingRefund[];
}

export interface V2ActionCommand {
  actionId: string;
  runId: string;
  storeId: string;
  actionType: V2ActionType;
  campaignId: string;
  expectedTargetVersion: number;
  percentage?: number;
  payloadHash: string;
}

export interface V2SkuConfig {
  skuCode: string;
  asin?: string;
  initialInventory: number;
  priceCents: number;
  referencePriceCents: number;
  priceElasticity: number;
  unitCostCents: number;
  baseNaturalSessions: number;
  baseNaturalCVR: number;
  referenceBidCents: number;
  referenceCpcCents: number;
  baseAdClicks: number;
  baseAdCVR: number;
  dailyBudgetCents: number;
  initialBidCents: number;
}

export interface V2Config {
  modelVersion: 'closed-loop-v2';
  seed: number;
  startDate: string; // UTC YYYY-MM-DD
  skus: V2SkuConfig[];
  platformFeeRate: number; // e.g. 0.15
  fbaFeeCents: number; // e.g. 450
  returnRate: number; // e.g. 0.05
  returnRestockableRate: number; // e.g. 0.8
  plannedShipments?: V2PendingShipment[];
  group?: 'CONTROL' | 'RULE' | 'CROSSPILOT';
}

export function canonicalStringify(data: unknown): string {
  if (data === null || typeof data !== 'object') {
    return JSON.stringify(data);
  }
  if (Array.isArray(data)) {
    return '[' + data.map(canonicalStringify).join(',') + ']';
  }
  const obj = data as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  return '{' + sortedKeys.map((k) => JSON.stringify(k) + ':' + canonicalStringify(obj[k])).join(',') + '}';
}

export function computeSha256(data: unknown): string {
  const str = typeof data === 'string' ? data : canonicalStringify(data);
  return createHash('sha256').update(str).digest('hex');
}

export function createDefaultV2Config(seed = 1001, startDate = '2026-09-01'): V2Config {
  return {
    modelVersion: 'closed-loop-v2',
    seed,
    startDate,
    platformFeeRate: 0.15,
    fbaFeeCents: 450,
    returnRate: 0.05,
    returnRestockableRate: 0.8,
    skus: [
      {
        skuCode: 'MTH-WHITE-001',
        asin: 'B0CHWHITE1',
        initialInventory: 500,
        priceCents: 2999,
        referencePriceCents: 2999,
        priceElasticity: -1.2,
        unitCostCents: 850,
        baseNaturalSessions: 120,
        baseNaturalCVR: 0.08,
        referenceBidCents: 120,
        referenceCpcCents: 85,
        baseAdClicks: 60,
        baseAdCVR: 0.1,
        dailyBudgetCents: 5000,
        initialBidCents: 120,
      },
      {
        skuCode: 'MTH-GREEN-001',
        asin: 'B0CHGREEN2',
        initialInventory: 400,
        priceCents: 3499,
        referencePriceCents: 3499,
        priceElasticity: -1.5,
        unitCostCents: 980,
        baseNaturalSessions: 90,
        baseNaturalCVR: 0.07,
        referenceBidCents: 140,
        referenceCpcCents: 95,
        baseAdClicks: 50,
        baseAdCVR: 0.09,
        dailyBudgetCents: 4500,
        initialBidCents: 140,
      },
      {
        skuCode: 'MTH-GREY-001',
        asin: 'B0CHGREY03',
        initialInventory: 300,
        priceCents: 2799,
        referencePriceCents: 2799,
        priceElasticity: -1.0,
        unitCostCents: 750,
        baseNaturalSessions: 80,
        baseNaturalCVR: 0.075,
        referenceBidCents: 110,
        referenceCpcCents: 75,
        baseAdClicks: 40,
        baseAdCVR: 0.085,
        dailyBudgetCents: 4000,
        initialBidCents: 110,
      },
    ],
  };
}

export function createInitialV2WorldState(
  runId: string,
  workspaceId: string,
  storeId: string,
  config: V2Config,
  skuIdMap: Record<string, string>,
  campaignIdMap: Record<string, string>,
): V2WorldState {
  return {
    modelVersion: 'closed-loop-v2',
    runId,
    workspaceId,
    storeId,
    nextDate: config.startDate,
    completedThrough: null,
    stateVersion: 1,
    seed: config.seed,
    skus: config.skus.map((sku) => ({
      id: skuIdMap[sku.skuCode] ?? `sku_${sku.skuCode}`,
      skuCode: sku.skuCode,
      priceCents: sku.priceCents,
      unitCostCents: sku.unitCostCents,
      available: sku.initialInventory,
      reserved: 0,
      unsellable: 0,
    })),
    campaigns: config.skus.map((sku) => {
      const skuId = skuIdMap[sku.skuCode] ?? `sku_${sku.skuCode}`;
      return {
        id: campaignIdMap[sku.skuCode] ?? `camp_${sku.skuCode}`,
        skuId,
        status: 'ACTIVE',
        bidCents: sku.initialBidCents,
        dailyBudgetCents: sku.dailyBudgetCents,
        targetVersion: 1,
      };
    }),
    pendingOrders: [],
    pendingShipments: (config.plannedShipments ?? []).map((s) => ({ ...s })),
    pendingRefunds: [],
  };
}
