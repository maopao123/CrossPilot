import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SupplierService } from './supplier.service.js';
import { CurrentWorkspace } from '../../common/decorators/current-workspace.decorator.js';
import {
  CreateSupplierInput,
  CreateSupplierQuoteInput,
  CreateSupplierQuoteSchema,
  CreateSupplierSchema,
} from '@crosspilot/shared';

@Controller()
export class SupplierController {
  constructor(private supplierService: SupplierService) {}

  @Get('suppliers')
  async listSuppliers(@CurrentWorkspace() workspaceId: string) {
    return this.supplierService.listSuppliers(workspaceId);
  }

  @Post('suppliers')
  async createSupplier(
    @CurrentWorkspace() workspaceId: string,
    @Body() body: CreateSupplierInput,
  ) {
    const validated = CreateSupplierSchema.parse(body);
    return this.supplierService.createSupplier(workspaceId, validated);
  }

  @Get('skus/:skuId/supplier-quotes')
  async listQuotes(
    @CurrentWorkspace() workspaceId: string,
    @Param('skuId') skuId: string,
  ) {
    return this.supplierService.listQuotesBySku(workspaceId, skuId);
  }

  @Post('skus/:skuId/supplier-quotes')
  async createQuote(
    @CurrentWorkspace() workspaceId: string,
    @Param('skuId') skuId: string,
    @Body() body: Omit<CreateSupplierQuoteInput, 'skuId'>,
  ) {
    const validated = CreateSupplierQuoteSchema.parse({ ...body, skuId });
    return this.supplierService.createQuote(workspaceId, validated);
  }
}
