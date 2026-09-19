export interface RuntimeLogContext {
  service?: string;
  traceId?: string;
  workspaceId?: string;
  workflowId?: string;
  actionId?: string;
  operationId?: string;
  attempt?: number;
  provider?: string;
  adapter?: string;
  executionMode?: string;
  workerId?: string;
  jobId?: string;
  [key: string]: unknown;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
