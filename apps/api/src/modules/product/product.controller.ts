import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProductService } from './product.service.js';
import { CurrentWorkspace } from '../../common/decorators/current-workspace.decorator.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import {
  CreateProductInput,
  CreateProductSchema,
  CreateSkuInput,
  CreateSkuSchema,
} from '@crosspilot/shared';

@Controller()
@UseGuards(WorkspaceGuard)
export class ProductController {
  constructor(private productService: ProductService) {}

  @Get('products')
  async listProducts(
    @CurrentWorkspace() workspaceId: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.productService.listProducts(workspaceId, keyword);
  }

  @Get('products/:productId')
  async getProduct(
    @CurrentWorkspace() workspaceId: string,
    @Param('productId') productId: string,
  ) {
    return this.productService.getProductById(workspaceId, productId);
  }

  @Post('products')
  async createProduct(
    @CurrentWorkspace() workspaceId: string,
    @Body() body: CreateProductInput,
  ) {
    const validated = CreateProductSchema.parse(body);
    return this.productService.createProduct(workspaceId, validated);
  }

  @Get('products/:productId/skus')
  async listProductSkus(
    @CurrentWorkspace() workspaceId: string,
    @Param('productId') productId: string,
  ) {
    return this.productService.listProductSkus(workspaceId, productId);
  }

  @Post('products/:productId/skus')
  async createSku(
    @CurrentWorkspace() workspaceId: string,
    @Param('productId') productId: string,
    @Body() body: Omit<CreateSkuInput, 'productId'>,
  ) {
    const validated = CreateSkuSchema.parse({ ...body, productId });
    return this.productService.createSku(workspaceId, validated);
  }

  /**
   * Section 81: GET /api/v1/skus/:skuId/overview
   */
  @Get('skus/:skuId/overview')
  async getSku360Overview(
    @CurrentWorkspace() workspaceId: string,
    @Param('skuId') skuId: string,
  ) {
    return this.productService.getSku360Overview(workspaceId, skuId);
  }
}
