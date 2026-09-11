import { ProviderRegistry } from './core/provider-registry.js';
import { CapabilityBindingRegistry } from './core/capability-binding.registry.js';
import { ProviderRouter } from './core/provider-router.js';
import { IntegrationGateway } from './core/integration-gateway.js';
import { McpConnectionManager } from './transports/mcp/mcp-connection-manager.js';
import { McpExecutor } from './transports/mcp/mcp-executor.js';
import { McpDiscovery } from './transports/mcp/mcp-discovery.js';
import {
  XYDC_PROVIDER_DEFINITION,
  XYDC_CAPABILITY_BINDINGS,
  XYDC_PROVIDER_ID,
} from './providers/xydc/xydc.config.js';
import { XydcProvider } from './providers/xydc/xydc.provider.js';
import {
  MOCK_PROVIDER_DEFINITION,
  MOCK_CAPABILITY_BINDINGS,
  MockMarketProvider,
} from './providers/mock/mock-market.provider.js';
import { SecretProvider } from './secrets/secret-provider.js';

export * from './core/provider.types.js';
export * from './core/provider-registry.js';
export * from './core/capability-binding.registry.js';
export * from './core/provider-router.js';
export * from './core/integration-gateway.js';
export * from './transports/mcp/mcp.types.js';
export * from './transports/mcp/mcp-client.js';
export * from './transports/mcp/mcp-connection-manager.js';
export * from './transports/mcp/mcp-executor.js';
export * from './transports/mcp/mcp-discovery.js';
export * from './providers/xydc/xydc.types.js';
export * from './providers/xydc/xydc.mapper.js';
export * from './providers/xydc/xydc.config.js';
export * from './providers/xydc/xydc.provider.js';
export * from './providers/mock/mock-market.provider.js';
export * from './secrets/secret-provider.js';

export interface IntegrationFrameworkBundle {
  providerRegistry: ProviderRegistry;
  bindingRegistry: CapabilityBindingRegistry;
  router: ProviderRouter;
  connectionManager: McpConnectionManager;
  mcpExecutor: McpExecutor;
  discovery: McpDiscovery;
  gateway: IntegrationGateway;
}

export function createDefaultIntegrationGateway(): IntegrationFrameworkBundle {
  const providerRegistry = new ProviderRegistry();
  const bindingRegistry = new CapabilityBindingRegistry();
  const connectionManager = new McpConnectionManager();
  const mcpExecutor = new McpExecutor(connectionManager);
  const discovery = new McpDiscovery(connectionManager);
  const router = new ProviderRouter(providerRegistry, bindingRegistry);
  const gateway = new IntegrationGateway(router);

  // 1. Register Mock Provider (Fallback)
  providerRegistry.register(MOCK_PROVIDER_DEFINITION);
  for (const b of MOCK_CAPABILITY_BINDINGS) {
    bindingRegistry.register(b);
  }
  const mockAdapter = new MockMarketProvider();
  gateway.registerAdapter(mockAdapter);

  // 2. Register XYDC Provider (Primary)
  providerRegistry.register(XYDC_PROVIDER_DEFINITION);
  for (const b of XYDC_CAPABILITY_BINDINGS) {
    bindingRegistry.register(b);
  }

  // Setup MCP Connection if Endpoint/Token are configured
  const xydcEndpoint = SecretProvider.getSecret('XYDC_MCP_ENDPOINT');
  const xydcToken = SecretProvider.getSecret('XYDC_MCP_TOKEN');

  if (xydcEndpoint) {
    connectionManager.registerConnection(XYDC_PROVIDER_ID, {
      endpoint: xydcEndpoint,
      token: xydcToken,
      timeoutMs: XYDC_PROVIDER_DEFINITION.timeoutMs,
    });
  }

  const xydcAdapter = new XydcProvider(mcpExecutor, connectionManager);
  gateway.registerAdapter(xydcAdapter);

  return {
    providerRegistry,
    bindingRegistry,
    router,
    connectionManager,
    mcpExecutor,
    discovery,
    gateway,
  };
}

// Wire default singleton factory
IntegrationGateway.setFactory(() => createDefaultIntegrationGateway().gateway);
