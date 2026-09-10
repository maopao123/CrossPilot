import { Worker, Job } from 'bullmq';
import { RedisService } from '@crosspilot/integrations';
import {
  AgentTaskJobData,
  processAgentTaskJob,
} from './processors/agent-task.processor.js';

export class WorkerService {
  private worker: Worker<AgentTaskJobData> | null = null;
  private redisService: RedisService;
  private isRunning = false;

  constructor() {
    this.redisService = new RedisService();
  }

  public async start(): Promise<void> {
    console.log('🔄 Initializing CrossPilot Background Worker...');

    try {
      const redisClient = this.redisService.getClient();

      // Check redis connection
      const health = await this.redisService.healthCheck();
      if (health.status === 'down') {
        console.warn('⚠️ Redis is not available locally. Worker running in idle/standby mode.');
        this.isRunning = true;
        return;
      }

      this.worker = new Worker<AgentTaskJobData>(
        'crosspilot-tasks',
        async (job: Job<AgentTaskJobData>) => {
          return processAgentTaskJob(job.data);
        },
        {
          connection: redisClient as any,
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

  public async stop(): Promise<void> {
    console.log('🛑 Shutting down CrossPilot Worker...');
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
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
