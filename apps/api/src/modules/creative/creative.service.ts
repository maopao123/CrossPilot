import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ToolCenterService } from '../tool-center/tool-center.service.js';

export interface CreativePackResult {
  skuCode: string;
  productName: string;
  mainImage: any;
  lifestyleImage: any;
  infographic: any;
  resizedVariants: any;
  videoShowcase: any;
  totalCostUsd: number;
  totalDurationMs: number;
  generatedAt: string;
}

@Injectable()
export class CreativeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly toolCenter: ToolCenterService,
  ) {}

  async generateCreativePack(
    skuCodeOrId: string,
    workspaceId: string,
  ): Promise<CreativePackResult> {
    const sku = await this.prisma.sku.findFirst({
      where: {
        OR: [{ id: skuCodeOrId }, { skuCode: skuCodeOrId }],
      },
      include: { product: true },
    });

    const skuCode = sku?.skuCode || skuCodeOrId;
    const productName = sku?.product.name || 'Natural Marble Toothbrush Holder';
    const startTime = Date.now();

    // Step 1: Main Product Image
    const mainImgRes = await this.toolCenter.executeTool(
      'creative.image.generate',
      {
        prompt: `${productName}, studio white backdrop, 3.57 lbs solid natural marble stone, high resolution 8k`,
        style: 'studio_white',
        aspectRatio: '1:1',
      },
      workspaceId,
      undefined,
      'WORKFLOW',
    );

    // Step 2: Lifestyle Image
    const lifestyleRes = await this.toolCenter.executeTool(
      'creative.image.lifestyle',
      {
        productName,
        sceneType: 'modern_bathroom',
        lighting: 'soft_natural',
      },
      workspaceId,
      undefined,
      'WORKFLOW',
    );

    // Step 3: Infographic Callouts (1.5" diameter guarantee + 3.57 lbs weight)
    const infoRes = await this.toolCenter.executeTool(
      'creative.infographic.generate',
      {
        productTitle: productName,
        slotDiameterInch: 1.5,
        netWeightLbs: 3.57,
      },
      workspaceId,
      undefined,
      'WORKFLOW',
    );

    // Step 4: Multi-Aspect Resize
    const resizeRes = await this.toolCenter.executeTool(
      'creative.image.resize',
      {
        sourceImageUrl: mainImgRes.data?.imageUrl || 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=1200',
      },
      workspaceId,
      undefined,
      'WORKFLOW',
    );

    // Step 5: Short Video
    const videoRes = await this.toolCenter.executeTool(
      'creative.video.generate',
      {
        productTitle: productName,
        durationSec: 15,
      },
      workspaceId,
      undefined,
      'WORKFLOW',
    );

    const totalCostUsd =
      (mainImgRes.cost?.amount || 0) +
      (lifestyleRes.cost?.amount || 0) +
      (infoRes.cost?.amount || 0) +
      (resizeRes.cost?.amount || 0) +
      (videoRes.cost?.amount || 0);

    return {
      skuCode,
      productName,
      mainImage: mainImgRes.data,
      lifestyleImage: lifestyleRes.data,
      infographic: infoRes.data,
      resizedVariants: resizeRes.data?.variants || [],
      videoShowcase: videoRes.data,
      totalCostUsd: Math.round(totalCostUsd * 100) / 100,
      totalDurationMs: Date.now() - startTime,
      generatedAt: new Date().toISOString(),
    };
  }

  getCreativeGallery() {
    return [
      {
        id: 'c_01',
        title: 'POLEGAS Natural Marble Toothbrush Holder - Main White',
        skuCode: 'MTH-GREEN-001',
        category: 'MAIN_IMAGE',
        url: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=1200&auto=format&fit=crop&q=80',
        specs: '2000x2000 JPEG RGB(255,255,255)',
        compliant: true,
      },
      {
        id: 'c_02',
        title: 'Modern Vanity Morning Lifestyle Display',
        skuCode: 'MTH-GREEN-001',
        category: 'LIFESTYLE',
        url: 'https://images.unsplash.com/photo-1620626011761-996317b8d101?w=1200&auto=format&fit=crop&q=80',
        specs: '1920x1080 Aspect 16:9',
        compliant: true,
      },
      {
        id: 'c_03',
        title: '1.5" Wide Slot Dimension & EVA Non-Slip Callout',
        skuCode: 'MTH-GREEN-001',
        category: 'INFOGRAPHIC',
        url: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=1200&auto=format&fit=crop&q=80',
        specs: '2000x2000 Callout Badges',
        compliant: true,
      },
    ];
  }
}
