import type {
  SimConfig,
  SimEventRow,
  SimInboundShipment,
  SimInventoryBalanceRow,
  SimInventorySnapshotRow,
  SimSkuState,
  SimWorldState,
  SkuChannelSales,
} from './types.js';
import { simDateToUtcDate } from './types.js';

export interface InboundArrival {
  skuCode: string;
  quantity: number;
}

/**
 * Receives inbound shipments whose arriveDayIndex has been reached into
 * fulfillable stock. Runs at the start of the day, before sales.
 * Conservation: fulfillable increases by exactly the arrived quantities.
 */
export function receiveInboundArrivals(
  skuStates: SimSkuState[],
  dayIndex: number,
): { skuStates: SimSkuState[]; arrivals: InboundArrival[] } {
  const arrivals: InboundArrival[] = [];
  const nextStates = skuStates.map((state) => {
    const due: SimInboundShipment[] = [];
    const pending: SimInboundShipment[] = [];
    for (const shipment of state.inboundShipments) {
      if (shipment.arriveDayIndex <= dayIndex) due.push(shipment);
      else pending.push(shipment);
    }
    if (due.length === 0) return { ...state };
    const received = due.reduce((sum, shipment) => sum + shipment.quantity, 0);
    arrivals.push({ skuCode: state.skuCode, quantity: received });
    return {
      ...state,
      fulfillable: state.fulfillable + received,
      inboundShipments: pending,
      cumulativeUnitsReceived: state.cumulativeUnitsReceived + received,
    };
  });
  return { skuStates: nextStates, arrivals };
}

export interface InventoryEngineInput {
  /** SKU states after this morning's inbound arrivals. */
  skuStates: SimSkuState[];
  arrivals: InboundArrival[];
  salesSummary: SkuChannelSales[];
  config: SimConfig;
  world: SimWorldState;
}

export interface InventoryEngineOutput {
  skuStates: SimSkuState[];
  snapshots: SimInventorySnapshotRow[];
  balances: SimInventoryBalanceRow[];
  eventRows: SimEventRow[];
}

const AVG_SALES_EMA_ALPHA = 0.25;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Deducts the day's sales from stock, computes daysCover, places reorders
 * when fulfillable + pending inbound drops below the reorder point (arriving
 * after leadTimeDays), and emits replenishment / low-stock / stockout events
 * on rising edges.
 */
export function runInventoryEngine(input: InventoryEngineInput): InventoryEngineOutput {
  const { skuStates, arrivals, salesSummary, config, world } = input;
  const snapshots: SimInventorySnapshotRow[] = [];
  const balances: SimInventoryBalanceRow[] = [];
  const eventRows: SimEventRow[] = [];
  const nextStates: SimSkuState[] = [];
  const rowDate = simDateToUtcDate(world.simDate);

  for (const sku of config.skus) {
    const state = skuStates.find((item) => item.skuCode === sku.skuCode);
    if (!state) continue;
    const sold = salesSummary.find((item) => item.skuCode === sku.skuCode)?.unitsSold ?? 0;

    for (const arrival of arrivals.filter((item) => item.skuCode === sku.skuCode)) {
      eventRows.push({
        skuCode: sku.skuCode,
        simDate: rowDate,
        code: 'REPLENISHMENT_RECEIVED',
        severity: 'INFO',
        title: 'FBA Replenishment Received',
        description: `${arrival.quantity} units received at the FBA fulfillment center. Available inventory restored; PPC bidding resumes at target ACOS.`,
        status: 'COMPLETED',
      });
    }

    const fulfillable = Math.max(0, state.fulfillable - sold);
    const avgDailySales =
      Math.round(
        (state.avgDailySales * (1 - AVG_SALES_EMA_ALPHA) + sold * AVG_SALES_EMA_ALPHA) * 100,
      ) / 100;
    const daysCover = avgDailySales > 0.05 ? round1(fulfillable / avgDailySales) : 99;

    const inboundShipments = [...state.inboundShipments];
    let pendingInbound = inboundShipments.reduce((sum, shipment) => sum + shipment.quantity, 0);

    if (fulfillable + pendingInbound < sku.reorderPoint) {
      inboundShipments.push({
        quantity: sku.reorderQuantity,
        arriveDayIndex: world.dayIndex + sku.leadTimeDays,
      });
      pendingInbound += sku.reorderQuantity;
      eventRows.push({
        skuCode: sku.skuCode,
        simDate: rowDate,
        code: 'REORDER_PLACED',
        severity: daysCover < sku.leadTimeDays ? 'WARNING' : 'INFO',
        title: 'FBA Replenishment Ordered',
        description: `Stock drops below reorder point (${sku.reorderPoint} units). Purchase order for ${sku.reorderQuantity} units placed; inbound arrives in ${sku.leadTimeDays} days.`,
        status: 'ACTIVE',
      });
    }

    let lowStockActive = state.lowStockActive;
    if (fulfillable > 0 && daysCover < sku.leadTimeDays && !lowStockActive) {
      lowStockActive = true;
      eventRows.push({
        skuCode: sku.skuCode,
        simDate: rowDate,
        code: 'LOW_STOCK',
        severity: 'CRITICAL',
        title: 'Critical Reorder Warning',
        description: `At the current velocity of ${avgDailySales} units/day, Days Cover drops to ${daysCover} days (< ${sku.leadTimeDays} days supplier lead time). Stockout risk without expedited PO.`,
        status: 'ACTIVE',
      });
    } else if (daysCover >= sku.leadTimeDays) {
      lowStockActive = false;
    }

    let stockoutActive = state.stockoutActive;
    if (fulfillable === 0 && !stockoutActive) {
      stockoutActive = true;
      eventRows.push({
        skuCode: sku.skuCode,
        simDate: rowDate,
        code: 'STOCKOUT',
        severity: 'CRITICAL',
        title: 'Inventory Stockout',
        description:
          'Fulfillable inventory hits zero. Listing loses Buy Box eligibility and organic ranking until replenishment arrives.',
        status: 'ACTIVE',
      });
    } else if (fulfillable > 0) {
      stockoutActive = false;
    }

    const reserved = Math.min(Math.round(sold * 1.2), fulfillable);

    snapshots.push({
      skuCode: sku.skuCode,
      snapshotDate: rowDate,
      fulfillable,
      reserved,
      inbound: pendingInbound,
      unfulfillable: 0,
      daysCover,
    });
    balances.push({
      skuCode: sku.skuCode,
      warehouseType: 'FBA',
      fulfillableQuantity: fulfillable,
      reservedQuantity: reserved,
      inboundQuantity: pendingInbound,
      unfulfillableQuantity: 0,
    });
    nextStates.push({
      ...state,
      fulfillable,
      inboundShipments,
      cumulativeUnitsSold: state.cumulativeUnitsSold + sold,
      avgDailySales,
      lowStockActive,
      stockoutActive,
    });
  }

  return { skuStates: nextStates, snapshots, balances, eventRows };
}
