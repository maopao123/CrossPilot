import { ListingWorkflowDagService } from '../src/listing/listing-workflow-dag.service';
import { getMarketplacePolicyProfile } from '../src/listing/marketplace-policy.profile';

describe('ListingWorkflowDagService & Policy Profiles (V2)', () => {
  it('should execute 14-step DAG and output fully grounded listing draft', async () => {
    const result = await ListingWorkflowDagService.executeWorkflowDag({
      skuCode: 'MTH-WHITE-001',
      productName: 'Natural Marble Toothbrush Holder',
      brand: 'POLEGAS',
      variantName: 'Carrara White',
      features: [
        { id: 'f_mat', name: 'Material', value: 'Natural Marble Stone', isCore: true },
        { id: 'f_slot', name: 'Slot Diameter', value: '1.5"', isCore: true },
        { id: 'f_wt', name: 'Weight', value: '3.57 lbs', isCore: true },
      ],
      skuWeightKg: 1.62,
      images: ['https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=800'],
    });

    expect(result.success).toBe(true);
    expect(result.stepTraces).toHaveLength(14);
    expect(result.listingDraft.title).toContain('POLEGAS');
    expect(result.listingDraft.title).toContain('1.5"');
    expect(result.listingDraft.bulletPoints).toHaveLength(5);
    expect(result.listingDraft.claims).toHaveLength(3);
    expect(result.groundingMetrics.groundingRate).toBe(1.0);
    expect(result.creativeBrief.imageBriefs.length).toBeGreaterThanOrEqual(5);
    expect(result.creativeBrief.aPlusPlan).toBeDefined();
    expect(result.humanReviewState).toBe('WAITING_APPROVAL');
  }, 35000);

  it('should reject inputs with more than 10 images (§338.30.1)', async () => {
    const elevenImages = Array.from({ length: 11 }, (_, i) => `https://example.com/img-${i}.jpg`);
    await expect(
      ListingWorkflowDagService.executeWorkflowDag({
        skuCode: 'MTH-WHITE-001',
        productName: 'Natural Marble Toothbrush Holder',
        brand: 'POLEGAS',
        features: [],
        images: elevenImages,
      }),
    ).rejects.toThrow('Product images cannot exceed 10 items');
  });

  it('should enforce MarketplacePolicyProfile limits for Amazon US (§338.30.5)', () => {
    const profile = getMarketplacePolicyProfile('AMAZON_US');
    expect(profile.marketplace).toBe('AMAZON_US');
    expect(profile.locale).toBe('en-US');
    expect(profile.title.maxLength).toBe(200);
    expect(profile.bullets.maxCount).toBe(5);
    expect(profile.searchTerms.maxLength).toBe(250);
    expect(profile.forbiddenPatterns).toContain('fda approved');
  });
});
