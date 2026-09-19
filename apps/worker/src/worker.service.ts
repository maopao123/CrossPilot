import http, { type Server as HttpServer } from 'node:http';
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
import { runtimeLogger, RuntimeEvents, runtimeMetrics } from '@crosspilot/shared';

const SIMULATOR_QUEUE_NAME = 'crosspilot-simulator-tick';
const OUTCOME_QUEUE_NAME = 'crosspilot-outcome-evaluator';
export const CLOSED_LOOP_V2_QUEUE_NAME = 'crosspilot-closed-loop-v2';
export { AUTOMATION_RECOVERY_QUEUE_NAME };

const workerLogger = runtimeLogger.child({
  service: 'worker-service',
});

export class WorkerService {
  private worker: Worker<AgentTaskJobData> | null = null;
  private taskRedis: Redis | null = null;
  private metricsServer: HttpServer | null = null;
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
    workerLogger.info({ event: RuntimeEvents.WORKER_STARTED, message: 'Initializing CrossPilot Background Worker' });

    // Lifecycle invariant: if previous run aborted shutdownController, recreate a fresh controller for new run
    if (this.shutdownController.signal.aborted) {
      this.shutdownController = new AbortController();
    }

    try {
      await this.startMetricsServer();
    } catch (err: any) {
      workerLogger.warn({ event: 'worker.metrics_server.init_warning', error: err });
    }

    try {
      // Check redis connection
      const health = await this.redisService.healthCheck();
      if (health.status === 'down') {
        workerLogger.warn({ event: 'worker.redis_unavailable', message: 'Redis is not available locally. Worker running in idle/standby mode.' });
        workerLogger.warn({ event: 'worker.scheduler.skipped', scheduler: 'simulator', message: 'Simulator scheduler skipped (requires Redis for BullMQ repeatable jobs).' });
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
          if (job.timestamp) {
            runtimeMetrics.observeQueueWait({
              queue: 'crosspilot-tasks',
              waitSeconds: (Date.now() - job.timestamp) / 1000,
            });
          }
          return processAgentTaskJob(job.data);
        },
        {
          connection: this.taskRedis as any,
          concurrency: 5,
        },
      );

      this.worker.on('completed', (job: Job) => {
        workerLogger.info({ event: RuntimeEvents.WORKER_JOB_COMPLETED, queue: 'crosspilot-tasks', jobId: job.id });
      });

      this.worker.on('failed', (job: Job | undefined, err: Error) => {
        workerLogger.error({ event: RuntimeEvents.WORKER_JOB_FAILED, queue: 'crosspilot-tasks', jobId: job?.id, error: err });
      });

