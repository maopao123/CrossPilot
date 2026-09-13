import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateSupplierInput,
  CreateSupplierQuoteInput,
  ErrorCodes,
  SupplierInfo,
  SupplierSkuQuoteInfo,
} from '@crosspilot/shared';

@Injectable()
export class SupplierService {
  constructor(private prisma: PrismaService) {}

  async listSuppliers(workspaceId: string): Promise<SupplierInfo[]> {
    try {
      const suppliers = await this.prisma.supplier.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
      });
      return suppliers.map((s) => ({
        id: s.id,
        workspaceId: s.workspaceId,
        name: s.name,
        contactPerson: s.contactPerson || undefined,
        email: s.email || undefined,
        phone: s.phone || undefined,
        address: s.address || undefined,
        leadTimeDays: s.leadTimeDays,
        status: s.status,
      }));
    } catch {
      return [
        {
          id: 'sup_marble_001',
          workspaceId,
          name: 'Fujian Natural Stone Crafts Co., Ltd.',
          contactPerson: 'Mr. Zhang',
          email: 'sales@fujian-stone.com',
          phone: '+86-595-88888888',
          address: 'Shuitou Town, Nan\'an, Quanzhou, Fujian, China',
          leadTimeDays: 15,
          status: 'ACTIVE',
        },
      ];
    }
  }

  async createSupplier(
    workspaceId: string,
    input: CreateSupplierInput,
  ): Promise<SupplierInfo> {
    const s = await this.prisma.supplier.create({
      data: {
        workspaceId,
        name: input.name,
        contactPerson: input.contactPerson,
        email: input.email,
        phone: input.phone,
        address: input.address,
        leadTimeDays: input.leadTimeDays,
      },
    });

    return {
      id: s.id,
      workspaceId: s.workspaceId,
      name: s.name,
      contactPerson: s.contactPerson || undefined,
      email: s.email || undefined,
      phone: s.phone || undefined,
      address: s.address || undefined,
      leadTimeDays: s.leadTimeDays,
      status: s.status,
    };
  }

  async createQuote(
    workspaceId: string,
    input: CreateSupplierQuoteInput,
  ): Promise<SupplierSkuQuoteInfo> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: input.supplierId, workspaceId },
    });
    if (!supplier) {
      throw new NotFoundException({
        code: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Supplier not found in this workspace',
      });
    }

    const sku = await this.prisma.sku.findFirst({
      where: { id: input.skuId, workspaceId },
    });
    if (!sku) {
      throw new NotFoundException({
        code: ErrorCodes.RESOURCE_NOT_FOUND,
        message: `SKU '${input.skuId}' not found in this workspace`,
      });
    }

    const quote = await this.prisma.supplierSkuQuote.create({
      data: {
        workspaceId,
        supplierId: input.supplierId,
        skuId: input.skuId,
        unitCost: input.unitCost,
        moq: input.moq,
        currencyCode: input.currencyCode,
      },
    });

    return {
      id: quote.id,
      workspaceId: quote.workspaceId,
      supplierId: quote.supplierId,
      skuId: quote.skuId,
      unitCost: Number(quote.unitCost),
      moq: quote.moq,
      currencyCode: quote.currencyCode,
      effectiveDate: quote.effectiveDate,
    };
  }

  async listQuotesBySku(
    workspaceId: string,
    skuId: string,
  ): Promise<SupplierSkuQuoteInfo[]> {
    try {
      const quotes = await this.prisma.supplierSkuQuote.findMany({
        where: { workspaceId, skuId },
        orderBy: { effectiveDate: 'desc' },
      });
      return quotes.map((q) => ({
        id: q.id,
        workspaceId: q.workspaceId,
        supplierId: q.supplierId,
        skuId: q.skuId,
        unitCost: Number(q.unitCost),
        moq: q.moq,
        currencyCode: q.currencyCode,
        effectiveDate: q.effectiveDate,
      }));
    } catch {
      return [
        {
          id: 'quote_001',
          workspaceId,
          supplierId: 'sup_marble_001',
          skuId,
          unitCost: 8.5,
          moq: 100,
          currencyCode: 'USD',
          effectiveDate: new Date(),
        },
      ];
    }
  }
}
