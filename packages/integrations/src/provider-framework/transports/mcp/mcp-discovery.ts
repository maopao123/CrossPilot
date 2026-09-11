import { McpConnectionManager } from './mcp-connection-manager.js';
import { McpToolSchema } from './mcp.types.js';

export class McpDiscovery {
  constructor(private readonly connectionManager: McpConnectionManager) {}

  async discover(providerId: string): Promise<McpToolSchema[]> {
    const client = this.connectionManager.getClient(providerId);
    if (!client) {
      throw new Error(`MCP Client for provider '${providerId}' is not connected`);
    }
    return client.listTools();
  }
}
