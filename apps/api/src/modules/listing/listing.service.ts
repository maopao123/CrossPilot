import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PlatformLlmRuntime } from '@crosspilot/ai';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ComplianceJudgeService,
  ListingWorkflowDagService,
  VisualFact,
  KeywordItem,
  RufusQaItem,
  ListingCreativeBrief,
  KeywordSource,
} from '@crosspilot/domain';
import {
  ProductVisualExtractTool,
  KeywordFileExtractTool,
  KeywordNormalizeTool,
} from '@crosspilot/tool-platform';
import { ErrorCodes, ModelRouter } from '@crosspilot/shared';

export interface GenerateListingOptions {
  customDirectives?: string;
  images?: string[];
  keywords?: KeywordItem[];
  rufusQa?: RufusQaItem[];
  marketplace?: string;
  modelName?: string;
  forceRefreshVisual?: boolean;
}

@Injectable()
export class ListingService {
  constructor(private readonly prisma: PrismaService) {}

  async getListingBySkuId(skuId: string, workspaceId: string) {
    const listing = await this.prisma.listing.findFirst({
      where: {
        skuId,
        workspaceId,
      },
      include: {
        sku: {
          include: {
            product: {
              include: {
                features: true,
                visualFacts: true,
              },
            },
          },
        },
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: {
            complianceChecks: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!listing) {
      throw new NotFoundException(`Listing for SKU ${skuId} not found in workspace`);
    }

    return {
      id: listing.id,
      skuId: listing.skuId,
      skuCode: listing.sku.skuCode,
      productId: listing.sku.productId,
      productName: listing.sku.product.name,
      brand: listing.sku.product.brand,
      status: listing.status,
      currentVersionId: listing.currentVersionId,
      visualFacts: (listing.sku.product.visualFacts || []).map((vf: any) => ({
        id: vf.id,
        imageId: vf.imageId,
        imageUrl: vf.imageUrl,
        type: vf.type,
        value: vf.value,
        confidence: Number(vf.confidence),
        status: vf.status,
      })),
      versions: listing.versions.map((v: any) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        title: v.title,
        bulletPoints: JSON.parse(v.bulletPointsJson || '[]'),
        description: v.description,
        searchTerms: v.searchTerms,
        imageBriefs: v.imageBriefsJson ? JSON.parse(v.imageBriefsJson) : [],
        aPlusPlan: v.aPlusPlanJson ? JSON.parse(v.aPlusPlanJson) : null,
        rufusCoverage: v.rufusCoverageJson ? JSON.parse(v.rufusCoverageJson) : [],
        keywordCoverage: v.keywordCoverageJson ? JSON.parse(v.keywordCoverageJson) : null,
        claims: v.claimsJson ? JSON.parse(v.claimsJson) : [],
        knowledgeEvidence: v.knowledgeEvidenceJson ? JSON.parse(v.knowledgeEvidenceJson) : [],
        marketplace: v.marketplace || 'AMAZON_US',
        generationSource: v.generationSource,
        generationMode: v.generationSource?.includes('TEMPLATE')
          ? v.generationSource?.includes('LEGACY')
            ? 'LEGACY_TEMPLATE'
            : 'TEMPLATE_FALLBACK'
          : 'AI',
        modelUsed: v.complianceChecks[0]?.modelName || ModelRouter.llmRouter.heavyReasoning,
        promptVersion: v.complianceChecks[0]?.promptVersion || 'listing.generate.v1',
        createdAt: v.createdAt,
        complianceCheck: v.complianceChecks[0]
          ? {
              status: v.complianceChecks[0].status,
              riskLevel: v.complianceChecks[0].riskLevel,
              evidenceSummary: v.complianceChecks[0].evidenceSummary,
              modelName: v.complianceChecks[0].modelName,
              promptVersion: v.complianceChecks[0].promptVersion,
              ruleHits: JSON.parse(v.complianceChecks[0].ruleHitsJson || '[]'),
            }
          : null,
      })),
    };
  }

  /**
   * Visual Facts Extraction with Snapshot Cache Reuse (§338.30.2)
   */
  async getOrExtractVisualFacts(
    productId: string,
    images: string[],
    workspaceId: string,
    forceRefresh = false,
  ) {
    const existing = await this.prisma.productVisualFact.findMany({
      where: { productId, workspaceId },
      orderBy: { createdAt: 'asc' },
    });

    if (existing.length > 0 && !forceRefresh) {
      return {
        productId,
        cacheHit: true,
        visualFacts: existing.map((vf: any) => ({
          id: vf.id,
          productId: vf.productId,
          imageId: vf.imageId,
          imageUrl: vf.imageUrl || undefined,
          type: vf.type as any,
          value: vf.value,
          confidence: Number(vf.confidence),
          status: vf.status as any,
        })),
        message: 'Visual facts reused from database snapshot cache. Vision model skipped.',
      };
    }

    // Call tool executor logic with execution context
    const ctx = {
      workspaceId,
      traceId: `trace-vf-${Date.now()}`,
      source: 'WORKFLOW' as const,
    };
    const extractRes = ProductVisualExtractTool.execute(
      {
        productId,
        images: images && images.length > 0 ? images : ['https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=800'],
        forceRefresh,
      },
      ctx,
    );

    // Persist into database
    if (forceRefresh && existing.length > 0) {
      await this.prisma.productVisualFact.deleteMany({
        where: { productId, workspaceId },
      });
    }

    const savedFacts: VisualFact[] = [];
    for (const vf of extractRes.visualFacts) {
      const created = await this.prisma.productVisualFact.create({
        data: {
          workspaceId,
          productId,
          imageId: vf.imageId,
          imageUrl: vf.imageUrl,
          type: vf.type,
          value: vf.value,
          confidence: vf.confidence,
          status: vf.status,
          evidenceRegionJson: vf.evidenceRegion ? JSON.stringify(vf.evidenceRegion) : null,
        },
      });
      savedFacts.push({
        id: created.id,
        productId: created.productId,
        imageId: created.imageId,
        imageUrl: created.imageUrl || undefined,
        type: created.type as any,
        value: created.value,
        confidence: Number(created.confidence),
        status: created.status as any,
      });
    }

    return {
      productId,
      cacheHit: false,
      visualFacts: savedFacts,
      message: 'Visual facts freshly extracted and persisted to database snapshot.',
    };
  }

  /**
   * Human confirmation / rejection of visual fact
   */
  async confirmVisualFact(factId: string, status: 'CONFIRMED' | 'REJECTED', workspaceId: string) {
    const fact = await this.prisma.productVisualFact.findFirst({
      where: { id: factId, workspaceId },
    });
    if (!fact) throw new NotFoundException(`Visual fact ${factId} not found`);

    return this.prisma.productVisualFact.update({
      where: { id: factId },
      data: { status },
    });
  }

  /**
   * Keyword intake: extract & normalize from raw file content
   */
  async extractAndNormalizeKeywords(content: string, sourceType: KeywordSource = 'MANUAL') {
    const ctx = {
      workspaceId: 'default',
      traceId: `trace-kw-${Date.now()}`,
      source: 'TOOL_CENTER' as const,
    };
    const extracted = KeywordFileExtractTool.execute({ content, sourceType }, ctx);
    const normalized = KeywordNormalizeTool.execute({ keywords: extracted.keywords }, ctx);
    return {
      totalParsed: extracted.totalLines,
      extractedCount: extracted.extractedCount,
      deduplicatedCount: normalized.deduplicatedCount,
      keywords: normalized.keywords,
    };
  }

  /**
   * AI Rufus Q&A Extraction: extracts structured Q&A pairs from raw unstructured text.
   * Leverages LLM with automatic deduplication, plus high-availability heuristic fallback.
   */
  async extractRufusQa(content: string, defaultSource: 'MANUAL' | 'QA' | 'VOC' = 'QA') {
    if (!content || !content.trim()) {
      return {
        totalExtracted: 0,
        deduplicatedCount: 0,
        extractor: 'NONE',
        items: [],
      };
    }

    const trimmed = content.trim();

    // 1. Attempt LLM extraction first
    try {
      const runtime = PlatformLlmRuntime.getInstance();
      const systemPrompt = `You are a professional Amazon Rufus and E-Commerce Q&A Extraction Specialist.
Your task is to extract structured buyer questions and verified factual answers from unstructured text (copied from Amazon product pages, Rufus conversations, or Customer Q&A).

Rules:
1. Identify all genuine buyer questions (ending with '?') and their corresponding factual answers.
2. Filter out UI noise, section labels (e.g. "Customer question", "Top question", "Community answers"), and conversational follow-ups without an answer (e.g. "Want tips on...").
3. Semantic Deduplication: If the same or highly similar question appears multiple times, merge them into ONE single best entry with the most accurate, detailed, and clear answer.
4. Set source to "${defaultSource}".
5. Output format: JSON ONLY, strictly following:
{
  "items": [
    {
      "question": "Clear question ending with ?",
      "answer": "Accurate factual answer.",
      "source": "${defaultSource}"
    }
  ]
}`;

      const userPrompt = `Here is the raw text to extract:\n\n${trimmed}`;

      const llmResult = await runtime.generateText({
        model: 'qwen-plus',
        systemPrompt,
        userPrompt,
        temperature: 0.1,
        maxTokens: 3000,
        timeoutMs: 35000,
        retryPolicy: { maxAttempts: 1, backoffMs: 500 },
      }, { traceId: `trace-rufus-extract-${Date.now()}` });

      let parsedItems: any[] = [];
      try {
        const rawJson = typeof llmResult.output === 'object' && llmResult.output !== null
          ? llmResult.output
          : JSON.parse(llmResult.rawText.replace(/```json\n?|\n?```/g, '').trim());
        
        parsedItems = Array.isArray(rawJson) ? rawJson : rawJson.items || [];
      } catch (jsonErr) {
        // Fall back to heuristic
      }

      if (parsedItems && parsedItems.length > 0) {
        const validated = parsedItems
          .filter((item: any) => item && item.question && item.answer)
          .map((item: any, idx: number) => ({
            id: `rufus-ai-${Date.now()}-${idx + 1}`,
            question: String(item.question).trim(),
            answer: String(item.answer).trim(),
            source: item.source || defaultSource,
          }));

        if (validated.length > 0) {
          return {
            totalExtracted: validated.length,
            deduplicatedCount: validated.length,
            extractor: 'LLM',
            model: llmResult.model,
            items: validated,
          };
        }
      }
    } catch (llmErr) {
      console.warn('[ListingService] LLM Rufus extract failed or timed out, falling back to heuristic parser:', (llmErr as any)?.message);
    }

    // 2. High-availability Heuristic Fallback
    const heuristicItems = this.heuristicExtractRufusQa(trimmed, defaultSource);
    return {
      totalExtracted: heuristicItems.length,
      deduplicatedCount: heuristicItems.length,
      extractor: 'HEURISTIC_PARSER',
      items: heuristicItems,
    };
  }

  /**
   * Deterministic heuristic parser for Amazon Customer Q&A / Rufus text blocks.
   */
  private heuristicExtractRufusQa(rawText: string, defaultSource: 'MANUAL' | 'QA' | 'VOC' = 'QA'): RufusQaItem[] {
    if (!rawText || !rawText.trim()) return [];

    const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const qRegex = /^((is|how|can|does|do|what|where|why|which|will|would|are|could|weight|capacity)\b|\b.*\?$|\b.*\？$)/i;
    const ignoreRegex = /^(customer question|seller question|buyer question|q&a|rufus question|top question|community answers?)$/i;

    const pairs: { question: string; answer: string }[] = [];
    let currentQ: string | null = null;
    let currentA: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (ignoreRegex.test(line)) {
        continue;
      }

      const isQuestion = qRegex.test(line) && (line.endsWith('?') || line.endsWith('？') || line.length < 90);

      if (isQuestion) {
        if (currentQ && currentA.length > 0) {
          pairs.push({
            question: currentQ,
            answer: currentA.join(' ').trim(),
          });
        }
        currentQ = line;
        currentA = [];
      } else {
        if (currentQ) {
          currentA.push(line);
        }
      }
    }

    if (currentQ && currentA.length > 0) {
      pairs.push({
        question: currentQ,
        answer: currentA.join(' ').trim(),
      });
    }

    // Normalize and deduplicate questions
    const dedupeMap = new Map<string, { question: string; answer: string }>();
    for (const pair of pairs) {
      const key = pair.question.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
      if (!dedupeMap.has(key)) {
        dedupeMap.set(key, pair);
      } else {
        const existing = dedupeMap.get(key)!;
        if (pair.answer.length > existing.answer.length) {
          dedupeMap.set(key, pair);
        }
      }
    }

    const results: RufusQaItem[] = [];
    let idx = 1;
    for (const item of dedupeMap.values()) {
      results.push({
        id: `rufus-ext-${Date.now()}-${idx++}`,
        question: item.question,
        answer: item.answer,
        source: defaultSource,
      });
    }

    return results;
  }

