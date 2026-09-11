import { IntegrationProviderDefinition, ProviderCategory } from './provider.types.js';

export class ProviderRegistry {
  private readonly providers = new Map<string, IntegrationProviderDefinition>();

  register(definition: IntegrationProviderDefinition): void {
    this.providers.set(definition.id, definition);
  }

  get(id: string): IntegrationProviderDefinition | undefined {
    return this.providers.get(id);
  }

  has(id: string): boolean {
    return this.providers.has(id);
  }

  list(): IntegrationProviderDefinition[] {
    return Array.from(this.providers.values());
  }

  listByCategory(category: ProviderCategory): IntegrationProviderDefinition[] {
    return this.list().filter((p) => p.category === category);
  }

  listEnabled(): IntegrationProviderDefinition[] {
    return this.list().filter((p) => p.enabled);
  }

  setEnabled(id: string, enabled: boolean): boolean {
    const p = this.providers.get(id);
    if (!p) return false;
    p.enabled = enabled;
    return true;
  }
}
