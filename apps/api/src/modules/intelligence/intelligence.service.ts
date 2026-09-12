import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CreateEvidenceInput,
  CreateFactInput,
  CreateRecommendationInput,
  ErrorCodes,
  RecommendationStatus,
  VocIntelligenceInput,
} from '@crosspilot/shared';
import {
  EvidenceEngine,
  FactEngine,
  IntelligenceError,
  RecommendationEngine,
  VocIntelligenceEngine,
} from '@crosspilot/domain';
import { PrismaService } from '../prisma/prisma.service.js';
import { PrismaIntelligenceStore } from './prisma-intelligence.store.js';

@Injectable()
export class IntelligenceService {
  private readonly facts: FactEngine;
  private readonly evidence: EvidenceEngine;
  private readonly recommendations: RecommendationEngine;
  private readonly voc = new VocIntelligenceEngine();

  constructor(prisma: PrismaService) {
    const store = new PrismaIntelligenceStore(prisma);
    this.facts = new FactEngine(store);
    this.evidence = new EvidenceEngine(store);
    this.recommendations = new RecommendationEngine(store);
  }

  createFact(workspaceId: string, input: CreateFactInput) {
    return this.wrap(() => this.facts.createFact(workspaceId, input));
  }
  listFacts(workspaceId: string, playbookRunId?: string) {
    return this.wrap(() => this.facts.listFacts(workspaceId, playbookRunId ? { playbookRunId } : undefined));
  }
  getFact(workspaceId: string, id: string) {
    return this.wrap(() => this.facts.getFact(workspaceId, id));
  }
  createEvidence(workspaceId: string, input: CreateEvidenceInput) {
    return this.wrap(() => this.evidence.createEvidence(workspaceId, input));
  }
  listEvidence(workspaceId: string, factId?: string, playbookRunId?: string) {
    return this.wrap(() => this.evidence.listEvidence(workspaceId, { factId, playbookRunId }));
  }
  createRecommendation(workspaceId: string, input: CreateRecommendationInput) {
    return this.wrap(() => this.recommendations.createRecommendation(workspaceId, input));
  }
  listRecommendations(workspaceId: string) {
    return this.wrap(() => this.recommendations.listRecommendations(workspaceId));
  }
  getRecommendation(workspaceId: string, id: string) {
    return this.wrap(() => this.recommendations.getRecommendation(workspaceId, id));
  }
  transition(workspaceId: string, id: string, next: RecommendationStatus) {
    return this.wrap(() => this.recommendations.transition(workspaceId, id, next));
  }
  analyzeVoc(workspaceId: string, input: VocIntelligenceInput) {
    return this.wrap(async () => {
      const result = this.voc.analyze(input);
      const fact = await this.facts.createFact(workspaceId, {
        factType: 'VOC',
        metric: 'voc_pain_count',
        valueJson: { value: result.painPoints.length, outputs: result.outputs },
        sourceProvider: 'voc-intelligence',
        sourceReference: 'POST /voc/analyze',
      });
      return { ...result, factId: fact.id };
    });
  }

  latestVoc(workspaceId: string) {
    return this.wrap(async () => {
      const facts = await this.facts.listFacts(workspaceId);
      const stored = facts.find((fact) => fact.factType === 'VOC');
      if (!stored) return null;
      const outputs =
        stored.valueJson.outputs && typeof stored.valueJson.outputs === 'object'
          ? (stored.valueJson.outputs as Record<string, string>)
          : {};
      return {
        factId: stored.id,
        observedAt: stored.observedAt,
        painCount: stored.valueJson.value,
        listingSuggestion: outputs.listingImprovement,
        productImprovement: outputs.productImprovement,
        outputs,
      };
    });
  }

  private async wrap<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      throw this.toHttp(err);
    }
  }

  private toHttp(err: unknown): never {
    if (err instanceof IntelligenceError) {
      const payload = { code: err.code, message: err.message };
      if (
        err.code === ErrorCodes.FACT_NOT_FOUND ||
        err.code === ErrorCodes.EVIDENCE_NOT_FOUND ||
        err.code === ErrorCodes.RECOMMENDATION_NOT_FOUND
      ) {
        throw new NotFoundException(payload);
      }
      throw new BadRequestException(payload);
    }
    throw err;
  }
}
