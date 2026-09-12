import {
  CapabilityBinding,
  CompositeTraceStep,
  ProviderAdapter,
  ProviderExecutionContext,
  ProviderExecutionResult,
  ProviderHealth,
} from '../../core/provider.types.js';
import {
  KeywordMetric,
  MarketProduct,
  MarketTrend,
  ResearchEvidence,
  CompositeProductSearchResult,
  VocProductAnalysisResult,
  ProductReviewHealthResult,
} from '@crosspilot/shared';
import { McpExecutor } from '../../transports/mcp/mcp-executor.js';
import { McpConnectionManager } from '../../transports/mcp/mcp-connection-manager.js';
import {
  ProviderCache,
  CachedProviderPayload,
  buildProviderCacheKey,
  RedisProviderCache,
} from '../../cache/provider-cache.js';
import { XydcMapper } from './xydc.mapper.js';
import { XYDC_PROVIDER_ID } from './xydc.config.js';
import { XydcProductEntity } from './xydc.types.js';

export class XydcProvider implements ProviderAdapter {
  readonly providerId = XYDC_PROVIDER_ID;
  readonly transport = 'MCP';

  private readonly cache: ProviderCache;
  private readonly TREND_CACHE_TTL_SECONDS = 6 * 60 * 60; // 6-hour TTL

  constructor(
    private readonly mcpExecutor: McpExecutor,
    private readonly connectionManager?: McpConnectionManager,
    cache?: ProviderCache,
  ) {
    this.cache = cache || new RedisProviderCache();
  }

  async checkHealth(): Promise<ProviderHealth> {
    if (!this.connectionManager) {
      return {
        providerId: this.providerId,
        status: 'UNKNOWN',
        lastCheckedAt: new Date().toISOString(),
      };
    }
    return this.connectionManager.checkHealth(this.providerId);
  }

  private toCountry(marketplace?: string): string {
    if (!marketplace) return 'US';
    const upper = marketplace.toUpperCase();
    if (upper.includes('US')) return 'US';
    if (upper.includes('UK') || upper.includes('GB')) return 'UK';
    if (upper.includes('DE')) return 'DE';
    if (upper.includes('JP')) return 'JP';
    if (upper.includes('CA')) return 'CA';
    if (upper.includes('FR')) return 'FR';
    if (upper.includes('IT')) return 'IT';
    if (upper.includes('ES')) return 'ES';
    return 'US';
  }

