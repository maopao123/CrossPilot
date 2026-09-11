import { McpConnectionManager } from './mcp-connection-manager.js';
import { McpToolCallResult } from './mcp.types.js';
import { ProviderError } from '../../core/provider.types.js';
import { SecretProvider } from '../../secrets/secret-provider.js';

export class McpExecutor {
  constructor(private readonly connectionManager: McpConnectionManager) {}

  async executeRemoteTool(
    providerId: string,
    remoteToolName: string,
    args: Record<string, any> = {},
  ): Promise<{ result: McpToolCallResult; durationMs: number }> {
    const client = this.connectionManager.getClient(providerId);
    if (!client) {
      const error: ProviderError = {
        code: 'PROVIDER_UNAVAILABLE',
        message: `MCP client not found for provider '${providerId}'`,
        retryable: false,
      };
      throw error;
    }

    const start = Date.now();
    try {
      const sanitizedArgs = SecretProvider.redact(args);
      const result = await client.callTool(remoteToolName, sanitizedArgs);
      const durationMs = Date.now() - start;
      return { result, durationMs };
    } catch (err: any) {
      throw err;
    }
  }
}
