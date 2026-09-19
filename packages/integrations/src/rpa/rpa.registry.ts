import { AutomationMode } from '@crosspilot/shared';
import { RpaAdapter } from './rpa.interface.js';
import { MockRpaAdapter } from './mock-rpa.adapter.js';
import { YingdaoRpaAdapter } from './yingdao.adapter.js';
import { PlaywrightRpaAdapter } from './playwright.adapter.js';

export class RpaRegistry {
  private adapters = new Map<string, RpaAdapter>();

  constructor() {
    this.register(new MockRpaAdapter());
    this.register(new YingdaoRpaAdapter());
    this.register(new PlaywrightRpaAdapter());
  }

  register(adapter: RpaAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  get(id: string): RpaAdapter | undefined {
    return this.adapters.get(id);
  }

  getDefault(mode: AutomationMode = 'LIVE'): RpaAdapter | undefined {
    if (mode === 'MOCK') {
      const mock = this.adapters.get('mock-rpa');
      if (mock && (!mock.supportedModes || mock.supportedModes.includes('MOCK'))) {
        return mock;
      }
      for (const adapter of this.adapters.values()) {
        if (adapter.supportedModes?.includes('MOCK')) return adapter;
      }
      return undefined;
    }

    if (mode === 'LIVE') {
      const live = this.adapters.get('yingdao-rpa');
      if (live && (!live.supportedModes || live.supportedModes.includes('LIVE'))) {
        return live;
      }
      for (const adapter of this.adapters.values()) {
        if (adapter.supportedModes?.includes('LIVE')) return adapter;
      }
      return undefined;
    }

    if (mode === 'SIMULATOR') {
      for (const adapter of this.adapters.values()) {
        if (adapter.supportedModes?.includes('SIMULATOR')) return adapter;
      }
      return undefined;
    }

    return undefined;
  }

  listAdapters(): Array<{ id: string; name: string }> {
    return Array.from(this.adapters.values()).map((a) => ({
      id: a.id,
      name: a.name,
    }));
  }
}

export const defaultRpaRegistry = new RpaRegistry();
