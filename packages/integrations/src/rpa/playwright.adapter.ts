import { randomUUID } from 'node:crypto';
import { AutomationMode } from '@crosspilot/shared';
import {
  RpaAdapter,
  RpaExecutionInput,
  RpaExecutionResult,
} from './rpa.interface.js';
import {
  ListingUpdateWorkflow,
  UpdateListingWorkflowParams,
} from './playwright/listing.workflow.js';
import { MockSellerCentralServer } from './playwright/mock-seller-central.server.js';

export interface PlaywrightRpaAdapterOptions {
  baseUrl?: string;
  headless?: boolean;
  timeoutMs?: number;
  evidenceDir?: string;
  mockServer?: MockSellerCentralServer;
}

/**
 * Playwright Browser RPA Adapter implementing RpaAdapter.
 * Executes genuine headless browser automation against Seller Central.
 * Captures real screenshots, Playwright trace.zip, before/after values, and enforces read-back verification.
 */
export class PlaywrightRpaAdapter implements RpaAdapter {
  readonly id = 'playwright-rpa';
  readonly name = 'Playwright Browser RPA';
  readonly supportedModes: AutomationMode[] = ['LIVE'];

  private readonly options: PlaywrightRpaAdapterOptions;
  private readonly executionResults = new Map<string, RpaExecutionResult>();

  constructor(options: PlaywrightRpaAdapterOptions = {}) {
    this.options = options;
  }

  async execute(input: RpaExecutionInput): Promise<RpaExecutionResult> {
    const jobId = `rpa_playwright_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const startTime = Date.now();

    const params = (input.params || {}) as Record<string, any>;

    // 1. Workflow validation: match exact code or friendly proposal name
    const rawWorkflow = String(params.workflow || input.workflow || '').trim();
    const normalizedWorkflow = rawWorkflow.toUpperCase().replace(/[\s-]+/g, '_');
    const isSupported =
      normalizedWorkflow === 'UPDATE_LISTING' ||
      normalizedWorkflow === 'UPDATE_AMAZON_LISTING' ||
      rawWorkflow === 'UPDATE_LISTING';

    if (!isSupported) {
      const failedResult: RpaExecutionResult = {
        jobId,
        status: 'FAILED',
        error: `UNSUPPORTED_WORKFLOW: Playwright RPA adapter does not support workflow "${input.workflow}"`,
        logs: [
          {
            timestamp: new Date().toISOString(),
            step: 'VALIDATION',
            message: `Unsupported workflow "${input.workflow}". Supported: [UPDATE_LISTING]`,
          },
        ],
        durationMs: Date.now() - startTime,
      };
      this.executionResults.set(jobId, failedResult);
      return failedResult;
    }

    const skuCode = String(params.skuCode || params.sku || '');
    const title = params.title != null ? String(params.title) : undefined;
    const price = params.price != null ? parseFloat(String(params.price)) : undefined;

    // 2. Base URL discovery: input param > options > env > explicitly provided mockServer
    let baseUrl = params.baseUrl || this.options.baseUrl || process.env.SELLER_CENTRAL_URL;
    if (!baseUrl && this.options.mockServer) {
      baseUrl = this.options.mockServer.getUrl();
    }

    // Fail-closed: Never auto-spin mock server in LIVE mode if target URL is missing!
    if (!baseUrl) {
      const configErrorResult: RpaExecutionResult = {
        jobId,
        status: 'FAILED',
        error: 'CONFIG_ERROR: No Seller Central target URL provided for LIVE RPA execution. Set SELLER_CENTRAL_URL or configure baseUrl.',
        logs: [
          {
            timestamp: new Date().toISOString(),
            step: 'CONFIG_VALIDATION',
            message: 'LIVE RPA execution rejected: target Seller Central URL is missing. Refusing to fallback to mock in LIVE mode.',
          },
        ],
        durationMs: Date.now() - startTime,
      };
      this.executionResults.set(jobId, configErrorResult);
      return configErrorResult;
    }

    const workflowParams: UpdateListingWorkflowParams = {
      skuCode,
      title,
      price,
      baseUrl,
      headless: params.headless ?? this.options.headless ?? true,
      timeoutMs: input.timeoutMs || params.timeoutMs || this.options.timeoutMs || 15000,
      evidenceDir: params.evidenceDir || this.options.evidenceDir,
    };

    try {
      const outcome = await ListingUpdateWorkflow.run(jobId, workflowParams);

      let status: 'SUCCESS' | 'FAILED' | 'TIMEOUT' = 'FAILED';
      if (outcome.success) {
        status = 'SUCCESS';
      } else if (outcome.error && outcome.error.startsWith('PAGE_TIMEOUT')) {
        status = 'TIMEOUT';
      }

      const result: RpaExecutionResult = {
        jobId,
        status,
        output: outcome.output as unknown as Record<string, unknown>,
        screenshotUrls: outcome.screenshotUrls,
        logs: outcome.logs,
        error: outcome.error,
        durationMs: outcome.durationMs,
      };

      this.executionResults.set(jobId, result);
      return result;
    } catch (err: any) {
      const errorResult: RpaExecutionResult = {
        jobId,
        status: 'FAILED',
        error: `EXECUTION_ERROR: ${err?.message || String(err)}`,
        logs: [
          {
            timestamp: new Date().toISOString(),
            step: 'UNHANDLED_EXCEPTION',
            message: err?.message || String(err),
          },
        ],
        durationMs: Date.now() - startTime,
      };
      this.executionResults.set(jobId, errorResult);
      return errorResult;
    }
  }

  async getStatus(jobId: string): Promise<RpaExecutionResult> {
    const res = this.executionResults.get(jobId);
    if (res) return res;
    return {
      jobId,
      status: 'FAILED',
      error: `Job ${jobId} not found`,
      durationMs: 0,
    };
  }
}
