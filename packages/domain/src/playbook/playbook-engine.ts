import { randomUUID } from 'node:crypto';
import { ErrorCodes } from '@crosspilot/shared';
import type {
  CreatePlaybookInput,
  PlaybookRecord,
  PlaybookRunRecord,
  PlaybookStatus,
  StartPlaybookRunResult,
} from '@crosspilot/shared';
import type { IIntelligenceStore } from '../intelligence/intelligence.types.js';
import { AmazonProductResearchRunner } from '../intelligence/amazon-product-research.runner.js';
import { VocIntelligenceEngine } from '../intelligence/voc-intelligence.engine.js';
import { FactEngine } from '../intelligence/fact-engine.js';
import { EvidenceEngine } from '../intelligence/evidence-engine.js';
import { RecommendationEngine } from '../intelligence/recommendation-engine.js';
import {
  IPlaybookStore,
  PlaybookError,
  playbookNotFound,
  playbookRunNotFound,
} from './playbook.types.js';
import { assertPlaybookJsonSchema, validateAgainstSchema } from './playbook-schema.validator.js';

const VERSION_RE = /^\d+\.\d+\.\d+$/;
const STATUSES = new Set<PlaybookStatus>(['REGISTERED', 'ACTIVE', 'DISABLED']);

export class PlaybookEngine {
  constructor(
    private readonly store: IPlaybookStore,
    private readonly intelligence?: IIntelligenceStore,
  ) {}

  async createPlaybook(workspaceId: string, input: CreatePlaybookInput): Promise<PlaybookRecord> {
    const name = (input.name || '').trim();
    if (!name) {
      throw new PlaybookError(ErrorCodes.PLAYBOOK_SCHEMA_INVALID, 'Playbook name is required');
    }
    if (!VERSION_RE.test(input.version || '')) {
      throw new PlaybookError(
        ErrorCodes.PLAYBOOK_VERSION_INVALID,
        `Playbook version must be MAJOR.MINOR.PATCH, got "${input.version}"`,
      );
    }
    const status: PlaybookStatus = input.status ?? 'REGISTERED';
    if (!STATUSES.has(status)) {
      throw new PlaybookError(ErrorCodes.PLAYBOOK_SCHEMA_INVALID, `Invalid playbook status: ${status}`);
    }
    const inputSchema = assertPlaybookJsonSchema(input.inputSchema, 'inputSchema');
    const outputSchema = assertPlaybookJsonSchema(input.outputSchema, 'outputSchema');

    const existing = await this.store.findPlaybookByNameVersion(workspaceId, name, input.version);
    if (existing) {
      throw new PlaybookError(
        ErrorCodes.PLAYBOOK_VERSION_CONFLICT,
        `Playbook ${name}@${input.version} already exists in workspace`,
      );
    }

    const now = new Date().toISOString();
    const record: PlaybookRecord = {
      id: randomUUID(),
      workspaceId,
      name,
      version: input.version,
      status,
      inputSchema,
      outputSchema,
      definition: input.definition ?? {},
      createdAt: now,
      updatedAt: now,
    };
    return this.store.createPlaybook(record);
  }

  async getPlaybook(workspaceId: string, id: string): Promise<PlaybookRecord> {
    const found = await this.store.findPlaybookById(workspaceId, id);
    if (!found) throw playbookNotFound(id);
    return found;
  }

  async listPlaybooks(workspaceId: string): Promise<PlaybookRecord[]> {
    return this.store.listPlaybooks(workspaceId);
  }

  async startRun(
    workspaceId: string,
    playbookId: string,
    input: Record<string, unknown>,
    createdBy?: string,
  ): Promise<StartPlaybookRunResult> {
    const playbook = await this.getPlaybook(workspaceId, playbookId);
    if (playbook.status === 'DISABLED') {
      throw new PlaybookError(
        ErrorCodes.PLAYBOOK_DISABLED,
        `Playbook ${playbook.name}@${playbook.version} is DISABLED`,
      );
    }
    const valid = validateAgainstSchema(input, playbook.inputSchema);
    if (!valid.ok) {
      throw new PlaybookError(ErrorCodes.PLAYBOOK_INPUT_INVALID, valid.message);
    }

    const now = new Date().toISOString();
    const record: PlaybookRunRecord = {
      id: randomUUID(),
      workspaceId,
      playbookId: playbook.id,
      runId: randomUUID(),
      status: 'CREATED',
      input,
      output: null,
      createdBy,
      createdAt: now,
      updatedAt: now,
    };
    const saved = await this.store.createRun(record);
    return {
      runId: saved.runId,
      playbookId: saved.playbookId,
      status: 'CREATED',
      run: saved,
    };
  }

