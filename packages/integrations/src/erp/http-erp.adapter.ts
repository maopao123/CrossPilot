import {
  type ErpCreateCommand,
  type ErpInventoryItem,
  type ErpLookup,
  type ErpPurchaseOrder,
  type ErpReceiptCommand,
  type ErpReceiptRecord,
  type ErpResult,
  normalizeExecutionError,
  combineAbortSignals,
  getAutomationTimeoutConfig,
  runtimeLogger,
  RuntimeEvents,
  runtimeMetrics,
} from '@crosspilot/shared';

export interface HttpErpAdapterOptions {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchFn?: typeof fetch;
}

export interface ErpRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  traceId?: string;
  operationId?: string;
  workspaceId?: string;
}

export class HttpERPAdapter {
  protected readonly baseUrl: string;
  protected readonly apiKey?: string;
  protected readonly timeoutMs: number;
  protected readonly maxRetries: number;
  protected readonly fetchFn: typeof fetch;

  constructor(options: HttpErpAdapterOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? getAutomationTimeoutConfig().httpTimeoutMs;
    this.maxRetries = options.maxRetries ?? 0;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  protected async request<T>(
    endpoint: string,
    options: {
      method: string;
      body?: unknown;
      headers?: Record<string, string>;
      timeoutMs?: number;
      signal?: AbortSignal;
      traceId?: string;
      operationId?: string;
      workspaceId?: string;
    },
  ): Promise<ErpResult<T>> {
    const startTime = Date.now();
    const result = await this.doRequest<T>(endpoint, options, startTime);
    const durationSeconds = (Date.now() - startTime) / 1000;

    let status: 'success' | 'failed' | 'timeout' | 'cancelled';
    let errorClass: string = 'none';

    if (result.success) {
      status = 'success';
      errorClass = 'none';
    } else if (result.normalizedError?.code === 'CANCELLED' || options.signal?.aborted) {
      status = 'cancelled';
      errorClass = 'TIMEOUT';
    } else if (result.errorCode === 'TIMEOUT' || result.normalizedError?.class === 'TIMEOUT') {
      status = 'timeout';
      errorClass = 'TIMEOUT';
      runtimeMetrics.recordTimeout({ provider: 'erp' });
    } else {
      status = 'failed';
      errorClass = result.normalizedError?.class ?? 'PROVIDER_ERROR';
    }

    runtimeMetrics.recordAdapterRequest({
      provider: 'erp',
      status,
      errorClass,
      durationSeconds,
    });

    return result;
  }

  private async doRequest<T>(
    endpoint: string,
    options: {
      method: string;
      body?: unknown;
      headers?: Record<string, string>;
      timeoutMs?: number;
      signal?: AbortSignal;
      traceId?: string;
      operationId?: string;
      workspaceId?: string;
    },
    startTime: number,
  ): Promise<ErpResult<T>> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const timeout = options.timeoutMs ?? this.timeoutMs;
    const combined = combineAbortSignals([options.signal], timeout);

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      ...options.headers,
    };

    const erpLogger = runtimeLogger.child({
      service: 'http-erp-adapter',
      provider: 'erp',
      traceId: options.traceId,
      operationId: options.operationId,
      workspaceId: options.workspaceId,
    });

    erpLogger.debug({
      event: RuntimeEvents.ADAPTER_REQUEST_STARTED,
      method: options.method,
      endpoint,
    });