  async execute(
    capabilityId: string,
    binding: CapabilityBinding,
    input: any,
    context: ProviderExecutionContext,
  ): Promise<ProviderExecutionResult<any>> {
    // Dispatch composite capability: market.product.search
    if (capabilityId === 'market.product.search') {
      return this.executeCompositeProductSearch(input, context, binding);
    }

    // Dispatch composite capability: market.product.trend
    if (capabilityId === 'market.product.trend') {
      return this.executeCompositeProductTrend(input, context, binding);
    }

    // Dispatch capability: review.product.health (and compatibility alias: voc.product.analyze)
    if (capabilityId === 'review.product.health' || capabilityId === 'voc.product.analyze') {
      return this.executeReviewProductHealth(input, context, binding, capabilityId);
    }

    const startTime = Date.now();
    const remoteToolName = binding.remoteToolName || 'xydc_generic_query';
    const marketplace = context.marketplace || 'AMAZON_US';

    try {
      // 1. Prepare vendor-specific payload arguments
      let remoteArgs = input;
      if (remoteToolName === 'get_asin_info') {
        const asin = input?.asin || (Array.isArray(input?.asins) ? input.asins[0] : input);
        remoteArgs = {
          asins: Array.isArray(input?.asins) ? input.asins : [asin],
          country: this.toCountry(input?.marketplace || marketplace),
          intent_summary: `Query product details for ASIN ${asin}`,
          user_task: `CrossPilot market intelligence query for ASIN ${asin}`,
        };
      } else if (remoteToolName === 'get_keyword_info') {
        const kw =
          input?.keyword ||
          input?.searchTerm ||
          (Array.isArray(input?.keywords) ? input.keywords[0] : input);
        remoteArgs = {
          keywords: Array.isArray(input?.keywords) ? input.keywords : [kw],
          country: this.toCountry(input?.marketplace || marketplace),
          intent_summary: `Query market metrics for keyword ${kw}`,
          user_task: `CrossPilot keyword research for ${kw}`,
        };
      }

      // 2. Invoke remote MCP tool
      const { result, durationMs } = await this.mcpExecutor.executeRemoteTool(
        this.providerId,
        remoteToolName,
        remoteArgs,
      );

      // 3. Extract raw payload from MCP tool call result
      const rawPayload =
        result.structuredContent ||
        result.raw ||
        result.content?.[0]?.data ||
        result.content?.[0]?.text;
      let rawParsed = rawPayload;
      if (typeof rawPayload === 'string') {
        try {
          rawParsed = JSON.parse(rawPayload);
        } catch {
          rawParsed = { text: rawPayload };
        }
      }

      // 4. Validate remote business response
      if (rawParsed?.data?.error === true || (rawParsed?.status && rawParsed.status >= 400)) {
        return {
          success: false,
          error: {
            code: 'PROVIDER_EXECUTION_ERROR',
            message:
              rawParsed?.data?.message ||
              `XYDC remote execution error: ${rawParsed?.data?.reason || rawParsed?.status}`,
            retryable: false,
            details: rawParsed,
          },
          providerId: this.providerId,
          transport: 'MCP',
          remoteToolName,
          capabilityId,
          durationMs: durationMs || Date.now() - startTime,
          mode: 'DEGRADED',
          capturedAt: new Date().toISOString(),
        };
      }

      // 5. Map to CrossPilot Normalized Contracts
      let normalizedData: any;
      switch (capabilityId) {
        case 'market.product.detail': {
          const entities = rawParsed?.data?.entities || rawParsed?.entities;
          if (Array.isArray(entities) && entities.length > 0) {
            normalizedData = XydcMapper.toMarketProductFromEntity(entities[0], marketplace);
          } else if (rawParsed?.asin) {
            normalizedData = XydcMapper.toMarketProductFromEntity(rawParsed, marketplace);
          } else {
            normalizedData = XydcMapper.toMarketProduct(rawParsed?.product || rawParsed, marketplace);
          }
          break;
        }

        case 'market.product.search':
          normalizedData = XydcMapper.toMarketProducts(
            Array.isArray(rawParsed) ? rawParsed : rawParsed?.products || rawParsed?.items || [],
            marketplace,
          );
          break;

        case 'market.market.overview':
          normalizedData = XydcMapper.toMarketOverview(
            rawParsed?.overview || rawParsed,
            marketplace,
            'LIVE',
          );
          break;

        case 'market.keyword.search': {
          const list =
            rawParsed?.data?.list ||
            rawParsed?.list ||
            (Array.isArray(rawParsed) ? rawParsed : rawParsed?.keywords || [rawParsed]);
          let mapped = XydcMapper.toKeywordMetrics(list, marketplace);
          if (input?.limit && Array.isArray(mapped)) {
            mapped = mapped.slice(0, input.limit);
          }
          normalizedData = mapped;
          break;
        }

        case 'market.product.trend':
          normalizedData = XydcMapper.toMarketTrend(rawParsed?.trend || rawParsed, marketplace);
          break;

        default:
          normalizedData = rawParsed;
      }

      return {
        success: true,
        data: normalizedData,
        providerId: this.providerId,
        transport: 'MCP',
        remoteToolName,
        capabilityId,
        durationMs: durationMs || Date.now() - startTime,
        mode: 'LIVE',
        capturedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        success: false,
        error: {
          code: err.code || 'PROVIDER_EXECUTION_ERROR',
          message: err.message || `Failed executing remote tool ${remoteToolName}`,
          retryable: err.retryable !== undefined ? err.retryable : true,
          details: err.details,
        },
        providerId: this.providerId,
        transport: 'MCP',
        remoteToolName,
        capabilityId,
        durationMs: Date.now() - startTime,
        mode: 'DEGRADED',
        capturedAt: new Date().toISOString(),
      };
    }
  }

