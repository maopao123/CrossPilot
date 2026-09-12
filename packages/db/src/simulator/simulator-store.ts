import { PrismaClient } from '@prisma/client';
import {
  createDefaultSimConfig,
  createInitialWorldState,
  simulateOneDay,
  DaySimulationOutput,
  SimConfig,
  SimWorldState,
  DEFAULT_SIM_START_DATE,
} from '@crosspilot/domain';

export const SIM_AMAZON_PROVIDER = 'simulator-amazon';
export const SIM_SHOPIFY_PROVIDER = 'simulator-shopify';
export const SIM_CAMPAIGN_NAME = 'SIM - Sponsored Products - Simulator Catalog';
export const SIM_REVIEWER_PREFIX = 'sim-';

/** Thrown when a tick races another writer for the same sim day (HTTP 409 in the API). */
export class SimulatorConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SimulatorConflictError';
  }
}

/** Thrown when the workspace or demo catalog (SKUs) is missing (HTTP 400 in the API). */
export class SimulatorCatalogMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SimulatorCatalogMissingError';
  }
}

export interface SimFixtures {
  workspaceId: string;
  marketplaceId: string;
  /** skuCode → skuId for the SKUs referenced by the SimConfig. */
  skuMap: Record<string, string>;
  accountIds: { amazon: string; shopify: string };
  campaignId: string;
}

export interface StoredSimState {
  config: SimConfig;
  worldState: SimWorldState;
}

export interface SimulationStateRow {
  id: string;
  simDate: Date;
  dayIndex: number;
  status: string;
  config: unknown;
}

export interface SimulatorTickResult {
  simDate: string;
  dayIndex: number;
  day: {
    orders: number;
    reviews: number;
    adMetrics: number;
    channelMetrics: number;
    events: number;
    inventorySnapshots: number;
  };
}

/**
 * Framework-free persistence + orchestration for the Commerce Simulator,
 * shared by apps/api (HTTP endpoints) and apps/worker (scheduled ticks).
 * Maps pure domain rows (keyed by skuCode) onto Prisma models.
 */
export class SimulatorStore {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Ensures the simulator's anchor rows exist: the AMAZON_US marketplace,
   * the two simulator CommerceAccounts, and the SIM- campaign used for
   * AdMetricDaily rows. Resolves the skuCode → skuId map; fails loudly when
   * the demo catalog has not been seeded yet.
   */
  async ensureFixtures(workspaceId: string, config: SimConfig): Promise<SimFixtures> {
    const workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) {
      throw new SimulatorCatalogMissingError(`Workspace not found: ${workspaceId}`);
    }

    let marketplaceId = workspace.defaultMarketplaceId as string | null;
    if (!marketplaceId) {
      const marketplace = await this.prisma.marketplace.upsert({
        where: { code: 'AMAZON_US' },
        update: {},
        create: {
          code: 'AMAZON_US',
          name: 'Amazon US',
          countryCode: 'US',
          currencyCode: 'USD',
          languageCode: 'en-US',
          timezone: 'America/Los_Angeles',
          isActive: true,
        },
      });
      marketplaceId = marketplace.id;
    }

    const skuCodes = config.skus.map((sku) => sku.skuCode);
    const skus = await this.prisma.sku.findMany({
      where: { workspaceId, skuCode: { in: skuCodes } },
    });
    const skuMap: Record<string, string> = {};
    for (const sku of skus) {
      skuMap[sku.skuCode] = sku.id;
    }
    const missing = skuCodes.filter((code) => !skuMap[code]);
    if (missing.length > 0) {
      throw new SimulatorCatalogMissingError(
        `Simulator SKUs not found in workspace (${missing.join(', ')}). Run \`pnpm db:seed\` first.`,
      );
    }

    const amazonAccount = await this.prisma.commerceAccount.upsert({
      where: { workspaceId_provider: { workspaceId, provider: SIM_AMAZON_PROVIDER } },
      update: { status: 'CONNECTED' },
      create: {
        workspaceId,
        provider: SIM_AMAZON_PROVIDER,
        status: 'CONNECTED',
        defaultMarketplaceCode: 'AMAZON_US',
      },
    });
    const shopifyAccount = await this.prisma.commerceAccount.upsert({
      where: { workspaceId_provider: { workspaceId, provider: SIM_SHOPIFY_PROVIDER } },
      update: { status: 'CONNECTED' },
      create: {
        workspaceId,
        provider: SIM_SHOPIFY_PROVIDER,
        status: 'CONNECTED',
        defaultMarketplaceCode: 'AMAZON_US',
      },
    });

