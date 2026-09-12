import { PrismaClient } from '@prisma/client';
import {
  SimulatorAdapter,
  SimulatorCatalogMissingError,
  SimulatorConflictError,
} from '@crosspilot/db';

/**
 * One simulator sweep: every workspace whose SimulationState is RUNNING gets
 * advanced by one simulated day. A workspace that was already advanced by a
 * concurrent tick (optimistic-lock conflict) is skipped silently; any other
 * failure is logged and skipped so one bad workspace never stalls the sweep.
 */
export async function runSimulatorTick(prisma: PrismaClient): Promise<void> {
  let states: { workspaceId: string }[];
  try {
    states = await prisma.simulationState.findMany({
      where: { status: 'RUNNING' },
      select: { workspaceId: true },
    });
  } catch (err: any) {
    console.warn('⚠️ Simulator tick skipped: cannot query SimulationState:', err?.message || err);
    return;
  }

  const adapter = new SimulatorAdapter(prisma);
  for (const state of states) {
    try {
      const result = await adapter.tick(state.workspaceId);
      console.log(
        `🕐 Simulator advanced workspace ${state.workspaceId} to ${result.simDate} ` +
          `(day ${result.dayIndex}, ${result.day.orders} orders, ${result.day.events} events)`,
      );
    } catch (err: any) {
      if (err instanceof SimulatorConflictError) {
        // Another tick (API or worker) already advanced this workspace — fine.
        continue;
      }
      if (err instanceof SimulatorCatalogMissingError) {
        console.warn(`⚠️ Simulator tick skipped for ${state.workspaceId}: ${err.message}`);
        continue;
      }
      console.warn(
        `⚠️ Simulator tick failed for workspace ${state.workspaceId}:`,
        err?.message || err,
      );
    }
  }
}
