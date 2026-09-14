import { HttpERPAdapter, HttpErpAdapterOptions } from './http-erp.adapter.js';

export interface SimulatorErpAdapterOptions extends Partial<HttpErpAdapterOptions> {
  baseUrl?: string;
}

export class SimulatorERPAdapter extends HttpERPAdapter {
  constructor(options: SimulatorErpAdapterOptions = {}) {
    const baseUrl =
      options.baseUrl ||
      process.env.SIMULATOR_ERP_URL ||
      process.env.AUTOMATION_SIMULATOR_ERP_URL ||
      'http://127.0.0.1:9099';
    super({
      ...options,
      baseUrl,
      timeoutMs: options.timeoutMs ?? 5000,
      maxRetries: options.maxRetries ?? 0,
    });
  }
}
