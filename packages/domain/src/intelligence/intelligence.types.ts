import { ErrorCodes } from '@crosspilot/shared';
import type {
  BusinessRecommendationRecord,
  CommerceFactRecord,
  EvidenceItemRecord,
} from '@crosspilot/shared';

export class IntelligenceError extends Error {
  constructor(
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'IntelligenceError';
  }
}

export interface IIntelligenceStore {
  createFact(record: CommerceFactRecord): Promise<CommerceFactRecord>;
  getFact(workspaceId: string, id: string): Promise<CommerceFactRecord | null>;
  listFacts(workspaceId: string, filter?: { playbookRunId?: string }): Promise<CommerceFactRecord[]>;
  createEvidence(record: EvidenceItemRecord): Promise<EvidenceItemRecord>;
  getEvidence(workspaceId: string, id: string): Promise<EvidenceItemRecord | null>;
  listEvidence(
    workspaceId: string,
    filter?: { factId?: string; playbookRunId?: string },
  ): Promise<EvidenceItemRecord[]>;
  createRecommendation(record: BusinessRecommendationRecord): Promise<BusinessRecommendationRecord>;
  getRecommendation(workspaceId: string, id: string): Promise<BusinessRecommendationRecord | null>;
  listRecommendations(workspaceId: string): Promise<BusinessRecommendationRecord[]>;
  updateRecommendation(
    workspaceId: string,
    id: string,
    patch: Partial<Pick<BusinessRecommendationRecord, 'status' | 'executionDispatched' | 'updatedAt'>>,
  ): Promise<BusinessRecommendationRecord>;
}

export class InMemoryIntelligenceStore implements IIntelligenceStore {
  facts: CommerceFactRecord[] = [];
  evidence: EvidenceItemRecord[] = [];
  recommendations: BusinessRecommendationRecord[] = [];

  async createFact(record: CommerceFactRecord): Promise<CommerceFactRecord> {
    this.facts.push(record);
    return record;
  }
  async getFact(workspaceId: string, id: string): Promise<CommerceFactRecord | null> {
    return this.facts.find((f) => f.workspaceId === workspaceId && f.id === id) ?? null;
  }
  async listFacts(workspaceId: string, filter?: { playbookRunId?: string }): Promise<CommerceFactRecord[]> {
    return this.facts.filter(
      (f) => f.workspaceId === workspaceId && (!filter?.playbookRunId || f.playbookRunId === filter.playbookRunId),
    );
  }
  async createEvidence(record: EvidenceItemRecord): Promise<EvidenceItemRecord> {
    this.evidence.push(record);
    return record;
  }
  async getEvidence(workspaceId: string, id: string): Promise<EvidenceItemRecord | null> {
    return this.evidence.find((e) => e.workspaceId === workspaceId && e.id === id) ?? null;
  }
  async listEvidence(
    workspaceId: string,
    filter?: { factId?: string; playbookRunId?: string },
  ): Promise<EvidenceItemRecord[]> {
    return this.evidence.filter(
      (e) =>
        e.workspaceId === workspaceId &&
        (!filter?.factId || e.factId === filter.factId) &&
        (!filter?.playbookRunId || e.playbookRunId === filter.playbookRunId),
    );
  }
  async createRecommendation(record: BusinessRecommendationRecord): Promise<BusinessRecommendationRecord> {
    this.recommendations.push(record);
    return record;
  }
  async getRecommendation(workspaceId: string, id: string): Promise<BusinessRecommendationRecord | null> {
    return this.recommendations.find((r) => r.workspaceId === workspaceId && r.id === id) ?? null;
  }
  async listRecommendations(workspaceId: string): Promise<BusinessRecommendationRecord[]> {
    return this.recommendations.filter((r) => r.workspaceId === workspaceId);
  }
  async updateRecommendation(
    workspaceId: string,
    id: string,
    patch: Partial<Pick<BusinessRecommendationRecord, 'status' | 'executionDispatched' | 'updatedAt'>>,
  ): Promise<BusinessRecommendationRecord> {
    const found = await this.getRecommendation(workspaceId, id);
    if (!found) {
      throw new IntelligenceError(ErrorCodes.RECOMMENDATION_NOT_FOUND, id);
    }
    Object.assign(found, patch);
    return found;
  }
}
