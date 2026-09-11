import { EvidenceSourceMode } from '@crosspilot/shared';

export type ProviderTransport = 'MCP' | 'HTTP' | 'NATIVE' | 'RPA';

export type ProviderCategory =
  | 'MARKET_DATA'
  | 'EXTERNAL_VOC'
  | 'CREATIVE'
  | 'ERP'
  | 'CUSTOMER_SERVICE'
  | 'PRODUCTIVITY'
  | 'OTHER';

export type ProviderErrorCode =
  | 'PROVIDER_AUTH_ERROR'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_RATE_LIMIT'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_TOOL_NOT_FOUND'
  | 'PROVIDER_SCHEMA_MISMATCH'
  | 'PROVIDER_INVALID_RESPONSE'
  | 'PROVIDER_MAPPING_ERROR'
  | 'PROVIDER_EXECUTION_ERROR';

export interface ProviderError {
  code: ProviderErrorCode | string;
  message: string;
  retryable?: boolean;
  details?: any;
}

export interface IntegrationProviderDefinition {
  id: string;
  name: string;
  category: ProviderCategory;
  transport: ProviderTransport;
  enabled: boolean;
  priority: number;
  timeoutMs: number;
  retryPolicy?: {
    maxAttempts: number;
    backoffMs?: number;
  };
  authRef?: string;
  endpointRef?: string;
  metadata?: Record<string, unknown>;
}

export interface CapabilityBinding {
  capabilityId: string;
  providerId: string;
  transport: ProviderTransport;
  remoteToolName?: string;
  remoteOperation?: string;
  enabled: boolean;
  priority: number;
  inputMapper?: string;
  outputMapper?: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderHealth {
  providerId: string;
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';
  latencyMs?: number;
  lastCheckedAt: string;
  message?: string;
}

export interface ProviderExecutionContext {
  workspaceId: string;
  traceId: string;
  userId?: string;
  marketplace?: string;
  locale?: string;
  source?: string;
  taskId?: string;
  stepNumber?: number;
  metadata?: Record<string, any>;
}

export interface ProviderExecutionResult<T = any> {
  success: boolean;
  data?: T;
  error?: ProviderError;
  providerId: string;
  transport: ProviderTransport;
  remoteToolName?: string;
  capabilityId: string;
  durationMs: number;
  mode: EvidenceSourceMode;
  retryCount?: number;
  fallbackUsed?: boolean;
  credits?: number;
  capturedAt: string;
}

export interface ProviderAdapter<TInput = any, TRawOutput = any, TNormalizedOutput = any> {
  providerId: string;
  transport: ProviderTransport;
  execute(
    capabilityId: string,
    binding: CapabilityBinding,
    input: TInput,
    context: ProviderExecutionContext,
  ): Promise<ProviderExecutionResult<TNormalizedOutput>>;
  checkHealth?(): Promise<ProviderHealth>;
}
