import {
  RpaAdapter,
  RpaExecutionInput,
  RpaExecutionResult,
} from './rpa.interface.js';

export class MockRpaAdapter implements RpaAdapter {
  readonly id = 'mock-rpa';
  readonly name = 'Mock Deterministic RPA Engine';

  async execute(input: RpaExecutionInput): Promise<RpaExecutionResult> {
    const startTime = Date.now();
    const jobId = `mock_job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const logs = [
      {
        timestamp: new Date().toISOString(),
        step: 'LAUNCH_BROWSER',
        message: 'Chromium headless session spawned successfully.',
      },
      {
        timestamp: new Date().toISOString(),
        step: 'AUTH_VERIFY',
        message: 'Seller Central session cookie valid. Region: North America.',
      },
      {
        timestamp: new Date().toISOString(),
        step: 'NAVIGATE_INVENTORY',
        message: 'Navigated to Seller Central > Add Products via Upload.',
      },
      {
        timestamp: new Date().toISOString(),
        step: 'POPULATE_FIELDS',
        message: `Filled product attributes for workflow: ${input.workflow}. SKU: ${input.params.skuCode || 'N/A'}.`,
      },
      {
        timestamp: new Date().toISOString(),
        step: 'UPLOAD_ASSETS',
        message: 'Uploaded 5 compliant listing images and dimension diagrams.',
      },
      {
        timestamp: new Date().toISOString(),
        step: 'SUBMIT_FEED',
        message: 'Batch feed submitted. Amazon Batch ID: 8192049102.',
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
        verified: true,
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
      durationMs: 120,
    };
  }
}
