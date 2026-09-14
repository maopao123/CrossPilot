/**
 * Local ApprovalProof contract for operation-automation module.
 * Does not reverse-depend on unexported packages or domain internals.
 */

export interface ApprovalProof {
  approvalId: string;
  workspaceId: string;
  actionId?: string;
  actionType: string;
  targetId: string;
  targetType?: string;
  payloadHash?: string;
  approvedBy: string;
  approvedAt: string;
  expiresAt?: string | null;
}

export interface ApprovalVerificationResult {
  valid: boolean;
  reason?: string;
  proof?: ApprovalProof;
}
