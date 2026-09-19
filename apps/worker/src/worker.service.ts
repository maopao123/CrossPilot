import { Worker, Job, Queue } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { RedisService } from '@crosspilot/integrations';
import {
  AgentTaskJobData,
  processAgentTaskJob,
} from './processors/agent-task.processor.js';
import { runSimulatorTick } from './processors/simulator-tick.processor.js';
import { runOutcomeEvaluation } from './processors/outcome-evaluator.processor.js';
import {
  advanceClosedLoopRun,
  runClosedLoopV2Sweep,
} from './processors/closed-loop-v2.processor.js';
import {
  processAutomationRecovery,
  AUTOMATION_RECOVERY_QUEUE_NAME,
} from './processors/automation-recovery.processor.js';

const SIMULATOR_QUEUE_NAME = 'crosspilot-simulator-tick';
const OUTCOME_QUEUE_NAME = 'crosspilot-outcome-evaluator';
export const CLOSED_LOOP_V2_QUEUE_NAME = 'crosspilot-closed-loop-v2';
export { AUTOMATION_RECOVERY_QUEUE_NAME };

export class WorkerService {
  private worker: Worker<AgentTaskJobData> | null = null;
  private taskRedis: Redis | null = null;
  private simulatorWorker: Worker | null = null;
  private simulatorQueue: Queue | null = null;
  private simulatorRedis: Redis | null = null;
  private simulatorPrisma: PrismaClient | null = null;
  private outcomeWorker: Worker | null = null;
  private outcomeQueue: Queue | null = null;
  private outcomeRedis: Redis | null = null;
  private outcomePrisma: PrismaClient | null = null;
  private closedLoopWorker: Worker | null = null;
  private closedLoopQueue: Queue | null = null;
  private closedLoopRedis: Redis | null = null;
  private closedLoopPrisma: PrismaClient | null = null;
  private recoveryWorker: Worker | null = null;
  private recoveryQueue: Queue | null = null;
  private recoveryRedis: Redis | null = null;
  private recoveryPrisma: PrismaClient | null = null;
  private shutdownController = new AbortController();
  private redisService: RedisService;
  private isRunning = false;

  constructor() {
    this.redisService = new RedisService();
  }

  public async start(): Promise<void> {
    console.log('🔄 Initializing CrossPilot Background Worker...');

    try {
      // Check redis connection
      const health = await this.redisService.healthCheck();
      if (health.status === 'down') {
        console.warn('⚠️ Redis is not available locally. Worker running in idle/standby mode.');
        console.warn('⚠️ Simulator scheduler skipped (requires Redis for BullMQ repeatable jobs).');
        this.isRunning = true;
        return;
      }

      // Scheduler is independent of the legacy agent-task queue: start it
      // first so a failure in the main Worker setup cannot starve it.
      await this.startSimulatorScheduler();

      // Closed-Loop-v2 scheduler & processor worker
      await this.startClosedLoopScheduler();

      // V10 Epic A：Outcome Tracking 评估器，与 simulator 调度互不影响。
      await this.startOutcomeScheduler();

      // V10 AI Automation：故障恢复 Worker，监控租约过期与查询远端自愈
      await this.startAutomationRecoveryScheduler();

      // BullMQ requires maxRetriesPerRequest: null. RedisService uses 1 for
      // API health checks, so the agent-task worker gets its own connection.
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      this.taskRedis = new Redis(redisUrl, { maxRetriesPerRequest: null });

      this.worker = new Worker<AgentTaskJobData>(
        'crosspilot-tasks',
        async (job: Job<AgentTaskJobData>) => {
          return processAgentTaskJob(job.data);
        },
        {
          connection: this.taskRedis as any,
          concurrency: 5,
        },
      );

      this.worker.on('completed', (job: Job) => {
        console.log(`✅ Job ${job.id} completed successfully`);
      });

      this.worker.on('failed', (job: Job | undefined, err: Error) => {
        console.error(`❌ Job ${job?.id} failed:`, err.message);
      });

      this.isRunning = true;
      console.log('🚀 CrossPilot Worker listening for queue events.');
    } catch (err: any) {
      console.warn('⚠️ Worker initialization warning:', err.message);
      this.isRunning = true;
    }
  }