  private async executeCompositeProductSearch(
    input: any,
    context: ProviderExecutionContext,
    binding: CapabilityBinding,
  ): Promise<ProviderExecutionResult<CompositeProductSearchResult>> {
    const startTime = Date.now();
    const marketplace = input?.marketplace || context.marketplace || 'AMAZON_US';
    const country = this.toCountry(marketplace);
    const keyword = (input?.keyword || input?.searchTerm || '').trim();
    const limit = Math.max(1, Math.min(input?.limit || 3, 10));

    if (!keyword) {
      return {
        success: false,
        error: {
          code: 'INVALID_ARGUMENTS',
          message: 'Keyword is required for market.product.search',
          retryable: false,
        },
        providerId: this.providerId,
        transport: 'MCP',
        remoteToolName: 'get_keyword_info+get_asin_info',
        capabilityId: 'market.product.search',
        durationMs: Date.now() - startTime,
        mode: 'DEGRADED',
        capturedAt: new Date().toISOString(),
      };
    }

    const compositeSteps: CompositeTraceStep[] = [];
    const evidences: ResearchEvidence[] = [];

    // ==========================================
    // STEP 1: Invoke get_keyword_info
    // ==========================================
    const step1Start = Date.now();
    let kwRawParsed: any = null;
    let step1Duration = 0;

    try {
      const step1Args = {
        keywords: [keyword],
        country,
        intent_summary: `Search products and extract top ASINs for keyword ${keyword}`,
        user_task: `CrossPilot composite market product search for ${keyword}`,
      };

      const { result, durationMs } = await this.mcpExecutor.executeRemoteTool(
        this.providerId,
        'get_keyword_info',
        step1Args,
      );
      step1Duration = durationMs || Date.now() - step1Start;

      const rawPayload =
        result.structuredContent ||
        result.raw ||
        result.content?.[0]?.data ||
        result.content?.[0]?.text;
      kwRawParsed = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;

      if (kwRawParsed?.data?.error === true || (kwRawParsed?.status && kwRawParsed.status >= 400)) {
        throw new Error(
          kwRawParsed?.data?.message ||
            `XYDC get_keyword_info error: ${kwRawParsed?.data?.reason || kwRawParsed?.status}`,
        );
      }

      const kwCredits = kwRawParsed?.cost_credits ?? 1;
      compositeSteps.push({
        step: 'get_keyword_info',
        toolName: 'get_keyword_info',
        durationMs: step1Duration,
        credits: kwCredits,
        success: true,
      });
    } catch (err: any) {
      step1Duration = Date.now() - step1Start;
      compositeSteps.push({
        step: 'get_keyword_info',
        toolName: 'get_keyword_info',
        durationMs: step1Duration,
        credits: 0,
        success: false,
        error: err.message || 'Failed get_keyword_info',
      });

      // Step 1 failure causes entire composite capability to fail -> Fallback to Mock!
      return {
        success: false,
        error: {
          code: 'PROVIDER_EXECUTION_ERROR',
          message: `Composite step 1 (get_keyword_info) failed: ${err.message}`,
          retryable: false,
          details: err,
        },
        providerId: this.providerId,
        transport: 'MCP',
        remoteToolName: 'get_keyword_info',
        capabilityId: 'market.product.search',
        durationMs: Date.now() - startTime,
        mode: 'DEGRADED',
        compositeTrace: {
          steps: compositeSteps,
          totalDurationMs: Date.now() - startTime,
          totalCredits: 0,
        },
        capturedAt: new Date().toISOString(),
      };
    }

    // Extract keyword metrics & Top ASINs
    const termEntity =
      kwRawParsed?.data?.list?.[0] ||
      kwRawParsed?.list?.[0] ||
      (Array.isArray(kwRawParsed?.data) ? kwRawParsed.data[0] : kwRawParsed?.data);

    const keywordMetric: KeywordMetric | null = termEntity
      ? XydcMapper.toKeywordMetricFromEntity(termEntity)
      : null;

    if (keywordMetric) {
      evidences.push({
        evidenceId: `evi_kw_${encodeURIComponent(keyword)}_${Date.now()}`,
        source: 'XYDC',
        providerId: this.providerId,
        transport: 'MCP',
        mode: 'LIVE',
        type: 'KEYWORD',
        sourceId: keyword,
        title: `Keyword Intelligence: ${keyword}`,
        content: `Keyword: ${keyword} | Search Volume: ${keywordMetric.searchVolume != null ? keywordMetric.searchVolume.toLocaleString() : '—'} | ABA Rank: ${keywordMetric.abaRank != null ? '#' + keywordMetric.abaRank.toLocaleString() : '—'} | CPC: ${keywordMetric.cpc != null ? '$' + keywordMetric.cpc.toFixed(2) : '—'} | Competition: ${keywordMetric.competition != null ? keywordMetric.competition.toFixed(2) : '—'}`,
        capturedAt: new Date().toISOString(),
        costCredits: kwRawParsed?.cost_credits ?? 1,
        executionTimeMs: step1Duration,
        confidenceScore: 0.98,
      });
    }

    // Extract, deduplicate, filter empty ASINs
    const rawTopAsins: string[] = Array.isArray(termEntity?.abaReport?.topAsins)
      ? termEntity.abaReport.topAsins.map((t: any) => t.asin)
      : [];
    const uniqueTopAsins = Array.from(new Set(rawTopAsins.map((a: string) => (a || '').trim())))
      .filter((a: string) => a.length >= 8 && a.length <= 12)
      .slice(0, limit);

    // If no top ASINs found, return immediately without faking products
    if (uniqueTopAsins.length === 0) {
      evidences.push({
        evidenceId: `evi_no_asin_${Date.now()}`,
        source: 'XYDC',
        providerId: this.providerId,
        transport: 'MCP',
        mode: 'LIVE',
        type: 'MARKET_PRODUCT',
        sourceId: keyword,
        title: `No Top ASINs Found: ${keyword}`,
        content: `NO_TOP_ASIN_FOUND: get_keyword_info returned 0 top ASINs in ABA report for '${keyword}'.`,
        capturedAt: new Date().toISOString(),
        confidenceScore: 1.0,
      });

      const totalKwCredits = kwRawParsed?.cost_credits ?? 1;
      return {
        success: true,
        data: {
          query: { keyword, marketplace },
          keywordMetric,
          products: [],
          evidence: evidences,
          provider: { providerId: this.providerId, transport: 'MCP', mode: 'LIVE' },
        },
        providerId: this.providerId,
        transport: 'MCP',
        remoteToolName: 'get_keyword_info',
        capabilityId: 'market.product.search',
        durationMs: step1Duration,
        mode: 'LIVE',
        credits: totalKwCredits,
        compositeTrace: {
          steps: compositeSteps,
          totalDurationMs: step1Duration,
          totalCredits: totalKwCredits,
        },
        capturedAt: new Date().toISOString(),
      };
    }

    // ==========================================
    // STEP 2: Batch invoke get_asin_info
    // ==========================================
    const step2Start = Date.now();
    let asinRawParsed: any = null;
    let step2Duration = 0;

    try {
      const step2Args = {
        asins: uniqueTopAsins, // Single batch request!
        country,
        intent_summary: `Batch query details for top ASINs: ${uniqueTopAsins.join(', ')}`,
        user_task: `CrossPilot composite product detail extraction for ${keyword}`,
      };

      const { result, durationMs } = await this.mcpExecutor.executeRemoteTool(
        this.providerId,
        'get_asin_info',
        step2Args,
      );
      step2Duration = durationMs || Date.now() - step2Start;

      const rawPayload =
        result.structuredContent ||
        result.raw ||
        result.content?.[0]?.data ||
        result.content?.[0]?.text;
      asinRawParsed = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;

      if (
        asinRawParsed?.data?.error === true ||
        (asinRawParsed?.status && asinRawParsed.status >= 400)
      ) {
        throw new Error(
          asinRawParsed?.data?.message ||
            `XYDC get_asin_info batch error: ${asinRawParsed?.data?.reason || asinRawParsed?.status}`,
        );
      }
    } catch (err: any) {
      step2Duration = Date.now() - step2Start;
      compositeSteps.push({
        step: 'get_asin_info',
        toolName: 'get_asin_info',
        durationMs: step2Duration,
        credits: 0,
        success: false,
        error: err.message || 'Failed get_asin_info batch',
      });

      // Failure Semantics Scene B: get_keyword_info success, get_asin_info failed.
      // Mode is DEGRADED, but keyword data & evidence are preserved!
      const totalCredits = kwRawParsed?.cost_credits ?? 1;
      const totalDuration = step1Duration + step2Duration;

      return {
        success: true,
        data: {
          query: { keyword, marketplace },
          keywordMetric,
          products: [],
          evidence: evidences,
          provider: { providerId: this.providerId, transport: 'MCP', mode: 'DEGRADED' },
        },
        providerId: this.providerId,
        transport: 'MCP',
        remoteToolName: 'get_keyword_info+get_asin_info',
        capabilityId: 'market.product.search',
        durationMs: totalDuration,
        mode: 'DEGRADED',
        credits: totalCredits,
        compositeTrace: {
          steps: compositeSteps,
          totalDurationMs: totalDuration,
          totalCredits,
        },
        metadata: {
          step2Failed: true,
          error: err.message,
        },
        capturedAt: new Date().toISOString(),
      };
    }

    // Step 2 Success: Parse entities and map to MarketProduct
    const entities: XydcProductEntity[] =
      asinRawParsed?.data?.entities || asinRawParsed?.entities || [];
    const asinCredits = asinRawParsed?.cost_credits ?? uniqueTopAsins.length;

    compositeSteps.push({
      step: 'get_asin_info',
      toolName: 'get_asin_info',
      durationMs: step2Duration,
      credits: asinCredits,
      success: true,
      itemCount: entities.length,
    });

    const products = XydcMapper.toMarketProductsFromEntities(entities, marketplace);

    for (const prod of products) {
      evidences.push(
        XydcMapper.toProductEvidence(prod, {
          providerId: this.providerId,
          transport: 'MCP',
          mode: 'LIVE',
          executionTimeMs: step2Duration,
        }),
      );
    }

    const totalDuration = step1Duration + step2Duration;
    const totalCredits = (kwRawParsed?.cost_credits ?? 1) + asinCredits;
    const partialFailure = entities.length < uniqueTopAsins.length;

    return {
      success: true,
      data: {
        query: { keyword, marketplace },
        keywordMetric,
        products,
        evidence: evidences,
        provider: {
          providerId: this.providerId,
          transport: 'MCP',
          mode: 'LIVE',
        },
      },
      providerId: this.providerId,
      transport: 'MCP',
      remoteToolName: 'get_keyword_info+get_asin_info',
      capabilityId: 'market.product.search',
      durationMs: totalDuration,
      mode: 'LIVE',
      credits: totalCredits,
      compositeTrace: {
        steps: compositeSteps,
        totalDurationMs: totalDuration,
        totalCredits,
      },
      metadata: {
        partialFailure,
        topAsinsRequested: uniqueTopAsins.length,
        productsReturned: products.length,
      },
      capturedAt: new Date().toISOString(),
    };
  }

