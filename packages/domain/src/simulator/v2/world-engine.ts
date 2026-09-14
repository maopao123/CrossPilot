import { createHash } from 'crypto';
import {
  V2Config,
  V2WorldState,
  V2SkuState,
  V2CampaignState,
  V2PendingOrder,
  V2PendingRefund,
  V2SkuConfig,
} from './types.js';

export interface V2ExternalEvent {
  code: string;
  skuCode?: string;
  date: string;
  /**
   * For quality events, durationDays defines the effective window [date, date + durationDays - 1].
   * If endDate is provided, the window is [date, endDate] (inclusive).
   * Default durationDays is 7 days if neither durationDays nor endDate is specified.
   */
  durationDays?: number;
  /** Explicit end date (inclusive) for the event window. */
  endDate?: string;
  demandMultiplier?: number;
  cpcMultiplier?: number;
  returnRateMultiplier?: number;
  shipmentDelayDays?: number;
  failureSchedule?: {
    tickTimeout?: boolean;
    dbCrash?: boolean;
  };
}

/**
 * Helper to check whether a quality / defect event is actively effective on currentDate.
 * Ensures quality events only affect return rates within their defined window [date, endDate].
 */
export function isQualityEventActive(event: V2ExternalEvent, currentDate: string): boolean {
  if (!event.returnRateMultiplier && !event.code.includes('QUALITY')) {
    return false;
  }
  const startDate = event.date;
  const endDate = event.endDate ?? addDays(event.date, (event.durationDays ?? 7) - 1);
  return currentDate >= startDate && currentDate <= endDate;
}

export interface V2SkuDayOutput {
  skuCode: string;
  skuId: string;
  naturalSessions: number;
  naturalOrders: number;
  adClicks: number;
  adImpressions: number;
  adOrders: number;
  spendCents: number;
  cpcCents: number;
  totalOrders: number;
  fulfilledOrders: number;
  lostSales: number;
  revenueCents: number;
}

export interface V2AdDayOutput {
  campaignId: string;
  skuCode: string;
  status: 'ACTIVE' | 'PAUSED';
  bidCents: number;
  dailyBudgetCents: number;
  impressions: number;
  clicks: number;
  spendCents: number;
  cpcCents: number;
  adOrders: number;
  adSalesCents: number;
}

export interface V2NaturalDayOutput {
  skuCode: string;
  sessions: number;
  orders: number;
  cvr: number;
  salesCents: number;
}

export interface V2DayOutput {
  runId: string;
  date: string;
  skuOutputs: V2SkuDayOutput[];
  adOutputs: V2AdDayOutput[];
  naturalOutputs: V2NaturalDayOutput[];
  shippedOrders: V2PendingOrder[];
  deliveredOrders: V2PendingOrder[];
  processedRefunds: V2PendingRefund[];
  nextState: V2WorldState;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function hashDeterministicRatio(seed: number, ...keys: (string | number)[]): number {
  const hash = createHash('sha256')
    .update(`${seed}:${keys.join(':')}`)
    .digest('hex');
  const intVal = parseInt(hash.slice(0, 8), 16);
  return (intVal % 100000) / 100000;
}

/**
 * Deterministic Binomial(n, p) sampling using keyed pseudo-randomness.
 * Uses exact Bernoulli trial summation for small n (<= 30) and
 * Box-Muller normal approximation for larger n.
 */
function sampleBinomial(n: number, p: number, seed: number, date: string, key: string): number {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1) return n;

  if (n <= 30) {
    let successes = 0;
    for (let i = 0; i < n; i++) {
      const u = hashDeterministicRatio(seed, date, key, 'trial', i);
      if (u < p) successes++;
    }
    return successes;
  }

  const u1 = Math.max(1e-7, hashDeterministicRatio(seed, date, key, 'u1'));
  const u2 = hashDeterministicRatio(seed, date, key, 'u2');
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  const mean = n * p;
  const stdDev = Math.sqrt(n * p * (1.0 - p));
  const sampled = Math.round(mean + z * stdDev);
  return Math.max(0, Math.min(n, sampled));
}

