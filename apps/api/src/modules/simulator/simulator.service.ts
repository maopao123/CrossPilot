import { createHash } from 'crypto';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  SimulatorAdapter,
  SimulatorCatalogMissingError,
  SimulatorConflictError,
  SimulatorTickResult,
  V2RunStore,
  V2ConflictError,
  V2NotFoundError,
  V2ForbiddenError,
  V2BadRequestError,
} from '@crosspilot/db';
import { SimWorldState } from '@crosspilot/domain';
import { PrismaService } from '../prisma/prisma.service.js';
import { SimulatorPersistenceService } from './simulator.persistence.js';

@Injectable()
export class SimulatorService {
  private readonly logger = new Logger(SimulatorService.name);

  private closedLoopQueue: Queue | null = null;

  public setClosedLoopQueue(queue: Queue | null) {
    this.closedLoopQueue = queue;
  }

  public getClosedLoopQueue(): Queue {
    if (!this.closedLoopQueue) {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      this.closedLoopQueue = new Queue('crosspilot-closed-loop-v2', {
        connection: new Redis(redisUrl, { maxRetriesPerRequest: null }) as any,
      });
    }
    return this.closedLoopQueue;
  }

  constructor(
    private readonly persistence: SimulatorPersistenceService,
    private readonly prisma: PrismaService,
  ) {}

