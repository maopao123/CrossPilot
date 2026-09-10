import { Redis } from 'ioredis';
import { ServiceHealthItem } from '@crosspilot/shared';

export interface RedisConfig {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
}

export class RedisService {
  private client: Redis | null = null;
  private isConnected = false;
  private readonly config: RedisConfig;

  constructor(config: RedisConfig = {}) {
    this.config = {
      url: config.url || process.env.REDIS_URL || 'redis://localhost:6379',
      host: config.host || process.env.REDIS_HOST || 'localhost',
      port: config.port || Number(process.env.REDIS_PORT) || 6379,
      password: config.password || process.env.REDIS_PASSWORD,
    };
  }

  public getClient(): Redis {
    if (!this.client) {
      const options = {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: (times: number) => {
          if (times > 3) return null; // do not reconnect infinitely if offline
          return Math.min(times * 100, 1000);
        },
      };

      if (this.config.url) {
        this.client = new Redis(this.config.url, options);
      } else {
        this.client = new Redis({
          host: this.config.host,
          port: this.config.port,
          password: this.config.password,
          ...options,
        });
      }

      this.client.on('connect', () => {
        this.isConnected = true;
      });

      this.client.on('error', (err) => {
        this.isConnected = false;
        // Suppress unhandled crash if Redis is unavailable locally
      });

      this.client.on('close', () => {
        this.isConnected = false;
      });
    }
    return this.client;
  }

  public async healthCheck(): Promise<ServiceHealthItem> {
    const start = Date.now();
    try {
      const client = this.getClient();
      if (client.status === 'wait') {
        await client.connect();
      }
      const pong = await client.ping();
      const latencyMs = Date.now() - start;

      if (pong === 'PONG') {
        return {
          status: 'up',
          latencyMs,
          message: 'Redis is responsive',
        };
      }
      return {
        status: 'degraded',
        latencyMs,
        message: `Unexpected Redis ping response: ${pong}`,
      };
    } catch (error: any) {
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        error: error?.message || 'Redis connection failed',
      };
    }
  }

  public async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        this.client.disconnect();
      }
      this.client = null;
      this.isConnected = false;
    }
  }
}
