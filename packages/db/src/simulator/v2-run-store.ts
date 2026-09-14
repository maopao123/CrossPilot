import { Prisma, PrismaClient } from '@prisma/client';
import {
  createDefaultV2Config,
  createInitialV2WorldState,
  computeSha256,
  simulateV2Day,
  generateLedgerEntries,
  projectObservables,
  summarizeDailyProfit,
  mergeV2Config,
  V2Config,
  V2WorldState,
  V2ProfitSummary,
  V2ExternalEvent,
} from '@crosspilot/domain';

export class V2ConflictError extends Error {
  readonly code = 'CONFLICT';
  status = 409;
  constructor(message: string) {
    super(message);
    this.name = 'ConflictException';
  }
}

export class V2NotFoundError extends Error {
  readonly code = 'NOT_FOUND';
  status = 404;
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundException';
  }
}

export class V2ForbiddenError extends Error {
  readonly code = 'FORBIDDEN';
  status = 403;
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenException';
  }
}

export class V2BadRequestError extends Error {
  readonly code = 'BAD_REQUEST';
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestException';
  }
}

export interface V2TickResult {
  runId: string;
  simDate: string;
  nextDate: string;
  completedThrough: string;
  profitSummary: V2ProfitSummary;
  dayOutput: {
    orders: number;
    shipped: number;
    refunds: number;
    adClicks: number;
    adSpendCents: number;
  };
}

export interface CreateRunOptions {
  modelVersion?: string;
  seed?: number;
  scenarioId?: string;
  idempotencyKey?: string;
  customConfig?: Partial<V2Config>;
  policyEnabled?: boolean;
  policyLimits?: any;
}

export interface RunCreationResult {
  runId: string;
  runWorkspaceId: string;
  storeId: string;
  modelVersion: string;
  status: string;
}

