export type RpaStatus = 'SUCCESS' | 'FAILED' | 'RUNNING' | 'TIMEOUT';

export interface RpaExecutionLog {
  timestamp: string;
  step: string;
  message: string;
}

export interface RpaExecutionInput {
  workflow: string;
  params: Record<string, unknown>;
  timeoutMs?: number;
}

export interface RpaExecutionResult {
  jobId: string;
  status: RpaStatus;
  output?: Record<string, unknown>;
  screenshotUrls?: string[];
  logs?: RpaExecutionLog[];
  error?: string;
  durationMs: number;
}

export interface RpaAdapter {
  readonly id: string;
  readonly name: string;
  execute(input: RpaExecutionInput): Promise<RpaExecutionResult>;
  cancel?(jobId: string): Promise<boolean>;
  getStatus?(jobId: string): Promise<RpaExecutionResult>;
}
