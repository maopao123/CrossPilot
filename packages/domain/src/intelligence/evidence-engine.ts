import { randomUUID } from 'node:crypto';
import { ErrorCodes } from '@crosspilot/shared';
import type { CreateEvidenceInput, EvidenceItemRecord } from '@crosspilot/shared';
import { IIntelligenceStore, IntelligenceError } from './intelligence.types.js';

export class EvidenceEngine {
  constructor(private readonly store: IIntelligenceStore) {}

  async createEvidence(workspaceId: string, input: CreateEvidenceInput): Promise<EvidenceItemRecord> {
    const fact = await this.store.getFact(workspaceId, input.factId);
    if (!fact) throw new IntelligenceError(ErrorCodes.FACT_NOT_FOUND, input.factId);
    if (!input.quote?.trim()) {
      throw new IntelligenceError(ErrorCodes.VALIDATION_ERROR, 'quote is required');
    }
    if (typeof input.confidence !== 'number' || input.confidence < 0 || input.confidence > 1) {
      throw new IntelligenceError(ErrorCodes.VALIDATION_ERROR, 'confidence must be 0..1');
    }
    return this.store.createEvidence({
      id: randomUUID(),
      workspaceId,
      factId: input.factId,
      sourceType: input.sourceType?.trim() || 'FACT',
      sourceId: input.sourceId?.trim() || input.factId,
      quote: input.quote.trim(),
      confidence: input.confidence,
      playbookRunId: input.playbookRunId ?? fact.playbookRunId,
      createdAt: new Date().toISOString(),
    });
  }

  listEvidence(workspaceId: string, filter?: { factId?: string; playbookRunId?: string }) {
    return this.store.listEvidence(workspaceId, filter);
  }
}
