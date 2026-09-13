import { Controller, Get, Post, Patch, Param, Body } from '@nestjs/common';
import { ListingService } from './listing.service.js';
import { CurrentWorkspace } from '../../common/decorators/current-workspace.decorator.js';

@Controller('listings')
export class ListingController {
  constructor(private readonly listingService: ListingService) {}

  @Get('sku/:skuId')
  getListingBySkuId(
    @Param('skuId') skuId: string,
    @CurrentWorkspace() workspaceId: string,
  ) {
    return this.listingService.getListingBySkuId(skuId, workspaceId);
  }

  @Post('generate')
  generateListing(
    @CurrentWorkspace() workspaceId: string,
    @Body('skuId') skuId: string,
    @Body('customDirectives') customDirectives?: string,
    @Body('images') images?: string[],
    @Body('keywords') keywords?: any[],
    @Body('rufusQa') rufusQa?: any[],
    @Body('marketplace') marketplace?: string,
    @Body('modelName') modelName?: string,
    @Body('forceRefreshVisual') forceRefreshVisual?: boolean,
  ) {
    return this.listingService.generateListing(skuId, workspaceId, {
      customDirectives,
      images,
      keywords,
      rufusQa,
      marketplace,
      modelName,
      forceRefreshVisual,
    });
  }

  @Post('visual-extract')
  extractVisualFacts(
    @CurrentWorkspace() workspaceId: string,
    @Body('productId') productId: string,
    @Body('images') images: string[],
    @Body('forceRefresh') forceRefresh?: boolean,
  ) {
    return this.listingService.getOrExtractVisualFacts(productId, images, workspaceId, forceRefresh);
  }

  @Patch('visual-facts/:factId')
  confirmVisualFact(
    @Param('factId') factId: string,
    @CurrentWorkspace() workspaceId: string,
    @Body('status') status: 'CONFIRMED' | 'REJECTED',
  ) {
    return this.listingService.confirmVisualFact(factId, status, workspaceId);
  }

  @Post('keyword-extract')
  extractKeywords(
    @Body('content') content: string,
    @Body('sourceType') sourceType?: any,
  ) {
    return this.listingService.extractAndNormalizeKeywords(content, sourceType);
  }

  @Post('rufus-extract')
  extractRufusQa(
    @Body('content') content: string,
    @Body('defaultSource') defaultSource?: 'MANUAL' | 'QA' | 'VOC',
  ) {
    return this.listingService.extractRufusQa(content, defaultSource);
  }

  @Get('creative-brief/:versionId')
  getCreativeBrief(
    @Param('versionId') versionId: string,
    @CurrentWorkspace() workspaceId: string,
  ) {
    return this.listingService.getCreativeBrief(versionId, workspaceId);
  }

  @Post('compliance-check')
  checkCompliance(
    @Body() payload: { title: string; bulletPoints: string[]; description?: string },
  ) {
    return this.listingService.checkCompliance(payload);
  }
}
