import { CapabilityBinding } from './provider.types.js';

export class CapabilityBindingRegistry {
  private readonly bindings: CapabilityBinding[] = [];

  register(binding: CapabilityBinding): void {
    const existingIndex = this.bindings.findIndex(
      (b) => b.capabilityId === binding.capabilityId && b.providerId === binding.providerId,
    );
    if (existingIndex >= 0) {
      this.bindings[existingIndex] = binding;
    } else {
      this.bindings.push(binding);
    }
  }

  getBindingsForCapability(capabilityId: string): CapabilityBinding[] {
    return this.bindings
      .filter((b) => b.capabilityId === capabilityId)
      .sort((a, b) => b.priority - a.priority);
  }

  getBinding(capabilityId: string, providerId: string): CapabilityBinding | undefined {
    return this.bindings.find(
      (b) => b.capabilityId === capabilityId && b.providerId === providerId,
    );
  }

  list(): CapabilityBinding[] {
    return [...this.bindings];
  }

  listEnabled(): CapabilityBinding[] {
    return this.bindings.filter((b) => b.enabled);
  }
}
