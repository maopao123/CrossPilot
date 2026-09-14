import { V2DayOutput } from './world-engine.js';

export interface V2ChannelMetricObservable {
  skuId: string;
  skuCode: string;
  channel: 'amazon' | 'shopify';
  metricDate: string;
  sessions: number;
  addToCart: number;
  checkout: number;
  orders: number;
  conversionRate: number;
  bounceRate: number;
  revenue: number;
}

export interface V2AdMetricObservable {
  campaignId: string;
  skuCode: string;
  metricDate: string;
  impressions: number;
  clicks: number;
  spend: number;
  orders: number;
  sales: number;
}

export interface V2InventorySnapshotObservable {
  skuId: string;
  skuCode: string;
  snapshotDate: string;
  fulfillable: number;
  reserved: number;
  inbound: number;
  unfulfillable: number;
  daysCover: number;
}

export interface V2Observables {
  date: string;
  channelDailyMetrics: V2ChannelMetricObservable[];
  adMetrics: V2AdMetricObservable[];
  inventorySnapshots: V2InventorySnapshotObservable[];
}

/**
 * Projects internal simulation output into public observable datasets,
 * strictly excluding internal causes, secret events, and future data.
 */
export function projectObservables(output: V2DayOutput): V2Observables {
  const channelDailyMetrics: V2ChannelMetricObservable[] = [];
  const adMetrics: V2AdMetricObservable[] = [];
  const inventorySnapshots: V2InventorySnapshotObservable[] = [];

  for (const sku of output.skuOutputs) {
    const sessions = sku.naturalSessions + sku.adClicks;
    const orders = sku.fulfilledOrders;
    const conversionRate = sessions > 0 ? Math.round((orders / sessions) * 10000) / 10000 : 0;
    const revenue = sku.revenueCents / 100;

    const bounceRate = sessions > 0 ? Math.max(0.15, Math.min(0.65, Math.round((0.45 - conversionRate * 1.5) * 100) / 100)) : 0;

    channelDailyMetrics.push({
      skuId: sku.skuId,
      skuCode: sku.skuCode,
      channel: 'amazon',
      metricDate: output.date,
      sessions,
      addToCart: Math.round(orders * 1.5), // estimated funnel
      checkout: Math.round(orders * 1.2), // estimated funnel
      orders,
      conversionRate,
      bounceRate,
      revenue,
    });
  }

  for (const ad of output.adOutputs) {
    adMetrics.push({
      campaignId: ad.campaignId,
      skuCode: ad.skuCode,
      metricDate: output.date,
      impressions: ad.impressions,
      clicks: ad.clicks,
      spend: ad.spendCents / 100,
      orders: ad.adOrders,
      sales: ad.adSalesCents / 100,
    });
  }

  for (const skuState of output.nextState.skus) {
    const skuOutput = output.skuOutputs.find((s) => s.skuCode === skuState.skuCode);
    const avgDailySales = Math.max(1, skuOutput?.fulfilledOrders ?? 5);
    const daysCover = Math.round((skuState.available / avgDailySales) * 10) / 10;

    const inbound = (output.nextState.pendingShipments || [])
      .filter((s) => s.skuCode === skuState.skuCode)
      .reduce((sum, s) => sum + s.quantity, 0);

    inventorySnapshots.push({
      skuId: skuState.id,
      skuCode: skuState.skuCode,
      snapshotDate: output.date,
      fulfillable: skuState.available,
      reserved: skuState.reserved,
      inbound,
      unfulfillable: skuState.unsellable,
      daysCover,
    });
  }

  return {
    date: output.date,
    channelDailyMetrics,
    adMetrics,
    inventorySnapshots,
  };
}
