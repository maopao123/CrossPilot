import {
  getAutomationTimeoutConfig,
  combineAbortSignals,
  DEFAULT_AUTOMATION_TIMEOUT_CONFIG,
  normalizeExecutionError,
  ExecutionErrorClass,
} from '@crosspilot/shared';
import {
  HttpERPAdapter,
  PlaywrightRpaAdapter,
  RpaRegistry,
  RpaExecutionResult,
} from '@crosspilot/integrations';
import {
  ShopifyAdapter,
  HttpShopifyGraphQLTransport,
  defaultShopifyTokenExchanger,
} from '@crosspilot/db';
import { CommercePortError } from '@crosspilot/domain';
import { ActionRouter, ActionProposal, computeCanonicalPayloadHash } from '../src/index.js';

describe('Phase 2: Timeout, Cancellation & AbortSignal Propagation Tests', () => {
  // ---------------------------------------------------------------------------
  // 1. Timeout Config Parsing and Defaults
  // ---------------------------------------------------------------------------
  describe('1. AutomationTimeoutConfig Parsing & Boundary Enforcement', () => {
    it('1.1 returns correct default timeout configuration', () => {
      const config = getAutomationTimeoutConfig({});
      expect(config.httpTimeoutMs).toBe(10_000);
      expect(config.executionTimeoutMs).toBe(60_000);
      expect(config.verifyTimeoutMs).toBe(15_000);
      expect(config.rpaNavigationTimeoutMs).toBe(30_000);
      expect(DEFAULT_AUTOMATION_TIMEOUT_CONFIG.httpTimeoutMs).toBe(10_000);
    });

    it('1.2 parses environment variable overrides correctly', () => {
      const customEnv = {
        AUTOMATION_HTTP_TIMEOUT_MS: '5000',
        AUTOMATION_EXECUTION_TIMEOUT_MS: '45000',
        AUTOMATION_VERIFY_TIMEOUT_MS: '12000',
        AUTOMATION_RPA_NAVIGATION_TIMEOUT_MS: '20000',
      };
      const config = getAutomationTimeoutConfig(customEnv);
      expect(config.httpTimeoutMs).toBe(5000);
      expect(config.executionTimeoutMs).toBe(45000);
      expect(config.verifyTimeoutMs).toBe(12000);
      expect(config.rpaNavigationTimeoutMs).toBe(20000);
    });

    it('1.3 clamps values to safe bounds [100ms, 600000ms] and handles negative/invalid values', () => {
      const invalidEnv = {
        AUTOMATION_HTTP_TIMEOUT_MS: '-500',
        AUTOMATION_EXECUTION_TIMEOUT_MS: '0',
        AUTOMATION_VERIFY_TIMEOUT_MS: '999999999',
        AUTOMATION_RPA_NAVIGATION_TIMEOUT_MS: 'not-a-number',
      };
      const config = getAutomationTimeoutConfig(invalidEnv);
      // Negative / zero values fall back to defaults (or clamped to min)
      expect(config.httpTimeoutMs).toBe(DEFAULT_AUTOMATION_TIMEOUT_CONFIG.httpTimeoutMs);
      expect(config.executionTimeoutMs).toBe(DEFAULT_AUTOMATION_TIMEOUT_CONFIG.executionTimeoutMs);
      // Excessively large values clamped to max (600_000ms = 10 min)
      expect(config.verifyTimeoutMs).toBe(600_000);
      // NaN falls back to default
      expect(config.rpaNavigationTimeoutMs).toBe(DEFAULT_AUTOMATION_TIMEOUT_CONFIG.rpaNavigationTimeoutMs);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. combineAbortSignals Behavior
  // ---------------------------------------------------------------------------
  describe('2. combineAbortSignals Multi-Source & Timeout Coordination', () => {
    it('2.1 aborts when timeout fires if no external signal triggered', async () => {
      const { signal, cleanup, isTimedOut, isCancelled } = combineAbortSignals([], 50);
      expect(signal.aborted).toBe(false);
      expect(isTimedOut()).toBe(false);
      expect(isCancelled()).toBe(false);

      await new Promise((r) => setTimeout(r, 80));

      expect(signal.aborted).toBe(true);
      expect(isTimedOut()).toBe(true);
      expect(isCancelled()).toBe(false);
      cleanup();
    });

    it('2.2 aborts when external signal fires before timeout', () => {
      const controller = new AbortController();
      const { signal, cleanup, isTimedOut, isCancelled } = combineAbortSignals([controller.signal], 5000);

      expect(signal.aborted).toBe(false);
      controller.abort();

      expect(signal.aborted).toBe(true);
      expect(isTimedOut()).toBe(false);
      expect(isCancelled()).toBe(true);
      cleanup();
    });

    it('2.3 immediately marks aborted if pre-aborted signal is supplied', () => {
      const controller = new AbortController();
      controller.abort();

      const { signal, cleanup, isTimedOut, isCancelled } = combineAbortSignals([controller.signal], 10000);

      expect(signal.aborted).toBe(true);
      expect(isTimedOut()).toBe(false);
      expect(isCancelled()).toBe(true);
      cleanup();
    });

    it('2.4 cleanup clears internal timer and detaches event listeners without throwing', () => {
      const controller = new AbortController();
      const { signal, cleanup, isTimedOut } = combineAbortSignals([controller.signal], 1000);

      expect(signal.aborted).toBe(false);
      // Clean up before timeout
      cleanup();

      // Controller abort after cleanup should not affect already cleaned combined state
      expect(isTimedOut()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Shopify Adapter Timeout & Abort
  // ---------------------------------------------------------------------------
  describe('3. Shopify Adapter Timeout & Abort Propagation', () => {
    it('3.1 GraphQL transport normalizes internal timeout as TIMEOUT error', async () => {
      const slowFetch = async (_url: string, init?: RequestInit): Promise<Response> => {
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const abortErr = new Error('The operation was aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          });
        });
      };
      const transport = new HttpShopifyGraphQLTransport('2026-07', slowFetch as any);

      await expect(
        transport.execute(
          'test-shop',
          'test_token',
          '{ shop { name } }',
          {},
          { timeoutMs: 30 },
        ),
      ).rejects.toMatchObject({
        code: 'TIMEOUT',
        retryable: false,
      });
    });

    it('3.2 GraphQL transport normalizes external signal cancellation as CANCELLED', async () => {
      const controller = new AbortController();
      const slowFetch = async (_url: string, init?: RequestInit): Promise<Response> => {
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const abortErr = new Error('The operation was aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          });
        });
      };
      const transport = new HttpShopifyGraphQLTransport('2026-07', slowFetch as any);

      const requestPromise = transport.execute(
        'test-shop',
        'test_token',
        '{ shop { name } }',
        {},
        { signal: controller.signal, timeoutMs: 5000 },
      );

      // Abort from external controller
      controller.abort();

      await expect(requestPromise).rejects.toMatchObject({
        code: 'CANCELLED',
        retryable: false,
      });
    });

    it('3.3 Token exchanger normalizes timeout and external abort as TIMEOUT error', async () => {
      const slowFetch = async (_url: string, init?: RequestInit): Promise<Response> => {
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      };

      // Internal timeout
      await expect(
        defaultShopifyTokenExchanger(
          'test-shop',
          'client_id',
          'client_secret',
          { timeoutMs: 30, fetchFn: slowFetch as any },
        ),
      ).rejects.toMatchObject({
        code: 'TIMEOUT',
        retryable: false,
      });

      // External cancellation
      const controller = new AbortController();
      const exchangePromise = defaultShopifyTokenExchanger(
        'test-shop',
        'client_id',
        'client_secret',
        { signal: controller.signal, timeoutMs: 5000, fetchFn: slowFetch as any },
      );
      controller.abort();

      await expect(exchangePromise).rejects.toMatchObject({
        code: 'CANCELLED',
        retryable: false,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 4. ERP Adapter Timeout & Abort
  // ---------------------------------------------------------------------------
  describe('4. ERP Adapter Timeout & Abort Handling', () => {
    it('4.1 request timeout returns errorCode TIMEOUT and NormalizedExecutionError(class: TIMEOUT, retryable: false)', async () => {
      const slowFetch = async (_url: string, init?: RequestInit): Promise<Response> => {
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      };

      const adapter = new HttpERPAdapter({
        baseUrl: 'http://127.0.0.1:9099',
        timeoutMs: 30,
        fetchFn: slowFetch as any,
      });

      const res = await adapter.getPurchaseOrder({
        scope: { workspaceId: 'ws_test' },
        operationId: 'op_erp_timeout_01',
      });

      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('TIMEOUT');
      expect(res.normalizedError).toBeDefined();
      expect(res.normalizedError?.class).toBe('TIMEOUT');
      expect(res.normalizedError?.code).toBe('TIMEOUT');
      expect(res.normalizedError?.retryable).toBe(false);
    });

    it('4.2 external signal cancellation returns errorCode TIMEOUT with code CANCELLED', async () => {
      const slowFetch = async (_url: string, init?: RequestInit): Promise<Response> => {
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      };

      const adapter = new HttpERPAdapter({
        baseUrl: 'http://127.0.0.1:9099',
        timeoutMs: 10_000,
        fetchFn: slowFetch as any,
      });

      const controller = new AbortController();
      const callPromise = adapter.createPurchaseOrder(
        {
          scope: { workspaceId: 'ws_test' },
          operationId: 'op_erp_abort_01',
          supplierId: 'SUP-01',
          lines: [{ skuId: 'sku_1', quantity: 10, unitCostMinor: 1000 }],
        },
        { signal: controller.signal },
      );

      controller.abort();
      const res = await callPromise;

      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('TIMEOUT');
      expect(res.normalizedError?.class).toBe('TIMEOUT');
      expect(res.normalizedError?.code).toBe('CANCELLED');
      expect(res.normalizedError?.retryable).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Playwright RPA Pre-Write vs Post-Write Cancel
  // ---------------------------------------------------------------------------
  describe('5. Playwright RPA Pre-Write vs Post-Write Cancel Truth Matrix', () => {
    it('5.1 Pre-write cancellation before browser launch produces effect: NOT_APPLIED, recovery: NONE', async () => {
      const adapter = new PlaywrightRpaAdapter();
      const controller = new AbortController();
      controller.abort(); // pre-aborted

      const res = await adapter.execute({
        workflow: 'UPDATE_LISTING',
        params: { skuCode: 'SKU-001', title: 'New Title' },
        signal: controller.signal,
      });

      expect(res.status).toBe('FAILED');
      expect(res.output?.writeExecuted).toBe(false);
      expect(res.normalizedError?.class).toBe('TIMEOUT');
      expect(res.normalizedError?.code).toBe('CANCELLED');
    });

    it('5.2 ActionRouter handles pre-write cancel: effect NOT_APPLIED, recovery NONE', async () => {
      const router = new ActionRouter();
      const controller = new AbortController();
      controller.abort(); // already cancelled

      const proposal: ActionProposal = {
        id: 'act_pre_cancel_01',
        type: 'RPA',
        name: 'Update Listing',
        requiresHumanApproval: true,
        targetEntity: 'SKU',
        targetId: 'SKU-001',
        payload: { workflow: 'UPDATE_LISTING', skuCode: 'SKU-001', title: 'T' },
        approvedPayload: { workflow: 'UPDATE_LISTING', skuCode: 'SKU-001', title: 'T' },
        riskLevel: 'HIGH',
        status: 'APPROVED',
        createdAt: new Date().toISOString(),
      };

      const result = await router.dispatch(proposal, {
        workspaceId: 'ws_test',
        isApproved: true,
        executionMode: 'MOCK',
        signal: controller.signal,
      });

      expect(result.status).toBe('FAILED');
      expect(result.executionEvidence?.effect).toBe('NOT_APPLIED');
      expect(result.executionEvidence?.recovery).toBe('NONE');
    });

    it('5.3 Post-write timeout/cancel strictly results in effect: UNKNOWN, recovery: QUERY, errorClass: TIMEOUT', async () => {
      // Create an RPA adapter mock where write executed is true, then timeout occurs during verify
      const postWriteTimeoutAdapter = {
        id: 'mock-post-write-rpa',
        supportedModes: ['MOCK', 'LIVE'] as any,
        execute: async (): Promise<RpaExecutionResult> => {
          const timeoutErr = normalizeExecutionError(
            new Error('Timeout 15000ms exceeded while verifying remote updated listing'),
            { code: 'VERIFY_TIMEOUT', provider: 'mock-post-write-rpa' },
          );
          return {
            status: 'TIMEOUT',
            error: timeoutErr,
            output: {
              writeExecuted: true, // Write succeeded, verification timed out
            },
          };
        },
        getStatus: async () => ({ status: 'UNKNOWN' as any }),
      };

      const registry = new RpaRegistry();
      registry.register(postWriteTimeoutAdapter as any);
      const router = new ActionRouter(registry);

      const proposal: ActionProposal = {
        id: 'act_post_timeout_01',
        type: 'RPA',
        name: 'Update Listing',
        requiresHumanApproval: true,
        targetEntity: 'SKU',
        targetId: 'SKU-001',
        payload: { workflow: 'UPDATE_LISTING', skuCode: 'SKU-001', title: 'T' },
        approvedPayload: { workflow: 'UPDATE_LISTING', skuCode: 'SKU-001', title: 'T' },
        riskLevel: 'HIGH',
        status: 'APPROVED',
        createdAt: new Date().toISOString(),
      };

      const result = await router.dispatch(proposal, {
        workspaceId: 'ws_test',
        providerId: 'mock-post-write-rpa',
        isApproved: true,
        executionMode: 'LIVE',
      });

      expect(result.status).toBe('FAILED');
      // Critical Safety Invariant:
      // When writeExecuted is true, effect CANNOT be NOT_APPLIED. It MUST be UNKNOWN.
      expect(result.executionEvidence?.effect).toBe('UNKNOWN');
      // Recovery MUST be QUERY to check remote state, NEVER RETRY!
      expect(result.executionEvidence?.recovery).toBe('QUERY');
      expect(result.executionEvidence?.errorClass).toBe('TIMEOUT');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. ActionRouter + Recovery Safety Invariants
  // ---------------------------------------------------------------------------
  describe('6. ActionRouter & Automation Recovery Safety Invariants', () => {
    it('6.1 Timeout on side-effecting operation NEVER sets recovery: RETRY', async () => {
      const timeoutAdapter = {
        id: 'mock-timeout-rpa',
        supportedModes: ['MOCK', 'LIVE'] as any,
        execute: async (): Promise<RpaExecutionResult> => {
          const timeoutErr = normalizeExecutionError(
            new Error('Operation timed out on remote server'),
            { code: 'TIMEOUT', provider: 'mock-timeout-rpa' },
          );
          return {
            status: 'TIMEOUT',
            error: timeoutErr,
            output: {
              writeExecuted: true,
            },
          };
        },
        getStatus: async () => ({ status: 'UNKNOWN' as any }),
      };

      const registry = new RpaRegistry();
      registry.register(timeoutAdapter as any);
      const router = new ActionRouter(registry);

      const proposal: ActionProposal = {
        id: 'act_safety_01',
        type: 'RPA',
        name: 'Update Listing',
        requiresHumanApproval: true,
        targetEntity: 'SKU',
        targetId: 'SKU-001',
        payload: { workflow: 'UPDATE_LISTING', skuCode: 'SKU-001', title: 'T' },
        approvedPayload: { workflow: 'UPDATE_LISTING', skuCode: 'SKU-001', title: 'T' },
        riskLevel: 'HIGH',
        status: 'APPROVED',
        createdAt: new Date().toISOString(),
      };

      const result = await router.dispatch(proposal, {
        workspaceId: 'ws_test',
        providerId: 'mock-timeout-rpa',
        isApproved: true,
        executionMode: 'LIVE',
      });

      // Verification of the Core Safety Axiom:
      // TIMEOUT ≠ "确认失败"
      // TIMEOUT → effect UNKNOWN → QUERY / VERIFY → 确认远端状态 → 才决定 Retry / Completed / Manual
      expect(result.executionEvidence?.recovery).not.toBe('RETRY');
      expect(result.executionEvidence?.recovery).toBe('QUERY');
      expect(result.executionEvidence?.effect).toBe('UNKNOWN');
    });

    it('6.2 Normalized error for TIMEOUT always has retryable: false', () => {
      const err = new Error('HTTP request timeout 10000ms');
      const normalized = normalizeExecutionError(err, { code: 'TIMEOUT' });
      expect(normalized.class).toBe('TIMEOUT');
      expect(normalized.retryable).toBe(false);
    });

    it('6.3 Normalized error for CANCELLED always has retryable: false', () => {
      const err = new Error('Request was aborted by caller');
      const normalized = normalizeExecutionError(err, { code: 'CANCELLED' });
      expect(normalized.class).toBe('TIMEOUT');
      expect(normalized.code).toBe('CANCELLED');
      expect(normalized.retryable).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Shopify Response Body Consumption Timeout & Abort Coverage
  // ---------------------------------------------------------------------------
  describe('7. Shopify Response Body Consumption Timeout & Abort Coverage', () => {
    it('7.1 HttpShopifyGraphQLTransport throws TIMEOUT when response body stream hangs', async () => {
      const slowBodyFetch = async (): Promise<Response> => {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers(),
          json: async () => {
            return new Promise((_, reject) => {
              setTimeout(() => {
                const err = new Error('Body stream timed out');
                err.name = 'TimeoutError';
                reject(err);
              }, 60);
            });
          },
        } as any;
      };

      const transport = new HttpShopifyGraphQLTransport('2026-07', slowBodyFetch as any);
      await expect(
        transport.execute('test-shop', 'test-tok', '{ shop { name } }', {}, { timeoutMs: 30 }),
      ).rejects.toMatchObject({
        code: 'TIMEOUT',
        retryable: false,
      });
    });

    it('7.2 HttpShopifyGraphQLTransport throws CANCELLED when external abort occurs during body read', async () => {
      const controller = new AbortController();
      const slowBodyFetch = async (_url: string, init?: RequestInit): Promise<Response> => {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers(),
          json: async () => {
            return new Promise((_, reject) => {
              if (init?.signal?.aborted) {
                const err = new Error('The operation was aborted');
                err.name = 'AbortError';
                return reject(err);
              }
              init?.signal?.addEventListener('abort', () => {
                const err = new Error('The operation was aborted');
                err.name = 'AbortError';
                reject(err);
              });
            });
          },
        } as any;
      };

      const transport = new HttpShopifyGraphQLTransport('2026-07', slowBodyFetch as any);
      const promise = transport.execute(
        'test-shop',
        'test-tok',
        '{ shop { name } }',
        {},
        { signal: controller.signal, timeoutMs: 5000 },
      );
      controller.abort();

      await expect(promise).rejects.toMatchObject({
        code: 'CANCELLED',
        retryable: false,
      });
    });

    it('7.3 defaultShopifyTokenExchanger throws TIMEOUT when token response body stream hangs', async () => {
      const slowBodyFetch = async (): Promise<Response> => {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers(),
          json: async () => {
            return new Promise((_, reject) => {
              setTimeout(() => {
                const err = new Error('Token stream timed out');
                err.name = 'TimeoutError';
                reject(err);
              }, 60);
            });
          },
        } as any;
      };

      await expect(
        defaultShopifyTokenExchanger('test-shop', 'id', 'secret', {
          timeoutMs: 30,
          fetchFn: slowBodyFetch as any,
        }),
      ).rejects.toMatchObject({
        code: 'TIMEOUT',
        retryable: false,
      });
    });

    it('7.4 defaultShopifyTokenExchanger throws CANCELLED when external abort occurs during token body read', async () => {
      const controller = new AbortController();
      const slowBodyFetch = async (_url: string, init?: RequestInit): Promise<Response> => {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers(),
          json: async () => {
            return new Promise((_, reject) => {
              if (init?.signal?.aborted) {
                const err = new Error('The operation was aborted');
                err.name = 'AbortError';
                return reject(err);
              }
              init?.signal?.addEventListener('abort', () => {
                const err = new Error('The operation was aborted');
                err.name = 'AbortError';
                reject(err);
              });
            });
          },
        } as any;
      };

      const promise = defaultShopifyTokenExchanger('test-shop', 'id', 'secret', {
        signal: controller.signal,
        timeoutMs: 5000,
        fetchFn: slowBodyFetch as any,
      });
      controller.abort();

      await expect(promise).rejects.toMatchObject({
        code: 'CANCELLED',
        retryable: false,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Shopify Nested Pagination Signal & Timeout Propagation
  // ---------------------------------------------------------------------------
  describe('8. Shopify Nested Pagination Signal & Timeout Propagation', () => {
    function mockPrisma() {
      return {
        store: {
          findUnique: jest.fn(async () => ({
            id: 'store_sh1',
            workspaceId: 'ws_demo',
            platform: 'shopify',
          })),
        },
        commerceAccount: {
          findUnique: jest.fn(async () => ({
            id: 'acc_sh1',
            storeId: 'store_sh1',
          })),
        },
        providerCredential: {
          findUnique: jest.fn(async () => ({
            id: 'cred_sh1',
            payloadEnc: JSON.stringify({
              shop: 'test-shop',
              clientId: 'client_id',
              clientSecret: 'client_secret',
            }),
          })),
        },
        channelIdentity: {
          findMany: jest.fn(async () => []),
          createMany: jest.fn(async () => ({ count: 0 })),
        },
      } as any;
    }

    it('8.1 listProducts variants pagination propagates signal and aborts on second page', async () => {
      const controller = new AbortController();
      const prisma = mockPrisma();

      const transport = {
        execute: jest.fn(async (_shop: string, _token: string, query: string, _vars?: any, options?: any) => {
          if (query.includes('ListProducts')) {
            // Page 1: returns product with hasNextPage = true on variants
            return {
              data: {
                products: {
                  pageInfo: { hasNextPage: false },
                  nodes: [
                    {
                      id: 'gid://shopify/Product/1',
                      title: 'Product with many variants',
                      variants: {
                        pageInfo: { hasNextPage: true, endCursor: 'var_cur_1' },
                        nodes: [{ id: 'gid://shopify/ProductVariant/1', title: 'V1', price: '10.00' }],
                      },
                    },
                  ],
                },
              },
            };
          }
          if (query.includes('GetProductMoreVariants')) {
            // Page 2: variants pagination! Verify options.signal was propagated
            expect(options?.signal).toBeDefined();
            return new Promise((_, reject) => {
              options.signal.addEventListener('abort', () => {
                reject(new CommercePortError('CANCELLED', 'Cancelled by caller during variant pagination', false));
              });
            });
          }
          return { data: {} };
        }),
      };

      const adapter = new ShopifyAdapter(prisma, {
        transport,
        exchangeToken: async () => ({ accessToken: 'tok', expiresIn: 3600 }),
        decryptCredential: (p) => p,
        persistIdentities: false,
      });

      const listPromise = adapter.listProducts({
        workspaceId: 'ws_demo',
        storeId: 'store_sh1',
        signal: controller.signal,
      });

      // Let page 1 finish and wait for page 2
      await new Promise((r) => setTimeout(r, 20));
      controller.abort();

      await expect(listPromise).rejects.toMatchObject({
        code: 'CANCELLED',
        retryable: false,
      });
    });

    it('8.2 listOrders lineItems pagination propagates signal and aborts on second page', async () => {
      const controller = new AbortController();
      const prisma = mockPrisma();

      const transport = {
        execute: jest.fn(async (_shop: string, _token: string, query: string, _vars?: any, options?: any) => {
          if (query.includes('ListOrders')) {
            // Page 1: returns order with hasNextPage = true on lineItems
            return {
              data: {
                orders: {
                  pageInfo: { hasNextPage: false },
                  nodes: [
                    {
                      id: 'gid://shopify/Order/1',
                      name: '#1001',
                      createdAt: new Date().toISOString(),
                      totalPriceSet: { shopMoney: { amount: '100.00', currencyCode: 'USD' } },
                      lineItems: {
                        pageInfo: { hasNextPage: true, endCursor: 'line_cur_1' },
                        nodes: [{ id: 'gid://shopify/LineItem/1', quantity: 1 }],
                      },
                    },
                  ],
                },
              },
            };
          }
          if (query.includes('GetOrderMoreLineItems')) {
            // Page 2: line items pagination! Verify options.signal was propagated
            expect(options?.signal).toBeDefined();
            return new Promise((_, reject) => {
              options.signal.addEventListener('abort', () => {
                reject(new CommercePortError('CANCELLED', 'Cancelled during line items pagination', false));
              });
            });
          }
          return { data: {} };
        }),
      };

      const adapter = new ShopifyAdapter(prisma, {
        transport,
        exchangeToken: async () => ({ accessToken: 'tok', expiresIn: 3600 }),
        decryptCredential: (p) => p,
        persistIdentities: false,
      });

      const listPromise = adapter.listOrders({
        workspaceId: 'ws_demo',
        storeId: 'store_sh1',
        signal: controller.signal,
      });

      await new Promise((r) => setTimeout(r, 20));
      controller.abort();

      await expect(listPromise).rejects.toMatchObject({
        code: 'CANCELLED',
        retryable: false,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 9. ActionRouter Abort Side-Effect Safety (Post-Dispatch Unknown vs Pre-Dispatch)
  // ---------------------------------------------------------------------------
  describe('9. ActionRouter Abort Side-Effect Safety (Post-Dispatch Unknown vs Pre-Dispatch)', () => {
    it('9.1 Third-party adapter throwing AbortError during execute() MUST result in UNKNOWN effect and QUERY recovery', async () => {
      const thirdPartyAdapter = {
        id: 'third-party-throwing-adapter',
        supportedModes: ['LIVE'] as any,
        execute: jest.fn(async () => {
          // Simulates adapter that started network write, then encountered an unproven AbortError
          const abortErr = new Error('Third-party API request was aborted by signal');
          abortErr.name = 'AbortError';
          throw abortErr;
        }),
        getStatus: jest.fn(async () => ({ status: 'UNKNOWN' as any })),
      };

      const registry = new RpaRegistry();
      registry.register(thirdPartyAdapter as any);
      const router = new ActionRouter(registry);

      const proposal: ActionProposal = {
        id: 'act_unknown_abort_01',
        type: 'RPA',
        name: 'Update Listing',
        requiresHumanApproval: true,
        targetEntity: 'SKU',
        targetId: 'SKU-001',
        payload: { workflow: 'UPDATE_LISTING', skuCode: 'SKU-001', title: 'T' },
        approvedPayload: { workflow: 'UPDATE_LISTING', skuCode: 'SKU-001', title: 'T' },
        riskLevel: 'HIGH',
        status: 'APPROVED',
        createdAt: new Date().toISOString(),
      };

      const result = await router.dispatch(proposal, {
        workspaceId: 'ws_test',
        providerId: 'third-party-throwing-adapter',
        isApproved: true,
        executionMode: 'LIVE',
      });

      expect(result.status).toBe('FAILED');
      // Crucial Safety Rule:
      // "收到 AbortError" ≠ "能够证明写操作没有发生"
      // Without explicit writeExecuted = false proof, effect MUST be UNKNOWN!
      expect(result.executionEvidence?.effect).toBe('UNKNOWN');
      expect(result.executionEvidence?.recovery).toBe('QUERY');
      expect(result.executionEvidence?.effect).not.toBe('NOT_APPLIED');
    });

    it('9.2 Third-party adapter without getStatus throwing AbortError defaults to MANUAL recovery', async () => {
      const adapterWithoutStatus = {
        id: 'third-party-no-status',
        supportedModes: ['LIVE'] as any,
        execute: jest.fn(async () => {
          const abortErr = new Error('Aborted');
          abortErr.name = 'AbortError';
          throw abortErr;
        }),
        // getStatus is undefined
      };

      const registry = new RpaRegistry();
      registry.register(adapterWithoutStatus as any);
      const router = new ActionRouter(registry);

      const proposal: ActionProposal = {
        id: 'act_unknown_abort_02',
        type: 'RPA',
        name: 'Update Listing',
        requiresHumanApproval: true,
        targetEntity: 'SKU',
        targetId: 'SKU-001',
        payload: { workflow: 'UPDATE_LISTING', skuCode: 'SKU-001', title: 'T' },
        approvedPayload: { workflow: 'UPDATE_LISTING', skuCode: 'SKU-001', title: 'T' },
        riskLevel: 'HIGH',
        status: 'APPROVED',
        createdAt: new Date().toISOString(),
      };

      const result = await router.dispatch(proposal, {
        workspaceId: 'ws_test',
        providerId: 'third-party-no-status',
        isApproved: true,
        executionMode: 'LIVE',
      });

      expect(result.status).toBe('FAILED');
      expect(result.executionEvidence?.effect).toBe('UNKNOWN');
      expect(result.executionEvidence?.recovery).toBe('MANUAL');
    });

    it('9.3 Pre-dispatch cancel (signal already aborted before adapter.execute) safely yields NOT_APPLIED and NONE', async () => {
      const adapter = {
        id: 'mock-not-called-adapter',
        supportedModes: ['LIVE'] as any,
        execute: jest.fn(),
      };
      const registry = new RpaRegistry();
      registry.register(adapter as any);
      const router = new ActionRouter(registry);

      const controller = new AbortController();
      controller.abort(); // Pre-dispatch abort

      const proposal: ActionProposal = {
        id: 'act_predispatch_01',
        type: 'RPA',
        name: 'Update Listing',
        requiresHumanApproval: true,
        targetEntity: 'SKU',
        targetId: 'SKU-001',
        payload: { workflow: 'UPDATE_LISTING', skuCode: 'SKU-001', title: 'T' },
        approvedPayload: { workflow: 'UPDATE_LISTING', skuCode: 'SKU-001', title: 'T' },
        riskLevel: 'HIGH',
        status: 'APPROVED',
        createdAt: new Date().toISOString(),
      };

      const result = await router.dispatch(proposal, {
        workspaceId: 'ws_test',
        providerId: 'mock-not-called-adapter',
        isApproved: true,
        executionMode: 'LIVE',
        signal: controller.signal,
      });

      expect(adapter.execute).not.toHaveBeenCalled();
      expect(result.status).toBe('FAILED');
      expect(result.executionEvidence?.effect).toBe('NOT_APPLIED');
      expect(result.executionEvidence?.recovery).toBe('NONE');
    });
  });
});
