import { AutomationMode, ExecutionEvidenceArtifact, NormalizedExecutionError } from '@crosspilot/shared';

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
  signal?: AbortSignal;
  traceId?: string;
  operationId?: string;
  workspaceId?: string;
  actionId?: string;
  executionMode?: string;
}

export interface RpaExecutionResult {
  jobId: string;
  status: RpaStatus;
  output?: Record<string, unknown>;
  screenshotUrls?: string[];
  logs?: RpaExecutionLog[];
  error?: string;
  durationMs: number;
  normalizedError?: NormalizedExecutionError;
  evidenceArtifacts?: ExecutionEvidenceArtifact[];
}

export interface RpaAdapter {
  readonly id: string;
  readonly name: string;
  readonly supportedModes?: AutomationMode[];
  execute(input: RpaExecutionInput): Promise<RpaExecutionResult>;
  cancel?(jobId: string): Promise<boolean>;
  getStatus?(jobId: string): Promise<RpaExecutionResult>;
}