  /**
   * Upgraded WF-02 14-Step DAG Listing Generation with Backward Compatibility
   */
  async generateListing(
    skuId: string,
    workspaceId: string,
    optionsOrDirectives?: string | GenerateListingOptions,
  ) {
    if (!skuId || typeof skuId !== 'string' || !skuId.trim()) {
      throw new BadRequestException({
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'skuId is required',
      });
    }
    const resolvedSkuId = skuId.trim();

    const options: GenerateListingOptions =
      typeof optionsOrDirectives === 'string'
        ? { customDirectives: optionsOrDirectives }
        : optionsOrDirectives || {};

    const sku = await this.prisma.sku.findFirst({
      where: { id: resolvedSkuId, workspaceId },
      include: {
        product: {
          include: {
            features: true,
            visualFacts: true,
          },
        },
      },
    });

    if (!sku) {
      throw new NotFoundException({
        code: ErrorCodes.RESOURCE_NOT_FOUND,
        message: `SKU ${resolvedSkuId} not found in workspace`,
      });
    }

    // Load or extract visual facts with snapshot caching (§338.30.2)
    let visualFacts: VisualFact[] = [];
    if (sku.product.visualFacts && sku.product.visualFacts.length > 0 && !options.forceRefreshVisual) {
      visualFacts = sku.product.visualFacts.map((vf: any) => ({
        id: vf.id,
        productId: vf.productId,
        imageId: vf.imageId,
        imageUrl: vf.imageUrl || undefined,
        type: vf.type as any,
        value: vf.value,
        confidence: Number(vf.confidence),
        status: vf.status as any,
      }));
    } else {
      const vfRes = await this.getOrExtractVisualFacts(
        sku.productId,
        options.images || [],
        workspaceId,
        options.forceRefreshVisual,
      );
      visualFacts = vfRes.visualFacts;
    }

    // Execute 14-step DAG
    const dagResult = await ListingWorkflowDagService.executeWorkflowDag({
      skuCode: sku.skuCode,
      productName: sku.product.name,
      brand: sku.product.brand,
      variantName: sku.variantName,
      features: sku.product.features.map((f: any) => ({
        id: f.id,
        name: f.name,
        value: f.value,
        isCore: f.isCore,
      })),
      skuWeightKg: sku.weightKg ? Number(sku.weightKg) : undefined,
      productBrief: sku.product.productBrief || undefined,
      visualFacts,
      images: options.images,
      keywords: options.keywords,
      rufusQa: options.rufusQa,
      marketplace: options.marketplace || 'AMAZON_US',
      customDirectives: options.customDirectives,
      modelName: options.modelName,
    });

    // Ensure Listing record exists
    let listing = await this.prisma.listing.findFirst({
      where: { skuId, workspaceId },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });

    if (!listing) {
      const defaultMarketplace = await this.prisma.marketplace.findFirst();
      listing = await this.prisma.listing.create({
        data: {
          workspaceId,
          skuId,
          marketplaceId: defaultMarketplace?.id || sku.product.marketplaceId,
          status: 'DRAFT',
        },
        include: { versions: true },
      });
    }

    const nextVersionNumber = ((listing.versions?.[0] as any)?.versionNumber || 0) + 1;

    // Persist Listing Version with Extended Fields
    const savedVersion = await this.prisma.listingVersion.create({
      data: {
        listingId: listing.id,
        versionNumber: nextVersionNumber,
        title: dagResult.listingDraft.title,
        bulletPointsJson: JSON.stringify(dagResult.listingDraft.bulletPoints),
        description: dagResult.listingDraft.description,
        searchTerms: dagResult.listingDraft.searchTerms,
        aPlusCopy: JSON.stringify(dagResult.listingDraft.aPlusCopy || []),
        imageBrief: JSON.stringify(dagResult.listingDraft.imageBriefs || []),
        imageBriefsJson: JSON.stringify(dagResult.listingDraft.imageBriefs || []),
        aPlusPlanJson: JSON.stringify(dagResult.listingDraft.aPlusPlan || null),
        rufusCoverageJson: JSON.stringify(dagResult.listingDraft.rufusCoverage || []),
        keywordCoverageJson: JSON.stringify(dagResult.keywordCoverage),
        claimsJson: JSON.stringify(dagResult.listingDraft.claims),
        knowledgeEvidenceJson: JSON.stringify(dagResult.listingDraft.knowledgeEvidence || []),
        marketplace: dagResult.listingDraft.marketplace,
        locale: dagResult.listingDraft.locale,
        generationSource: dagResult.listingDraft.generationMode || dagResult.listingDraft.generationSource,
      },
    });

    // Link Current Version
    await this.prisma.listing.update({
      where: { id: listing.id },
      data: { currentVersionId: savedVersion.id },
    });

    // Persist Compliance Check
    await this.prisma.listingComplianceCheck.create({
      data: {
        listingVersionId: savedVersion.id,
        status: dagResult.complianceResult.status,
        riskLevel: dagResult.complianceResult.riskLevel,
        ruleHitsJson: JSON.stringify(dagResult.complianceResult.violations),
        evidenceSummary: dagResult.complianceResult.evidenceSummary,
        modelName: dagResult.listingDraft.modelUsed || 'AUTO',
        promptVersion: dagResult.listingDraft.promptVersion || 'listing.generate.v1',
      },
    });

    // Set listingVersionId on CreativeBrief
    dagResult.creativeBrief.listingVersionId = savedVersion.id;
    dagResult.creativeBrief.productId = sku.productId;

    return {
      skuId,
      skuCode: sku.skuCode,
      versionId: savedVersion.id,
      versionNumber: savedVersion.versionNumber,
      generatedListing: {
        title: dagResult.listingDraft.title,
        bulletPoints: dagResult.listingDraft.bulletPoints,
        description: dagResult.listingDraft.description,
        searchTerms: dagResult.listingDraft.searchTerms,
        claims: dagResult.listingDraft.claims,
        generationSource: dagResult.listingDraft.generationSource,
        generationMode: dagResult.listingDraft.generationMode,
        modelUsed: dagResult.listingDraft.modelUsed,
        promptVersion: dagResult.listingDraft.promptVersion,
        llmUsage: dagResult.listingDraft.llmUsage,
        directivesUsed: options.customDirectives || 'Standard factual constraints from Product Brief',
        imageBriefs: dagResult.listingDraft.imageBriefs,
        aPlusPlan: dagResult.listingDraft.aPlusPlan,
        rufusCoverage: dagResult.listingDraft.rufusCoverage,
        usedKeywords: dagResult.listingDraft.usedKeywords,
        unusedHighPriorityKeywords: dagResult.listingDraft.unusedHighPriorityKeywords,
        knowledgeEvidence: dagResult.listingDraft.knowledgeEvidence,
        marketplace: dagResult.listingDraft.marketplace,
        locale: dagResult.listingDraft.locale,
      },
      compliance: dagResult.complianceResult,
      creativeBrief: dagResult.creativeBrief,
      keywordCoverage: dagResult.keywordCoverage,
      groundingMetrics: dagResult.groundingMetrics,
      rufusCoverageMetrics: dagResult.rufusCoverageMetrics,
      stepTraces: dagResult.stepTraces,
      executionTimeMs: dagResult.executionTimeMs,
      humanReviewState: dagResult.humanReviewState,
    };
  }

  /**
   * Get Listing Creative Brief for Creative Studio consumption (§338.30.7)
   */
  async getCreativeBrief(versionId: string, workspaceId: string): Promise<ListingCreativeBrief> {
    const version = await this.prisma.listingVersion.findFirst({
      where: { id: versionId, listing: { workspaceId } },
      include: { listing: { include: { sku: true } } },
    });

    if (!version) throw new NotFoundException(`Listing version ${versionId} not found`);

    const imageBriefs = version.imageBriefsJson ? JSON.parse(version.imageBriefsJson) : [];
    const aPlusPlan = version.aPlusPlanJson ? JSON.parse(version.aPlusPlanJson) : undefined;

    return {
      listingVersionId: version.id,
      productId: version.listing.sku.productId,
      skuIds: [version.listing.sku.skuCode],
      imageBriefs,
      aPlusPlan,
    };
  }

  async checkCompliance(payload: { title: string; bulletPoints: string[]; description?: string }) {
    return ComplianceJudgeService.evaluateListing(payload);
  }
}
