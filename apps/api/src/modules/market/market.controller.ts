import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { MarketService } from './market.service.js';
import { CurrentWorkspace } from '../../common/decorators/current-workspace.decorator.js';
import type {
  ProductCandidate,
  ProductDiscoveryRequest,
  CandidateDraft,
  EvidenceItem,
  CandidateEnrichmentRequest,
  CandidateEnrichmentRun,
  ProductSpecification,
  SupplierQuote,
  ResearchAnalyticsEvent,
} from '@crosspilot/shared';

@Controller()
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Get('market-research/snapshot')
  getMarketSnapshot(
    @CurrentWorkspace() workspaceId: string,
    @Query('keyword') keyword?: string,
    @Query('marketplace') marketplace?: string,
  ) {
    return this.marketService.getMarketSnapshot(workspaceId, keyword, marketplace);
  }

  @Get('market-research/products')
  searchProducts(
    @CurrentWorkspace() workspaceId: string,
    @Query('keyword') keyword: string,
    @Query('category') category?: string,
    @Query('marketplace') marketplace?: string,
    @Query('limit') limit?: number,
  ) {
    return this.marketService.searchProducts(
      workspaceId,
      keyword,
      category,
      marketplace,
      limit ? Number(limit) : 20,
    );
  }

  @Get('market-research/products/:asin')
  getProductDetail(
    @CurrentWorkspace() workspaceId: string,
    @Param('asin') asin: string,
    @Query('marketplace') marketplace?: string,
  ) {
    return this.marketService.getProductDetail(workspaceId, asin, marketplace);
  }

  @Get('market-research/keywords')
  searchKeywords(
    @CurrentWorkspace() workspaceId: string,
    @Query('keyword') keyword: string,
    @Query('marketplace') marketplace?: string,
    @Query('limit') limit?: number,
  ) {
    return this.marketService.searchKeywords(
      workspaceId,
      keyword,
      marketplace,
      limit ? Number(limit) : 20,
    );
  }

  @Get('market-research/trend')
  getProductTrend(
    @CurrentWorkspace() workspaceId: string,
    @Query('asin') asin: string,
    @Query('metric') metric?: string,
    @Query('range') range?: string,
    @Query('marketplace') marketplace?: string,
  ) {
    return this.marketService.getProductTrend(workspaceId, asin, metric, range, marketplace);
  }

  @Get('market-research/review-health')
  getProductReviewHealth(
    @CurrentWorkspace() workspaceId: string,
    @Query('asin') asin: string,
    @Query('marketplace') marketplace?: string,
    @Query('skipCache') skipCache?: string,
  ) {
    return this.marketService.getProductReviewHealth(
      workspaceId,
      asin,
      marketplace,
      skipCache === 'true',
    );
  }

  @Get('market-research/voc')
  getProductVoc(
    @CurrentWorkspace() workspaceId: string,
    @Query('asin') asin: string,
    @Query('marketplace') marketplace?: string,
    @Query('skipCache') skipCache?: string,
  ) {
    return this.marketService.getProductVoc(
      workspaceId,
      asin,
      marketplace,
      skipCache === 'true',
    );
  }

  @Get('market-research/opportunity')
  calculateOpportunity(
    @CurrentWorkspace() workspaceId: string,
    @Query('keyword') keyword?: string,
    @Query('asin') asin?: string,
    @Query('marketplace') marketplace?: string,
    @Query('skipCache') skipCache?: string,
  ) {
    return this.marketService.calculateOpportunity(
      workspaceId,
      keyword || 'marble toothbrush holder',
      asin,
      marketplace,
      skipCache === 'true',
    );
  }

  @Get('competitors')
  getCompetitors(@CurrentWorkspace() workspaceId: string) {
    return this.marketService.getCompetitors(workspaceId);
  }

  @Get('voc/topics')
  getVocTopics(@CurrentWorkspace() workspaceId: string) {
    return this.marketService.getVocTopics(workspaceId);
  }

  @Get('voc/topics/:id/evidence')
  getTopicEvidence(
    @Param('id') topicId: string,
    @CurrentWorkspace() workspaceId: string,
  ) {
    return this.marketService.getTopicEvidence(topicId, workspaceId);
  }

  @Get('product-opportunities')
  getProductOpportunities(
    @CurrentWorkspace() workspaceId: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.marketService.getProductOpportunities(workspaceId, keyword);
  }

  @Get('market-research/candidates/defaults')
  getDefaultCandidates() {
    return this.marketService.getDefaultCandidates();
  }

  @Get('market-research/candidates/demo')
  getDemoCandidates() {
    return this.marketService.getDefaultCandidates();
  }

  @Post('market-research/candidates/compare')
  compareCandidates(@Body() body: { candidates: ProductCandidate[] }) {
    return this.marketService.compareCandidates(body.candidates || []);
  }

  @Post('market-research/discovery/run')
  runDiscovery(@Body() request: ProductDiscoveryRequest) {
    return this.marketService.runDiscovery(request);
  }

  @Post('market-research/discovery/preview')
  previewDiscovery(@Body() request: ProductDiscoveryRequest) {
    return this.marketService.previewDiscovery(request);
  }

  @Get('market-research/discovery/demo')
  getDemoDiscovery() {
    return this.marketService.getDemoDiscovery();
  }

  @Post('market-research/discovery/handoff')
  handoffDiscovery(@Body() body: { drafts: CandidateDraft[]; allEvidence?: EvidenceItem[] }) {
    return this.marketService.handoffDiscovery(body.drafts || [], body.allEvidence || []);
  }

  @Post('market-research/enrichment/run')
  runEnrichment(@Body() request: CandidateEnrichmentRequest) {
    return this.marketService.runEnrichment(request);
  }

  @Post('market-research/enrichment/handoff')
  handoffEnrichment(@Body() body: { run: CandidateEnrichmentRun }) {
    return this.marketService.handoffEnrichment(body.run);
  }

  // ==========================================================================
  // Single-Product Research V1 Endpoints (工程增强修订)
  // ==========================================================================

  @Get('market-research/single-product/demo-fruit-box')
  getDemoFruitBox() {
    return this.marketService.getDemoFruitBoxCandidate();
  }

  @Post('market-research/single-product/init')
  initSingleProduct(
    @Body()
    body: {
      title: string;
      marketplace?: string;
      category?: string;
      targetSellingPrice?: number;
      material?: string;
      capacity?: string;
      dimensions?: string;
      entryPoint?: string;
    },
  ) {
    return this.marketService.initSingleProductCandidate(body);
  }

  @Post('market-research/single-product/spec/freeze')
  freezeSpec(
    @Body()
    body: {
      candidate: ProductCandidate;
      spec: ProductSpecification;
    },
  ) {
    return this.marketService.freezeSingleProductSpec(body.candidate, body.spec);
  }

  @Post('market-research/single-product/rfq')
  generateRfq(
    @Body()
    body: {
      candidate: ProductCandidate;
      specId?: string;
    },
  ) {
    return this.marketService.generateSingleProductRfq(body.candidate, body.specId);
  }

  @Post('market-research/single-product/quote/save')
  saveQuote(
    @Body()
    body: {
      candidate: ProductCandidate;
      quote: Partial<SupplierQuote>;
    },
  ) {
    return this.marketService.saveSingleProductQuote(body.candidate, body.quote);
  }

  @Post('market-research/single-product/quote/select-primary')
  selectPrimaryQuote(
    @Body()
    body: {
      candidate: ProductCandidate;
      quoteId: string;
      confirmedUnknownCharges?: { packagingCost?: number; logoCost?: number };
    },
  ) {
    return this.marketService.selectSingleProductPrimaryQuote(
      body.candidate,
      body.quoteId,
      body.confirmedUnknownCharges,
    );
  }

  @Post('market-research/single-product/evaluate')
  evaluateSingleProduct(
    @Body()
    body: {
      candidate: ProductCandidate;
      feeInputs?: Partial<ProductCandidate['economics']['inputs']>;
      initialCashParams?: {
        sampleCost?: number;
        firstFreightCost?: number;
        toolingCost?: number;
        packagingSetupCost?: number;
      };
    },
  ) {
    return this.marketService.evaluateSingleProduct(
      body.candidate,
      body.feeInputs,
      body.initialCashParams,
    );
  }

  @Post('market-research/analytics/event')
  trackAnalyticsEvent(@Body() body: ResearchAnalyticsEvent) {
    return this.marketService.trackAnalyticsEvent(body);
  }

  @Get('market-research/analytics/events')
  getAnalyticsEvents(@Query('candidateId') candidateId?: string) {
    return this.marketService.getAnalyticsEvents(candidateId);
  }
}
