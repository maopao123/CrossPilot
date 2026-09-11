import { ProviderRouter } from './provider-router.js';
import {
  CapabilityBinding,
  ProviderAdapter,
  ProviderExecutionContext,
  ProviderExecutionResult,
} from './provider.types.js';
import { SecretProvider } from '../secrets/secret-provider.js';

export class IntegrationGateway {
  private static defaultInstance: IntegrationGateway | null = null;
  private static instanceFactory?: () => IntegrationGateway;
  private readonly adapters = new Map<string, ProviderAdapter>();

  constructor(private readonly router: ProviderRouter) {}

  static setFactory(factory: () => IntegrationGateway): void {
    this.instanceFactory = factory;
  }

  static setInstance(instance: IntegrationGateway): void {
    this.defaultInstance = instance;
  }

  static getInstance(): IntegrationGateway {
    if (!this.defaultInstance) {
      if (this.instanceFactory) {
        this.defaultInstance = this.instanceFactory();
      } else {
        throw new Error('IntegrationGateway has not been initialized. Call initializeDefaultIntegrationGateway() first.');
      }
    }
    return this.defaultInstance;
  }

  registerAdapter(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.providerId, adapter);
  }

  getAdapter(providerId: string): ProviderAdapter | undefined {
    return this.adapters.get(providerId);
  }

  async executeCapability<TInput = any, TOutput = any>(
    capabilityId: string,
    input: TInput,
    context: ProviderExecutionContext,
  ): Promise<ProviderExecutionResult<TOutput>> {
    const startTime = Date.now();
    const route = this.router.resolveRoute(capabilityId, context);

    if (!route.primary || !route.primaryProvider) {
      return {
        success: false,
        capabilityId,
        providerId: 'NONE',
        transport: 'NATIVE',
        durationMs: Date.now() - startTime,
        mode: 'DEGRADED',
        capturedAt: new Date().toISOString(),
        error: {
          code: 'PROVIDER_NOT_FOUND',
          message: `No active provider or capability binding found for '${capabilityId}'`,
          retryable: false,
        },
      };
    }

    const primaryAdapter = this.adapters.get(route.primary.providerId);
    if (!primaryAdapter) {
      return {
        success: false,
        capabilityId,
        providerId: route.primary.providerId,
        transport: route.primary.transport,
        durationMs: Date.now() - startTime,
        mode: 'DEGRADED',
        capturedAt: new Date().toISOString(),
        error: {
          code: 'PROVIDER_ADAPTER_MISSING',
          message: `Adapter for provider '${route.primary.providerId}' is not registered in IntegrationGateway`,
          retryable: false,
        },
      };
    }

    // 1. Primary Execution with Bounded Retry
    const maxAttempts = route.primaryProvider.retryPolicy?.maxAttempts || 1;
    let attempt = 0;
    let lastResult: ProviderExecutionResult<TOutput> | null = null;

    while (attempt < maxAttempts) {
      attempt++;
      try {
        const result = await primaryAdapter.execute(capabilityId, route.primary, input, context);
        if (result.success) {
          result.retryCount = attempt - 1;
          result.data = SecretProvider.redact(result.data);
          return result;
        }
        lastResult = result;
        if (!result.error?.retryable) {
          break; // Non-retryable error (e.g. auth error or schema mismatch), skip retry
        }
      } catch (err: any) {
        lastResult = {
          success: false,
          capabilityId,
          providerId: route.primary.providerId,
          transport: route.primary.transport,
          remoteToolName: route.primary.remoteToolName,
          durationMs: Date.now() - startTime,
          mode: 'DEGRADED',
          capturedAt: new Date().toISOString(),
          error: {
            code: 'PROVIDER_EXECUTION_ERROR',
            message: SecretProvider.redact(err.message || 'Unknown execution error'),
            retryable: false,
            details: err,
          },
        };
      }
    }

    // 2. Fallback execution if primary failed and fallback route is available
    if (route.fallback && route.fallbackProvider) {
      const fallbackAdapter = this.adapters.get(route.fallback.providerId);
      if (fallbackAdapter) {
        try {
          const fallbackResult = await fallbackAdapter.execute(
            capabilityId,
            route.fallback,
            input,
            context,
          );
          fallbackResult.fallbackUsed = true;
          fallbackResult.mode = 'DEGRADED';
          fallbackResult.data = SecretProvider.redact(fallbackResult.data);
          return fallbackResult;
        } catch {
          // If fallback also throws, return lastResult from primary
        }
      }
    }

    return (
      lastResult || {
        success: false,
        capabilityId,
        providerId: route.primary.providerId,
        transport: route.primary.transport,
        durationMs: Date.now() - startTime,
        mode: 'DEGRADED',
        capturedAt: new Date().toISOString(),
        error: {
          code: 'PROVIDER_EXECUTION_ERROR',
          message: 'Execution failed and no fallback available',
        },
      }
    );
  }
}
