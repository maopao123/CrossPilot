import { AutomationMode, ExecutionEvidence, NormalizedExecutionError } from '@crosspilot/shared';

export type ActionType =
  | 'AI'
  | 'API'
  | 'PYTHON'
  | 'BROWSER'
  | 'RPA'
  | 'COMPUTER_USE'
  | 'HUMAN';

export type ActionStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'WAITING_APPROVAL'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED';

export interface ActionProposal<T = any> {
  id: string;
  type: ActionType;
  name: string;
  description: string;
  requiresHumanApproval: boolean;
  targetEntity: string;
  targetId: string;
  payload: T;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  status: ActionStatus;
  createdAt: string;
  approvedPayload?: Record<string, unknown> | string;
  approvedPayloadHash?: string;
  approvalProof?: any;
}

export interface ActionExecutionResult<T = any> {
  actionId: string;
  status: ActionStatus;
  data?: T;
  error?: string;
  traceId: string;
  durationMs: number;
  approvalId?: string;
  isMock?: boolean;
  executionEvidence?: ExecutionEvidence;
  normalizedError?: NormalizedExecutionError;
}

export interface ActionDispatcherContext {
  workspaceId: string;
  userId?: string;
  traceId?: string;
  isApproved?: boolean;
  operationId?: string;
  executionMode?: AutomationMode;
  providerId?: string;
  approvedPayload?: Record<string, unknown> | string;
  approvedPayloadHash?: string;
  approvalProof?: any;
  signal?: AbortSignal;
  timeoutMs?: number;
}
