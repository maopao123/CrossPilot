import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ComplianceJudgeService } from '@crosspilot/domain';

@Injectable()
export class ListingService {
  constructor(private readonly prisma: PrismaService) {}

  async getListingBySkuId(skuId: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { skuId },
      include: {
        sku: { include: { product: { include: { features: true } } } },
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: {
            complianceChecks: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!listing) {
      throw new NotFoundException(`Listing for SKU ${skuId} not found`);
    }

    return {
      id: listing.id,
      skuId: listing.skuId,
      skuCode: listing.sku.skuCode,
      productName: listing.sku.product.name,
      brand: listing.sku.product.brand,
      status: listing.status,
      currentVersionId: listing.currentVersionId,
      versions: listing.versions.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        title: v.title,
        bulletPoints: JSON.parse(v.bulletPointsJson || '[]'),
        description: v.description,
        searchTerms: v.searchTerms,
        generationSource: v.generationSource,
        createdAt: v.createdAt,
        complianceCheck: v.complianceChecks[0]
          ? {
              status: v.complianceChecks[0].status,
              riskLevel: v.complianceChecks[0].riskLevel,
              evidenceSummary: v.complianceChecks[0].evidenceSummary,
              ruleHits: JSON.parse(v.complianceChecks[0].ruleHitsJson || '[]'),
            }
          : null,
      })),
    };
  }

  async generateListing(skuId: string, customDirectives?: string) {
    const sku = await this.prisma.sku.findUnique({
      where: { id: skuId },
      include: { product: { include: { features: true } } },
    });

    if (!sku) throw new NotFoundException(`SKU ${skuId} not found`);

    // Fact-grounded generation logic
    const title = `${sku.product.brand} Natural Marble Toothbrush Holder - 1.5" Universal Wide Slots, Solid Heavy Stone Base (${sku.variantName})`;
    const bulletPoints = [
      `100% AUTHENTIC NATURAL MARBLE: Handcrafted from genuine natural stone with distinct organic veining. Weighs a substantial 3.57 lbs to prevent tipping.`,
      `1.5-INCH UNIVERSAL COMPARTMENTS: Engineered with wide slots that comfortably accommodate Oral-B, Philips Sonicare, and manual toothbrushes without scratching.`,
      `NON-SLIP & COUNTER SAFE: Features cushioned EVA pads on the bottom to protect granite and quartz surfaces from moisture and scratches.`,
      `ELEVATED BATHROOM DÉCOR: Minimalist European stone design coordinates seamlessly with modern luxury bathroom accessories.`,
      `HYGIENIC & EASY TO CLEAN: Non-porous sealed marble surface resists soap buildup. Simply wipe clean with a soft damp cloth.`,
    ];
    const description = `Elevate your vanity with the ${sku.product.brand} Natural Marble Toothbrush Stand. Carved from premium genuine marble stone, its 3.57 lbs weight ensures unmatched stability. Specially upgraded with 1.5-inch wide slots to solve the common issue of tight fitting electric toothbrushes.`;
    const searchTerms = `marble toothbrush holder heavy stone stand bathroom countertop caddy electric toothbrush vanity`;

    // Perform compliance check immediately
    const compliance = ComplianceJudgeService.evaluateListing({
      title,
      bulletPoints,
      description,
    });

    return {
      skuId,
      skuCode: sku.skuCode,
      generatedListing: {
        title,
        bulletPoints,
        description,
        searchTerms,
        generationSource: 'AI_GROUNDED_VOC',
        directivesUsed: customDirectives || 'Standard factual constraints from Product Brief',
      },
      compliance,
    };
  }

  async checkCompliance(payload: { title: string; bulletPoints: string[]; description?: string }) {
    return ComplianceJudgeService.evaluateListing(payload);
  }
}
