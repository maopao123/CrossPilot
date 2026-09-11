export type ToolCategory =
  | 'CREATIVE'
  | 'PRODUCT_RESEARCH'
  | 'OPERATION'
  | 'DATA'
  | 'UTILITY';

export type ToolFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'select'
  | 'textarea';

export interface ToolFieldSchema {
  name: string;
  label: string;
  type: ToolFieldType;
  description?: string;
  required?: boolean;
  defaultValue?: any;
  options?: { label: string; value: any }[];
  placeholder?: string;
}

export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, ToolFieldSchema>;
  required?: string[];
}

export interface ToolExecutionContext {
  workspaceId: string;
  userId?: string;
  traceId: string;
  source: 'AGENT' | 'TOOL_CENTER' | 'WORKFLOW';
  taskId?: string;
  stepNumber?: number;
  metadata?: Record<string, any>;
}

export interface ToolError {
  code: string;
  message: string;
  retryable?: boolean;
  details?: any;
}

export interface ToolExecutionResult<T = any> {
  success: boolean;
  data?: T;
  error?: ToolError;
  traceId: string;
  durationMs: number;
  cost?: {
    amount: number;
    unit: string;
  };
}

export interface ToolDefinition<TInput = any, TOutput = any> {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  version: string;
  tags?: string[];
  inputSchema: ToolInputSchema;
  outputSchema?: Record<string, any>;
  permissions?: string[];
  timeoutMs?: number;
  costEstimate?: {
    amount: number;
    unit: string;
  };
  execute: (input: TInput, ctx: ToolExecutionContext) => Promise<TOutput> | TOutput;
}