  /**
   * Commerce Simulator scheduler: a BullMQ repeatable job advances every
   * RUNNING SimulationState by one simulated day per interval. Enabled via
   * SIMULATOR_ENABLED=true; interval via SIMULATOR_TICK_INTERVAL_MINUTES
   * (default 60, i.e. 1 real hour = 1 simulated day). Never crashes the
   * worker — scheduling or tick failures degrade to warn logs.
   */
  private async startSimulatorScheduler(): Promise<void> {
    if (process.env.SIMULATOR_ENABLED !== 'true') {
      console.log('ℹ️ Simulator scheduler disabled (set SIMULATOR_ENABLED=true to enable).');
      return;
    }

    try {
      const intervalMinutes =
        Number.parseInt(process.env.SIMULATOR_TICK_INTERVAL_MINUTES ?? '', 10) || 60;

      this.simulatorPrisma = new PrismaClient();
      const prisma = this.simulatorPrisma;

      // BullMQ Workers require maxRetriesPerRequest: null; the shared
      // RedisService client uses 1, so the scheduler gets a dedicated connection.
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      this.simulatorRedis = new Redis(redisUrl, { maxRetriesPerRequest: null });

      this.simulatorQueue = new Queue(SIMULATOR_QUEUE_NAME, {
        connection: this.simulatorRedis as any,
      });
      await this.simulatorQueue.add(
        'simulator-tick',
        {},
        {
          jobId: 'simulator-tick',
          repeat: { every: intervalMinutes * 60 * 1000 },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );

      this.simulatorWorker = new Worker(
        SIMULATOR_QUEUE_NAME,
        async () => runSimulatorTick(prisma),
        { connection: this.simulatorRedis as any },
      );
      this.simulatorWorker.on('failed', (job: Job | undefined, err: Error) => {
        console.warn(`⚠️ Simulator tick job ${job?.id} failed:`, err.message);
      });

      console.log(
        `🕐 Simulator scheduler enabled: 1 simulated day every ${intervalMinutes} minute(s).`,
      );
    } catch (err: any) {
      console.warn('⚠️ Simulator scheduler initialization warning:', err.message);
    }
  }

  /**
   * V10 Epic A — Outcome evaluator scheduler: a BullMQ repeatable job scans
   * every workspace for due OBSERVING outcomes (observe_end <= today, where
   * today = sim_date when a SimulationState exists) and evaluates them.
   * Interval via OUTCOME_EVAL_INTERVAL_MINUTES (default 30). Never crashes
   * the worker — failures degrade to warn logs.
   */
  private async startOutcomeScheduler(): Promise<void> {
    try {
      const intervalMinutes =
        Number.parseInt(process.env.OUTCOME_EVAL_INTERVAL_MINUTES ?? '', 10) || 30;

      this.outcomePrisma = new PrismaClient();
      const prisma = this.outcomePrisma;

      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      this.outcomeRedis = new Redis(redisUrl, { maxRetriesPerRequest: null });

      this.outcomeQueue = new Queue(OUTCOME_QUEUE_NAME, {
        connection: this.outcomeRedis as any,
      });
      await this.outcomeQueue.add(
        'outcome-evaluator',
        {},
        {
          jobId: 'outcome-evaluator',
          repeat: { every: intervalMinutes * 60 * 1000 },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );

      this.outcomeWorker = new Worker(
        OUTCOME_QUEUE_NAME,
        async () => runOutcomeEvaluation(prisma),
        { connection: this.outcomeRedis as any },
      );
      this.outcomeWorker.on('failed', (job: Job | undefined, err: Error) => {
        console.warn(`⚠️ Outcome evaluator job ${job?.id} failed:`, err.message);
      });

      console.log(
        `📊 Outcome evaluator enabled: sweep every ${intervalMinutes} minute(s).`,
      );
    } catch (err: any) {
      console.warn('⚠️ Outcome evaluator initialization warning:', err.message);
    }
  }

  /**
   * Closed-Loop v2 Simulator scheduler and processor worker.
   * Handles explicit advance jobs enqueued via API and repeatable sweeps if SIMULATOR_ENABLED=true.
   */
  private async startClosedLoopScheduler(): Promise<void> {
    try {
      this.closedLoopPrisma = new PrismaClient();
      const prisma = this.closedLoopPrisma;

      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      this.closedLoopRedis = new Redis(redisUrl, { maxRetriesPerRequest: null });

      this.closedLoopQueue = new Queue(CLOSED_LOOP_V2_QUEUE_NAME, {
        connection: this.closedLoopRedis as any,
      });

      if (process.env.SIMULATOR_ENABLED === 'true') {
        const intervalMinutes =
          Number.parseInt(process.env.SIMULATOR_TICK_INTERVAL_MINUTES ?? '', 10) || 60;
        await this.closedLoopQueue.add(
          'closed-loop-v2-sweep',
          {},
          {
            jobId: 'closed-loop-v2-sweep',
            repeat: { every: intervalMinutes * 60 * 1000 },
            removeOnComplete: true,
            removeOnFail: 100,
          },
        );
        console.log(
          `🕐 ClosedLoopV2 scheduler enabled: sweep every ${intervalMinutes} minute(s).`,
        );
      }

      this.closedLoopWorker = new Worker(
        CLOSED_LOOP_V2_QUEUE_NAME,
        async (job: Job) => {
          const { runId, days, maxDays, userId } = job.data || {};
          if (runId) {
            return await advanceClosedLoopRun(prisma, runId, {
              maxDays: days ?? maxDays ?? 1,
              userId,
            });
          } else {
            return await runClosedLoopV2Sweep(prisma);
          }
        },
        { connection: this.closedLoopRedis as any },
      );

      this.closedLoopWorker.on('completed', (job: Job) => {
        console.log(`✅ ClosedLoopV2 Job ${job.id} completed successfully`);
      });

      this.closedLoopWorker.on('failed', (job: Job | undefined, err: Error) => {
        console.warn(`⚠️ ClosedLoopV2 Job ${job?.id} failed:`, err.message);
      });
    } catch (err: any) {
      console.warn('⚠️ ClosedLoopV2 scheduler initialization warning:', err.message);
    }
  }

  /**
   * V10 AI Automation — Recovery scheduler: scans for due automation operations
   * (expired leases, unverified submissions, pending retries) and processes them.
   */
  private async startAutomationRecoveryScheduler(): Promise<void> {
    try {
      const intervalMinutes =
        Number.parseInt(process.env.AUTOMATION_RECOVERY_INTERVAL_MINUTES ?? '', 10) || 5;

      this.recoveryPrisma = new PrismaClient();
      const prisma = this.recoveryPrisma;

      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      this.recoveryRedis = new Redis(redisUrl, { maxRetriesPerRequest: null });

      this.recoveryQueue = new Queue(AUTOMATION_RECOVERY_QUEUE_NAME, {
        connection: this.recoveryRedis as any,
      });

      await this.recoveryQueue.add(
        'automation-recovery-sweep',
        {},
        {
          jobId: 'automation-recovery-sweep',
          repeat: { every: intervalMinutes * 60 * 1000 },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );

      this.recoveryWorker = new Worker(
        AUTOMATION_RECOVERY_QUEUE_NAME,
        async (_job: Job) => {
          return await processAutomationRecovery(prisma, {
            signal: this.shutdownController.signal,
          });
        },
        { connection: this.recoveryRedis as any },
      );

      this.recoveryWorker.on('completed', (job: Job) => {
        console.log(`✅ AutomationRecovery Job ${job.id} completed`);
      });

      this.recoveryWorker.on('failed', (job: Job | undefined, err: Error) => {
        console.warn(`⚠️ AutomationRecovery Job ${job?.id} failed:`, err.message);
      });

      console.log(
        `🔄 Automation recovery enabled: sweep every ${intervalMinutes} minute(s).`,
      );
    } catch (err: any) {
      console.warn('⚠️ Automation recovery scheduler initialization warning:', err.message);
    }
  }

  public async stop(): Promise<void> {
    console.log('🛑 Shutting down CrossPilot Worker...');
    this.shutdownController.abort();
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    if (this.taskRedis) {
      await this.taskRedis.quit();
      this.taskRedis = null;
    }
    if (this.simulatorWorker) {
      await this.simulatorWorker.close();
      this.simulatorWorker = null;
    }
    if (this.simulatorQueue) {
      await this.simulatorQueue.close();
      this.simulatorQueue = null;
    }
    if (this.simulatorRedis) {
      await this.simulatorRedis.quit();
      this.simulatorRedis = null;
    }
    if (this.simulatorPrisma) {
      await this.simulatorPrisma.$disconnect();
      this.simulatorPrisma = null;
    }
    if (this.outcomeWorker) {
      await this.outcomeWorker.close();
      this.outcomeWorker = null;
    }
    if (this.outcomeQueue) {
      await this.outcomeQueue.close();
      this.outcomeQueue = null;
    }
    if (this.outcomeRedis) {
      await this.outcomeRedis.quit();
      this.outcomeRedis = null;
    }
    if (this.outcomePrisma) {
      await this.outcomePrisma.$disconnect();
      this.outcomePrisma = null;
    }
    if (this.closedLoopWorker) {
      await this.closedLoopWorker.close();
      this.closedLoopWorker = null;
    }
    if (this.closedLoopQueue) {
      await this.closedLoopQueue.close();
      this.closedLoopQueue = null;
    }
    if (this.closedLoopRedis) {
      await this.closedLoopRedis.quit();
      this.closedLoopRedis = null;
    }
    if (this.closedLoopPrisma) {
      await this.closedLoopPrisma.$disconnect();
      this.closedLoopPrisma = null;
    }
    if (this.recoveryWorker) {
      await this.recoveryWorker.close();
      this.recoveryWorker = null;
    }
    if (this.recoveryQueue) {
      await this.recoveryQueue.close();
      this.recoveryQueue = null;
    }
    if (this.recoveryRedis) {
      await this.recoveryRedis.quit();
      this.recoveryRedis = null;
    }
    if (this.recoveryPrisma) {
      await this.recoveryPrisma.$disconnect();
      this.recoveryPrisma = null;
    }
    await this.redisService.disconnect();
    this.isRunning = false;
    console.log('🏁 Worker shutdown complete.');
  }

  public getStatus(): { isRunning: boolean; queueName: string } {
    return {
      isRunning: this.isRunning,
      queueName: 'crosspilot-tasks',
    };
  }

  public getRecoveryStatus(): { isRegistered: boolean; queueName: string } {
    return {
      isRegistered: this.recoveryWorker !== null,
      queueName: AUTOMATION_RECOVERY_QUEUE_NAME,
    };
  }
}
