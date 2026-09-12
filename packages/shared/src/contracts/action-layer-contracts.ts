export type CommerceActionType =
  | 'DECREASE_BID'
  | 'UPDATE_INVENTORY'
  | 'GENERATE_REPORT'
  | 'STOP_CAMPAIGN'
  | 'CHANGE_PRICE'
  | 'DELETE_LISTING';

export type PlannedActionStatus =
  | 'CREATED'
  | 'WAITING_APPROVAL'
  | 'APPROVED'
  | 'EXECUTING'
  | 'SUCCESS'
  | 'FAILED';

export type CommerceActionRiskLevel = 'low' | 'medium' | 'high';

export type MockOutcome = 'success' | 'fail' | 'timeout';

export interface PlannedActionRecord {
  id: string;
  workspaceId: string;
  recommendationId?: string;
  actionType: CommerceActionType;
  target: Record<string, unknown>;
  parameters: Record<string, unknown>;
  riskLevel: CommerceActionRiskLevel;
  needApproval: boolean;
  status: PlannedActionStatus;
  lastMessage?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActionExecutionRecord {
  id: string;
  actionId: string;
  operator: string;
  timestamp: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  status: string;
  error?: string;
  attempt: number;
}

export interface RiskCheckResult {
  allowed: boolean;
  needApproval: boolean;
  risk: CommerceActionRiskLevel;
  reason: string;
}

export interface PlanActionInput {
  recommendationId: string;
}

export interface PlanAcosActionInput {
  campaignId?: string;
  keyword?: string;
  percentage?: number;
}
