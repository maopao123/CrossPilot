import { V2DayOutput } from './world-engine.js';
import { V2Config } from './types.js';

export interface V2LedgerEntry {
  runId: string;
  storeId: string;
  skuId?: string;
  date: string;
  sourceType: string;
  sourceId: string;
  entryType: string;
  sequence: number;
  signedAmountCents: number;
  currency: string;
  description?: string;
}

export interface V2ProfitSummary {
  date: string;
  revenueCents: number;
  cogsCents: number;
  adSpendCents: number;
  platformFeesCents: number;
  fulfillmentFeesCents: number;
  refundsCents: number;
  cogsReversalCents: number;
  contributionProfitCents: number;
}

/**
 * Generates immutable ledger entries from a simulated day's output.
 */
export function generateLedgerEntries(
  output: V2DayOutput,
  config: V2Config,
  storeId: string,
): V2LedgerEntry[] {
  const entries: V2LedgerEntry[] = [];
  const runId = output.runId;
  const date = output.date;

  // 1. Shipped orders: recognize Revenue, COGS, Platform Fee, and FBA Fee
  for (const order of output.shippedOrders) {
    // Revenue
    entries.push({
      runId,
      storeId,
      skuId: order.skuId,
      date,
      sourceType: 'ORDER',
      sourceId: order.id,
      entryType: 'REVENUE',
      sequence: 0,
      signedAmountCents: order.priceCents,
      currency: 'USD',
      description: `Shipped order ${order.id} revenue`,
    });

    // COGS
    entries.push({
      runId,
      storeId,
      skuId: order.skuId,
      date,
      sourceType: 'ORDER',
      sourceId: order.id,
      entryType: 'COGS',
      sequence: 0,
      signedAmountCents: -order.unitCostCents,
      currency: 'USD',
      description: `Shipped order ${order.id} COGS`,
    });

    // Platform Referral Fee
    const platformFee = Math.round(order.priceCents * config.platformFeeRate);
    entries.push({
      runId,
      storeId,
      skuId: order.skuId,
      date,
      sourceType: 'ORDER',
      sourceId: order.id,
      entryType: 'PLATFORM_FEE',
      sequence: 0,
      signedAmountCents: -platformFee,
      currency: 'USD',
      description: `Platform referral fee for order ${order.id}`,
    });

    // FBA Fulfillment Fee
    entries.push({
      runId,
      storeId,
      skuId: order.skuId,
      date,
      sourceType: 'ORDER',
      sourceId: order.id,
      entryType: 'FULFILLMENT_FEE',
      sequence: 0,
      signedAmountCents: -config.fbaFeeCents,
      currency: 'USD',
      description: `FBA fulfillment fee for order ${order.id}`,
    });
  }

  // 2. Advertising spend
  for (const ad of output.adOutputs) {
    if (ad.spendCents > 0) {
      const adSku = output.nextState.skus.find((s) => s.skuCode === ad.skuCode);
      const adSkuId = adSku?.id ?? output.nextState.campaigns.find((c) => c.id === ad.campaignId)?.skuId;
      entries.push({
        runId,
        storeId,
        skuId: adSkuId,
        date,
        sourceType: 'AD_DAILY',
        sourceId: `${ad.campaignId}:${date}`,
        entryType: 'AD_SPEND',
        sequence: 0,
        signedAmountCents: -ad.spendCents,
        currency: 'USD',
        description: `Ad spend for campaign ${ad.campaignId} on ${date}`,
      });
    }
  }

  // 3. Processed refunds
  for (const refund of output.processedRefunds) {
    entries.push({
      runId,
      storeId,
      skuId: refund.skuId,
      date,
      sourceType: 'REFUND',
      sourceId: refund.orderId,
      entryType: 'RETURN_REFUND',
      sequence: 0,
      signedAmountCents: -refund.refundAmountCents,
      currency: 'USD',
      description: `Customer refund for order ${refund.orderId}`,
    });

    // COGS reversal if item was restockable
    if (refund.isRestockable) {
      entries.push({
        runId,
        storeId,
        skuId: refund.skuId,
        date,
        sourceType: 'REFUND',
        sourceId: refund.orderId,
        entryType: 'COGS_REVERSAL',
        sequence: 0,
        signedAmountCents: refund.unitCostCents,
        currency: 'USD',
        description: `COGS reversal for restocked return of order ${refund.orderId}`,
      });
    }
  }

  return entries;
}

/**
 * Calculates net contribution profit in cents from ledger entries,
 * de-duplicating by entry key for idempotency.
 */
export function calculateContributionProfit(entries: V2LedgerEntry[]): number {
  const seenKeys = new Set<string>();
  let totalCents = 0;

  for (const entry of entries) {
    const key = `${entry.runId}:${entry.date}:${entry.sourceType}:${entry.sourceId}:${entry.entryType}:${entry.sequence}`;
    if (seenKeys.has(key)) {
      continue;
    }
    seenKeys.add(key);
    totalCents += entry.signedAmountCents;
  }

  return totalCents;
}

/**
 * Summarizes ledger entries into a structured daily profit statement.
 */
export function summarizeDailyProfit(date: string, entries: V2LedgerEntry[]): V2ProfitSummary {
  const seenKeys = new Set<string>();

  let revenueCents = 0;
  let cogsCents = 0;
  let adSpendCents = 0;
  let platformFeesCents = 0;
  let fulfillmentFeesCents = 0;
  let refundsCents = 0;
  let cogsReversalCents = 0;

  for (const entry of entries) {
    const key = `${entry.runId}:${entry.date}:${entry.sourceType}:${entry.sourceId}:${entry.entryType}:${entry.sequence}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    switch (entry.entryType) {
      case 'REVENUE':
        revenueCents += entry.signedAmountCents;
        break;
      case 'COGS':
        cogsCents += Math.abs(entry.signedAmountCents);
        break;
      case 'AD_SPEND':
        adSpendCents += Math.abs(entry.signedAmountCents);
        break;
      case 'PLATFORM_FEE':
        platformFeesCents += Math.abs(entry.signedAmountCents);
        break;
      case 'FULFILLMENT_FEE':
        fulfillmentFeesCents += Math.abs(entry.signedAmountCents);
        break;
      case 'RETURN_REFUND':
        refundsCents += Math.abs(entry.signedAmountCents);
        break;
      case 'COGS_REVERSAL':
        cogsReversalCents += entry.signedAmountCents;
        break;
    }
  }

  const contributionProfitCents =
    revenueCents -
    refundsCents -
    cogsCents +
    cogsReversalCents -
    adSpendCents -
    platformFeesCents -
    fulfillmentFeesCents;

  return {
    date,
    revenueCents,
    cogsCents,
    adSpendCents,
    platformFeesCents,
    fulfillmentFeesCents,
    refundsCents,
    cogsReversalCents,
    contributionProfitCents,
  };
}