  /**
   * Phase 4: Composite Trend Execution (market.product.trend)
   * Dispatches get_asin_bsr_trends + get_asin_info_trends in parallel based on requested metric.
   * Performs 100% code-based deterministic metric and directional computation.
   * Employs memory caching with 6-hour TTL to eliminate redundant billing.
   */
  private async executeCompositeProductTrend(
    input: any,
    context: ProviderExecutionContext,
    binding: CapabilityBinding,
  ): Promise<ProviderExecutionResult<any>> {
    const startTime = Date.now();
    const marketplace = context.marketplace || input?.marketplace || 'AMAZON_US';
    const country = this.toCountry(marketplace);
    const asin = (input?.asin || '').trim();

    if (!asin) {
      return {
        success: false,
        error: {
          code: 'INVALID_ARGUMENTS',
          message: 'Missing required parameter: asin for market.product.trend',
          retryable: false,
        },
        providerId: this.providerId,
        transport: 'MCP',
        remoteToolName: 'get_asin_bsr_trends+get_asin_info_trends',
        capabilityId: 'market.product.trend',
        durationMs: Date.now() - startTime,
        mode: 'DEGRADED',
        capturedAt: new Date().toISOString(),
      };
    }

    const requestedMetric = (input?.metric || 'ALL').toUpperCase();
    const range = (input?.range || '30d').toLowerCase();

    // Date calculations
    const now = new Date();
    const endDateStr = input?.endDate || now.toISOString().split('T')[0];
    let days = 30;
    if (range === '90d') days = 90;
    else if (range === '180d') days = 180;
    else if (range === '365d') days = 365;
    else if (range === '30d') days = 30;
    else if (range.endsWith('d')) {
      const parsedDays = parseInt(range, 10);
      if (!isNaN(parsedDays) && parsedDays > 0) days = parsedDays;
    }
    const startDateObj = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const startDateStr = input?.startDate || startDateObj.toISOString().split('T')[0];

    // Check ProviderCache (Redis / In-memory fallback)
    const cacheKey = buildProviderCacheKey({
      providerId: this.providerId,
      capabilityId: 'market.product.trend',
      marketplace,
      subject: asin,
      parameters: `${days}d:${requestedMetric}`,
      version: 'v1',
    });

    if (!input?.skipCache) {
      const cached = await this.cache.get<
        CachedProviderPayload<{
          trends: MarketTrend[];
          categoryTree?: any[];
          dateRangeNotice?: string;
        }>
      >(cacheKey);

      if (cached && cached.data) {
        const evidence = XydcMapper.toTrendEvidence(
          asin,
          cached.data.trends,
          0,
          'CACHED',
          cached.data.categoryTree,
        );
        return {
          success: true,
          data: cached.data.trends,
          providerId: this.providerId,
          transport: 'MCP',
          remoteToolName: 'get_asin_bsr_trends+get_asin_info_trends',
          capabilityId: 'market.product.trend',
          durationMs: Date.now() - startTime,
          mode: 'CACHED',
          credits: 0,
          compositeTrace: {
            steps: [],
            totalDurationMs: Date.now() - startTime,
            totalCredits: 0,
          },
          capturedAt: cached.capturedAt,
          metadata: {
            cacheHit: true,
            cachedAt: cached.capturedAt,
            expiresAt: cached.expiresAt,
            categoryTree: cached.data.categoryTree,
            dateRangeNotice: cached.data.dateRangeNotice,
            evidence: [evidence],
          },
        };
      }
    }

    // Determine sub-tools to invoke
    const needBsr =
      requestedMetric === 'ALL' || requestedMetric === 'BSR' || requestedMetric === 'SALES';
    const needInfo =
      requestedMetric === 'ALL' ||
      requestedMetric === 'PRICE' ||
      requestedMetric === 'RATING' ||
      requestedMetric === 'REVIEW_COUNT';

    const compositeSteps: CompositeTraceStep[] = [];
    let bsrRaw: any = null;
    let infoRaw: any = null;
    let totalCredits = 0;

    try {
      const toolPromises: Promise<any>[] = [];

      if (needBsr) {
        const bsrStart = Date.now();
        toolPromises.push(
          this.mcpExecutor
            .executeRemoteTool(this.providerId, 'get_asin_bsr_trends', {
              asin,
              country,
              start_date: startDateStr,
              end_date: endDateStr,
              intent_summary: `Query BSR rank history for ASIN ${asin}`,
              user_task: `CrossPilot market trend query for ASIN ${asin}`,
            })
            .then((res) => {
              const bsrDuration = Date.now() - bsrStart;
              const rawPayload =
                res.result?.structuredContent ||
                res.result?.raw ||
                res.result?.content?.[0]?.data ||
                res.result?.content?.[0]?.text;
              const parsed = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
              const credits = parsed?.cost_credits ?? (days > 10 ? 4 : 1);
              totalCredits += credits;
              compositeSteps.push({
                step: String(compositeSteps.length + 1),
                toolName: 'get_asin_bsr_trends',
                durationMs: bsrDuration,
                credits,
                success: !parsed?.data?.error,
                itemCount: parsed?.data?.trends?.length || 0,
              });
              bsrRaw = parsed;
            })
            .catch((err) => {
              compositeSteps.push({
                step: String(compositeSteps.length + 1),
                toolName: 'get_asin_bsr_trends',
                durationMs: Date.now() - bsrStart,
                credits: 0,
                success: false,
                error: err.message,
              });
            }),
        );
      }

      if (needInfo) {
        const infoStart = Date.now();
        toolPromises.push(
          this.mcpExecutor
            .executeRemoteTool(this.providerId, 'get_asin_info_trends', {
              asin,
              country,
              start_date: startDateStr,
              end_date: endDateStr,
              intent_summary: `Query price and rating history for ASIN ${asin}`,
              user_task: `CrossPilot price/rating trend query for ASIN ${asin}`,
            })
            .then((res) => {
              const infoDuration = Date.now() - infoStart;
              const rawPayload =
                res.result?.structuredContent ||
                res.result?.raw ||
                res.result?.content?.[0]?.data ||
                res.result?.content?.[0]?.text;
              const parsed = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
              const credits = parsed?.cost_credits ?? (days > 10 ? 3 : 1);
              totalCredits += credits;
              compositeSteps.push({
                step: String(compositeSteps.length + 1),
                toolName: 'get_asin_info_trends',
                durationMs: infoDuration,
                credits,
                success: !parsed?.data?.error,
                itemCount: parsed?.data?.trends?.length || 0,
              });
              infoRaw = parsed;
            })
            .catch((err) => {
              compositeSteps.push({
                step: String(compositeSteps.length + 1),
                toolName: 'get_asin_info_trends',
                durationMs: Date.now() - infoStart,
                credits: 0,
                success: false,
                error: err.message,
              });
            }),
        );
      }

      await Promise.all(toolPromises);
    } catch (err: any) {
      // Fallback: Check last successful Redis cache
      const staleCached = await this.cache.get<
        CachedProviderPayload<{
          trends: MarketTrend[];
          categoryTree?: any[];
          dateRangeNotice?: string;
        }>
      >(cacheKey);
      if (staleCached && staleCached.data) {
        const evidence = XydcMapper.toTrendEvidence(
          asin,
          staleCached.data.trends,
          0,
          'CACHED',
          staleCached.data.categoryTree,
        );
        return {
          success: true,
          data: staleCached.data.trends,
          providerId: this.providerId,
          transport: 'MCP',
          remoteToolName: 'get_asin_bsr_trends+get_asin_info_trends',
          capabilityId: 'market.product.trend',
          durationMs: Date.now() - startTime,
          mode: 'CACHED',
          credits: 0,
          capturedAt: staleCached.capturedAt,
          metadata: {
            cacheHit: true,
            servedFromStaleCacheOnFailure: true,
            cachedAt: staleCached.capturedAt,
            categoryTree: staleCached.data.categoryTree,
            dateRangeNotice: staleCached.data.dateRangeNotice,
            evidence: [evidence],
          },
        };
      }

      return {
        success: false,
        error: {
          code: 'PROVIDER_EXECUTION_ERROR',
          message: `Trend query failed: ${err.message}`,
          retryable: false,
          details: err,
        },
        providerId: this.providerId,
        transport: 'MCP',
        remoteToolName: 'get_asin_bsr_trends+get_asin_info_trends',
        capabilityId: 'market.product.trend',
        durationMs: Date.now() - startTime,
        mode: 'DEGRADED',
        capturedAt: new Date().toISOString(),
      };
    }

    // Map trends
    const trends: MarketTrend[] = [];
    let categoryTree: any[] | undefined;
    let dateRangeNotice: string | undefined;

    if (bsrRaw?.data && !bsrRaw.data.error) {
      categoryTree = bsrRaw.data.categoryTree;
      dateRangeNotice = bsrRaw.data.dateRangeNotice;
      if (needBsr) {
        const bsrTrend = XydcMapper.toBsrTrend(bsrRaw.data, marketplace, asin);
        trends.push(bsrTrend);
      }
    }

    if (infoRaw?.data && !infoRaw.data.error) {
      dateRangeNotice = dateRangeNotice || infoRaw.data.dateRangeNotice;
      if (requestedMetric === 'ALL' || requestedMetric === 'PRICE') {
        trends.push(XydcMapper.toPriceTrend(infoRaw.data, marketplace, asin));
      }
      if (requestedMetric === 'ALL' || requestedMetric === 'RATING') {
        trends.push(XydcMapper.toRatingTrend(infoRaw.data, marketplace, asin));
      }
      if (requestedMetric === 'ALL' || requestedMetric === 'REVIEW_COUNT') {
        trends.push(XydcMapper.toReviewCountTrend(infoRaw.data, marketplace, asin));
      }
    }

    // If both failed or returned 0 trends, fallback to Mock!
    if (trends.length === 0) {
      return {
        success: false,
        error: {
          code: 'PROVIDER_EMPTY_DATA',
          message: `No trend data available for ASIN ${asin} in ${marketplace}`,
          retryable: false,
        },
        providerId: this.providerId,
        transport: 'MCP',
        remoteToolName: 'get_asin_bsr_trends+get_asin_info_trends',
        capabilityId: 'market.product.trend',
        durationMs: Date.now() - startTime,
        mode: 'DEGRADED',
        capturedAt: new Date().toISOString(),
      };
    }

    // Cache successful trends in ProviderCache (Redis / In-Memory fallback)
    const ttlSeconds = this.TREND_CACHE_TTL_SECONDS;
    const cachePayload: CachedProviderPayload<{
      trends: MarketTrend[];
      categoryTree?: any[];
      dateRangeNotice?: string;
    }> = {
      data: {
        trends,
        categoryTree,
        dateRangeNotice,
      },
      providerId: this.providerId,
      source: 'PROVIDER_CACHE',
      capturedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      schemaVersion: 'v1',
    };
    await this.cache.set(cacheKey, cachePayload, ttlSeconds);

    const evidence = XydcMapper.toTrendEvidence(asin, trends, totalCredits, 'LIVE', categoryTree);

    return {
      success: true,
      data: trends,
      providerId: this.providerId,
      transport: 'MCP',
      remoteToolName: 'get_asin_bsr_trends+get_asin_info_trends',
      capabilityId: 'market.product.trend',
      durationMs: Date.now() - startTime,
      mode: 'LIVE',
      compositeTrace: {
        steps: compositeSteps,
        totalDurationMs: Date.now() - startTime,
        totalCredits,
      },
      capturedAt: new Date().toISOString(),
      metadata: {
        asin,
        range,
        days,
        categoryTree,
        dateRangeNotice,
        totalCredits,
        evidence: [evidence],
      },
    };
  }

