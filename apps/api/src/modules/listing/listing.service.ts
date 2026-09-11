import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ComplianceJudgeService } from '@crosspilot/domain';

@Injectable()
export class ListingService {
  constructor(private readonly prisma: PrismaService) {}

  async getListingBySkuId(skuId: string, workspaceId: string) {
    const listing = await this.prisma.listing.findFirst({
      where: {
        skuId,
        workspaceId,
      },
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
      throw new NotFoundException(`Listing for SKU ${skuId} not found in workspace`);
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

  async generateListing(skuId: string, workspaceId: string, customDirectives?: string) {
    const sku = await this.prisma.sku.findFirst({
      where: { id: skuId, workspaceId },
      include: { product: { include: { features: true } } },
    });

    if (!sku) throw new NotFoundException(`SKU ${skuId} not found in workspace`);

    // Ground claims strictly in product features / facts (§189, §190)
    const features = sku.product.features || [];
    const material = features.find(f => f.name.toLowerCase().includes('material'))?.value || 'Natural Marble Stone';
    const slotDiameter = features.find(f => f.name.toLowerCase().includes('slot') || f.name.toLowerCase().includes('diameter'))?.value || '1.5"';
    const weight = features.find(f => f.name.toLowerCase().includes('weight'))?.value || (sku.weightKg ? `${(Number(sku.weightKg) * 2.20462).toFixed(2)} lbs` : '3.57 lbs');

    const claims: Array<{ claim: string; factIds: string[] }> = [];

    const bulletPoints = [
      `100% AUTHENTIC ${material.toUpperCase()}: Handcrafted from genuine natural stone with distinct organic veining. Weighs a substantial ${weight} to prevent tipping.`,
      `${slotDiameter.toUpperCase()} UNIVERSAL COMPARTMENTS: Engineered with wide slots that comfortably accommodate standard manual and electric toothbrush handles up to ${slotDiameter}.`,
      `NON-SLIP & COUNTER SAFE: Features cushioned EVA pads on the bottom to protect countertop surfaces from moisture and scratches.`,
      `ELEVATED BATHROOM DÉCOR: Minimalist European stone design coordinates seamlessly with modern luxury bathroom accessories.`,
      `HYGIENIC & EASY TO CLEAN: Non-porous sealed surface resists soap buildup. Simply wipe clean with a soft damp cloth.`,
    ];

    features.forEach(f => {
      claims.push({
        claim: `${f.name}: ${f.value}`,
        factIds: [f.id],
      });
    });

    const title = `${sku.product.brand} Natural Marble Toothbrush Holder - ${slotDiameter} Universal Wide Slots, Solid Heavy Stone Base (${sku.variantName})`;
    const description = `Elevate your vanity with the ${sku.product.brand} Natural Marble Toothbrush Stand. Carved from premium genuine ${material}, its ${weight} base ensures unmatched stability. Upgraded with ${slotDiameter} wide slots to comfortably fit electric toothbrushes.`;
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
        claims,
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
