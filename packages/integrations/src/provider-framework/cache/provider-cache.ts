import { RedisService } from '../../redis/redis.service.js';

/**
 * Standard Provider Cache interface
 */
export interface ProviderCache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear?(pattern?: string): Promise<void>;
}

/**
 * Standardized Cached Provider Payload contract
 */
export interface CachedProviderPayload<T> {
  data: T;
  providerId: string;
  source: 'PROVIDER_CACHE';
  capturedAt: string;
  expiresAt: string;
  schemaVersion: string;
  metadata?: Record<string, any>;
}

/**
 * Standard Cache Key Generator:
 * provider:{providerId}:{capabilityId}:{marketplace}:{subject}:{parameters}:{version}
 */
export function buildProviderCacheKey(params: {
  providerId: string;
  capabilityId: string;
  marketplace: string;
  subject: string;
  parameters?: string;
  version?: string;
}): string {
  const p = params.parameters ? params.parameters.replace(/\s+/g, '_') : 'default';
  const v = params.version || 'v1';
  return `provider:${params.providerId}:${params.capabilityId}:${params.marketplace}:${params.subject}:${p}:${v}`;
}

/**
 * In-memory implementation of ProviderCache
 */
export class InMemoryProviderCache implements ProviderCache {
  private cache = new Map<string, { value: any; expiresAt: number }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

/**
 * Redis-backed Provider Cache with automatic in-memory graceful fallback
 */
export class RedisProviderCache implements ProviderCache {
  private readonly fallbackCache = new InMemoryProviderCache();
  private isRedisAvailable = false;
  private lastHealthCheckTime = 0;
  private readonly HEALTH_CHECK_INTERVAL_MS = 30000; // 30s recheck

  constructor(private readonly redisService?: RedisService) {}

  private async checkRedisConnection(): Promise<boolean> {
    if (!this.redisService) return false;
    const now = Date.now();
    if (now - this.lastHealthCheckTime < this.HEALTH_CHECK_INTERVAL_MS && this.isRedisAvailable) {
      return true;
    }

    try {
      const client = this.redisService.getClient();
      if (client.status === 'wait') {
        await client.connect();
      }
      const pingRes = await Promise.race([
        client.ping(),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('Redis ping timeout')), 500),
        ),
      ]);
      this.isRedisAvailable = pingRes === 'PONG';
      this.lastHealthCheckTime = now;
      return this.isRedisAvailable;
    } catch {
      this.isRedisAvailable = false;
      this.lastHealthCheckTime = now;
      return false;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const available = await this.checkRedisConnection();
      if (available && this.redisService) {
        const client = this.redisService.getClient();
        const raw = await Promise.race([
          client.get(key),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('Redis get timeout')), 1000),
          ),
        ]);
        if (raw) {
          try {
            return JSON.parse(raw) as T;
          } catch {
            return raw as unknown as T;
          }
        }
        return null;
      }
    } catch (err: any) {
      // Graceful degradation: Log & fallback
      this.isRedisAvailable = false;
    }

    // Fallback to in-memory
    return this.fallbackCache.get<T>(key);
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    // Always write to in-memory fallback as local replica/failover
    await this.fallbackCache.set(key, value, ttlSeconds);

    try {
      const available = await this.checkRedisConnection();
      if (available && this.redisService) {
        const client = this.redisService.getClient();
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        await Promise.race([
          client.set(key, serialized, 'EX', ttlSeconds),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error('Redis set timeout')), 1000),
          ),
        ]);
      }
    } catch (err: any) {
      this.isRedisAvailable = false;
    }
  }

  async delete(key: string): Promise<void> {
    await this.fallbackCache.delete(key);
    try {
      const available = await this.checkRedisConnection();
      if (available && this.redisService) {
        const client = this.redisService.getClient();
        await client.del(key);
      }
    } catch {
      this.isRedisAvailable = false;
    }
  }

  async clear(pattern = 'provider:*'): Promise<void> {
    await this.fallbackCache.clear();
    try {
      const available = await this.checkRedisConnection();
      if (available && this.redisService) {
        const client = this.redisService.getClient();
        const keys = await client.keys(pattern);
        if (keys.length > 0) {
          await client.del(...keys);
        }
      }
    } catch {
      this.isRedisAvailable = false;
    }
  }

  getUsingRedis(): boolean {
    return this.isRedisAvailable;
  }
}