      this.isRunning = true;
      workerLogger.info({ event: 'worker.listening', message: 'CrossPilot Worker listening for queue events' });
    } catch (err: any) {
      workerLogger.warn({ event: 'worker.init_warning', error: err });
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
      workerLogger.info({ event: 'worker.scheduler.disabled', scheduler: 'simulator' });
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
        async (job: Job) => {
          if (job.timestamp) {
            runtimeMetrics.observeQueueWait({
              queue: SIMULATOR_QUEUE_NAME,
              waitSeconds: (Date.now() - job.timestamp) / 1000,
            });
          }
          return runSimulatorTick(prisma);
        },
        { connection: this.simulatorRedis as any },
      );
      this.simulatorWorker.on('failed', (job: Job | undefined, err: Error) => {
        workerLogger.warn({ event: RuntimeEvents.WORKER_JOB_FAILED, queue: SIMULATOR_QUEUE_NAME, jobId: job?.id, error: err });
      });

      workerLogger.info({
        event: 'worker.scheduler.enabled',
        scheduler: 'simulator',
        intervalMinutes,
      });
    } catch (err: any) {
      workerLogger.warn({ event: 'worker.scheduler.init_warning', scheduler: 'simulator', error: err });
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
        async (job: Job) => {
          if (job.timestamp) {
            runtimeMetrics.observeQueueWait({
              queue: OUTCOME_QUEUE_NAME,
              waitSeconds: (Date.now() - job.timestamp) / 1000,
            });
          }
          return runOutcomeEvaluation(prisma);
        },
        { connection: this.outcomeRedis as any },
      );
      this.outcomeWorker.on('failed', (job: Job | undefined, err: Error) => {
        workerLogger.warn({ event: RuntimeEvents.WORKER_JOB_FAILED, queue: OUTCOME_QUEUE_NAME, jobId: job?.id, error: err });
      });

      workerLogger.info({
        event: 'worker.scheduler.enabled',
        scheduler: 'outcome-evaluator',
        intervalMinutes,
      });
    } catch (err: any) {
      workerLogger.warn({ event: 'worker.scheduler.init_warning', scheduler: 'outcome-evaluator', error: err });
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
        workerLogger.info({
          event: 'worker.scheduler.enabled',
          scheduler: 'closed-loop-v2',
          intervalMinutes,
        });
      }

      this.closedLoopWorker = new Worker(
        CLOSED_LOOP_V2_QUEUE_NAME,
        async (job: Job) => {
          if (job.timestamp) {
            runtimeMetrics.observeQueueWait({
              queue: CLOSED_LOOP_V2_QUEUE_NAME,
              waitSeconds: (Date.now() - job.timestamp) / 1000,
            });
          }
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
        workerLogger.info({ event: RuntimeEvents.WORKER_JOB_COMPLETED, queue: CLOSED_LOOP_V2_QUEUE_NAME, jobId: job.id });
      });

      this.closedLoopWorker.on('failed', (job: Job | undefined, err: Error) => {
        workerLogger.warn({ event: RuntimeEvents.WORKER_JOB_FAILED, queue: CLOSED_LOOP_V2_QUEUE_NAME, jobId: job?.id, error: err });
      });
    } catch (err: any) {
      workerLogger.warn({ event: 'worker.scheduler.init_warning', scheduler: 'closed-loop-v2', error: err });
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
        async (job: Job) => {
          if (job.timestamp) {
            runtimeMetrics.observeQueueWait({
              queue: AUTOMATION_RECOVERY_QUEUE_NAME,
              waitSeconds: (Date.now() - job.timestamp) / 1000,
            });
          }
          return await processAutomationRecovery(prisma, {
            signal: this.shutdownController.signal,
          });
        },
        { connection: this.recoveryRedis as any },
      );

      this.recoveryWorker.on('completed', (job: Job) => {
        workerLogger.info({ event: RuntimeEvents.WORKER_JOB_COMPLETED, queue: AUTOMATION_RECOVERY_QUEUE_NAME, jobId: job.id });
      });

      this.recoveryWorker.on('failed', (job: Job | undefined, err: Error) => {
        workerLogger.warn({ event: RuntimeEvents.WORKER_JOB_FAILED, queue: AUTOMATION_RECOVERY_QUEUE_NAME, jobId: job?.id, error: err });
      });

      workerLogger.info({
        event: 'worker.scheduler.enabled',
        scheduler: 'automation-recovery',
        intervalMinutes,
      });
    } catch (err: any) {
      workerLogger.warn({ event: 'worker.scheduler.init_warning', scheduler: 'automation-recovery', error: err });
    }
  }

  public async stop(): Promise<void> {
    workerLogger.info({ event: RuntimeEvents.WORKER_STOPPING, message: 'Shutting down CrossPilot Worker' });
    this.shutdownController.abort();
    await this.stopMetricsServer();
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
    workerLogger.info({ event: RuntimeEvents.WORKER_STOPPED, message: 'Worker shutdown complete' });
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

  public getMetricsServer(): HttpServer | null {
    return this.metricsServer;
  }

  private async startMetricsServer(): Promise<void> {
    if (process.env.WORKER_METRICS_ENABLED !== 'true') {
      return;
    }
    if (this.metricsServer) {
      return;
    }

    const port = Number.parseInt(process.env.WORKER_METRICS_PORT ?? '', 10) || 9100;
    const host = process.env.WORKER_METRICS_HOST || '127.0.0.1';
    const bearerToken = process.env.WORKER_METRICS_TOKEN || process.env.METRICS_BEARER_TOKEN;
    const isProduction = process.env.NODE_ENV === 'production';
    const isLoopback = host === '127.0.0.1' || host === '::1' || host === 'localhost';

    if (isProduction && !isLoopback && !bearerToken) {
      workerLogger.warn({
        event: 'worker.metrics_server.config_rejected',
        host,
        port,
        message:
          'Worker metrics server disabled: non-loopback binding in production requires WORKER_METRICS_TOKEN or METRICS_BEARER_TOKEN',
      });
      return;
    }

    const server = http.createServer(async (req, res) => {
      const url = req.url?.split('?')[0];

      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Method Not Allowed\n');
        return;
      }

      if (url !== '/metrics' && url !== '/internal/metrics') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found\n');
        return;
      }

      if (bearerToken) {
        const auth = req.headers.authorization;
        if (!auth || auth !== `Bearer ${bearerToken}`) {
          res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Unauthorized\n');
          return;
        }
      }

      try {
        const metrics = await runtimeMetrics.getMetricsAsText();
        res.writeHead(200, { 'Content-Type': runtimeMetrics.contentType });
        res.end(metrics);
      } catch {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Failed to collect metrics\n');
      }
    });

    await new Promise<void>((resolve, reject) => {
      server.listen(port, host, () => {
        workerLogger.info({
          event: 'worker.metrics_server.started',
          host,
          port,
          message: `Worker metrics server listening on http://${host}:${port}/metrics`,
        });
        resolve();
      });
      server.on('error', (err) => {
        workerLogger.error({
          event: 'worker.metrics_server.error',
          error: err,
        });
        reject(err);
      });
    });

    this.metricsServer = server;
  }

  private async stopMetricsServer(): Promise<void> {
    if (this.metricsServer) {
      const server = this.metricsServer;
      this.metricsServer = null;
      await new Promise<void>((resolve) => {
        if (typeof (server as any).closeAllConnections === 'function') {
          (server as any).closeAllConnections();
        }
        server.close(() => {
          workerLogger.info({
            event: 'worker.metrics_server.stopped',
            message: 'Worker metrics server stopped',
          });
          resolve();
        });
      });
    }
  }
}
