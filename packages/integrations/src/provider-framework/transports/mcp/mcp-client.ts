import {
  McpConnectionConfig,
  McpJsonRpcRequest,
  McpJsonRpcResponse,
  McpToolCallResult,
  McpToolSchema,
} from './mcp.types.js';
import { ProviderError, ProviderErrorCode } from '../../core/provider.types.js';
import { SecretProvider } from '../../secrets/secret-provider.js';

export class McpClient {
  constructor(private readonly config: McpConnectionConfig) {}

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...this.config.headers,
    };
    if (this.config.token) {
      headers['Authorization'] = `Bearer ${this.config.token}`;
    }
    return headers;
  }

  async sendRpc<T = any>(method: string, params?: Record<string, any>): Promise<T> {
    const timeoutMs = this.config.timeoutMs || 10000;
    const reqId = `mcp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const payload: McpJsonRpcRequest = {
      jsonrpc: '2.0',
      id: reqId,
      method,
      params: params || {},
    };

    let controller: AbortController | null = new AbortController();
    const timeoutTimer = setTimeout(() => {
      controller?.abort();
    }, timeoutMs);

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutTimer);
      controller = null;

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        let errCode: ProviderErrorCode = 'PROVIDER_UNAVAILABLE';
        let retryable = true;

        if (response.status === 401 || response.status === 403) {
          errCode = 'PROVIDER_AUTH_ERROR';
          retryable = false;
        } else if (response.status === 429) {
          errCode = 'PROVIDER_RATE_LIMIT';
          retryable = true;
        } else if (response.status === 404) {
          errCode = 'PROVIDER_TOOL_NOT_FOUND';
          retryable = false;
        }

        const error: ProviderError = {
          code: errCode,
          message: SecretProvider.redact(
            `MCP Endpoint returned HTTP ${response.status}: ${errorText.substring(0, 200)}`,
          ),
          retryable,
        };
        throw error;
      }

      const rpcRes = (await response.json()) as unknown as McpJsonRpcResponse<T>;
      if (rpcRes.error) {
        const error: ProviderError = {
          code: 'PROVIDER_INVALID_RESPONSE',
          message: SecretProvider.redact(rpcRes.error.message || 'MCP RPC Error'),
          details: rpcRes.error,
          retryable: false,
        };
        throw error;
      }

      return rpcRes.result as T;
    } catch (err: any) {
      if (controller) clearTimeout(timeoutTimer);

      if (err.code && Object.values([
        'PROVIDER_AUTH_ERROR',
        'PROVIDER_TIMEOUT',
        'PROVIDER_RATE_LIMIT',
        'PROVIDER_UNAVAILABLE',
        'PROVIDER_TOOL_NOT_FOUND',
        'PROVIDER_INVALID_RESPONSE',
      ]).includes(err.code)) {
        throw err;
      }

      const isAbort = err.name === 'AbortError' || err.message?.includes('aborted');
      const normalizedError: ProviderError = {
        code: isAbort ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE',
        message: SecretProvider.redact(
          isAbort ? `MCP request timed out after ${timeoutMs}ms` : err.message || 'Network error connecting to MCP Endpoint',
        ),
        retryable: isAbort || true,
      };
      throw normalizedError;
    }
  }

  async listTools(): Promise<McpToolSchema[]> {
    const res = await this.sendRpc<{ tools: McpToolSchema[] }>('tools/list', {});
    return res?.tools || [];
  }

  async callTool(name: string, args: Record<string, any> = {}): Promise<McpToolCallResult> {
    const res = await this.sendRpc<any>('tools/call', {
      name,
      arguments: args,
    });
    return res as McpToolCallResult;
  }
}
