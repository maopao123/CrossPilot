import { Controller, Get, Post, Patch, Param, Body, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
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
    @Body('productSpecs') productSpecs?: {
      productName?: string;
      brand?: string;
      dimensions?: string;
      material?: string;
      weight?: string;
      featuresText?: string;
    },
  ) {
    return this.listingService.generateListing(skuId, workspaceId, {
      customDirectives,
      images,
      keywords,
      rufusQa,
      marketplace,
      modelName,
      forceRefreshVisual,
      productSpecs,
    });
  }

  @Post('generate/stream')
  async generateListingStream(
    @CurrentWorkspace() workspaceId: string,
    @Body()
    body: {
      skuId: string;
      customDirectives?: string;
      images?: string[];
      keywords?: any[];
      rufusQa?: any[];
      marketplace?: string;
      modelName?: string;
      forceRefreshVisual?: boolean;
      productSpecs?: {
        productName?: string;
        brand?: string;
        dimensions?: string;
        material?: string;
        weight?: string;
        featuresText?: string;
      };
    },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const writeEvent = (event: string, data: unknown) => {
      if (req.destroyed || res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      (res as any).flush?.();
    };

    try {
      const result = await this.listingService.generateListing(body.skuId, workspaceId, {
        customDirectives: body.customDirectives,
        images: body.images,
        keywords: body.keywords,
        rufusQa: body.rufusQa,
        marketplace: body.marketplace,
        modelName: body.modelName,
        forceRefreshVisual: body.forceRefreshVisual,
        productSpecs: body.productSpecs,
        onStep: (step) => writeEvent('step', step),
      });
      writeEvent('result', result);
    } catch (err: any) {
      writeEvent('error', {
        message: err?.message || 'Listing generation failed',
        code: err?.response?.code || err?.code || 'INTERNAL_SERVER_ERROR',
      });
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
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

  @Post('product-specs-extract')
  extractProductSpecs(@Body('content') content: string) {
    return this.listingService.extractProductSpecs(content);
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
