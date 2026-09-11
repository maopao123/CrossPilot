export interface McpToolSchema {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, any>;
    required?: string[];
  };
}

export interface McpConnectionConfig {
  endpoint: string;
  token?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export interface McpJsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, any>;
}

export interface McpJsonRpcResponse<T = any> {
  jsonrpc: '2.0';
  id: string | number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface McpToolCallResult {
  content?: Array<{
    type: string;
    text?: string;
    data?: any;
  }>;
  isError?: boolean;
  raw?: any;
}