  async getRun(workspaceId: string, runId: string): Promise<PlaybookRunRecord> {
    const found = await this.store.findRunByRunId(workspaceId, runId);
    if (!found) throw playbookRunNotFound(runId);
    return found;
  }

  async executeRun(workspaceId: string, runId: string): Promise<PlaybookRunRecord> {
    const run = await this.getRun(workspaceId, runId);
    if (run.status !== 'CREATED') {
      throw new PlaybookError(
        ErrorCodes.PLAYBOOK_RUN_INVALID_STATE,
        `Run ${runId} is ${run.status}; only CREATED runs can execute`,
      );
    }
    const playbook = await this.getPlaybook(workspaceId, run.playbookId);
    await this.store.updateRun(workspaceId, runId, {
      status: 'RUNNING',
      updatedAt: new Date().toISOString(),
    });
    try {
      const output = await this.produceOutput(playbook, run);
      const valid = validateAgainstSchema(output, playbook.outputSchema);
      if (!valid.ok) {
        throw new PlaybookError(ErrorCodes.PLAYBOOK_OUTPUT_INVALID, valid.message);
      }
      return this.store.updateRun(workspaceId, runId, {
        status: 'COMPLETED',
        output,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: string })?.code;
      await this.store.updateRun(workspaceId, runId, {
        status: 'FAILED',
        output: { error: message, code },
        updatedAt: new Date().toISOString(),
      });
      throw err;
    }
  }

  private async produceOutput(
    playbook: PlaybookRecord,
    run: PlaybookRunRecord,
  ): Promise<Record<string, unknown>> {
    const kind = String(playbook.definition?.kind ?? '');
    if (kind === 'amazon-product-research' || playbook.name === 'amazon-product-research') {
      if (!this.intelligence) {
        throw new PlaybookError(ErrorCodes.PLAYBOOK_KIND_UNSUPPORTED, 'Intelligence store is required');
      }
      const runner = new AmazonProductResearchRunner(this.intelligence);
      const result = await runner.execute(playbook, run);
      return {
        decision: result.decision,
        listingBrief: result.listingBrief,
        ...(typeof result.opportunityScore === 'number'
          ? { opportunityScore: result.opportunityScore }
          : {}),
        recommendationId: result.recommendationId,
        factIds: result.factIds,
        evidenceIds: result.evidenceIds,
      };
    }
    if (kind === 'voc-intelligence' || playbook.name === 'voc-intelligence') {
      if (!this.intelligence) {
        throw new PlaybookError(ErrorCodes.PLAYBOOK_KIND_UNSUPPORTED, 'Intelligence store is required');
      }
      const voc = new VocIntelligenceEngine().analyze({
        reviews: Array.isArray(run.input.reviews) ? (run.input.reviews as string[]) : [],
        listingText: typeof run.input.listingText === 'string' ? run.input.listingText : undefined,
        feedback: Array.isArray(run.input.feedback) ? (run.input.feedback as string[]) : [],
      });
      const facts = new FactEngine(this.intelligence);
      const evidence = new EvidenceEngine(this.intelligence);
      const recs = new RecommendationEngine(this.intelligence);
      const fact = await facts.createFact(run.workspaceId, {
        factType: 'VOC',
        metric: 'voc_pain_count',
        valueJson: { value: voc.painPoints.length, outputs: voc.outputs },
        sourceProvider: 'playbook:voc-intelligence',
        sourceReference: 'voc.analyze',
        playbookRunId: run.runId,
      });
      const ev = await evidence.createEvidence(run.workspaceId, {
        factId: fact.id,
        sourceType: 'VOC',
        sourceId: fact.id,
        quote: voc.outputs.listingImprovement,
        confidence: voc.cleanedTexts.length ? 0.7 : 0.3,
        playbookRunId: run.runId,
      });
      const rec = await recs.createRecommendation(run.workspaceId, {
        decision: voc.painPoints.length ? 'IMPROVE_LISTING' : 'MONITOR_VOC',
        reason: voc.outputs.productImprovement,
        confidence: voc.cleanedTexts.length ? 0.7 : 0.3,
        evidenceIds: [ev.id],
        playbookRunId: run.runId,
      });
      return {
        productImprovement: voc.outputs.productImprovement,
        listingImprovement: voc.outputs.listingImprovement,
        creativeBrief: voc.outputs.creativeBrief,
        customerServiceKnowledge: voc.outputs.customerServiceKnowledge,
        recommendationId: rec.id,
      };
    }
    if ((playbook.outputSchema.required ?? []).length > 0) {
      throw new PlaybookError(
        ErrorCodes.PLAYBOOK_KIND_UNSUPPORTED,
        `No handler for playbook ${playbook.name}; definition.kind=${kind || '(empty)'}`,
      );
    }
    return {};
  }
}
