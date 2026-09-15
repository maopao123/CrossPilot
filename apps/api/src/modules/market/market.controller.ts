import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { MarketService } from './market.service.js';
import { CurrentWorkspace } from '../../common/decorators/current-workspace.decorator.js';
import type { ProductCandidate } from '@crosspilot/shared';

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

  @Post('market-research/candidates/compare')
  compareCandidates(@Body() body: { candidates: ProductCandidate[] }) {
    return this.marketService.compareCandidates(body.candidates || []);
  }
}
