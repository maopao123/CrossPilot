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
  allowedHosts?: (string | RegExp)[];
}

export const ALLOWED_SELLER_CENTRAL_HOST_PATTERNS: RegExp[] = [
  /^sellercentral\.amazon\.com$/,
  /^sellercentral\.amazon\.co\.uk$/,
  /^sellercentral\.amazon\.de$/,
  /^sellercentral\.amazon\.co\.jp$/,
  /^sellercentral\.amazon\.fr$/,
  /^sellercentral\.amazon\.it$/,
  /^sellercentral\.amazon\.es$/,
  /^sellercentral\.amazon\.ca$/,
  /^sellercentral\.amazon\.com\.mx$/,
  /^sellercentral\.amazon\.com\.au$/,
  /^([a-z0-9-]+\.)?sellercentral\.amazon\.[a-z.]+$/,
];

export function isAllowedTargetHost(
  urlStr: string,
  options: PlaywrightRpaAdapterOptions = {},
): boolean {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase();

    // 1. Check Seller Central allowlist
    for (const pattern of ALLOWED_SELLER_CENTRAL_HOST_PATTERNS) {
      if (pattern.test(hostname)) return true;
    }

    // 2. Check options.allowedHosts
    if (options.allowedHosts) {
      for (const allowed of options.allowedHosts) {
        if (typeof allowed === 'string' && allowed.toLowerCase() === hostname) return true;
        if (allowed instanceof RegExp && allowed.test(hostname)) return true;
      }
    }

    // 3. Check if hostname matches server-configured options.baseUrl
    if (options.baseUrl) {
      try {
        const configured = new URL(options.baseUrl);
        if (configured.hostname.toLowerCase() === hostname) return true;
      } catch {}
    }

    // 4. In test / dev environments, allow loopback hosts for mock testing
    const isTestOrDev =
      process.env.NODE_ENV === 'test' ||
      process.env.NODE_ENV === 'development' ||
      !process.env.NODE_ENV;
    if (isTestOrDev && (hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1')) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
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
        jobId: '',
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
      return failedResult;
    }

    const skuCode = String(params.skuCode || params.sku || '');
    const title = params.title != null ? String(params.title) : undefined;
    const price = params.price != null ? parseFloat(String(params.price)) : undefined;

    // 2. Base URL discovery & target host security guard:
    // In LIVE mode, client cannot arbitrarily supply external target URLs.
    // Target host must match the Seller Central allowlist or server trusted configuration.
    if (params.baseUrl && !isAllowedTargetHost(params.baseUrl, this.options)) {
      let hostname = 'unknown';
      try {
        hostname = new URL(params.baseUrl).hostname;
      } catch {}
      return {
        jobId: '',
        status: 'FAILED',
        error: `CONFIG_ERROR: Unauthorized target host "${hostname}" in baseUrl. Target host must be a valid Seller Central domain or trusted server configuration.`,
        logs: [
          {
            timestamp: new Date().toISOString(),
            step: 'CONFIG_VALIDATION',
            message: `LIVE RPA execution rejected: host "${hostname}" is not in the Seller Central allowlist or server configuration.`,
          },
        ],
        durationMs: Date.now() - startTime,
      };
    }

    let baseUrl = params.baseUrl || this.options.baseUrl || process.env.SELLER_CENTRAL_URL;
    if (!baseUrl && this.options.mockServer) {
      baseUrl = this.options.mockServer.getUrl();
    }

    // Fail-closed: Never auto-spin mock server in LIVE mode if target URL is missing!
    if (!baseUrl) {
      const configErrorResult: RpaExecutionResult = {
        jobId: '',
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
      return configErrorResult;
    }

    if (!isAllowedTargetHost(baseUrl, this.options)) {
      let hostname = 'unknown';
      try {
        hostname = new URL(baseUrl).hostname;
      } catch {}
      return {
        jobId: '',
        status: 'FAILED',
        error: `CONFIG_ERROR: Unauthorized target host "${hostname}" in configured baseUrl. Target host must be a valid Seller Central domain.`,
        logs: [
          {
            timestamp: new Date().toISOString(),
            step: 'CONFIG_VALIDATION',
            message: `LIVE RPA execution rejected: host "${hostname}" is not in the Seller Central allowlist.`,
          },
        ],
        durationMs: Date.now() - startTime,
      };
    }

    const jobId = `rpa_playwright_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

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