export interface RunSummary {
  id: string;
  controlWorkspaceId: string;
  runWorkspaceId: string;
  storeId: string;
  modelVersion: string;
  status: string;
  completedThrough: string | null;
  seed: number;
  configHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export class V2RunStore {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Check whether a given workspaceId is an isolated SimulationRun workspace.
   */
  async isRunWorkspace(workspaceId: string): Promise<boolean> {
    if (!this.prisma?.simulationRun?.findFirst) {
      return false;
    }
    const run = await this.prisma.simulationRun.findFirst({
      where: { runWorkspaceId: workspaceId },
      select: { id: true },
    });
    return run !== null;
  }

  /**
   * Create a new isolated v2 SimulationRun or replay if idempotencyKey matches.
   */
  async createRun(
    controlWorkspaceId: string,
    userId: string,
    options: CreateRunOptions = {},
  ): Promise<RunCreationResult> {
    const seed = options.seed ?? 1001;
    const modelVersion = options.modelVersion ?? 'closed-loop-v2';
    if (modelVersion !== 'closed-loop-v2') {
      throw new Error(`Unsupported modelVersion: ${modelVersion}`);
    }

    // 1. Check idempotency scoped to controlWorkspaceId
    if (options.idempotencyKey) {
      const existing = await this.prisma.simulationRun.findFirst({
        where: { idempotencyKey: options.idempotencyKey },
      });
      if (existing) {
        if (existing.controlWorkspaceId !== controlWorkspaceId) {
          throw new V2ConflictError(`Idempotency key ${options.idempotencyKey} belongs to another workspace`);
        }
        if (existing.seed !== seed || existing.modelVersion !== modelVersion) {
          throw new V2ConflictError(`Idempotency conflict: key ${options.idempotencyKey} already exists with different parameters`);
        }
        return {
          runId: existing.id,
          runWorkspaceId: existing.runWorkspaceId,
          storeId: existing.storeId,
          modelVersion: existing.modelVersion,
          status: existing.status,
        };
      }
    }

    // 2. Verify control workspace
    const controlWs = await this.prisma.workspace.findUnique({
      where: { id: controlWorkspaceId },
    });
    if (!controlWs) {
      throw new Error(`Control workspace not found: ${controlWorkspaceId}`);
    }

    const baseConfig = createDefaultV2Config(seed);
    const config = options.customConfig
      ? mergeV2Config(baseConfig, options.customConfig)
      : baseConfig;
    const configHash = computeSha256(config);

    // 3. Create dedicated runWorkspace and store in a transaction
    try {
      return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // 3.1 Create dedicated workspace
        const mktId = controlWs.defaultMarketplaceId ?? 'mkt_us';
        const runWorkspace = await tx.workspace.create({
          data: {
            slug: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name: `SimRun ${options.scenarioId ?? 'Run'} (${Date.now()})`,
            defaultMarketplaceId: mktId,
          },
        });

        // 3.2 Add creator as OWNER of the dedicated runWorkspace
        if (userId) {
          await tx.workspaceMember.create({
            data: {
              workspaceId: runWorkspace.id,
              userId,
              role: 'OWNER',
            },
          });
        }

        // 3.3 Create dedicated Store aligned with SimulatorAdapter
        const store = await tx.store.create({
          data: {
            workspaceId: runWorkspace.id,
            name: `Simulator Store (${runWorkspace.id.slice(0, 8)})`,
            platform: 'simulator',
            country: 'US',
            status: 'ACTIVE',
          },
        });

        // 3.4 Create CommerceAccount for the store
        await tx.commerceAccount.create({
          data: {
            workspaceId: runWorkspace.id,
            storeId: store.id,
            provider: 'simulator-amazon',
            status: 'ACTIVE',
          },
        });

        // 3.5 Create isolated Product & SKUs
        const product = await tx.product.create({
          data: {
            workspaceId: runWorkspace.id,
            marketplaceId: mktId,
            name: 'Simulator Product Line',
            brand: 'CrossPilot Sim',
            category: 'Home & Kitchen',
          },
        });

        const skuIdMap: Record<string, string> = {};
        const campaignIdMap: Record<string, string> = {};

        for (const skuCfg of config.skus) {
          const sku = await tx.sku.create({
            data: {
              workspaceId: runWorkspace.id,
              productId: product.id,
              skuCode: skuCfg.skuCode,
              variantName: `Sim Product ${skuCfg.skuCode}`,
              sellingPrice: skuCfg.priceCents / 100,
            },
          });
          skuIdMap[skuCfg.skuCode] = sku.id;

          const campaign = await tx.campaign.create({
            data: {
              workspaceId: runWorkspace.id,
              marketplaceId: mktId,
              name: `SIM - ${skuCfg.skuCode}`,
              status: 'ENABLED',
              budget: skuCfg.dailyBudgetCents / 100,
              startDate: new Date(`${config.startDate}T00:00:00.000Z`),
            },
          });
          campaignIdMap[skuCfg.skuCode] = campaign.id;
        }

        // 3.6 Create initial V2 WorldState
        const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const worldState = createInitialV2WorldState(
          runId,
          runWorkspace.id,
          store.id,
          config,
          skuIdMap,
          campaignIdMap,
        );

        // 3.7 Create SimulationRun row
        const run = await tx.simulationRun.create({
          data: {
            id: runId,
            controlWorkspaceId,
            runWorkspaceId: runWorkspace.id,
            storeId: store.id,
            modelVersion,
            configHash,
            seed,
            status: 'RUNNING',
            completedThrough: null,
            stateVersion: 1,
            stateSnapshot: worldState as any,
            config: config as any,
            idempotencyKey: options.idempotencyKey ?? null,
            policyEnabled: options.policyEnabled ?? false,
            policyLimits: options.policyLimits ?? null,
          },
        });

        return {
          runId: run.id,
          runWorkspaceId: runWorkspace.id,
          storeId: store.id,
          modelVersion: run.modelVersion,
          status: run.status,
        };
      });
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        if (options.idempotencyKey) {
          const winner = await this.prisma.simulationRun.findFirst({
            where: { idempotencyKey: options.idempotencyKey, controlWorkspaceId },
          });
          if (winner) {
            return {
              runId: winner.id,
              runWorkspaceId: winner.runWorkspaceId,
              storeId: winner.storeId,
              modelVersion: winner.modelVersion,
              status: winner.status,
            };
          }
        }
        throw new V2ConflictError('Concurrent run creation conflict');
      }
      throw err;
    }
  }

  /**
   * Read Run summary with authorization check.
   */
  async getRun(
    controlWorkspaceId: string,
    runId: string,
    userId?: string,
  ): Promise<RunSummary> {
    const run = await this.prisma.simulationRun.findUnique({
      where: { id: runId },
    });
    if (!run) {
      throw new V2NotFoundError(`SimulationRun not found: ${runId}`);
    }

    if (run.controlWorkspaceId !== controlWorkspaceId) {
      throw new V2ConflictError(`SimulationRun ${runId} does not belong to control workspace ${controlWorkspaceId}`);
    }

    if (userId) {
      const member = await this.prisma.workspaceMember.findFirst({
        where: {
          workspaceId: controlWorkspaceId,
          userId,
        },
      });
      if (!member) {
        throw new Error(`User ${userId} is not a member of control workspace ${controlWorkspaceId}`);
      }
      const runMember = await this.prisma.workspaceMember.findFirst({
        where: {
          workspaceId: run.runWorkspaceId,
          userId,
        },
      });
      if (!runMember) {
        throw new Error(`User ${userId} is not a member of run workspace ${run.runWorkspaceId}`);
      }
    }

    return {
      id: run.id,
      controlWorkspaceId: run.controlWorkspaceId,
      runWorkspaceId: run.runWorkspaceId,
      storeId: run.storeId,
      modelVersion: run.modelVersion,
      status: run.status,
      completedThrough: run.completedThrough ? run.completedThrough.toISOString().split('T')[0] : null,
      seed: run.seed,
      configHash: run.configHash,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    };
  }

  /**
   * Advance the simulation world of a Run by one day atomically and persist output.
   */
  async tickDay(
    controlWorkspaceId: string,
    runId: string,
    targetDate?: string,
    userId?: string,
  ): Promise<V2TickResult> {
    const run = await this.prisma.simulationRun.findUnique({
      where: { id: runId },
    });
    if (!run) {
      throw new V2NotFoundError(`SimulationRun not found: ${runId}`);
    }

    // Ownership & permission checks (FIX-4, R2-P1 #2, #9)
    if (run.controlWorkspaceId !== controlWorkspaceId) {
      throw new V2ForbiddenError(`SimulationRun ${runId} does not belong to control workspace ${controlWorkspaceId}`);
    }

    if (userId) {
      const member = await this.prisma.workspaceMember.findFirst({
        where: { workspaceId: controlWorkspaceId, userId },
      });
      if (!member) {
        throw new V2ForbiddenError(`User ${userId} is not a member of control workspace ${controlWorkspaceId}`);
      }
      const runMember = await this.prisma.workspaceMember.findFirst({
        where: { workspaceId: run.runWorkspaceId, userId },
      });
      if (!runMember) {
        throw new V2ForbiddenError(`User ${userId} is not a member of run workspace ${run.runWorkspaceId}`);
      }
    }

    if (run.status !== 'RUNNING') {
      throw new V2ConflictError(`SimulationRun ${runId} is not in RUNNING status (current: ${run.status})`);
    }

    const worldState = run.stateSnapshot as unknown as V2WorldState;
    const config = run.config as unknown as V2Config;
    const currentDate = worldState.nextDate;

    // Idempotency / date check (P1 #2: replay already committed tick)
    if (targetDate) {
      if (run.completedThrough) {
        const completedStr =
          run.completedThrough instanceof Date
            ? run.completedThrough.toISOString().split('T')[0]
            : String(run.completedThrough).split('T')[0];
        if (targetDate <= completedStr) {
          const existingTick = await this.prisma.simulationTick.findFirst({
            where: { runId, date: new Date(`${targetDate}T00:00:00.000Z`) },
          });
          if (existingTick) {
            const tickSummary = (existingTick.summary as any) ?? {};
            return {
              runId,
              simDate: targetDate,
              nextDate: worldState.nextDate,
              completedThrough: targetDate,
              profitSummary: tickSummary,
              dayOutput: tickSummary.dayOutput ?? {
                orders: 0,
                shipped: 0,
                refunds: 0,
                adClicks: 0,
                adSpendCents: 0,
              },
            };
          }
          throw new V2ConflictError(`Day ${targetDate} has already been completed for run ${runId}`);
        }
      }
      if (targetDate !== currentDate) {
        throw new V2ConflictError(`Target date ${targetDate} does not match expected nextDate ${currentDate}`);
      }
    }

    // Check existing tick for today (replay if committed)
    if (this.prisma.simulationTick?.findFirst) {
      const existingTick = await this.prisma.simulationTick.findFirst({
        where: {
          runId,
          date: new Date(`${currentDate}T00:00:00.000Z`),
        },
      });
      if (existingTick && existingTick.status === 'COMMITTED') {
        const tickSummary = (existingTick.summary as any) ?? {};
        return {
          runId,
          simDate: currentDate,
          nextDate: worldState.nextDate,
          completedThrough: currentDate,
          profitSummary: tickSummary,
          dayOutput: tickSummary.dayOutput ?? {
            orders: 0,
            shipped: 0,
            refunds: 0,
            adClicks: 0,
            adSpendCents: 0,
          },
        };
      }
    }

    // Pure domain day transition with external events
    const externalEvents: V2ExternalEvent[] = (config as any)?.externalEvents || [];
    const dayOutput = simulateV2Day(worldState, config, externalEvents);
    const ledgerEntries = generateLedgerEntries(dayOutput, config, run.storeId);
    const profitSummary = summarizeDailyProfit(currentDate, ledgerEntries);
    const observables = projectObservables(dayOutput);

    const inputHash = computeSha256({ worldState, config, date: currentDate });
    const outputHash = computeSha256({ nextState: dayOutput.nextState, profitSummary });

    try {
      // Atomic persistence
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // 1. Simulation Tick with full daily output summary (R2-12)
        const totalOrders = dayOutput.skuOutputs.reduce((acc, s) => acc + s.fulfilledOrders, 0);
        const totalShipped = dayOutput.shippedOrders.length;
        const totalRefunds = dayOutput.processedRefunds.length;
        const totalAdClicks = dayOutput.adOutputs.reduce((acc, a) => acc + a.clicks, 0);
        const totalAdSpend = dayOutput.adOutputs.reduce((acc, a) => acc + a.spendCents, 0);

        const tickSummary = {
          ...profitSummary,
          dayOutput: {
            orders: totalOrders,
            shipped: totalShipped,
            refunds: totalRefunds,
            adClicks: totalAdClicks,
            adSpendCents: totalAdSpend,
          },
        };

        await tx.simulationTick.create({
          data: {
            runId,
            date: new Date(`${currentDate}T00:00:00.000Z`),
            inputHash,
            outputHash,
            stateVersion: dayOutput.nextState.stateVersion,
            status: 'COMMITTED',
            summary: tickSummary as any,
          },
        });

        // 2. Ledger Entries
        if (ledgerEntries.length > 0) {
          await tx.simulationLedgerEntry.createMany({
            data: ledgerEntries.map((entry) => ({
              runId: entry.runId,
              storeId: entry.storeId,
              date: new Date(`${entry.date}T00:00:00.000Z`),
              sourceType: entry.sourceType,
              sourceId: entry.sourceId,
              entryType: entry.entryType,
              sequence: entry.sequence,
              signedAmountCents: entry.signedAmountCents,
              currency: entry.currency,
              description: entry.description,
            })),
          });
        }

        // 3. Profit Daily per SKU (FIX-2 aligned to schema.prisma:998-1022)
        for (const sku of dayOutput.nextState.skus) {
          const skuOrders = dayOutput.shippedOrders.filter((o) => o.skuId === sku.id);
          const skuRefunds = dayOutput.processedRefunds.filter((r) => r.skuId === sku.id);
          const skuAds = dayOutput.adOutputs.filter((a) => a.skuCode === sku.skuCode);

          const revCents = skuOrders.reduce((acc, o) => acc + o.priceCents, 0);
          const cogsCents = skuOrders.reduce((acc, o) => acc + o.unitCostCents, 0);
          const amzFeesCents = skuOrders.reduce(
            (acc, o) => acc + Math.round(o.priceCents * config.platformFeeRate),
            0,
          );
          const fbaFeesCents = skuOrders.length * config.fbaFeeCents;
          const adsCostCents = skuAds.reduce((acc, a) => acc + a.spendCents, 0);
          const returnLossCents = skuRefunds.reduce(
            (acc, r) => acc + r.refundAmountCents - (r.isRestockable ? r.unitCostCents : 0),
            0,
          );
          const netProfitCents =
            revCents - cogsCents - amzFeesCents - fbaFeesCents - adsCostCents - returnLossCents;

          const revDollars = revCents / 100;
          const netProfitDollars = netProfitCents / 100;
          const margin = revDollars > 0 ? Number((netProfitDollars / revDollars).toFixed(4)) : 0;

          await tx.profitDaily.create({
            data: {
              workspaceId: run.runWorkspaceId,
              skuId: sku.id,
              date: new Date(`${currentDate}T00:00:00.000Z`),
              revenue: revDollars,
              cogs: cogsCents / 100,
              adsCost: adsCostCents / 100,
              amazonFees: amzFeesCents / 100,
              fbaFee: fbaFeesCents / 100,
              returnLoss: returnLossCents / 100,
              otherCosts: 0,
              netProfit: netProfitDollars,
              margin,
              source: 'SIMULATOR',
            },
          });
        }

        // 4. Channel daily metrics
        if (observables.channelDailyMetrics.length > 0) {
          await tx.channelDailyMetric.createMany({
            data: observables.channelDailyMetrics.map((m) => ({
              workspaceId: run.runWorkspaceId,
              skuId: m.skuId,
              channel: m.channel,
              metricDate: new Date(`${m.metricDate}T00:00:00.000Z`),
              sessions: m.sessions,
              addToCart: m.addToCart,
              checkout: m.checkout,
              orders: m.orders,
              conversionRate: m.conversionRate,
              bounceRate: m.bounceRate,
              revenue: m.revenue,
            })),
          });
        }

        // 5. Ad daily metrics
        if (observables.adMetrics.length > 0) {
          await tx.adMetricDaily.createMany({
            data: observables.adMetrics.map((a) => ({
              campaignId: a.campaignId,
              skuId:
                dayOutput.nextState.skus.find((s) => s.skuCode === a.skuCode)?.id ?? a.skuCode,
              metricDate: new Date(`${a.metricDate}T00:00:00.000Z`),
              impressions: a.impressions,
              clicks: a.clicks,
              spend: a.spend,
              orders: a.orders,
              sales: a.sales,
            })),
          });
        }

        // 6. Inventory Snapshots
        if (observables.inventorySnapshots.length > 0) {
          await tx.inventorySnapshot.createMany({
            data: observables.inventorySnapshots.map((s) => ({
              workspaceId: run.runWorkspaceId,
              skuId: s.skuId,
              snapshotDate: new Date(`${s.snapshotDate}T00:00:00.000Z`),
              fulfillable: s.fulfillable,
              reserved: s.reserved,
              inbound: s.inbound,
              unfulfillable: s.unfulfillable,
              daysCover: s.daysCover,
            })),
          });
        }

        // 7. Inventory Balances
        for (const sku of dayOutput.nextState.skus) {
          await tx.inventoryBalance.upsert({
            where: {
              workspaceId_skuId_warehouseType: {
                workspaceId: run.runWorkspaceId,
                skuId: sku.id,
                warehouseType: 'FBA',
              },
            },
            update: {
              fulfillableQuantity: sku.available,
              reservedQuantity: sku.reserved,
              unfulfillableQuantity: sku.unsellable,
            },
            create: {
              workspaceId: run.runWorkspaceId,
              skuId: sku.id,
              warehouseType: 'FBA',
              fulfillableQuantity: sku.available,
              reservedQuantity: sku.reserved,
              unfulfillableQuantity: sku.unsellable,
              inboundQuantity: 0,
            },
          });
        }

        // 8. Update SimulationRun with optimistic concurrency control (FIX-7)
        const updateResult = await tx.simulationRun.updateMany({
          where: {
            id: run.id,
            stateVersion: run.stateVersion ?? 1,
          },
          data: {
            completedThrough: new Date(`${currentDate}T00:00:00.000Z`),
            stateSnapshot: dayOutput.nextState as any,
            stateVersion: (run.stateVersion ?? 1) + 1,
          },
        });
        if (updateResult.count === 0) {
          throw new V2ConflictError('VERSION_CONFLICT: SimulationRun state version conflict or concurrent update');
        }
      });
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const committedTick = await this.prisma.simulationTick.findFirst({
          where: { runId, date: new Date(`${currentDate}T00:00:00.000Z`) },
        });
        if (committedTick) {
          const tickSummary = (committedTick.summary as any) ?? {};
          return {
            runId,
            simDate: currentDate,
            nextDate: worldState.nextDate,
            completedThrough: currentDate,
            profitSummary: tickSummary.revenueCents !== undefined ? tickSummary : profitSummary,
            dayOutput: tickSummary.dayOutput ?? {
              orders: dayOutput.skuOutputs.reduce((acc, s) => acc + s.fulfilledOrders, 0),
              shipped: dayOutput.shippedOrders.length,
              refunds: dayOutput.processedRefunds.length,
              adClicks: dayOutput.adOutputs.reduce((acc, a) => acc + a.clicks, 0),
              adSpendCents: dayOutput.adOutputs.reduce((acc, a) => acc + a.spendCents, 0),
            },
          };
        }
        throw new V2ConflictError(`Concurrent tick conflict for date ${currentDate}`);
      }
      throw err;
    }

    const totalOrders = dayOutput.skuOutputs.reduce((acc, s) => acc + s.fulfilledOrders, 0);
    const totalAdClicks = dayOutput.adOutputs.reduce((acc, a) => acc + a.clicks, 0);
    const totalAdSpend = dayOutput.adOutputs.reduce((acc, a) => acc + a.spendCents, 0);

    return {
      runId,
      simDate: currentDate,
      nextDate: dayOutput.nextState.nextDate,
      completedThrough: currentDate,
      profitSummary,
      dayOutput: {
        orders: totalOrders,
        shipped: dayOutput.shippedOrders.length,
        refunds: dayOutput.processedRefunds.length,
        adClicks: totalAdClicks,
        adSpendCents: totalAdSpend,
      },
    };
  }

  /**
   * Applies an approved simulator action (DECREASE_BID / STOP_CAMPAIGN) atomically:
   * 1. Mutates campaign in stateSnapshot
   * 2. Writes execution receipt with actionId foreign key
   * 3. Updates SimulationRun.stateSnapshot with optimistic concurrency control on stateVersion
   * 4. Updates PlannedAction to SUCCESS and writes ActionExecution
   * All executed in a single atomic database transaction (R2-4, R2-10).
   */
  async applyAction(params: {
    runId: string;
    actionId: string;
    actionType: string;
    target: Record<string, unknown>;
    parameters: Record<string, unknown>;
    userId?: string;
    payloadHash: string;
    expectedTargetVersion?: number;
  }): Promise<{
    success: boolean;
    beforeState: { bidCents?: number; status?: string; targetVersion: number };
    afterState: { bidCents?: number; status?: string; targetVersion: number };
    appliedDate: Date;
  }> {
    const { runId, actionId, actionType, target, parameters, userId, payloadHash } = params;

    const run = await this.prisma.simulationRun.findUnique({
      where: { id: runId },
    });
    if (!run) {
      throw new V2NotFoundError(`SimulationRun not found: ${runId}`);
    }
    if (run.status !== 'RUNNING') {
      throw new V2ConflictError(`SimulationRun ${runId} is not in RUNNING status (${run.status})`);
    }
    if (target.storeId && target.storeId !== run.storeId) {
      throw new V2ForbiddenError(`Target storeId ${target.storeId} does not match SimulationRun storeId ${run.storeId}`);
    }

    const worldState = run.stateSnapshot as any;
    if (!worldState || !Array.isArray(worldState.campaigns)) {
      throw new V2BadRequestError('SimulationRun stateSnapshot has invalid campaigns');
    }

    const campaignId = String(target.campaignId);
    const campaign = worldState.campaigns.find((c: any) => c.id === campaignId);
    if (!campaign) {
      throw new V2NotFoundError(`Campaign ${campaignId} not found in SimulationRun ${runId}`);
    }

    const expectedVersion =
      params.expectedTargetVersion ??
      target.expectedTargetVersion ??
      parameters.expectedTargetVersion;

    if (expectedVersion === undefined || expectedVersion === null) {
      throw new V2BadRequestError('expectedTargetVersion is required for v2 simulation action execution');
    }
    if (Number(expectedVersion) !== campaign.targetVersion) {
      throw new V2ConflictError(
        `VERSION_CONFLICT: expected targetVersion ${expectedVersion} but found ${campaign.targetVersion}`,
      );
    }

    const beforeState = {
      bidCents: campaign.bidCents,
      status: campaign.status,
      targetVersion: campaign.targetVersion,
    };

    let percentage: number | undefined;
    if (actionType === 'DECREASE_BID') {
      const rawPct = parameters.percentage;
      percentage = Number(rawPct);
      if (rawPct === undefined || rawPct === null || isNaN(percentage) || percentage < 1 || percentage > 100) {
        throw new V2BadRequestError('percentage must be a number between 1 and 100');
      }
      const newBid = Math.round(campaign.bidCents * (1 - percentage / 100));
      campaign.bidCents = Math.max(20, newBid);
      campaign.targetVersion += 1;
    } else if (actionType === 'STOP_CAMPAIGN') {
      campaign.status = 'PAUSED';
      campaign.targetVersion += 1;
    } else {
      throw new V2BadRequestError(`UNSUPPORTED_CAPABILITY: Unsupported actionType ${actionType}`);
    }

    const afterState = {
      bidCents: campaign.bidCents,
      status: campaign.status,
      targetVersion: campaign.targetVersion,
    };

    const appliedDate = worldState.nextDate
      ? new Date(`${worldState.nextDate}T00:00:00.000Z`)
      : new Date();

    const history = worldState.actionHistory || [];
    history.push({
      campaignId: campaign.id,
      actionType,
      date: worldState.nextDate || new Date().toISOString().slice(0, 10),
      ...(percentage !== undefined ? { percentage } : {}),
    });
    worldState.actionHistory = history;

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient | any) => {
      // 1. Create execution receipt
      if (tx.simulationExecutionReceipt?.create) {
        await tx.simulationExecutionReceipt.create({
          data: {
            runId,
            actionId,
            operationKind: 'APPLY',
            payloadHash,
            appliedDate,
            targetVersion: campaign.targetVersion,
            status: 'APPLIED',
            beforeState,
            afterState,
            attempt: 1,
          },
        });
      }

      // 2. Update SimulationRun stateSnapshot with optimistic lock on stateVersion
      const updateCount = await tx.simulationRun.updateMany({
        where: {
          id: run.id,
          stateVersion: run.stateVersion,
        },
        data: {
          stateSnapshot: worldState,
          stateVersion: { increment: 1 },
        },
      });
      if (updateCount.count === 0) {
        throw new V2ConflictError('VERSION_CONFLICT: SimulationRun stateVersion conflict during action execution');
      }

      // 3. Record ActionExecution
      if (tx.actionExecution?.create) {
        await tx.actionExecution.create({
          data: {
            workspaceId: run.runWorkspaceId,
            actionId,
            operator: userId || 'owner',
            status: 'SUCCESS',
            attempt: 1,
            input: parameters,
            output: { beforeState, afterState, appliedDate: worldState.nextDate },
          },
        });
      }

      // 4. Update PlannedAction
      if (tx.plannedAction?.update) {
        await tx.plannedAction.update({
          where: { id: actionId },
          data: {
            status: 'SUCCESS',
            lastMessage: `Simulator v2 Action APPLIED to campaign ${campaignId}`,
          },
        });
      }
    });

    return {
      success: true,
      beforeState,
      afterState,
      appliedDate,
    };
  }
}
