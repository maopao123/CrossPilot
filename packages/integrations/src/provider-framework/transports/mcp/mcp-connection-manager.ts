import { McpClient } from './mcp-client.js';
import { McpConnectionConfig } from './mcp.types.js';
import { ProviderHealth } from '../../core/provider.types.js';

export class McpConnectionManager {
  private readonly clients = new Map<string, McpClient>();
  private readonly configs = new Map<string, McpConnectionConfig>();

  registerConnection(providerId: string, config: McpConnectionConfig): void {
    this.configs.set(providerId, config);
    this.clients.set(providerId, new McpClient(config));
  }

  getClient(providerId: string): McpClient | undefined {
    return this.clients.get(providerId);
  }

  hasConnection(providerId: string): boolean {
    return this.clients.has(providerId);
  }

  async checkHealth(providerId: string): Promise<ProviderHealth> {
    const client = this.clients.get(providerId);
    const checkedAt = new Date().toISOString();

    if (!client) {
      return {
        providerId,
        status: 'DOWN',
        lastCheckedAt: checkedAt,
        message: `No MCP connection configured for provider '${providerId}'`,
      };
    }

    const start = Date.now();
    try {
      const tools = await client.listTools();
      return {
        providerId,
        status: 'HEALTHY',
        latencyMs: Date.now() - start,
        lastCheckedAt: checkedAt,
        message: `MCP connection responsive (${tools.length} tools discovered)`,
      };
    } catch (err: any) {
      return {
        providerId,
        status: 'DOWN',
        latencyMs: Date.now() - start,
        lastCheckedAt: checkedAt,
        message: err.message || 'MCP health probe failed',
      };
    }
  }
}