  /**
   * Phase 5.1: Review Health & Rating Execution (review.product.health)
   * Resolves product rating & review volume from get_asin_info (1 Credit).
   * Caches in RedisProviderCache (6-hour TTL).
   * Standard Cache Key:
   * provider:xydc:review.product.health:{marketplace}:{asin}:default:v1
   * (or provider:xydc:voc.product.analyze:{marketplace}:{asin}:default:v1 when invoked via alias)
   * Strictly respects factual vs. observation boundaries.
   */
  private async executeReviewProductHealth(
    input: any,
    context: ProviderExecutionContext,
    _binding: CapabilityBinding,
    capabilityId: string = 'review.product.health',
  ): Promise<ProviderExecutionResult<any>> {
    const startTime = Date.now();
    const marketplace = context.marketplace || input?.marketplace || 'AMAZON_US';
    const country = this.toCountry(marketplace);
    const asin = (input?.asin || '').trim();

    if (!asin) {
      return {
        success: false,
        error: {
          code: 'INVALID_ARGUMENTS',
          message: `Missing required parameter: asin for ${capabilityId}`,
          retryable: false,
        },
        providerId: this.providerId,
        transport: 'MCP',
        remoteToolName: 'get_asin_info',
        capabilityId,
        durationMs: Date.now() - startTime,
        mode: 'DEGRADED',
        capturedAt: new Date().toISOString(),
      };
    }

    const cacheKey = buildProviderCacheKey({
      providerId: this.providerId,
      capabilityId,
      marketplace,
      subject: asin,
      parameters: 'default',
      version: 'v1',
    });

    // 1. Check Redis / Memory cache
    if (!input?.skipCache) {
      const cached = await this.cache.get<CachedProviderPayload<any>>(cacheKey);
      if (cached && cached.data) {
        const evidence =
          capabilityId === 'voc.product.analyze'
            ? XydcMapper.toVocEvidence(asin, cached.data, 0, 'CACHED')
            : XydcMapper.toReviewMetricEvidence(asin, cached.data, 0, 'CACHED');

        return {
          success: true,
          data: {
            ...cached.data,
            evidence: [evidence],
          },
          providerId: this.providerId,
          transport: 'MCP',
          remoteToolName: 'get_asin_info',
          capabilityId,
          durationMs: Date.now() - startTime,
          mode: 'CACHED',
          credits: 0,
          capturedAt: cached.capturedAt,
          metadata: {
            cacheHit: true,
            cachedAt: cached.capturedAt,
            expiresAt: cached.expiresAt,
            evidence: [evidence],
          },
        };
      }
    }

    // 2. Invoke remote MCP tool: get_asin_info (1 credit)
    try {
      const { result, durationMs } = await this.mcpExecutor.executeRemoteTool(
        this.providerId,
        'get_asin_info',
        {
          asins: [asin],
          country,
          intent_summary: `Query rating and review count for ASIN ${asin}`,
          user_task: `CrossPilot review health analysis for ASIN ${asin}`,
        },
      );

      const rawPayload =
        result.structuredContent ||
        result.raw ||
        result.content?.[0]?.data ||
        result.content?.[0]?.text;
      const parsed = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;

      if (parsed?.data?.error === true || (parsed?.status && parsed.status >= 400)) {
        // Check stale cache fallback
        const staleCached = await this.cache.get<CachedProviderPayload<any>>(cacheKey);
        if (staleCached && staleCached.data) {
          const evidence =
            capabilityId === 'voc.product.analyze'
              ? XydcMapper.toVocEvidence(asin, staleCached.data, 0, 'CACHED')
              : XydcMapper.toReviewMetricEvidence(asin, staleCached.data, 0, 'CACHED');
          return {
            success: true,
            data: { ...staleCached.data, evidence: [evidence] },
            providerId: this.providerId,
            transport: 'MCP',
            remoteToolName: 'get_asin_info',
            capabilityId,
            durationMs: Date.now() - startTime,
            mode: 'CACHED',
            credits: 0,
            capturedAt: staleCached.capturedAt,
            metadata: {
              cacheHit: true,
              servedFromStaleCacheOnFailure: true,
              evidence: [evidence],
            },
          };
        }

        return {
          success: false,
          error: {
            code: 'PROVIDER_EXECUTION_ERROR',
            message: parsed?.data?.message || `XYDC error querying ASIN info for ${capabilityId}`,
            retryable: false,
            details: parsed,
          },
          providerId: this.providerId,
          transport: 'MCP',
          remoteToolName: 'get_asin_info',
          capabilityId,
          durationMs: durationMs || Date.now() - startTime,
          mode: 'DEGRADED',
          capturedAt: new Date().toISOString(),
        };
      }

      const entity: XydcProductEntity | undefined =
        parsed?.data?.entities?.[0] || parsed?.entities?.[0];
      const credits = parsed?.cost_credits ?? 1;

      let normalizedResult: any;
      let evidence: ResearchEvidence;

      if (capabilityId === 'voc.product.analyze') {
        const vocResult = XydcMapper.toVocAnalysisResult(asin, marketplace, entity);
        evidence = XydcMapper.toVocEvidence(asin, vocResult, credits, 'LIVE');
        vocResult.evidence = [evidence];
        normalizedResult = vocResult;
      } else {
        const healthResult = XydcMapper.toReviewHealthResult(asin, marketplace, entity);
        evidence = XydcMapper.toReviewMetricEvidence(asin, healthResult, credits, 'LIVE');
        healthResult.evidence = [evidence];
        normalizedResult = healthResult;
      }

      // Save to cache
      const ttlSeconds = this.TREND_CACHE_TTL_SECONDS;
      const cachePayload: CachedProviderPayload<any> = {
        data: normalizedResult,
        providerId: this.providerId,
        source: 'PROVIDER_CACHE',
        capturedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
        schemaVersion: 'v1',
      };
      await this.cache.set(cacheKey, cachePayload, ttlSeconds);

      return {
        success: true,
        data: normalizedResult,
        providerId: this.providerId,
        transport: 'MCP',
        remoteToolName: 'get_asin_info',
        capabilityId,
        durationMs: Date.now() - startTime,
        mode: 'LIVE',
        credits,
        capturedAt: new Date().toISOString(),
        metadata: {
          asin,
          marketplace,
          totalCredits: credits,
          evidence: [evidence],
        },
      };
    } catch (err: any) {
      // Check stale cache
      const staleCached = await this.cache.get<CachedProviderPayload<any>>(cacheKey);
      if (staleCached && staleCached.data) {
        const evidence =
          capabilityId === 'voc.product.analyze'
            ? XydcMapper.toVocEvidence(asin, staleCached.data, 0, 'CACHED')
            : XydcMapper.toReviewMetricEvidence(asin, staleCached.data, 0, 'CACHED');
        return {
          success: true,
          data: { ...staleCached.data, evidence: [evidence] },
          providerId: this.providerId,
          transport: 'MCP',
          remoteToolName: 'get_asin_info',
          capabilityId,
          durationMs: Date.now() - startTime,
          mode: 'CACHED',
          credits: 0,
          capturedAt: staleCached.capturedAt,
          metadata: {
            cacheHit: true,
            servedFromStaleCacheOnFailure: true,
            evidence: [evidence],
          },
        };
      }

      return {
        success: false,
        error: {
          code: 'PROVIDER_EXECUTION_ERROR',
          message: `${capabilityId} failed: ${err.message}`,
          retryable: false,
          details: err,
        },
        providerId: this.providerId,
        transport: 'MCP',
        remoteToolName: 'get_asin_info',
        capabilityId,
        durationMs: Date.now() - startTime,
        mode: 'DEGRADED',
        capturedAt: new Date().toISOString(),
      };
    }
  }
}

