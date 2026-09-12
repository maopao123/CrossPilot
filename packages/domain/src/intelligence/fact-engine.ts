import { randomUUID } from 'node:crypto';
import { ErrorCodes } from '@crosspilot/shared';
import type { CommerceFactRecord, CreateFactInput } from '@crosspilot/shared';
import { IIntelligenceStore, IntelligenceError } from './intelligence.types.js';

export class FactEngine {
  constructor(private readonly store: IIntelligenceStore) {}

  async createFact(workspaceId: string, input: CreateFactInput): Promise<CommerceFactRecord> {
    if (!input.factType?.trim() || !input.metric?.trim()) {
      throw new IntelligenceError(ErrorCodes.VALIDATION_ERROR, 'factType and metric are required');
    }
    if (!input.sourceProvider?.trim() || !input.sourceReference?.trim()) {
      throw new IntelligenceError(ErrorCodes.VALIDATION_ERROR, 'sourceProvider and sourceReference are required');
    }
    if (!input.valueJson || typeof input.valueJson !== 'object') {
      throw new IntelligenceError(ErrorCodes.VALIDATION_ERROR, 'valueJson is required');
    }
    const now = new Date().toISOString();
    return this.store.createFact({
      id: randomUUID(),
      workspaceId,
      factType: input.factType.trim(),
      metric: input.metric.trim(),
      valueJson: input.valueJson,
      sourceProvider: input.sourceProvider.trim(),
      sourceReference: input.sourceReference.trim(),
      observedAt: input.observedAt ?? now,
      playbookRunId: input.playbookRunId,
      createdAt: now,
    });
  }

  async getFact(workspaceId: string, id: string): Promise<CommerceFactRecord> {
    const found = await this.store.getFact(workspaceId, id);
    if (!found) throw new IntelligenceError(ErrorCodes.FACT_NOT_FOUND, id);
    return found;
  }

  listFacts(workspaceId: string, filter?: { playbookRunId?: string }) {
    return this.store.listFacts(workspaceId, filter);
  }
}
