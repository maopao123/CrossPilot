import { Controller, Get, Param, Query } from '@nestjs/common';
import { MarketService } from './market.service.js';
import { CurrentWorkspace } from '../../common/decorators/current-workspace.decorator.js';

@Controller()
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Get('market-research/snapshot')
  getMarketSnapshot(@CurrentWorkspace() workspaceId: string) {
    return this.marketService.getMarketSnapshot(workspaceId);
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
  getProductOpportunities(@CurrentWorkspace() workspaceId: string) {
    return this.marketService.getProductOpportunities(workspaceId);
  }
}