export function simulateV2Day(
  state: V2WorldState,
  config: V2Config,
  externalEvents: V2ExternalEvent[] = [],
): V2DayOutput {
  const currentDate = state.nextDate;

  // 0. Check for simulated failure injection (e.g. S06: TIMEOUT_CRASH_DRILL)
  for (const event of externalEvents) {
    if (event.date === currentDate && event.failureSchedule?.tickTimeout) {
      throw new Error(`[SIMULATED_FAILURE] Injected tick timeout crash on date ${currentDate} (${event.code})`);
    }
  }

  // Clone SKUs and Campaigns for modification
  const nextSkus: V2SkuState[] = state.skus.map((s) => ({ ...s }));
  const nextCampaigns: V2CampaignState[] = state.campaigns.map((c) => ({ ...c }));
  let pendingOrders: V2PendingOrder[] = (state.pendingOrders ?? []).map((o) => ({ ...o }));
  let pendingShipments = (state.pendingShipments ?? []).map((s) => ({ ...s }));
  let pendingRefunds: V2PendingRefund[] = (state.pendingRefunds ?? []).map((r) => ({ ...r }));

  // Process operator action events (e.g. S03: OPERATOR_PAUSE_AD)
  for (const event of externalEvents) {
    if (event.date === currentDate && (event.code === 'OPERATOR_PAUSE_AD' || event.code.includes('PAUSE_AD'))) {
      for (const cmp of nextCampaigns) {
        const sku = nextSkus.find((s) => s.id === cmp.skuId);
        if (!event.skuCode || (sku && sku.skuCode === event.skuCode)) {
          cmp.status = 'PAUSED';
        }
      }
    }
  }

  // 1. Process inbound shipments, accounting for any delay events
  for (const event of externalEvents) {
    if (event.date === currentDate && event.shipmentDelayDays && event.shipmentDelayDays > 0) {
      for (const s of pendingShipments) {
        if (!event.skuCode || s.skuCode === event.skuCode) {
          s.arrivalDate = addDays(s.arrivalDate, event.shipmentDelayDays);
        }
      }
    }
  }

  const arrivingShipments = pendingShipments.filter((s) => s.arrivalDate === currentDate);
  for (const shipment of arrivingShipments) {
    const sku = nextSkus.find((s) => s.id === shipment.skuId);
    if (sku) {
      sku.available += shipment.quantity;
    }
  }
  pendingShipments = pendingShipments.filter((s) => s.arrivalDate !== currentDate);

  // 2. Process refunds due today
  const processedRefunds: V2PendingRefund[] = [];
  const remainingRefunds: V2PendingRefund[] = [];
  for (const refund of pendingRefunds) {
    if (refund.refundDate === currentDate) {
      processedRefunds.push(refund);
      const sku = nextSkus.find((s) => s.id === refund.skuId);
      if (sku) {
        if (refund.isRestockable) {
          sku.available += 1;
        } else {
          sku.unsellable += 1;
        }
      }
    } else {
      remainingRefunds.push(refund);
    }
  }
  pendingRefunds = remainingRefunds;

  // 3. Process shipments due today
  const shippedOrders: V2PendingOrder[] = [];
  for (const order of pendingOrders) {
    if (order.status === 'ORDERED' && order.shipDate === currentDate) {
      order.status = 'SHIPPED';
      shippedOrders.push(order);
      const sku = nextSkus.find((s) => s.id === order.skuId);
      if (!sku || sku.reserved <= 0) {
        throw new Error(
          `INVARIANT_VIOLATION: SKU ${order.skuId} reserved inventory is ${sku?.reserved ?? 'missing'}, cannot fulfill shipment for order ${order.id}`,
        );
      }
      sku.reserved -= 1;
    }
  }

  // 4. Process deliveries due today and evaluate returns at Delivery + 3 days (§4.4)
  const deliveredOrders: V2PendingOrder[] = [];
  for (const order of pendingOrders) {
    if (order.status === 'SHIPPED' && order.deliveryDate === currentDate) {
      order.status = 'DELIVERED';
      deliveredOrders.push(order);
    }

    // Return decision occurs exactly 3 days after delivery (§4.4)
    const returnDecisionDate = addDays(order.deliveryDate, 3);
    if (order.status === 'DELIVERED' && returnDecisionDate === currentDate) {
      const qualityEvents = externalEvents.filter(
        (e) => (e.skuCode === order.skuCode || !e.skuCode) && isQualityEventActive(e, currentDate),
      );
      const returnMult = qualityEvents.reduce((acc, e) => acc * (e.returnRateMultiplier ?? 4.0), 1.0);
      const effectiveReturnRate = Math.min(1.0, config.returnRate * returnMult);

      const returnRatio = hashDeterministicRatio(state.seed, currentDate, order.id, 'return');
      if (returnRatio < effectiveReturnRate) {
        const restockRatio = hashDeterministicRatio(state.seed, currentDate, order.id, 'restock');
        const isRestockable = restockRatio < config.returnRestockableRate;
        const refundDate = addDays(currentDate, 2); // 2 days bank processing

        pendingRefunds.push({
          orderId: order.id,
          skuId: order.skuId,
          skuCode: order.skuCode,
          refundDate,
          refundAmountCents: order.priceCents,
          isRestockable,
          unitCostCents: order.unitCostCents,
        });
        order.status = 'RETURNED';
      }
    }
  }

  // Periodic cleanup of settled DELIVERED/RETURNED orders older than 14 days
  const retentionCutoffDate = addDays(currentDate, -14);
  pendingOrders = pendingOrders.filter(
    (o) => (o.status !== 'DELIVERED' && o.status !== 'RETURNED') || o.deliveryDate >= retentionCutoffDate,
  );

  // 5. Generate daily demand and orders per SKU
  const skuOutputs: V2SkuDayOutput[] = [];
  const adOutputs: V2AdDayOutput[] = [];
  const naturalOutputs: V2NaturalDayOutput[] = [];

  for (const skuCfg of config.skus) {
    const sku = nextSkus.find((s) => s.skuCode === skuCfg.skuCode);
    if (!sku) continue;

    const campaign = nextCampaigns.find((c) => c.skuId === sku.id);

    // Filter active external events for this SKU & date
    const events = externalEvents.filter(
      (e) => e.date === currentDate && (!e.skuCode || e.skuCode === skuCfg.skuCode),
    );
    const demandMultiplier = events.reduce((acc, e) => acc * (e.demandMultiplier ?? 1.0), 1.0);
    const cpcMultiplier = events.reduce((acc, e) => acc * (e.cpcMultiplier ?? 1.0), 1.0);

    // Price elasticity factor
    const priceRatio = sku.priceCents / (skuCfg.referencePriceCents || 1);
    const priceFactor = Math.pow(Math.max(0.01, priceRatio), skuCfg.priceElasticity);

    // Keyed noise for natural traffic (±5%)
    const naturalNoiseRatio = hashDeterministicRatio(state.seed, currentDate, skuCfg.skuCode, 'nat_noise');
    const naturalNoise = 1.0 + (naturalNoiseRatio - 0.5) * 0.1;
    const naturalSessions = Math.max(0, Math.round(skuCfg.baseNaturalSessions * demandMultiplier * naturalNoise));
    const naturalCVR = Math.max(0, Math.min(1, skuCfg.baseNaturalCVR * priceFactor));
    const naturalOrders = sampleBinomial(naturalSessions, naturalCVR, state.seed, currentDate, `${skuCfg.skuCode}_nat_orders`);

    // Ad traffic
    let adClicks = 0;
    let adImpressions = 0;
    let spendCents = 0;
    let cpcCents = 0;
    let adOrders = 0;

    if (campaign && campaign.status === 'ACTIVE' && campaign.dailyBudgetCents > 0) {
      const r = campaign.bidCents / (skuCfg.referenceBidCents || 1);
      const reachFactor = Math.min(2, Math.max(0, r));
      cpcCents = Math.min(
        campaign.bidCents,
        Math.round(skuCfg.referenceCpcCents * Math.sqrt(Math.max(0, r)) * cpcMultiplier),
      );
      // Keyed noise for ad traffic (±5%)
      const adNoiseRatio = hashDeterministicRatio(state.seed, currentDate, skuCfg.skuCode, 'ad_noise');
      const adNoise = 1.0 + (adNoiseRatio - 0.5) * 0.1;
      const potentialAdClicks = Math.max(0, Math.round(skuCfg.baseAdClicks * demandMultiplier * reachFactor * adNoise));
      const maxClicksByBudget = cpcCents > 0 ? Math.floor(campaign.dailyBudgetCents / cpcCents) : 0;
      adClicks = Math.min(potentialAdClicks, maxClicksByBudget);
      spendCents = adClicks * cpcCents;
      adImpressions = adClicks > 0 ? Math.round(adClicks / 0.02) : 0; // ~2% CTR

      const adCVR = Math.max(0, Math.min(1, skuCfg.baseAdCVR * priceFactor));
      adOrders = sampleBinomial(adClicks, adCVR, state.seed, currentDate, `${skuCfg.skuCode}_ad_orders`);
    }

    // Inventory fulfillment
    const totalDemand = naturalOrders + adOrders;
    const available = sku.available;
    const fulfilledOrders = Math.min(available, totalDemand);
    const lostSales = totalDemand - fulfilledOrders;

    sku.available -= fulfilledOrders;
    sku.reserved += fulfilledOrders;

    // Split fulfilled orders between natural and ad proportionally
    let fulfilledNatural = 0;
    let fulfilledAd = 0;
    if (totalDemand > 0) {
      fulfilledNatural = Math.round(fulfilledOrders * (naturalOrders / totalDemand));
      fulfilledAd = fulfilledOrders - fulfilledNatural;
    }

    // Create new pending orders
    const newOrders: V2PendingOrder[] = [];
    for (let i = 0; i < fulfilledNatural; i++) {
      newOrders.push({
        id: `ord_${currentDate}_${sku.skuCode}_nat_${i}`,
        skuId: sku.id,
        skuCode: sku.skuCode,
        orderDate: currentDate,
        shipDate: addDays(currentDate, 1),
        deliveryDate: addDays(currentDate, 3),
        priceCents: sku.priceCents,
        unitCostCents: sku.unitCostCents,
        channel: 'amazon',
        source: 'organic',
        status: 'ORDERED',
      });
    }
    for (let i = 0; i < fulfilledAd; i++) {
      newOrders.push({
        id: `ord_${currentDate}_${sku.skuCode}_ad_${i}`,
        skuId: sku.id,
        skuCode: sku.skuCode,
        orderDate: currentDate,
        shipDate: addDays(currentDate, 1),
        deliveryDate: addDays(currentDate, 3),
        priceCents: sku.priceCents,
        unitCostCents: sku.unitCostCents,
        channel: 'amazon',
        source: 'ad',
        campaignId: campaign?.id,
        status: 'ORDERED',
      });
    }
    pendingOrders.push(...newOrders);

    skuOutputs.push({
      skuCode: sku.skuCode,
      skuId: sku.id,
      naturalSessions,
      naturalOrders,
      adClicks,
      adImpressions,
      adOrders,
      spendCents,
      cpcCents,
      totalOrders: fulfilledOrders,
      fulfilledOrders,
      lostSales,
      revenueCents: fulfilledOrders * sku.priceCents,
    });

    if (campaign) {
      adOutputs.push({
        campaignId: campaign.id,
        skuCode: sku.skuCode,
        status: campaign.status,
        bidCents: campaign.bidCents,
        dailyBudgetCents: campaign.dailyBudgetCents,
        impressions: adImpressions,
        clicks: adClicks,
        spendCents,
        cpcCents,
        adOrders: fulfilledAd,
        adSalesCents: fulfilledAd * sku.priceCents,
      });
    }

    naturalOutputs.push({
      skuCode: sku.skuCode,
      sessions: naturalSessions,
      orders: fulfilledNatural,
      cvr: naturalCVR,
      salesCents: fulfilledNatural * sku.priceCents,
    });
  }

  const nextState: V2WorldState = {
    ...state,
    completedThrough: currentDate,
    nextDate: addDays(currentDate, 1),
    stateVersion: state.stateVersion + 1,
    skus: nextSkus,
    campaigns: nextCampaigns,
    pendingOrders,
    pendingShipments,
    pendingRefunds,
  };

  return {
    runId: state.runId,
    date: currentDate,
    skuOutputs,
    adOutputs,
    naturalOutputs,
    shippedOrders,
    deliveredOrders,
    processedRefunds,
    nextState,
  };
}