  /** Advances the simulated world by one day and persists the resulting dataset. */
  async tick(workspaceId: string): Promise<SimulatorTickResult> {
    try {
      const result = await new SimulatorAdapter(this.prisma).tick(workspaceId);
      this.logger.log(`Simulator ticked to ${result.simDate} (day ${result.dayIndex}) for ${workspaceId}`);
      return result;
    } catch (err) {
      if (err instanceof SimulatorConflictError) {
        throw new ConflictException(err.message);
      }
      if (err instanceof SimulatorCatalogMissingError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  /** Advances N days (1–90) by repeatedly ticking. */
  async advance(workspaceId: string, days: number) {
    if (!Number.isInteger(days) || days < 1 || days > 90) {
      throw new BadRequestException('days 必须是 1 到 90 之间的整数。');
    }
    let last: SimulatorTickResult | null = null;
    for (let i = 0; i < days; i++) {
      last = await this.tick(workspaceId);
    }
    return {
      advancedDays: days,
      simDate: last!.simDate,
      dayIndex: last!.dayIndex,
      lastDay: last!.day,
    };
  }

  /** Reset the simulated world. */
  async reset(workspaceId: string) {
    const v2Store = new V2RunStore(this.prisma);
    if (await v2Store.isRunWorkspace(workspaceId)) {
      throw new ConflictException(
        'RESET_REQUIRES_NEW_RUN: v2 Run cannot be reset via legacy reset. Create a new Run instead.',
      );
    }

    throw new BadRequestException(
      'LEGACY_RESET_DISABLED: 传统模拟器重置已停用以保护未经验证的工作区数据。请创建并使用新的 v2 闭环模拟 Run。',
    );
  }

  /** Lists v2 SimulationRuns for a control workspace. */
  async listRuns(controlWorkspaceId: string, limit = 20) {
    return await this.prisma.simulationRun.findMany({
      where: { controlWorkspaceId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        controlWorkspaceId: true,
        runWorkspaceId: true,
        storeId: true,
        modelVersion: true,
        status: true,
        completedThrough: true,
        stateVersion: true,
        seed: true,
        configHash: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /** Creates an isolated v2 SimulationRun with dedicated workspace and store. */
  async createRun(
    controlWorkspaceId: string,
    userId: string,
    options: { modelVersion?: string; seed?: number; scenarioId?: string; idempotencyKey?: string; customConfig?: any } = {},
  ) {
    try {
      const v2Store = new V2RunStore(this.prisma);
      return await v2Store.createRun(controlWorkspaceId, userId, options);
    } catch (err: any) {
      if (err instanceof V2ConflictError || err?.code === 'CONFLICT' || err?.message?.includes('conflict') || err?.message?.includes('already exists')) {
        throw new ConflictException(err.message);
      }
      if (err instanceof V2NotFoundError || err?.code === 'NOT_FOUND' || err?.message?.includes('not found')) {
        throw new NotFoundException(err.message);
      }
      if (err?.message?.includes('Unsupported modelVersion')) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  /** Retrieves the summary of a v2 SimulationRun with receipts and outcomes. */
  async getRun(controlWorkspaceId: string, runId: string, userId?: string) {
    try {
      const v2Store = new V2RunStore(this.prisma);
      const summary = await v2Store.getRun(controlWorkspaceId, runId, userId);
      const receipts = (await this.prisma.simulationExecutionReceipt?.findMany?.({
        where: { runId },
        orderBy: { appliedDate: 'desc' },
        take: 50,
      })) || [];
      const outcomes = (await this.prisma.actionOutcome?.findMany?.({
        where: { workspaceId: summary.runWorkspaceId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })) || [];
      return {
        ...summary,
        receipts,
        outcomes,
      };
    } catch (err: any) {
      if (err instanceof V2NotFoundError || err?.code === 'NOT_FOUND' || err?.message?.includes('not found')) {
        throw new NotFoundException(err.message);
      }
      if (
        err instanceof V2ForbiddenError ||
        err?.code === 'FORBIDDEN' ||
        err?.message?.includes('does not belong') ||
        err?.message?.includes('not a member')
      ) {
        throw new ForbiddenException(err.message);
      }
      throw err;
    }
  }

  /** Advances a v2 SimulationRun by one day atomically (FIX-4). */
  async tickRun(controlWorkspaceId: string, runId: string, targetDate?: string, userId?: string) {
    try {
      const v2Store = new V2RunStore(this.prisma);
      return await v2Store.tickDay(controlWorkspaceId, runId, targetDate, userId);
    } catch (err: any) {
      if (
        err instanceof V2ConflictError ||
        err?.code === 'CONFLICT' ||
        err?.name === 'ConflictException' ||
        err?.message?.includes('already') ||
        err?.message?.includes('conflict')
      ) {
        throw new ConflictException(err.message);
      }
      if (
        err instanceof V2NotFoundError ||
        err?.code === 'NOT_FOUND' ||
        err?.name === 'NotFoundException' ||
        err?.message?.includes('not found')
      ) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof V2ForbiddenError || err?.code === 'FORBIDDEN' || err?.message?.includes('does not belong')) {
        throw new ForbiddenException(err.message);
      }
      throw err;
    }
  }

  /**
   * Advance a v2 SimulationRun by N days (1–90) (FIX-17 / R2-2).
   * mode:
   * - 'asynchronous': Enqueues real BullMQ job to 'crosspilot-closed-loop-v2' and returns 202 with real jobId.
   * - 'synchronous': Deterministic immediate in-process advancement (for tests, scripts, step debugging).
   */
  async advanceRun(
    controlWorkspaceId: string,
    runId: string,
    days: number,
    mode: 'synchronous' | 'asynchronous' = 'synchronous',
    userId?: string,
  ) {
    await this.getRun(controlWorkspaceId, runId, userId);

    if (mode === 'asynchronous') {
      const queue = this.getClosedLoopQueue();
      const job = await queue.add('advance-run', {
        runId,
        days,
        controlWorkspaceId,
        userId,
      });

      return {
        jobId: job.id,
        status: 'ACCEPTED',
        runId,
        days,
        mode: 'asynchronous',
      };
    }

    let advancedDays = 0;
    let lastResult: any = null;
    for (let i = 0; i < days; i++) {
      const currentRun = await this.prisma.simulationRun.findUnique({ where: { id: runId } });
      if (!currentRun || currentRun.status === 'PAUSED') {
        break;
      }
      lastResult = await this.tickRun(controlWorkspaceId, runId, undefined, userId);
      advancedDays += 1;
    }

    return {
      jobId: `sync-${runId}-${Date.now()}`,
      status: 'ACCEPTED',
      runId,
      requestedDays: days,
      advancedDays,
      completedThrough: lastResult?.completedThrough,
      mode: 'synchronous',
    };
  }

  /** Pause a v2 SimulationRun at day boundary (FIX-17). */
  async pauseRun(controlWorkspaceId: string, runId: string) {
    const run = await this.prisma.simulationRun.findUnique({ where: { id: runId } });
    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }
    if (run.controlWorkspaceId !== controlWorkspaceId) {
      throw new ForbiddenException(`Workspace does not own run ${runId}`);
    }

    return await this.prisma.simulationRun.update({
      where: { id: runId },
      data: { status: 'PAUSED' },
      select: { id: true, status: true, completedThrough: true },
    });
  }

  /** Inject external events into a v2 SimulationRun (FIX-17). Past events are immutable. */
  async injectEvents(controlWorkspaceId: string, runId: string, events: any[]) {
    const run = await this.prisma.simulationRun.findUnique({ where: { id: runId } });
    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }
    if (run.controlWorkspaceId !== controlWorkspaceId) {
      throw new ForbiddenException(`Workspace does not own run ${runId}`);
    }

    const completedDateStr = run.completedThrough
      ? run.completedThrough.toISOString().slice(0, 10)
      : null;

    if (completedDateStr) {
      for (const ev of events) {
        if (ev.date && ev.date <= completedDateStr) {
          throw new BadRequestException(
            `Cannot inject event for past date ${ev.date} (run completed through ${completedDateStr}). Committed past is immutable.`,
          );
        }
      }
    }

    const currentConfig = (run.config as any) ?? {};
    const existingEvents = Array.isArray(currentConfig.externalEvents)
      ? currentConfig.externalEvents
      : [];
    const updatedEvents = [...existingEvents, ...events];

    await this.prisma.simulationRun.update({
      where: { id: runId },
      data: {
        config: {
          ...currentConfig,
          externalEvents: updatedEvents,
        },
      },
    });

    return {
      success: true,
      injectedCount: events.length,
      totalEvents: updatedEvents.length,
    };
  }

  /** Current world snapshot: clock, recent events, 14-day channel funnel. */
  async getState(workspaceId: string) {
    const loaded = await this.persistence.loadState(workspaceId);
    if (!loaded) {
      return { initialized: false };
    }
    const worldState = loaded.stored.worldState as SimWorldState;

    const events = await this.prisma.simulationEvent.findMany({
      where: { workspaceId },
      orderBy: [{ simDate: 'desc' }, { createdAt: 'desc' }],
      take: 50,
      include: { sku: { select: { skuCode: true } } },
    });

    const funnelStart = new Date(`${worldState.simDate}T00:00:00.000Z`);
    funnelStart.setUTCDate(funnelStart.getUTCDate() - 13);
    const channelRows = await this.prisma.channelDailyMetric.findMany({
      where: { workspaceId, metricDate: { gte: funnelStart } },
      include: { sku: { select: { skuCode: true } } },
      orderBy: { metricDate: 'asc' },
    });

    const channelSummary: Record<
      string,
      { sessions: number; addToCart: number; checkout: number; orders: number; revenue: number }
    > = {};
    for (const row of channelRows) {
      const bucket = (channelSummary[row.channel] ??= {
        sessions: 0,
        addToCart: 0,
        checkout: 0,
        orders: 0,
        revenue: 0,
      });
      bucket.sessions += row.sessions;
      bucket.addToCart += row.addToCart;
      bucket.checkout += row.checkout;
      bucket.orders += row.orders;
      bucket.revenue += Number(row.revenue);
    }
    for (const bucket of Object.values(channelSummary)) {
      bucket.revenue = Math.round(bucket.revenue * 100) / 100;
    }

    return {
      initialized: true,
      simDate: worldState.simDate,
      dayIndex: worldState.dayIndex,
      status: loaded.row.status,
      activeEvents: worldState.activeEvents.map((event) => ({
        code: event.code,
        skuCode: event.skuCode,
        severity: event.severity,
        title: event.title,
        startDayIndex: event.startDayIndex,
        endDayIndex: event.endDayIndex,
      })),
      recentEvents: events,
      channelSummaryLast14Days: channelSummary,
    };
  }

  /** Creates a three-group experiment (Control, Rule, CrossPilot) with budget and policy constraints (FIX-15). */
  async createExperiment(
    controlWorkspaceId: string,
    userId: string,
    dto: {
      name?: string;
      scenarioIds?: string[];
      seeds?: number[];
      policyVersion?: string;
      evaluationVersion?: string;
      maxLlmCalls?: number;
      maxCostUSD?: number;
    } = {},
  ) {
    const v2Store = new V2RunStore(this.prisma);
    const scenarioIds = dto.scenarioIds ?? ['S01'];
    const seeds = dto.seeds ?? [1001];
    const name = dto.name ?? `Experiment_${scenarioIds.join('_')}_${Date.now()}`;

    const isBudgetExhausted =
      (dto.maxLlmCalls !== undefined && dto.maxLlmCalls <= 0) ||
      (dto.maxCostUSD !== undefined && dto.maxCostUSD <= 0);

    const initialStatus = isBudgetExhausted ? 'PAUSED_BUDGET' : 'RUNNING';

    const matrix: Array<{
      scenarioId: string;
      seed: number;
      controlRunId: string;
      ruleRunId: string;
      crossPilotRunId: string;
    }> = [];
    const allRunIds: string[] = [];

    for (const scenarioId of scenarioIds) {
      for (const seed of seeds) {
        const controlRun = await v2Store.createRun(controlWorkspaceId, userId, {
          scenarioId,
          seed,
          customConfig: { group: 'CONTROL' },
          policyEnabled: false,
        });

        const ruleRun = await v2Store.createRun(controlWorkspaceId, userId, {
          scenarioId,
          seed,
          customConfig: { group: 'RULE' },
          policyEnabled: true,
          policyLimits: {
            maxSingleBidChangePct: 0.10,
            maxCumulativeBidChangePct: 0.30,
            cooldownDays: 3,
            maxDailyActionsPerTarget: 3,
            min7DayClicks: 100,
            minBidUSD: 0.20,
          },
        });

        const crossPilotRun = await v2Store.createRun(controlWorkspaceId, userId, {
          scenarioId,
          seed,
          customConfig: { group: 'CROSSPILOT' },
          policyEnabled: true,
          policyLimits: {
            maxSingleBidChangePct: 0.20,
            maxCumulativeBidChangePct: 0.30,
            cooldownDays: 3,
            maxDailyActionsPerTarget: 3,
            min7DayClicks: 100,
            minBidUSD: 0.20,
          },
        });

        matrix.push({
          scenarioId,
          seed,
          controlRunId: controlRun.runId,
          ruleRunId: ruleRun.runId,
          crossPilotRunId: crossPilotRun.runId,
        });
        allRunIds.push(controlRun.runId, ruleRun.runId, crossPilotRun.runId);
      }
    }

    const firstPair = matrix[0];

    const manifest = {
      scenarioIds,
      seeds,
      policyVersion: dto.policyVersion ?? 'v1.0.0',
      evaluationVersion: dto.evaluationVersion ?? 'closed-loop-v2',
      maxLlmCalls: dto.maxLlmCalls ?? 100,
      maxCostUSD: dto.maxCostUSD ?? 10.0,
    };

    const manifestHash = createHash('sha256')
      .update(JSON.stringify(manifest))
      .digest('hex');

    const experiment = await this.prisma.simulationExperiment.create({
      data: {
        controlWorkspaceId,
        name,
        scenarioManifest: manifest.scenarioIds,
        seedManifest: manifest.seeds,
        manifestHash,
        policyVersion: manifest.policyVersion,
        evaluationVersion: manifest.evaluationVersion,
        status: initialStatus,
        controlRunId: firstPair?.controlRunId,
        ruleRunId: firstPair?.ruleRunId,
        crossPilotRunId: firstPair?.crossPilotRunId,
        artifacts: {
          strategyMode: 'CrossPilot 规则链路，无 LLM 调用',
          totalRunsPlanned: allRunIds.length,
          comparisonsPlanned: matrix.length,
          budget: {
            maxLlmCalls: manifest.maxLlmCalls,
            maxCostUSD: manifest.maxCostUSD,
            callsUsed: 0,
            costUsedUSD: 0,
          },
          matrix,
        },
      },
    });

    if (allRunIds.length > 0 && typeof this.prisma.simulationRun?.updateMany === 'function') {
      await this.prisma.simulationRun.updateMany({
        where: { id: { in: allRunIds } },
        data: { parentExperimentId: experiment.id },
      });
    }

    return experiment;
  }

  /** Retrieves a simulation experiment and its associated three-group runs. */
  async getExperiment(controlWorkspaceId: string, experimentId: string) {
    const experiment = await this.prisma.simulationExperiment.findUnique({
      where: { id: experimentId },
      include: { runs: true },
    });

    if (!experiment) {
      throw new NotFoundException(`Experiment ${experimentId} not found`);
    }

    if (experiment.controlWorkspaceId !== controlWorkspaceId) {
      throw new ForbiddenException(`Workspace does not own experiment ${experimentId}`);
    }

    return experiment;
  }

  /** Updates autopilot policy configuration for a run. Restricted to OWNER / ADMIN. Policy limits can only be tightened (FIX-10 / R2-3). */
  async updateRunPolicy(
    controlWorkspaceId: string,
    runId: string,
    userRole: string,
    dto: { policyEnabled: boolean; policyLimits?: any },
  ) {
    if (userRole !== 'OWNER' && userRole !== 'ADMIN') {
      throw new ForbiddenException('Only workspace OWNER or ADMIN can configure autopilot policy.');
    }

    const run = await this.prisma.simulationRun.findUnique({
      where: { id: runId },
    });

    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    if (run.controlWorkspaceId !== controlWorkspaceId) {
      throw new ForbiddenException(`Workspace does not own run ${runId}`);
    }

    const currentLimits = ((run.policyLimits as any) ?? {}) as Record<string, number | undefined>;
    let mergedLimits = { ...currentLimits };

    if (dto.policyLimits) {
      const limits = dto.policyLimits;
      const allowedKeys = [
        'maxSingleBidChangePct',
        'maxCumulativeBidChangePct',
        'cooldownDays',
        'maxDailyActionsPerTarget',
        'min7DayClicks',
        'minBidUSD',
      ];
      for (const key of Object.keys(limits)) {
        if (!allowedKeys.includes(key)) {
          throw new BadRequestException(`policyLimits contains unknown key: ${key}`);
        }
      }

      // Monotonic tightening checks against currently saved limits (or default limits)
      const currentMaxSingle = Math.min(0.20, currentLimits.maxSingleBidChangePct ?? 0.20);
      if (limits.maxSingleBidChangePct !== undefined && limits.maxSingleBidChangePct > currentMaxSingle) {
        throw new BadRequestException(
          `maxSingleBidChangePct cannot be relaxed beyond current limit of ${currentMaxSingle}`,
        );
      }

      const currentMaxCumulative = Math.min(0.30, currentLimits.maxCumulativeBidChangePct ?? 0.30);
      if (limits.maxCumulativeBidChangePct !== undefined && limits.maxCumulativeBidChangePct > currentMaxCumulative) {
        throw new BadRequestException(
          `maxCumulativeBidChangePct cannot be relaxed beyond current limit of ${currentMaxCumulative}`,
        );
      }

      const currentCooldown = Math.max(3, currentLimits.cooldownDays ?? 3);
      if (limits.cooldownDays !== undefined && limits.cooldownDays < currentCooldown) {
        throw new BadRequestException(
          `cooldownDays cannot be relaxed below current limit of ${currentCooldown} days`,
        );
      }

      const currentMaxDaily = Math.min(3, currentLimits.maxDailyActionsPerTarget ?? 3);
      if (limits.maxDailyActionsPerTarget !== undefined && limits.maxDailyActionsPerTarget > currentMaxDaily) {
        throw new BadRequestException(
          `maxDailyActionsPerTarget cannot be relaxed beyond current limit of ${currentMaxDaily}`,
        );
      }

      const currentMinClicks = Math.max(100, currentLimits.min7DayClicks ?? 100);
      if (limits.min7DayClicks !== undefined && limits.min7DayClicks < currentMinClicks) {
        throw new BadRequestException(
          `min7DayClicks cannot be relaxed below current limit of ${currentMinClicks} clicks`,
        );
      }

      const currentMinBid = Math.max(0.20, currentLimits.minBidUSD ?? 0.20);
      if (limits.minBidUSD !== undefined && limits.minBidUSD < currentMinBid) {
        throw new BadRequestException(
          `minBidUSD cannot be relaxed below current limit of $${currentMinBid.toFixed(2)}`,
        );
      }

      mergedLimits = { ...currentLimits, ...limits };
    }

    return await this.prisma.simulationRun.update({
      where: { id: runId },
      data: {
        policyEnabled: dto.policyEnabled,
        policyLimits: mergedLimits,
      },
    });
  }
}
