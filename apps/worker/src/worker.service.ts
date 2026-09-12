import { Worker, Job, Queue } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { RedisService } from '@crosspilot/integrations';
import {
  AgentTaskJobData,
  processAgentTaskJob,
} from './processors/agent-task.processor.js';
import { runSimulatorTick } from './processors/simulator-tick.processor.js';

const SIMULATOR_QUEUE_NAME = 'crosspilot-simulator-tick';

export class WorkerService {
  private worker: Worker<AgentTaskJobData> | null = null;
  private taskRedis: Redis | null = null;
  private simulatorWorker: Worker | null = null;
  private simulatorQueue: Queue | null = null;
  private simulatorRedis: Redis | null = null;
  private simulatorPrisma: PrismaClient | null = null;
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

  public async stop(): Promise<void> {
    console.log('🛑 Shutting down CrossPilot Worker...');
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
}
