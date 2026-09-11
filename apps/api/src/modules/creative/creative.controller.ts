import { Controller, Post, Get, Body } from '@nestjs/common';
import { CreativeService } from './creative.service.js';
import { CurrentWorkspace } from '../../common/decorators/current-workspace.decorator.js';

@Controller('creative')
export class CreativeController {
  constructor(private readonly creativeService: CreativeService) {}

  @Post('pack')
  generateCreativePack(
    @CurrentWorkspace() workspaceId: string,
    @Body() payload: { skuCode: string },
  ) {
    return this.creativeService.generateCreativePack(
      payload.skuCode || 'MTH-GREEN-001',
      workspaceId,
    );
  }

  @Get('gallery')
  getGallery() {
    return this.creativeService.getCreativeGallery();
  }
}