    try {
      const response = await this.fetchFn(url, {
        method: options.method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: combined.signal,
      });

      const status = response.status;
      let text = '';
      try {
        text = await response.text();
      } catch {
        // ignore read error
      }

      let parsedJson: any = null;
      if (text) {
        try {
          parsedJson = JSON.parse(text);
        } catch {
          parsedJson = null;
        }
      }

      if (status === 401 || status === 403) {
        const errorCode = status === 401 ? 'AUTH_FAILED' : 'VALIDATION_ERROR';
        const errorMessage = parsedJson?.message || parsedJson?.error || `Authentication failed with HTTP ${status}`;
        erpLogger.warn({
          event: RuntimeEvents.ADAPTER_REQUEST_FAILED,
          method: options.method,
          endpoint,
          statusCode: status,
          durationMs: Date.now() - startTime,
        });
        return {
          success: false,
          errorCode: status === 401 ? 'AUTH_FAILED' : 'VALIDATION_ERROR',
          errorMessage,
          statusCode: status,
          rawResponse: parsedJson || text,
          normalizedError: normalizeExecutionError(
            { errorCode, errorMessage, statusCode: status, rawResponse: parsedJson || text },
            { provider: 'erp', originalStatus: status, code: status === 401 ? 'AUTH_FAILED' : 'PERMISSION_DENIED' },
          ),
        };
      }

      if (status === 429) {
        const errorMessage = parsedJson?.message || parsedJson?.error || 'Rate limit exceeded';
        erpLogger.warn({
          event: RuntimeEvents.ADAPTER_REQUEST_FAILED,
          method: options.method,
          endpoint,
          statusCode: status,
          durationMs: Date.now() - startTime,
          errorClass: 'RATE_LIMIT',
          errorCode: 'RATE_LIMITED',
        });
        return {
          success: false,
          errorCode: 'RATE_LIMITED',
          errorMessage,
          statusCode: status,
          rawResponse: parsedJson || text,
          normalizedError: normalizeExecutionError(
            { errorCode: 'RATE_LIMITED', errorMessage, statusCode: status, rawResponse: parsedJson || text },
            { provider: 'erp', originalStatus: status, code: 'RATE_LIMITED' },
          ),
        };
      }

      if (status === 404) {
        const errorMessage = parsedJson?.message || parsedJson?.error || 'Resource not found';
        erpLogger.warn({
          event: RuntimeEvents.ADAPTER_REQUEST_FAILED,
          method: options.method,
          endpoint,
          statusCode: status,
          durationMs: Date.now() - startTime,
        });
        return {
          success: false,
          errorCode: 'NOT_FOUND',
          errorMessage,
          statusCode: status,
          rawResponse: parsedJson || text,
          normalizedError: normalizeExecutionError(
            { errorCode: 'NOT_FOUND', errorMessage, statusCode: status },
            { provider: 'erp', originalStatus: status, code: 'NOT_FOUND' },
          ),
        };
      }

      if (status === 400 || status === 422) {
        const errorMessage = parsedJson?.message || parsedJson?.error || 'Validation error';
        erpLogger.warn({
          event: RuntimeEvents.ADAPTER_REQUEST_FAILED,
          method: options.method,
          endpoint,
          statusCode: status,
          durationMs: Date.now() - startTime,
        });
        return {
          success: false,
          errorCode: 'VALIDATION_ERROR',
          errorMessage,
          statusCode: status,
          rawResponse: parsedJson || text,
          normalizedError: normalizeExecutionError(
            { errorCode: 'VALIDATION_ERROR', errorMessage, statusCode: status, rawResponse: parsedJson || text },
            { provider: 'erp', originalStatus: status, code: 'VALIDATION_ERROR' },
          ),
        };
      }

      if (status === 409) {
        const errorMessage = parsedJson?.message || parsedJson?.error || 'Conflict detected';
        erpLogger.warn({
          event: RuntimeEvents.ADAPTER_REQUEST_FAILED,
          method: options.method,
          endpoint,
          statusCode: status,
          durationMs: Date.now() - startTime,
        });
        return {
          success: false,
          errorCode: 'UNKNOWN_ERROR',
          errorMessage,
          statusCode: status,
          rawResponse: parsedJson || text,
          normalizedError: normalizeExecutionError(
            { errorCode: 'CONFLICT', errorMessage, statusCode: status, rawResponse: parsedJson || text },
            { provider: 'erp', originalStatus: status, code: 'CONFLICT' },
          ),
        };
      }

      if (status >= 500) {
        const errorMessage = parsedJson?.message || parsedJson?.error || `ERP server error HTTP ${status}`;
        erpLogger.warn({
          event: RuntimeEvents.ADAPTER_REQUEST_FAILED,
          method: options.method,
          endpoint,
          statusCode: status,
          durationMs: Date.now() - startTime,
        });
        return {
          success: false,
          errorCode: 'UNKNOWN_ERROR',
          errorMessage,
          statusCode: status,
          rawResponse: parsedJson || text,
          normalizedError: normalizeExecutionError(
            { errorCode: 'SERVER_ERROR', errorMessage, statusCode: status, rawResponse: parsedJson || text },
            { provider: 'erp', originalStatus: status, code: `HTTP_${status}` },
          ),
        };
      }

      if (status < 200 || status >= 300) {
        const errorMessage = parsedJson?.message || parsedJson?.error || `ERP server error HTTP ${status}`;
        erpLogger.warn({
          event: RuntimeEvents.ADAPTER_REQUEST_FAILED,
          method: options.method,
          endpoint,
          statusCode: status,
          durationMs: Date.now() - startTime,
        });
        return {
          success: false,
          errorCode: 'UNKNOWN_ERROR',
          errorMessage,
          statusCode: status,
          rawResponse: parsedJson || text,
          normalizedError: normalizeExecutionError(
            { errorCode: 'UNKNOWN_ERROR', errorMessage, statusCode: status },
            { provider: 'erp', originalStatus: status, code: `HTTP_${status}` },
          ),
        };
      }

      if (!parsedJson || typeof parsedJson !== 'object') {
        const errorMessage = 'Malformed 200 response: expected JSON object';
        erpLogger.warn({
          event: RuntimeEvents.ADAPTER_REQUEST_FAILED,
          method: options.method,
          endpoint,
          statusCode: status,
          durationMs: Date.now() - startTime,
          errorMessage,
        });
        return {
          success: false,
          errorCode: 'UNKNOWN_ERROR',
          errorMessage,
          statusCode: status,
          rawResponse: text,
          normalizedError: normalizeExecutionError(
            { code: 'VALIDATION_ERROR', message: errorMessage },
            { provider: 'erp', originalStatus: status, code: 'VALIDATION_ERROR' },
          ),
        };
      }

      erpLogger.debug({
        event: RuntimeEvents.ADAPTER_REQUEST_COMPLETED,
        method: options.method,
        endpoint,
        statusCode: status,
        durationMs: Date.now() - startTime,
      });

      return {
        success: true,
        data: (parsedJson.data ?? parsedJson) as T,
        statusCode: status,
        rawResponse: parsedJson,
      };
    } catch (err: any) {
      if (combined.isTimedOut() || err.name === 'TimeoutError' || err.code === 'UND_ERR_CONNECT_TIMEOUT') {
        const errorMessage = `Request timed out after ${timeout}ms`;
        erpLogger.warn({
          event: RuntimeEvents.ADAPTER_REQUEST_TIMEOUT,
          method: options.method,
          endpoint,
          timeoutMs: timeout,
          durationMs: Date.now() - startTime,
          errorClass: 'TIMEOUT',
          errorCode: 'TIMEOUT',
          retryable: false,
          effect: 'UNKNOWN',
          recovery: 'QUERY',
        });
        return {
          success: false,
          errorCode: 'TIMEOUT',
          errorMessage,
          normalizedError: normalizeExecutionError(err, { provider: 'erp', code: 'TIMEOUT' }),
        };
      }
      if (combined.isCancelled() || err.name === 'AbortError') {
        const errorMessage = 'Request was cancelled by caller';
        erpLogger.warn({
          event: RuntimeEvents.ADAPTER_REQUEST_CANCELLED,
          method: options.method,
          endpoint,
          durationMs: Date.now() - startTime,
          errorClass: 'TIMEOUT',
          errorCode: 'CANCELLED',
          retryable: false,
        });
        return {
          success: false,
          errorCode: 'TIMEOUT',
          errorMessage,
          normalizedError: normalizeExecutionError(err, { provider: 'erp', code: 'CANCELLED' }),
        };
      }
      erpLogger.error({
        event: RuntimeEvents.ADAPTER_REQUEST_FAILED,
        method: options.method,
        endpoint,
        durationMs: Date.now() - startTime,
        error: err,
      });
      return {
        success: false,
        errorCode: 'UNKNOWN_ERROR',
        errorMessage: err.message || 'Network error',
        normalizedError: normalizeExecutionError(err, { provider: 'erp', code: err?.code || 'NETWORK_ERROR' }),
      };
    } finally {
      combined.cleanup();
    }
  }

  async createPurchaseOrder(
    cmd: ErpCreateCommand,
    options?: ErpRequestOptions,
  ): Promise<ErpResult<ErpPurchaseOrder>> {
    const headers: Record<string, string> = {
      'x-workspace-id': cmd.scope.workspaceId,
      'x-idempotency-key': cmd.idempotencyKey,
      'x-operation-id': cmd.operationId,
    };
    if (cmd.scope.connectionId) {
      headers['x-connection-id'] = cmd.scope.connectionId;
    }

    const res = await this.request<ErpPurchaseOrder>('/erp/purchase-orders', {
      method: 'POST',
      body: cmd,
      headers,
      signal: options?.signal,
      timeoutMs: options?.timeoutMs,
      traceId: options?.traceId,
      operationId: options?.operationId ?? cmd.operationId,
      workspaceId: options?.workspaceId ?? cmd.scope.workspaceId,
    });

    if (!res.success) {
      return res;
    }

    const po = res.data;
    if (!po || typeof po !== 'object' || !po.externalId) {
      const errorMessage = 'ERP returned 200 but missing externalId or malformed payload';
      return {
        success: false,
        errorCode: 'UNKNOWN_ERROR',
        errorMessage,
        statusCode: res.statusCode,
        rawResponse: res.rawResponse,
        normalizedError: normalizeExecutionError(
          { code: 'VALIDATION_ERROR', message: errorMessage },
          { provider: 'erp', code: 'VALIDATION_ERROR', originalStatus: res.statusCode },
        ),
      };
    }

    return res;
  }

  async getPurchaseOrder(
    lookup: ErpLookup,
    options?: ErpRequestOptions,
  ): Promise<ErpResult<ErpPurchaseOrder>> {
    let endpoint = '';
    if (lookup.externalId) {
      endpoint = `/erp/purchase-orders/${encodeURIComponent(lookup.externalId)}`;
    } else if (lookup.operationId) {
      endpoint = `/erp/purchase-orders/by-operation/${encodeURIComponent(lookup.operationId)}`;
    } else if (lookup.idempotencyKey) {
      endpoint = `/erp/purchase-orders/by-idempotency/${encodeURIComponent(lookup.idempotencyKey)}`;
    } else {
      const errorMessage = 'Lookup requires externalId, operationId, or idempotencyKey';
      return {
        success: false,
        errorCode: 'VALIDATION_ERROR',
        errorMessage,
        normalizedError: normalizeExecutionError(
          { code: 'VALIDATION_ERROR', message: errorMessage },
          { provider: 'erp', code: 'VALIDATION_ERROR' },
        ),
      };
    }

    const headers: Record<string, string> = {
      'x-workspace-id': lookup.scope.workspaceId,
    };
    if (lookup.scope.connectionId) {
      headers['x-connection-id'] = lookup.scope.connectionId;
    }

    return this.request<ErpPurchaseOrder>(endpoint, {
      method: 'GET',
      headers,
      signal: options?.signal,
      timeoutMs: options?.timeoutMs,
      traceId: options?.traceId,
      operationId: options?.operationId ?? lookup.operationId,
      workspaceId: options?.workspaceId ?? lookup.scope.workspaceId,
    });
  }

  async getInventory(
    skuId: string,
    scope?: Record<string, unknown>,
    options?: ErpRequestOptions,
  ): Promise<ErpResult<ErpInventoryItem>> {
    const headers: Record<string, string> = {};
    if (scope?.workspaceId) {
      headers['x-workspace-id'] = String(scope.workspaceId);
    }
    return this.request<ErpInventoryItem>(`/erp/inventory/${encodeURIComponent(skuId)}`, {
      method: 'GET',
      headers,
      signal: options?.signal,
      timeoutMs: options?.timeoutMs,
      traceId: options?.traceId,
      operationId: options?.operationId,
      workspaceId: options?.workspaceId ?? (scope?.workspaceId ? String(scope.workspaceId) : undefined),
    });
  }

  async receivePurchaseOrder(
    cmd: ErpReceiptCommand,
    options?: ErpRequestOptions,
  ): Promise<ErpResult<ErpReceiptRecord>> {
    const headers: Record<string, string> = {
      'x-workspace-id': cmd.scope.workspaceId,
      'x-receipt-id': cmd.externalReceiptId,
    };
    const res = await this.request<ErpReceiptRecord>(
      `/erp/purchase-orders/${encodeURIComponent(cmd.purchaseOrderId)}/receipts`,
      {
        method: 'POST',
        body: cmd,
        headers,
        signal: options?.signal,
        timeoutMs: options?.timeoutMs,
        traceId: options?.traceId,
        operationId: options?.operationId,
        workspaceId: options?.workspaceId ?? cmd.scope?.workspaceId,
      },
    );

    if (!res.success) {
      return res;
    }

    const receipt = res.data;
    if (!receipt || typeof receipt !== 'object' || !receipt.externalReceiptId) {
      const errorMessage = 'ERP returned 200 for receipt but missing externalReceiptId';
      return {
        success: false,
        errorCode: 'UNKNOWN_ERROR',
        errorMessage,
        statusCode: res.statusCode,
        rawResponse: res.rawResponse,
        normalizedError: normalizeExecutionError(
          { code: 'VALIDATION_ERROR', message: errorMessage },
          { provider: 'erp', code: 'VALIDATION_ERROR', originalStatus: res.statusCode },
        ),
      };
    }

    return res;
  }
}
