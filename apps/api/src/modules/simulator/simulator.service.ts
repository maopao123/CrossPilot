import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import {
  SimulatorAdapter,
  SimulatorCatalogMissingError,
  SimulatorConflictError,
  SimulatorTickResult,
} from '@crosspilot/db';
import { SimWorldState } from '@crosspilot/domain';
import { PrismaService } from '../prisma/prisma.service.js';
import { SimulatorPersistenceService } from './simulator.persistence.js';

@Injectable()
export class SimulatorService {
  private readonly logger = new Logger(SimulatorService.name);

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

  /** Wipes simulator-produced rows and rebuilds the initial world. */
  async reset(workspaceId: string) {
    try {
      const { worldState } = await this.persistence.resetWorld(workspaceId);
      return {
        success: true,
        simDate: worldState.simDate,
        dayIndex: worldState.dayIndex,
        message: '模拟器世界已重置为初始状态。',
      };
    } catch (err) {
      if (err instanceof SimulatorCatalogMissingError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
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
}
