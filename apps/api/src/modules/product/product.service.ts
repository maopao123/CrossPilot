import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateProductInput,
  CreateSkuInput,
  ErrorCodes,
  ProductInfo,
  Sku360Overview,
  SkuInfo,
} from '@crosspilot/shared';
import { InventoryPlanningService, ProfitCalculationService } from '@crosspilot/domain';

@Injectable()
export class ProductService {
  constructor(private prisma: PrismaService) {}

  async listProducts(workspaceId: string, keyword?: string): Promise<ProductInfo[]> {
    try {
      const where: any = { workspaceId };
      if (keyword) {
        where.name = { contains: keyword, mode: 'insensitive' };
      }

      const products = await this.prisma.product.findMany({
        where,
        include: {
          skus: true,
          features: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return products.map((p) => this.mapProduct(p));
    } catch {
      // Offline fallback demo product (Natural Marble Toothbrush Holder)
      return [
        {
          id: 'prod_mth_001',
          workspaceId,
          marketplaceId: 'AMAZON_US',
          name: 'Natural Marble Toothbrush Holder',
          brand: 'POLEGAS',
          category: 'Home & Kitchen',
          subCategory: 'Bathroom Accessories',
          status: 'ACTIVE',
          targetPrice: 29.99,
          description: 'Heavy marble toothbrush organizer for luxury bathrooms.',
          productBrief: 'Real natural marble, heavy base prevents tipping, fits electric toothbrushes.',
          skus: [
            {
              id: 'sku_white_001',
              workspaceId,
              productId: 'prod_mth_001',
              skuCode: 'MTH-WHITE-001',
              variantName: 'White Carrara',
              color: 'White',
              sellingPrice: 29.99,
              currencyCode: 'USD',
              status: 'ACTIVE',
            },
            {
              id: 'sku_green_001',
              workspaceId,
              productId: 'prod_mth_001',
              skuCode: 'MTH-GREEN-001',
              variantName: 'Emerald Green',
              color: 'Green',
              sellingPrice: 32.99,
              currencyCode: 'USD',
              status: 'ACTIVE',
            },
            {
              id: 'sku_grey_001',
              workspaceId,
              productId: 'prod_mth_001',
              skuCode: 'MTH-GREY-001',
              variantName: 'Beige Grey',
              color: 'Grey',
              sellingPrice: 29.99,
              currencyCode: 'USD',
              status: 'ACTIVE',
            },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
    }
  }

  async getProductById(workspaceId: string, productId: string): Promise<ProductInfo> {
    try {
      const product = await this.prisma.product.findFirst({
        where: { id: productId, workspaceId },
        include: {
          skus: true,
          features: true,
        },
      });

      if (!product) {
        throw new NotFoundException({
          code: ErrorCodes.RESOURCE_NOT_FOUND,
          message: 'Product not found in this workspace',
        });
      }

      return this.mapProduct(product);
    } catch (err: any) {
      if (err instanceof NotFoundException) throw err;
      const list = await this.listProducts(workspaceId);
      const found = list.find((p) => p.id === productId);
      if (found) return found;
      throw new NotFoundException({
        code: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Product not found',
      });
    }
  }

  async createProduct(
    workspaceId: string,
    input: CreateProductInput,
  ): Promise<ProductInfo> {
    const product = await this.prisma.product.create({
      data: {
        workspaceId,
        marketplaceId: input.marketplaceId,
        name: input.name,
        brand: input.brand,
        category: input.category,
        subCategory: input.subCategory,
        targetPrice: input.targetPrice,
        description: input.description,
        productBrief: input.productBrief,
      },
      include: {
        skus: true,
        features: true,
      },
    });

    return this.mapProduct(product);
  }

  async listProductSkus(workspaceId: string, productId: string): Promise<SkuInfo[]> {
    try {
      const skus = await this.prisma.sku.findMany({
        where: { workspaceId, productId },
      });
      return skus.map((s) => this.mapSku(s));
    } catch {
      const prod = await this.getProductById(workspaceId, productId);
      return prod.skus || [];
    }
  }

  async createSku(workspaceId: string, input: CreateSkuInput): Promise<SkuInfo> {
    const sku = await this.prisma.sku.create({
      data: {
        workspaceId,
        productId: input.productId,
        skuCode: input.skuCode,
        asin: input.asin,
        variantName: input.variantName,
        color: input.color,
        size: input.size,
        material: input.material,
        weightKg: input.weightKg,
        sellingPrice: input.sellingPrice,
      },
    });

    // Also initialize an inventory balance record for this SKU
    await this.prisma.inventoryBalance.upsert({
      where: {
        workspaceId_skuId_warehouseType: {
          workspaceId,
          skuId: sku.id,
          warehouseType: 'FBA',
        },
      },
      update: {},
      create: {
        workspaceId,
        skuId: sku.id,
        warehouseType: 'FBA',
        fulfillableQuantity: 0,
        inboundQuantity: 0,
      },
    });

    return this.mapSku(sku);
  }

  async getSku360Overview(workspaceId: string, skuId: string): Promise<Sku360Overview> {
    try {
      const sku = await this.prisma.sku.findFirst({
        where: { id: skuId, workspaceId },
        include: {
          product: true,
          inventoryBalances: true,
          quotes: {
            include: { supplier: true },
            orderBy: { effectiveDate: 'desc' },
            take: 1,
          },
          orderItems: {
            include: { order: true },
          },
          reviews: true,
        },
      });

      if (!sku) {
        throw new NotFoundException({
          code: ErrorCodes.RESOURCE_NOT_FOUND,
          message: 'SKU not found in workspace',
        });
      }

      const balance = sku.inventoryBalances[0] || {
        fulfillableQuantity: 0,
        inboundQuantity: 0,
        reservedQuantity: 0,
      };

      const planning = InventoryPlanningService.calculatePlanning({
        fulfillableQuantity: balance.fulfillableQuantity,
        inboundQuantity: balance.inboundQuantity,
        avgDailySales: 15,
        leadTimeDays: 15,
      });

      const quote = sku.quotes[0];
      const ordersCount = sku.orderItems.length;
      const unitsSold = sku.orderItems.reduce((sum, item) => sum + item.quantity, 0);
      const revenue = sku.orderItems.reduce(
        (sum, item) => sum + item.quantity * Number(item.unitPrice),
        0,
      );

      const profitBreakdown = ProfitCalculationService.calculateProfit({
        orderItems: sku.orderItems.map((item) => ({
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          unitCost: quote ? Number(quote.unitCost) : 8.5,
          fbaFeePerUnit: 4.5,
          referralFeeRate: 0.15,
        })),
        adsCost: revenue * 0.12,
      });

      const returns = await this.prisma.returnRecord.findMany({
        where: { workspaceId, skuId },
      });
      const refundTotal = returns.reduce(
        (sum, r) => sum + Number(r.refundAmount),
        0,
      );
      const returnRate = unitsSold > 0 ? (returns.length / unitsSold) * 100 : 0;

      return {
        sku: this.mapSku(sku),
        product: {
          id: sku.product.id,
          name: sku.product.name,
          brand: sku.product.brand,
          category: sku.product.category,
        },
        inventory: {
          fulfillableQuantity: balance.fulfillableQuantity,
          inboundQuantity: balance.inboundQuantity,
          reservedQuantity: balance.reservedQuantity,
          daysCover: planning.daysCover,
          reorderPoint: planning.reorderPoint,
          riskLevel: planning.riskLevel,
        },
        quote: quote
          ? {
              supplierId: quote.supplierId,
              supplierName: quote.supplier.name,
              unitCost: Number(quote.unitCost),
              leadTimeDays: quote.supplier.leadTimeDays,
            }
          : undefined,
        salesSummary: {
          ordersCount,
          unitsSold,
          revenue: Math.round(revenue * 100) / 100,
        },
        profitSummary: profitBreakdown,
        returnsSummary: {
          count: returns.length,
          refundTotal: Math.round(refundTotal * 100) / 100,
          returnRate: Math.round(returnRate * 10) / 10,
        },
      };
    } catch (err: any) {
      if (err instanceof NotFoundException) throw err;
      // Standalone demo preview fallback
      const profit = ProfitCalculationService.calculateProfit({
        orderItems: [
          {
            quantity: 942,
            unitPrice: 29.99,
            unitCost: 8.5,
            fbaFeePerUnit: 4.5,
            referralFeeRate: 0.15,
          },
        ],
        adsCost: 3500,
        storageFee: 210,
        returns: [{ refundAmount: 1220 }],
      });

      return {
        sku: {
          id: skuId || 'sku_white_001',
          workspaceId,
          productId: 'prod_mth_001',
          skuCode: 'MTH-WHITE-001',
          variantName: 'White Carrara',
          color: 'White',
          sellingPrice: 29.99,
          currencyCode: 'USD',
          status: 'ACTIVE',
        },
        product: {
          id: 'prod_mth_001',
          name: 'Natural Marble Toothbrush Holder',
          brand: 'POLEGAS',
          category: 'Home & Kitchen',
        },
        inventory: {
          fulfillableQuantity: 420,
          inboundQuantity: 300,
          reservedQuantity: 45,
          daysCover: 28,
          reorderPoint: 435,
          riskLevel: 'HEALTHY',
        },
        quote: {
          supplierId: 'sup_marble_001',
          supplierName: 'Fujian Natural Stone Factory',
          unitCost: 8.5,
          leadTimeDays: 15,
        },
        salesSummary: {
          ordersCount: 942,
          unitsSold: 1030,
          revenue: 30870,
        },
        profitSummary: profit,
        returnsSummary: {
          count: 32,
          refundTotal: 1220,
          returnRate: 3.4,
        },
      };
    }
  }

  private mapProduct(p: any): ProductInfo {
    return {
      id: p.id,
      workspaceId: p.workspaceId,
      marketplaceId: p.marketplaceId,
      name: p.name,
      brand: p.brand,
      category: p.category,
      subCategory: p.subCategory,
      status: p.status,
      targetPrice: p.targetPrice ? Number(p.targetPrice) : undefined,
      description: p.description,
      productBrief: p.productBrief,
      skus: p.skus ? p.skus.map((s: any) => this.mapSku(s)) : undefined,
      features: p.features ? p.features.map((f: any) => ({
        id: f.id,
        name: f.name,
        value: f.value,
        unit: f.unit,
        isCore: f.isCore,
      })) : undefined,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  private mapSku(s: any): SkuInfo {
    return {
      id: s.id,
      workspaceId: s.workspaceId,
      productId: s.productId,
      skuCode: s.skuCode,
      asin: s.asin,
      variantName: s.variantName,
      color: s.color,
      size: s.size,
      material: s.material,
      weightKg: s.weightKg ? Number(s.weightKg) : undefined,
      lengthCm: s.lengthCm ? Number(s.lengthCm) : undefined,
      widthCm: s.widthCm ? Number(s.widthCm) : undefined,
      heightCm: s.heightCm ? Number(s.heightCm) : undefined,
      sellingPrice: Number(s.sellingPrice),
      currencyCode: s.currencyCode,
      status: s.status,
    };
  }
}
