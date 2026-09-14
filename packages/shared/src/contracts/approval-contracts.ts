export interface ApprovalProof {
  approvalId: string;
  workspaceId: string;
  actionId: string;
  actionType: string;
  targetId: string;
  payloadHash: string;
  approvedBy: string;
  approvedAt: string;
  expiresAt?: string | null;
}

export interface ApprovalVerifier {
  verify(proof: ApprovalProof): Promise<{ valid: boolean; reason?: string }>;
}
