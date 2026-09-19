import * as fs from 'node:fs';
import * as path from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { getAutomationTimeoutConfig } from '@crosspilot/shared';
import { RpaExecutionLog } from '../rpa.interface.js';
import { SellerCentralPage, ListingFormData } from './seller-central.page.js';

export interface UpdateListingWorkflowParams {
  skuCode: string;
  title?: string;
  price?: number;
  baseUrl?: string;
  headless?: boolean;
  timeoutMs?: number;
  evidenceDir?: string;
  signal?: AbortSignal;
}

export interface UpdateListingWorkflowOutput {
  skuCode: string;
  changedFields: string[];
  verified: boolean;
  before: ListingFormData;
  after: ListingFormData;
  screenshotPath: string;
  beforeScreenshotPath?: string;
  tracePath: string;
}

export interface UpdateListingWorkflowResult {
  success: boolean;
  output?: UpdateListingWorkflowOutput;
  screenshotUrls?: string[];
  logs: RpaExecutionLog[];
  error?: string;
  durationMs: number;
  writeExecuted?: boolean;
}

/**
 * Deterministic Playwright Browser Automation workflow for Amazon Listing Update.
 * Manages isolated browser contexts, Playwright tracing, screenshot capture, and read-back verification.
 */
export class ListingUpdateWorkflow {
  static async run(
    jobId: string,
    params: UpdateListingWorkflowParams,
  ): Promise<UpdateListingWorkflowResult> {
    const startTime = Date.now();
    const logs: RpaExecutionLog[] = [];
    let writeExecuted = false;

    const recordLog = (step: string, message: string) => {
      logs.push({
        timestamp: new Date().toISOString(),
        step,
        message,
      });
    };

    recordLog('INIT', `Starting UPDATE_LISTING workflow for SKU ${params.skuCode}`);
    params.signal?.throwIfAborted();

    if (!params.skuCode) {
      return {
        success: false,
        error: 'VALIDATION_FAILED: skuCode is required',
        logs,
        durationMs: Date.now() - startTime,
        writeExecuted: false,
      };
    }

    if (params.title == null && params.price == null) {
      return {
        success: false,
        error: 'VALIDATION_FAILED: At least one of title or price must be provided',
        logs,
        durationMs: Date.now() - startTime,
        writeExecuted: false,
      };
    }

    const baseUrl = (params.baseUrl || 'http://127.0.0.1:3000').replace(/\/$/, '');
    const timeoutConfig = getAutomationTimeoutConfig();
    const timeoutMs = params.timeoutMs || timeoutConfig.executionTimeoutMs;
    const navTimeoutMs = Math.min(timeoutMs, timeoutConfig.rpaNavigationTimeoutMs);
    const verifyTimeoutMs = Math.min(timeoutMs, timeoutConfig.verifyTimeoutMs);

    const baseEvidenceDir =
      params.evidenceDir ||
      path.join(process.cwd(), '.runtime-evidence', 'rpa');
    const evidenceDir = path.join(baseEvidenceDir, jobId);

    if (!fs.existsSync(evidenceDir)) {
      fs.mkdirSync(evidenceDir, { recursive: true });
    }

    const tracePath = path.join(evidenceDir, 'trace.zip');
    const beforeScreenshot = path.join(evidenceDir, 'screenshot-before.png');
    const afterScreenshot = path.join(evidenceDir, 'screenshot-after.png');
    const failureScreenshot = path.join(evidenceDir, 'screenshot-failure.png');

    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      params.signal?.throwIfAborted();
      recordLog('BROWSER_LAUNCH', 'Launching headless Chromium browser instance');
      browser = await chromium.launch({
        headless: params.headless !== false,
      });

      params.signal?.throwIfAborted();
      context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 CrossPilot-RPA/1.0',
      });

      recordLog('TRACING_START', 'Enabling Playwright event tracing with screenshots');
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

      page = await context.newPage();
      page.setDefaultTimeout(timeoutMs);

      const sellerPage = new SellerCentralPage(page);

      // Step 1: Open Seller Central Dashboard & Search SKU
      params.signal?.throwIfAborted();
      recordLog('NAVIGATE', `Navigating to Seller Central dashboard at ${baseUrl}`);
      await sellerPage.gotoDashboard(baseUrl, navTimeoutMs);

      params.signal?.throwIfAborted();
      recordLog('LOCATE_SKU', `Searching for SKU "${params.skuCode}" and opening Edit page`);
      await sellerPage.searchAndOpenEdit(params.skuCode, timeoutMs);

      // Step 2: Read Before State
      params.signal?.throwIfAborted();
      recordLog('READ_BEFORE', 'Reading baseline listing details before applying modification');
      const before = await sellerPage.getListingDetails();
      if (!before.sku) {
        throw new Error(
          `VERIFY_FAILED: TARGET_UNVERIFIABLE: Cannot determine target SKU on listing page before editing (expected "${params.skuCode}")`,
        );
      }
      if (before.sku !== params.skuCode) {
        throw new Error(
          `VERIFY_FAILED: TARGET_MISMATCH: Page SKU "${before.sku}" does not match requested SKU "${params.skuCode}" before edit`,
        );
      }
      await page.screenshot({ path: beforeScreenshot, fullPage: true });
      recordLog('CAPTURE_BEFORE', `Captured before screenshot at ${beforeScreenshot}`);

      // Step 3: Apply Updates
      params.signal?.throwIfAborted();
      const changedFields: string[] = [];
      if (params.title != null) changedFields.push('title');
      if (params.price != null) changedFields.push('price');

      recordLog('FILL_FORM', `Updating fields [${changedFields.join(', ')}] on listing form`);
      await sellerPage.fillListing({
        title: params.title,
        price: params.price,
      });

      // Step 4: Save & Confirm (Critical: check abort before committing write!)
      params.signal?.throwIfAborted();
      recordLog('SUBMIT_SAVE', 'Clicking "Save and finish" and waiting for confirmation banner');
      writeExecuted = true;
      await sellerPage.saveAndWaitForConfirmation(timeoutMs);

      // Step 5: Reload and Verify Read-Back Truth
      if (params.signal?.aborted) {
        throw new Error('ABORTED_AFTER_WRITE: Operation was cancelled after save was submitted, remote state unknown');
      }
      recordLog('VERIFY_RELOAD', 'Reloading page to verify true persistence on Seller Central');
      page.setDefaultTimeout(verifyTimeoutMs);
      const after = await sellerPage.reloadAndVerify();
      if (!after.sku) {
        throw new Error(
          `VERIFY_FAILED: TARGET_UNVERIFIABLE: Cannot determine target SKU on listing page after reload (expected "${params.skuCode}")`,
        );
      }
      if (after.sku !== params.skuCode) {
        throw new Error(
          `VERIFY_FAILED: TARGET_MISMATCH: Page SKU "${after.sku}" does not match requested SKU "${params.skuCode}" after reload`,
        );
      }
      await page.screenshot({ path: afterScreenshot, fullPage: true });
      recordLog('CAPTURE_AFTER', `Captured after screenshot at ${afterScreenshot}`);

      // Step 6: Verify Values
      if (params.title != null && after.title !== params.title) {
        throw new Error(
          `VERIFY_FAILED: Title on page "${after.title}" does not match requested "${params.title}"`,
        );
      }
      if (params.price != null && Math.abs(after.price - params.price) > 0.005) {
        throw new Error(
          `VERIFY_FAILED: Price on page $${after.price} does not match requested $${params.price}`,
        );
      }

      recordLog('VERIFIED', `Read-back verification successful. Updated state: ${JSON.stringify(after)}`);

      // Stop Tracing
      await context.tracing.stop({ path: tracePath });
      recordLog('TRACING_SAVED', `Playwright trace archive saved at ${tracePath}`);

      await browser.close();
      browser = null;

      const output: UpdateListingWorkflowOutput = {
        skuCode: params.skuCode,
        changedFields,
        verified: true,
        before,
        after,
        screenshotPath: afterScreenshot,
        beforeScreenshotPath: beforeScreenshot,
        tracePath,
      };

      return {
        success: true,
        output,
        screenshotUrls: [afterScreenshot, beforeScreenshot],
        logs,
        durationMs: Date.now() - startTime,
        writeExecuted: true,
      };
    } catch (err: any) {
      recordLog('ERROR', `Workflow execution failed: ${err.message || String(err)}`);

      try {
        if (page) {
          await page.screenshot({ path: failureScreenshot, fullPage: true }).catch(() => {});
          recordLog('CAPTURE_FAILURE', `Captured failure screenshot at ${failureScreenshot}`);
        }
        if (context) {
          await context.tracing.stop({ path: tracePath }).catch(() => {});
        }
      } catch {
        // Ignore secondary evidence capture errors
      }

      if (browser) {
        await browser.close().catch(() => {});
      }

      const screenshotUrls = fs.existsSync(failureScreenshot) ? [failureScreenshot] : [];

      let errorClassification = 'RPA_EXECUTION_FAILED';
      const msg = String(err?.message || '');
      if (err?.name === 'AbortError' || params.signal?.aborted || msg.includes('ABORTED')) {
        errorClassification = writeExecuted ? 'ABORTED_AFTER_WRITE' : 'ABORTED_BEFORE_WRITE';
      } else if (msg.includes('SAVE_FAILED')) {
        errorClassification = 'SAVE_FAILED';
      } else if (msg.includes('VERIFY_FAILED')) {
        errorClassification = 'VERIFY_FAILED';
      } else if (
        msg.includes('waiting for locator') ||
        msg.includes('waiting for selector') ||
        msg.includes('not found') ||
        msg.includes('LOCATE_SKU')
      ) {
        errorClassification = 'SELECTOR_NOT_FOUND';
      } else if (msg.includes('Timeout') || msg.includes('timed out')) {
        errorClassification = writeExecuted ? 'VERIFY_TIMEOUT' : 'PAGE_TIMEOUT';
      }

      return {
        success: false,
        error: `${errorClassification}: ${msg}`,
        screenshotUrls,
        logs,
        durationMs: Date.now() - startTime,
        writeExecuted,
      };
    }
  }
}