    let campaign = await this.prisma.campaign.findFirst({
      where: { workspaceId, name: { startsWith: 'SIM-' } },
    });
    if (!campaign) {
      campaign = await this.prisma.campaign.create({
        data: {
          workspaceId,
          marketplaceId,
          name: SIM_CAMPAIGN_NAME,
          campaignType: 'SPONSORED_PRODUCTS',
          targetingType: 'AUTO',
          budget: 100.0,
          status: 'ENABLED',
          startDate: new Date(`${DEFAULT_SIM_START_DATE}T00:00:00.000Z`),
        },
      });
    }

    return {
      workspaceId,
      marketplaceId,
      skuMap,
      accountIds: { amazon: amazonAccount.id, shopify: shopifyAccount.id },
      campaignId: campaign.id,
    };
  }

  /** Loads the persisted world; returns null when the simulation has never run. */
  async loadState(
    workspaceId: string,
  ): Promise<{ row: SimulationStateRow; stored: StoredSimState } | null> {
    const row = (await this.prisma.simulationState.findUnique({
      where: { workspaceId },
    })) as SimulationStateRow | null;
    if (!row) return null;
    return { row, stored: row.config as StoredSimState };
  }

  /**
   * Writes one simulated day and advances the world state.
   * Idempotency: the state row is advanced with a conditional update on the
   * (simDate, dayIndex) that was read; a concurrent or repeated tick finds
   * count = 0 and raises SimulatorConflictError instead of double-writing.
   */
  async persistDay(
    fixtures: SimFixtures,
    previous: SimulationStateRow | null,
    stored: StoredSimState,
    output: DaySimulationOutput,
    nextState: SimWorldState,
  ): Promise<void> {
    const { skuMap, accountIds, campaignId, marketplaceId, workspaceId } = fixtures;

    await this.prisma.$transaction(async (tx) => {
      for (const order of output.orders) {
        await tx.order.create({
          data: {
            workspaceId,
            marketplaceId,
            orderNumber: order.orderNumber,
            externalOrderId: order.orderNumber,
            sourceProvider: 'simulator',
            sourceAccountId: accountIds[order.channel],
            status: order.status,
            totalAmount: order.totalAmount,
            currencyCode: order.currencyCode,
            orderedAt: order.orderedAt,
            items: {
              create: order.items.map((item) => ({
                workspaceId,
                skuId: skuMap[item.skuCode],
                quantity: item.quantity,
                unitPrice: item.unitPrice,
              })),
            },
          },
        });
      }

      for (const balance of output.inventoryBalances) {
        await tx.inventoryBalance.upsert({
          where: {
            workspaceId_skuId_warehouseType: {
              workspaceId,
              skuId: skuMap[balance.skuCode],
              warehouseType: 'FBA',
            },
          },
          update: {
            fulfillableQuantity: balance.fulfillableQuantity,
            reservedQuantity: balance.reservedQuantity,
            inboundQuantity: balance.inboundQuantity,
            unfulfillableQuantity: balance.unfulfillableQuantity,
            sourceUpdatedAt: new Date(`${output.simDate}T00:00:00.000Z`),
          },
          create: {
            workspaceId,
            skuId: skuMap[balance.skuCode],
            warehouseType: 'FBA',
            fulfillableQuantity: balance.fulfillableQuantity,
            reservedQuantity: balance.reservedQuantity,
            inboundQuantity: balance.inboundQuantity,
            unfulfillableQuantity: balance.unfulfillableQuantity,
            sourceUpdatedAt: new Date(`${output.simDate}T00:00:00.000Z`),
          },
        });
      }

      for (const snapshot of output.inventorySnapshots) {
        await tx.inventorySnapshot.upsert({
          where: {
            skuId_snapshotDate: {
              skuId: skuMap[snapshot.skuCode],
              snapshotDate: snapshot.snapshotDate,
            },
          },
          update: {
            fulfillable: snapshot.fulfillable,
            reserved: snapshot.reserved,
            inbound: snapshot.inbound,
            unfulfillable: snapshot.unfulfillable,
            daysCover: snapshot.daysCover,
          },
          create: {
            workspaceId,
            skuId: skuMap[snapshot.skuCode],
            snapshotDate: snapshot.snapshotDate,
            fulfillable: snapshot.fulfillable,
            reserved: snapshot.reserved,
            inbound: snapshot.inbound,
            unfulfillable: snapshot.unfulfillable,
            daysCover: snapshot.daysCover,
          },
        });
      }

      if (output.reviews.length > 0) {
        await tx.review.createMany({
          data: output.reviews.map((review) => ({
            workspaceId,
            skuId: skuMap[review.skuCode],
            asin: review.asin,
            rating: review.rating,
            title: review.title,
            content: review.content,
            reviewerName: `${SIM_REVIEWER_PREFIX}${review.reviewerName ?? 'anonymous'}`,
            reviewDate: review.reviewDate,
            isVerified: review.isVerified,
            sourceType: review.sourceType,
          })),
        });
      }

      for (const metric of output.adMetrics) {
        await tx.adMetricDaily.upsert({
          where: {
            campaignId_metricDate_skuId: {
              campaignId,
              metricDate: metric.metricDate,
              skuId: skuMap[metric.skuCode],
            },
          },
          update: {
            impressions: metric.impressions,
            clicks: metric.clicks,
            spend: metric.spend,
            orders: metric.orders,
            sales: metric.sales,
          },
          create: {
            campaignId,
            skuId: skuMap[metric.skuCode],
            metricDate: metric.metricDate,
            impressions: metric.impressions,
            clicks: metric.clicks,
            spend: metric.spend,
            orders: metric.orders,
            sales: metric.sales,
          },
        });
      }

      for (const metric of output.channelMetrics) {
        await tx.channelDailyMetric.upsert({
          where: {
            workspaceId_channel_skuId_metricDate: {
              workspaceId,
              channel: metric.channel,
              skuId: skuMap[metric.skuCode],
              metricDate: metric.metricDate,
            },
          },
          update: {
            sessions: metric.sessions,
            addToCart: metric.addToCart,
            checkout: metric.checkout,
            orders: metric.orders,
            conversionRate: metric.conversionRate,
            bounceRate: metric.bounceRate,
            revenue: metric.revenue,
          },
          create: {
            workspaceId,
            channel: metric.channel,
            skuId: skuMap[metric.skuCode],
            metricDate: metric.metricDate,
            sessions: metric.sessions,
            addToCart: metric.addToCart,
            checkout: metric.checkout,
            orders: metric.orders,
            conversionRate: metric.conversionRate,
            bounceRate: metric.bounceRate,
            revenue: metric.revenue,
          },
        });
      }

      if (output.events.length > 0) {
        await tx.simulationEvent.createMany({
          data: output.events.map((event) => ({
            workspaceId,
            skuId: event.skuCode ? skuMap[event.skuCode] : undefined,
            simDate: event.simDate,
            code: event.code,
            severity: event.severity,
            title: event.title,
            description: event.description,
            status: event.status,
          })),
        });
      }

      const nextStored: StoredSimState = { config: stored.config, worldState: nextState };
      const stateData = {
        simDate: new Date(`${nextState.simDate}T00:00:00.000Z`),
        dayIndex: nextState.dayIndex,
        status: 'RUNNING',
        config: nextStored as object,
      };
      if (!previous) {
        await tx.simulationState.create({ data: { workspaceId, ...stateData } });
      } else {
        const result = await tx.simulationState.updateMany({
          where: { workspaceId, simDate: previous.simDate, dayIndex: previous.dayIndex },
          data: stateData,
        });
        if (result.count === 0) {
          throw new SimulatorConflictError(
            `Simulation day ${output.simDate} was already advanced by another tick. Retry against the latest state.`,
          );
        }
      }
    });
  }

  /**
   * Deletes only simulator-produced rows (never seed/scenario/real sync data)
   * and rebuilds the initial world. InventorySnapshots are shared with the
   * scenario generator, so they are only cleared for dates on/after the
   * simulator start date (scenario snapshots always lie in the past).
   */
  async resetWorld(workspaceId: string): Promise<{ config: SimConfig; worldState: SimWorldState }> {
    const config = createDefaultSimConfig();
    await this.ensureFixtures(workspaceId, config);

    await this.prisma.$transaction([
      this.prisma.orderItem.deleteMany({
        where: { workspaceId, order: { sourceProvider: 'simulator' } },
      }),
      this.prisma.order.deleteMany({ where: { workspaceId, sourceProvider: 'simulator' } }),
      this.prisma.review.deleteMany({
        where: { workspaceId, reviewerName: { startsWith: SIM_REVIEWER_PREFIX } },
      }),
      this.prisma.adMetricDaily.deleteMany({
        where: { campaign: { workspaceId, name: { startsWith: 'SIM-' } } },
      }),
      this.prisma.campaign.deleteMany({ where: { workspaceId, name: { startsWith: 'SIM-' } } }),
      this.prisma.channelDailyMetric.deleteMany({ where: { workspaceId } }),
      this.prisma.simulationEvent.deleteMany({ where: { workspaceId } }),
      this.prisma.simulationState.deleteMany({ where: { workspaceId } }),
      this.prisma.inventorySnapshot.deleteMany({
        where: {
          workspaceId,
          snapshotDate: { gte: new Date(`${DEFAULT_SIM_START_DATE}T00:00:00.000Z`) },
        },
      }),
    ]);

    // The SIM- campaign was deleted above; recreate fixtures for the fresh world.
    const freshFixtures = await this.ensureFixtures(workspaceId, config);

    const worldState = createInitialWorldState(config);
    await this.prisma.simulationState.create({
      data: {
        workspaceId,
        simDate: new Date(`${worldState.simDate}T00:00:00.000Z`),
        dayIndex: worldState.dayIndex,
        status: 'RUNNING',
        config: { config, worldState } as object,
      },
    });

    for (const sku of config.skus) {
      await this.prisma.inventoryBalance.upsert({
        where: {
          workspaceId_skuId_warehouseType: {
            workspaceId,
            skuId: freshFixtures.skuMap[sku.skuCode],
            warehouseType: 'FBA',
          },
        },
        update: {
          fulfillableQuantity: sku.initialInventory,
          reservedQuantity: 0,
          inboundQuantity: 0,
          unfulfillableQuantity: 0,
        },
        create: {
          workspaceId,
          skuId: freshFixtures.skuMap[sku.skuCode],
          warehouseType: 'FBA',
          fulfillableQuantity: sku.initialInventory,
          reservedQuantity: 0,
          inboundQuantity: 0,
          unfulfillableQuantity: 0,
        },
      });
    }

    return { config, worldState };
  }
}

/**
 * Shared orchestration: loadState → (init if absent) → simulateOneDay →
 * persistDay. Used by both the API (per-request) and the worker (scheduled).
 * Throws SimulatorConflictError when the day was already advanced.
 */
export async function tickSimulatorWorkspace(
  prisma: PrismaClient,
  workspaceId: string,
): Promise<SimulatorTickResult> {
  const store = new SimulatorStore(prisma);
  const loaded = await store.loadState(workspaceId);
  const stored: StoredSimState =
    loaded?.stored ?? {
      config: createDefaultSimConfig(),
      worldState: createInitialWorldState(createDefaultSimConfig()),
    };
  const fixtures = await store.ensureFixtures(workspaceId, stored.config);

  const { output, nextState } = simulateOneDay(stored.worldState, stored.config);
  await store.persistDay(fixtures, loaded?.row ?? null, stored, output, nextState);

  return {
    simDate: nextState.simDate,
    dayIndex: nextState.dayIndex,
    day: {
      orders: output.orders.length,
      reviews: output.reviews.length,
      adMetrics: output.adMetrics.length,
      channelMetrics: output.channelMetrics.length,
      events: output.events.length,
      inventorySnapshots: output.inventorySnapshots.length,
    },
  };
}
