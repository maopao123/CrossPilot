import {
  CapabilityBinding,
  ProviderAdapter,
  ProviderExecutionContext,
  ProviderExecutionResult,
  ProviderHealth,
} from '../../core/provider.types.js';
import { McpExecutor } from '../../transports/mcp/mcp-executor.js';
import { McpConnectionManager } from '../../transports/mcp/mcp-connection-manager.js';
import { XydcMapper } from './xydc.mapper.js';
import { XYDC_PROVIDER_ID } from './xydc.config.js';

export class XydcProvider implements ProviderAdapter {
  readonly providerId = XYDC_PROVIDER_ID;
  readonly transport = 'MCP';

  constructor(
    private readonly mcpExecutor: McpExecutor,
    private readonly connectionManager?: McpConnectionManager,
  ) {}

  async checkHealth(): Promise<ProviderHealth> {
    if (!this.connectionManager) {
      return {
        providerId: this.providerId,
        status: 'UNKNOWN',
        lastCheckedAt: new Date().toISOString(),
      };
    }
    return this.connectionManager.checkHealth(this.providerId);
  }

  async execute(
    capabilityId: string,
    binding: CapabilityBinding,
    input: any,
    context: ProviderExecutionContext,
  ): Promise<ProviderExecutionResult<any>> {
    const startTime = Date.now();
    const remoteToolName = binding.remoteToolName || 'xydc_generic_query';
    const marketplace = context.marketplace || 'AMAZON_US';

    try {
      const { result, durationMs } = await this.mcpExecutor.executeRemoteTool(
        this.providerId,
        remoteToolName,
        input,
      );

      // Extract raw data from MCP tool call response
      const rawPayload = result.raw || result.content?.[0]?.data || result.content?.[0]?.text;
      let rawParsed = rawPayload;
      if (typeof rawPayload === 'string') {
        try {
          rawParsed = JSON.parse(rawPayload);
        } catch {
          rawParsed = { text: rawPayload };
        }
      }

      // Map to CrossPilot Normalized Contracts
      let normalizedData: any;
      switch (capabilityId) {
        case 'market.product.search':
          normalizedData = XydcMapper.toMarketProducts(
            Array.isArray(rawParsed) ? rawParsed : rawParsed?.products || rawParsed?.items || [],
            marketplace,
          );
          break;

        case 'market.product.detail':
          normalizedData = XydcMapper.toMarketProduct(rawParsed?.product || rawParsed, marketplace);
          break;

        case 'market.market.overview':
          normalizedData = XydcMapper.toMarketOverview(
            rawParsed?.overview || rawParsed,
            marketplace,
            'LIVE',
          );
          break;

        case 'market.keyword.search':
          normalizedData = XydcMapper.toKeywordMetrics(
            Array.isArray(rawParsed) ? rawParsed : rawParsed?.keywords || [],
            marketplace,
          );
          break;

        case 'market.product.trend':
          normalizedData = XydcMapper.toMarketTrend(rawParsed?.trend || rawParsed, marketplace);
          break;

        default:
          normalizedData = rawParsed;
      }

      return {
        success: true,
        data: normalizedData,
        providerId: this.providerId,
        transport: 'MCP',
        remoteToolName,
        capabilityId,
        durationMs: durationMs || Date.now() - startTime,
        mode: 'LIVE',
        capturedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        success: false,
        error: {
          code: err.code || 'PROVIDER_EXECUTION_ERROR',
          message: err.message || `Failed executing remote tool ${remoteToolName}`,
          retryable: err.retryable !== undefined ? err.retryable : true,
          details: err.details,
        },
        providerId: this.providerId,
        transport: 'MCP',
        remoteToolName,
        capabilityId,
        durationMs: Date.now() - startTime,
        mode: 'DEGRADED',
        capturedAt: new Date().toISOString(),
      };
    }
  }
}
