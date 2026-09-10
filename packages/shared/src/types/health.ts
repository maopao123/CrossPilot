export type ServiceHealthStatus = 'ok' | 'up' | 'down' | 'degraded';

export interface ServiceHealthItem {
  status: ServiceHealthStatus;
  latencyMs?: number;
  uptime?: number;
  message?: string;
  error?: string;
}

export interface HealthCheckResponse {
  status: ServiceHealthStatus;
  timestamp: string;
  version: string;
  services: {
    api: ServiceHealthItem;
    postgres: ServiceHealthItem;
    redis: ServiceHealthItem;
    milvus: ServiceHealthItem;
  };
}

export interface AiHealthResponse {
  status: ServiceHealthStatus;
  provider: string;
  model: string;
  timestamp: string;
  message?: string;
}
