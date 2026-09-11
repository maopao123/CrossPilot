import { RpaAdapter } from './rpa.interface.js';
import { MockRpaAdapter } from './mock-rpa.adapter.js';
import { YingdaoRpaAdapter } from './yingdao.adapter.js';

export class RpaRegistry {
  private adapters = new Map<string, RpaAdapter>();

  constructor() {
    this.register(new MockRpaAdapter());
    this.register(new YingdaoRpaAdapter());
  }

  register(adapter: RpaAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  get(id: string): RpaAdapter | undefined {
    return this.adapters.get(id);
  }

  getDefault(): RpaAdapter {
    return this.adapters.get('mock-rpa') || Array.from(this.adapters.values())[0];
  }

  listAdapters(): Array<{ id: string; name: string }> {
    return Array.from(this.adapters.values()).map((a) => ({
      id: a.id,
      name: a.name,
    }));
  }
}

export const defaultRpaRegistry = new RpaRegistry();
