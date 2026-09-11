import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { CreativeService } from './creative.service.js';
import { Public } from '../../common/decorators/public.decorator.js';

@Controller('creative')
export class CreativeController {
  constructor(private readonly creativeService: CreativeService) {}

  @Public()
  @Post('pack')
  generateCreativePack(
    @Body() payload: { skuCode: string; workspaceId?: string },
  ) {
    return this.creativeService.generateCreativePack(
      payload.skuCode || 'MTH-GREEN-001',
      payload.workspaceId || 'ws_default_001',
    );
  }

  @Public()
  @Get('gallery')
  getGallery() {
    return this.creativeService.getCreativeGallery();
  }
}
