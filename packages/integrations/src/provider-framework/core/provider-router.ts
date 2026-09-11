import { ProviderRegistry } from './provider-registry.js';
import { CapabilityBindingRegistry } from './capability-binding.registry.js';
import {
  CapabilityBinding,
  IntegrationProviderDefinition,
  ProviderExecutionContext,
} from './provider.types.js';

export interface RouteResolution {
  capabilityId: string;
  primary?: CapabilityBinding;
  fallback?: CapabilityBinding;
  primaryProvider?: IntegrationProviderDefinition;
  fallbackProvider?: IntegrationProviderDefinition;
}

export class ProviderRouter {
  constructor(
    private readonly providerRegistry: ProviderRegistry,
    private readonly bindingRegistry: CapabilityBindingRegistry,
  ) {}

  resolveRoute(capabilityId: string, context?: ProviderExecutionContext): RouteResolution {
    const allBindings = this.bindingRegistry.getBindingsForCapability(capabilityId);

    // Filter bindings where both binding and provider are enabled
    const validBindings = allBindings.filter((binding) => {
      if (!binding.enabled) return false;
      const provider = this.providerRegistry.get(binding.providerId);
      return provider && provider.enabled;
    });

    if (validBindings.length === 0) {
      return { capabilityId };
    }

    // Highest priority valid binding is primary
    const primary = validBindings[0];
    const primaryProvider = this.providerRegistry.get(primary.providerId);

    // Any secondary valid binding (or specific mock fallback) is fallback
    const fallback = validBindings.length > 1 ? validBindings[1] : undefined;
    const fallbackProvider = fallback ? this.providerRegistry.get(fallback.providerId) : undefined;

    return {
      capabilityId,
      primary,
      fallback,
      primaryProvider,
      fallbackProvider,
    };
  }
}
