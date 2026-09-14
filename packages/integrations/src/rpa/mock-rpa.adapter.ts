import { AutomationMode } from '@crosspilot/shared';
import {
  RpaAdapter,
  RpaExecutionInput,
  RpaExecutionResult,
} from './rpa.interface.js';

export class MockRpaAdapter implements RpaAdapter {
  readonly id = 'mock-rpa';
  readonly name = 'Mock Deterministic RPA Engine (Simulation)';
  readonly supportedModes: AutomationMode[] = ['MOCK'];

  async execute(input: RpaExecutionInput): Promise<RpaExecutionResult> {
    const startTime = Date.now();
    const jobId = `mock_job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const logs = [
      {
        timestamp: new Date().toISOString(),
        step: 'MOCK_SPAWN',
        message: '[MOCK SIMULATION] Simulated headless worker initialized.',
      },
      {
        timestamp: new Date().toISOString(),
        step: 'MOCK_AUTH',
        message: '[MOCK SIMULATION] Verified simulated session token (Mock Seller Central).',
      },
      {
        timestamp: new Date().toISOString(),
        step: 'MOCK_NAVIGATE',
        message: '[MOCK SIMULATION] Navigating simulated product upload form.',
      },
      {
        timestamp: new Date().toISOString(),
        step: 'MOCK_POPULATE',
        message: `[MOCK SIMULATION] Populated mock product fields for: ${input.workflow}. SKU: ${input.params.skuCode || 'N/A'}.`,
      },
      {
        timestamp: new Date().toISOString(),
        step: 'MOCK_ASSETS',
        message: '[MOCK SIMULATION] Attached 5 simulated listing assets and dimension diagrams.',
      },
      {
        timestamp: new Date().toISOString(),
        step: 'MOCK_SUBMIT',
        message: '[MOCK SIMULATION] Mock feed submitted. Demo Batch ID: 8192049102.',
      },
    ];

    const durationMs = Date.now() - startTime + 80;

    return {
      jobId,
      status: 'SUCCESS',
      output: {
        batchFeedId: '8192049102',
        marketplaceId: 'ATVPDKIKX0DER',
        skuCode: input.params.skuCode,
        draftUrl: `https://sellercentral.amazon.com/inventory/view/${input.params.skuCode || 'item'}`,
        verified: false,
        isMock: true,
        mode: 'MOCK',
      },
      screenshotUrls: [
        'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=800&auto=format&fit=crop&q=80',
      ],
      logs,
      durationMs,
    };
  }

  async cancel(jobId: string): Promise<boolean> {
    return true;
  }

  async getStatus(jobId: string): Promise<RpaExecutionResult> {
    return {
      jobId,
      status: 'SUCCESS',
      output: {
        isMock: true,
        mode: 'MOCK',
        verified: false,
      },
      durationMs: 120,
    };
  }
}
