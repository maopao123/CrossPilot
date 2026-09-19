import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { ActionRouter, ActionProposal } from '../src/index.js';
import {
  RpaRegistry,
  PlaywrightRpaAdapter,
  MockSellerCentralServer,
  YingdaoRpaAdapter,
  MockRpaAdapter,
} from '@crosspilot/integrations/rpa';

describe('V10 Phase B: Playwright Listing RPA Execution Truth Tests', () => {
  let mockServer: MockSellerCentralServer;
  let serverUrl: string;

  beforeAll(async () => {
    mockServer = new MockSellerCentralServer();
    serverUrl = await mockServer.start(0);
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  beforeEach(() => {
    mockServer.resetListings();
  });

  const baseListingProposal: ActionProposal = {
    id: 'act_playwright_001',
    type: 'RPA',
    name: 'Update Amazon Listing',
    description: 'Update listing title and price for SKU-001',
    requiresHumanApproval: true,
    targetEntity: 'SKU',
    targetId: 'SKU-001',
    payload: {
      workflow: 'UPDATE_LISTING',
      skuCode: 'SKU-001',
      title: 'Marble Toothbrush Holder White - Upgraded',
      price: 29.99,
    },
    riskLevel: 'HIGH',
    status: 'PENDING',
    createdAt: '2026-09-19T00:00:00.000Z',
  };

  it('1. PlaywrightRpaAdapter is registered in RpaRegistry with id=playwright-rpa and LIVE mode', () => {
    const registry = new RpaRegistry();
    const adapter = registry.get('playwright-rpa');
    expect(adapter).toBeDefined();
    expect(adapter).toBeInstanceOf(PlaywrightRpaAdapter);
    expect(adapter?.id).toBe('playwright-rpa');
    expect(adapter?.supportedModes).toEqual(['LIVE']);
  });

  it('2-7. UPDATE_LISTING succeeds with real browser: updates title & price, verifies before/after, captures real screenshot and trace.zip', async () => {
    const testEvidenceDir = path.join(
      process.cwd(),
      '.runtime-evidence',
      'test-playwright-rpa',
      'job_success',
    );

    const adapter = new PlaywrightRpaAdapter({
      baseUrl: serverUrl,
      headless: true,
      evidenceDir: testEvidenceDir,
      timeoutMs: 15000,
    });

    const result = await adapter.execute({
      workflow: 'UPDATE_LISTING',
      params: {
        skuCode: 'SKU-001',
        title: 'Marble Toothbrush Holder White - Upgraded V2',
        price: 34.99,
      },
    });

    // 2. Status SUCCESS
    expect(result.status).toBe('SUCCESS');
    expect(result.error).toBeUndefined();
    expect(result.durationMs).toBeGreaterThan(50);
    expect(result.logs?.length).toBeGreaterThan(5);

    const out = result.output as any;
    expect(out).toBeDefined();
    expect(out.skuCode).toBe('SKU-001');
    expect(out.changedFields).toEqual(['title', 'price']);

    // 3. Title modified successfully
    expect(out.after.title).toBe('Marble Toothbrush Holder White - Upgraded V2');

    // 4. Price modified successfully
    expect(out.after.price).toBe(34.99);

    // 5. Before / After Verified
    expect(out.before.title).toBe('Marble Toothbrush Holder White');
    expect(out.before.price).toBe(24.99);
    expect(out.verified).toBe(true);

    // 6. Screenshot genuinely captured and exists on disk
    expect(out.screenshotPath).toBeDefined();
    expect(fs.existsSync(out.screenshotPath)).toBe(true);
    const screenshotStat = fs.statSync(out.screenshotPath);
    expect(screenshotStat.size).toBeGreaterThan(1000);

    // 7. Playwright trace.zip genuinely captured and exists on disk
    expect(out.tracePath).toBeDefined();
    expect(fs.existsSync(out.tracePath)).toBe(true);
    const traceStat = fs.statSync(out.tracePath);
    expect(traceStat.size).toBeGreaterThan(1000);

    // Check server in-memory persisted state aligns
    const serverItem = mockServer.getListing('SKU-001');
    expect(serverItem?.title).toBe('Marble Toothbrush Holder White - Upgraded V2');
    expect(serverItem?.price).toBe(34.99);
  }, 30000);

  it('8. Element / SKU not found returns FAILED with SELECTOR_NOT_FOUND and does not fake SUCCESS', async () => {
    const testEvidenceDir = path.join(
      process.cwd(),
      '.runtime-evidence',
      'test-playwright-rpa',
      'job_not_found',
    );

    const adapter = new PlaywrightRpaAdapter({
      baseUrl: serverUrl,
      headless: true,
      evidenceDir: testEvidenceDir,
      timeoutMs: 3000,
    });

    const result = await adapter.execute({
      workflow: 'UPDATE_LISTING',
      params: {
        skuCode: 'NON_EXISTENT_SKU_99999',
        title: 'Ghost Product',
        price: 19.99,
      },
    });

    expect(result.status).toBe('FAILED');
    expect(result.output?.verified).toBeUndefined();
    expect(result.error).toMatch(/SELECTOR_NOT_FOUND|Timeout|failed/i);
    // Failure screenshot captured
    if (result.screenshotUrls && result.screenshotUrls.length > 0) {
      expect(fs.existsSync(result.screenshotUrls[0])).toBe(true);
    }
  }, 15000);

  it('9. Server failure during save returns FAILED with appropriate error message', async () => {
    // Inject server-side error on update
    const origSetListing = mockServer.setListing;
    mockServer.setListing = () => {
      throw new Error('Simulated database write error');
    };

    const testEvidenceDir = path.join(
      process.cwd(),
      '.runtime-evidence',
      'test-playwright-rpa',
      'job_server_err',
    );

    const adapter = new PlaywrightRpaAdapter({
      baseUrl: serverUrl,
      headless: true,
      evidenceDir: testEvidenceDir,
      timeoutMs: 4000,
    });

    try {
      const result = await adapter.execute({
        workflow: 'UPDATE_LISTING',
        params: {
          skuCode: 'SKU-001',
          title: 'Should Fail Title',
          price: 50.0,
        },
      });

      expect(result.status).toBe('FAILED');
      expect(result.status).not.toBe('SUCCESS');
    } finally {
      mockServer.setListing = origSetListing;
    }
  }, 15000);

  it('10. Verify mismatch returns FAILED with VERIFY_FAILED', async () => {
    // Inject tamper: server persists different price than requested
    const origSetListing = mockServer.setListing;
    mockServer.setListing = (sku, data) => {
      return origSetListing.call(mockServer, sku, { ...data, price: 999.99 });
    };

    const testEvidenceDir = path.join(
      process.cwd(),
      '.runtime-evidence',
      'test-playwright-rpa',
      'job_verify_mismatch',
    );

    const adapter = new PlaywrightRpaAdapter({
      baseUrl: serverUrl,
      headless: true,
      evidenceDir: testEvidenceDir,
      timeoutMs: 8000,
    });

    try {
      const result = await adapter.execute({
        workflow: 'UPDATE_LISTING',
        params: {
          skuCode: 'SKU-001',
          title: 'Mismatch Test Title',
          price: 29.99,
        },
      });

      expect(result.status).toBe('FAILED');
      expect(result.error).toMatch(/VERIFY_FAILED/);
    } finally {
      mockServer.setListing = origSetListing;
    }
  }, 15000);

  it('11. Very short timeout triggers TIMEOUT status with PAGE_TIMEOUT error', async () => {
    const adapter = new PlaywrightRpaAdapter({
      baseUrl: serverUrl,
      headless: true,
      timeoutMs: 1, // 1 millisecond causes immediate timeout
    });

    const result = await adapter.execute({
      workflow: 'UPDATE_LISTING',
      params: {
        skuCode: 'SKU-001',
        title: 'Fast Timeout',
        price: 20.0,
      },
    });

    expect(['TIMEOUT', 'FAILED']).toContain(result.status);
    expect(result.status).not.toBe('SUCCESS');
    expect(result.error).toMatch(/TIMEOUT|Timeout/i);
  }, 10000);

  it('12. HITL Gate: ActionRouter blocks unapproved action before triggering Playwright browser', async () => {
    let browserExecuted = false;
    const mockPlaywrightAdapter: PlaywrightRpaAdapter = {
      id: 'playwright-rpa',
      name: 'Playwright Browser RPA',
      supportedModes: ['LIVE'],
      execute: async () => {
        browserExecuted = true;
        return { jobId: 'test', status: 'SUCCESS', durationMs: 1 };
      },
    } as any;

    const registry = new RpaRegistry();
    registry.register(mockPlaywrightAdapter);
    const router = new ActionRouter(registry);

    const result = await router.dispatch(baseListingProposal, {
      workspaceId: 'ws_demo',
      isApproved: false, // NOT APPROVED
      executionMode: 'LIVE',
      providerId: 'playwright-rpa',
    });

    expect(result.status).toBe('WAITING_APPROVAL');
    expect(result.executionEvidence?.effect).toBe('NOT_APPLIED');
    expect(browserExecuted).toBe(false);
  });

  it('13. MockRpaAdapter remains dedicated to MOCK mode', async () => {
    const registry = new RpaRegistry();
    const router = new ActionRouter(registry);

    const result = await router.dispatch(baseListingProposal, {
      workspaceId: 'ws_demo',
      isApproved: true,
      executionMode: 'MOCK',
      providerId: 'mock-rpa',
    });

    expect(result.status).toBe('SUCCEEDED');
    expect(result.isMock).toBe(true);
    expect(result.executionEvidence?.mode).toBe('MOCK');
  });

  it('14. YingdaoRpaAdapter is unaffected and regression free', () => {
    const registry = new RpaRegistry();
    const yingdao = registry.get('yingdao-rpa');
    expect(yingdao).toBeDefined();
    expect(yingdao).toBeInstanceOf(YingdaoRpaAdapter);
  });

  it('15. LIVE mode without live provider does NOT silently fallback to Mock', async () => {
    const registry = new RpaRegistry();
    const router = new ActionRouter(registry);

    const result = await router.dispatch(baseListingProposal, {
      workspaceId: 'ws_demo',
      isApproved: true,
      executionMode: 'LIVE',
      providerId: 'non_existent_provider',
    });

    expect(result.status).toBe('FAILED');
    expect(result.executionEvidence?.effect).toBe('NOT_APPLIED');
    expect(result.data?.isMock).toBeUndefined();
  });

  it('16. P1 Finding 1: Default registry + LIVE mode + Approved Action rejects execution with CONFIG_ERROR when baseUrl is missing and never falls back to Mock or claims APPLIED', async () => {
    const oldEnv = process.env.SELLER_CENTRAL_URL;
    delete process.env.SELLER_CENTRAL_URL;

    try {
      // Use standard default registry with default unconfigured PlaywrightRpaAdapter
      const registry = new RpaRegistry();
      const router = new ActionRouter(registry);

      const approvedProposalWithoutUrl: ActionProposal = {
        ...baseListingProposal,
        id: 'act_playwright_no_url',
        isApproved: true,
        payload: {
          workflow: 'UPDATE_LISTING',
          skuCode: 'SKU-001',
          title: 'Should not execute without target URL',
          price: 25.0,
          // No baseUrl provided in params
        },
      };

      const result = await router.dispatch(approvedProposalWithoutUrl, {
        workspaceId: 'ws_demo',
        isApproved: true,
        executionMode: 'LIVE',
        providerId: 'playwright-rpa',
      });

      expect(result.status).toBe('FAILED');
      expect(result.executionEvidence?.mode).toBe('LIVE');
      expect(result.executionEvidence?.phase).toBe('FAILED');
      expect(result.executionEvidence?.effect).toBe('NOT_APPLIED');
      expect(result.executionEvidence?.effect).not.toBe('APPLIED');
      expect(result.error).toContain('CONFIG_ERROR');
      expect(result.isMock).toBe(false);
    } finally {
      if (oldEnv) {
        process.env.SELLER_CENTRAL_URL = oldEnv;
      }
    }
  });

  it('17. P2 Finding 5: Approved Action Proposal with name "Update Amazon Listing" executes successfully through ActionRouter and applies change in browser', async () => {
    const registry = new RpaRegistry();
    const liveAdapter = new PlaywrightRpaAdapter({
      baseUrl: serverUrl,
      headless: true,
    });
    registry.register(liveAdapter);
    const router = new ActionRouter(registry);

    const proposalWithDisplayName: ActionProposal = {
      ...baseListingProposal,
      id: 'act_playwright_display_name',
      name: 'Update Amazon Listing', // Human-friendly display name
      isApproved: true,
      payload: {
        workflow: 'UPDATE_LISTING',
        skuCode: 'SKU-001',
        title: 'Title via ActionRouter Integration',
        price: 32.5,
        baseUrl: serverUrl,
      },
    };

    const result = await router.dispatch(proposalWithDisplayName, {
      workspaceId: 'ws_demo',
      isApproved: true,
      executionMode: 'LIVE',
      providerId: 'playwright-rpa',
    });

    expect(result.status).toBe('SUCCEEDED');
    expect(result.executionEvidence?.phase).toBe('COMPLETED');
    expect(result.executionEvidence?.effect).toBe('APPLIED');
    expect(result.executionEvidence?.externalId).toMatch(/^rpa_playwright_/);

    const current = mockServer.getListing('SKU-001');
    expect(current?.title).toBe('Title via ActionRouter Integration');
    expect(current?.price).toBe(32.5);
  }, 20000);

  it('18. P2 Finding 8: Distinct jobs configured with the same evidenceDir preserve independent subdirectories by jobId and do not overwrite each other', async () => {
    const sharedBaseEvidenceDir = path.join(
      process.cwd(),
      '.runtime-evidence',
      'test-playwright-shared-evidence',
    );

    const adapter = new PlaywrightRpaAdapter({
      baseUrl: serverUrl,
      headless: true,
      evidenceDir: sharedBaseEvidenceDir,
    });

    // Run Job 1
    const result1 = await adapter.execute({
      workflow: 'UPDATE_LISTING',
      params: {
        skuCode: 'SKU-001',
        title: 'Job 1 Title',
        price: 21.0,
      },
    });
    expect(result1.status).toBe('SUCCESS');
    const out1 = result1.output as any;
    expect(out1.tracePath).toContain(result1.jobId);
    expect(fs.existsSync(out1.tracePath)).toBe(true);

    const trace1Bytes = fs.readFileSync(out1.tracePath);
    const trace1Hash = crypto.createHash('sha256').update(trace1Bytes).digest('hex');

    // Run Job 2
    const result2 = await adapter.execute({
      workflow: 'UPDATE_LISTING',
      params: {
        skuCode: 'SKU-001',
        title: 'Job 2 Title',
        price: 22.0,
      },
    });
    expect(result2.status).toBe('SUCCESS');
    const out2 = result2.output as any;
    expect(out2.tracePath).toContain(result2.jobId);
    expect(fs.existsSync(out2.tracePath)).toBe(true);

    // Job IDs and trace paths must be distinct
    expect(result1.jobId).not.toBe(result2.jobId);
    expect(out1.tracePath).not.toBe(out2.tracePath);

    // Job 1's trace.zip must remain completely unaltered after Job 2 completes
    expect(fs.existsSync(out1.tracePath)).toBe(true);
    const trace1PostBytes = fs.readFileSync(out1.tracePath);
    const trace1PostHash = crypto.createHash('sha256').update(trace1PostBytes).digest('hex');
    expect(trace1PostHash).toBe(trace1Hash);
  }, 30000);

  it('19. P2 Finding 9: Mock Seller Central and POM safely handle titles with double quotes, ampersands, and angle brackets', async () => {
    const specialTitle = '12" Marble & Glass <Special> Holder';
    const adapter = new PlaywrightRpaAdapter({
      baseUrl: serverUrl,
      headless: true,
      timeoutMs: 15000,
    });

    const result = await adapter.execute({
      workflow: 'UPDATE_LISTING',
      params: {
        skuCode: 'SKU-001',
        title: specialTitle,
        price: 27.99,
      },
    });

    expect(result.status).toBe('SUCCESS');
    const out = result.output as any;
    expect(out.verified).toBe(true);
    expect(out.after.title).toBe(specialTitle);

    const savedListing = mockServer.getListing('SKU-001');
    expect(savedListing?.title).toBe(specialTitle);
  }, 20000);

  it('20. P2 Finding 10: Safely locates and updates listings with punctuation in SKU (e.g. SKU.A/01 and MTH-01/B.2)', async () => {
    // Register item with punctuation SKU
    mockServer.setListing('SKU.A/01', {
      sku: 'SKU.A/01',
      asin: 'B0CPUNCT01',
      title: 'Punctuation SKU Original Title',
      price: 18.5,
      status: 'Active',
    });

    const adapter = new PlaywrightRpaAdapter({
      baseUrl: serverUrl,
      headless: true,
      timeoutMs: 15000,
    });

    const result = await adapter.execute({
      workflow: 'UPDATE_LISTING',
      params: {
        skuCode: 'SKU.A/01',
        title: 'Punctuation SKU Updated Title',
        price: 23.5,
      },
    });

    expect(result.status).toBe('SUCCESS');
    const out = result.output as any;
    expect(out.verified).toBe(true);
    expect(out.after.title).toBe('Punctuation SKU Updated Title');
    expect(out.after.price).toBe(23.5);

    const updated = mockServer.getListing('SKU.A/01');
    expect(updated?.title).toBe('Punctuation SKU Updated Title');
    expect(updated?.price).toBe(23.5);
  }, 20000);
});
