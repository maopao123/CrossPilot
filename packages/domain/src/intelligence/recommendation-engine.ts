import { randomUUID } from 'node:crypto';
import { ErrorCodes } from '@crosspilot/shared';
import type {
  BusinessRecommendationRecord,
  CreateRecommendationInput,
  RecommendationStatus,
} from '@crosspilot/shared';
import { IIntelligenceStore, IntelligenceError } from './intelligence.types.js';

const TRANSITIONS: Record<RecommendationStatus, RecommendationStatus[]> = {
  GENERATED: ['WAITING_APPROVAL'],
  WAITING_APPROVAL: ['APPROVED', 'REJECTED'],
  APPROVED: ['EXECUTED'],
  REJECTED: [],
  EXECUTED: ['VERIFIED'],
  VERIFIED: [],
};

export class RecommendationEngine {
  constructor(private readonly store: IIntelligenceStore) {}

  async createRecommendation(
    workspaceId: string,
    input: CreateRecommendationInput,
  ): Promise<BusinessRecommendationRecord> {
    if (!input.decision?.trim() || !input.reason?.trim()) {
      throw new IntelligenceError(ErrorCodes.VALIDATION_ERROR, 'decision and reason are required');
    }
    if (!input.evidenceIds?.length) {
      throw new IntelligenceError(
        ErrorCodes.RECOMMENDATION_EVIDENCE_REQUIRED,
        'Recommendation must reference evidence',
      );
    }
    for (const evidenceId of input.evidenceIds) {
      const item = await this.store.getEvidence(workspaceId, evidenceId);
      if (!item) throw new IntelligenceError(ErrorCodes.EVIDENCE_NOT_FOUND, evidenceId);
    }
    const now = new Date().toISOString();
    const generated = await this.store.createRecommendation({
      id: randomUUID(),
      workspaceId,
      decision: input.decision.trim(),
      reason: input.reason.trim(),
      confidence: input.confidence,
      evidenceIds: input.evidenceIds,
      status: 'GENERATED',
      playbookRunId: input.playbookRunId,
      executionDispatched: false,
      createdAt: now,
      updatedAt: now,
    });
    return this.store.updateRecommendation(workspaceId, generated.id, {
      status: 'WAITING_APPROVAL',
      updatedAt: new Date().toISOString(),
    });
  }

  async getRecommendation(workspaceId: string, id: string): Promise<BusinessRecommendationRecord> {
    const found = await this.store.getRecommendation(workspaceId, id);
    if (!found) throw new IntelligenceError(ErrorCodes.RECOMMENDATION_NOT_FOUND, id);
    return found;
  }

  listRecommendations(workspaceId: string) {
    return this.store.listRecommendations(workspaceId);
  }

  async transition(
    workspaceId: string,
    id: string,
    next: RecommendationStatus,
  ): Promise<BusinessRecommendationRecord> {
    const current = await this.getRecommendation(workspaceId, id);
    if (!TRANSITIONS[current.status].includes(next)) {
      throw new IntelligenceError(
        ErrorCodes.RECOMMENDATION_INVALID_STATE,
        `Cannot transition ${current.status} → ${next}`,
      );
    }
    const patch: Partial<Pick<BusinessRecommendationRecord, 'status' | 'executionDispatched' | 'updatedAt'>> = {
      status: next,
      updatedAt: new Date().toISOString(),
    };
    if (next === 'EXECUTED') {
      patch.executionDispatched = false;
    }
    return this.store.updateRecommendation(workspaceId, id, patch);
  }
}
