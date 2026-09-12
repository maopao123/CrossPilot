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
        title: 'FBA 补货入库',
        description: `${arrival.quantity} 件已到达 FBA 运营中心，可售库存恢复；PPC 竞价恢复至目标 ACOS。`,
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
        title: 'FBA 补货下单',
        description: `库存跌破补货点（${sku.reorderPoint} 件），已创建 ${sku.reorderQuantity} 件采购订单；入库将在 ${sku.leadTimeDays} 天后到达。`,
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
        title: '紧急补货预警',
        description: `按当前 ${avgDailySales} 件/天的动销速度，可售天数降至 ${daysCover} 天（低于 ${sku.leadTimeDays} 天供应商交期）。不加急采购将有断货风险。`,
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
        title: '库存断货',
        description:
          '可售库存归零。补货到达前，Listing 将失去 Buy Box 资格和自然排名。',
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
