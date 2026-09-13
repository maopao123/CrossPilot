import {
  heuristicExtractProductSpecs,
  parseProductSpecsFromLlm,
} from '../src/modules/listing/product-specs-extractor';

const SHOE_ORGANIZER_RAW = `Color：Beige-yellow
Material：Fabric
Product Dimensions    10"L x 12"W x 5"H

2 Pack Shoe Organizer for Closet, Clear Foldable Shoe Storage Containers Adjustable Dividers Fits 16 Pairs,Shoe Storage Bins Baskets Boxes with Reinforced Handles Beige
LARGE STORAGE CAPACITY: These collapsible shoe boxes are designed to save space. Two modular units seamlessly connect to form a large storage container, allowing shoes to be stored vertically in compact compartments. This innovative design maximizes space efficiency compared to traditional plastic boxes. Ideal for shoe collectors, large households, or seasonal storage, they keep footwear clean and dust-free. Units can be folded flat when unused for additional space savings.
CLOSET ORGANIZERS & STORAGE: Features a transparent lid for easy content visibility and dust protection. The durable two-way zipper ensures smooth operation and full access to your items.
DIMENSIONS & DESIGN: Each shoe rack combines two compact units (16.9"×8.45"×11.8") into a unified large organizer (16.9"×16.9"×11.8"). Sized to fit most cabinets, it includes handles on both sides for effortless transport, solving narrow-space storage challenges while enhancing organization.
ADJUSTABLE DIVIDERS: Customize compartment sizes to accommodate various footwear types or multi-purpose storage needs. Perfect for decluttering shoes, clothing, toys, and other items.
AFTER-SALES SUPPORT: Encounter assembly or usage issues? Our 24/7 customer service team is ready to assist you promptly.`;

describe('heuristicExtractProductSpecs', () => {
  it('extracts name, color, material and prefers body dimensions over the labeled 10x12x5 line', () => {
    const result = heuristicExtractProductSpecs(SHOE_ORGANIZER_RAW);

    expect(result.extractor).toBe('HEURISTIC');
    expect(result.productName).toMatch(/2 Pack Shoe Organizer/i);
    expect(result.color).toMatch(/Beige-yellow/i);
    expect(result.material).toMatch(/Fabric/i);
    expect(result.material).toMatch(/Beige-yellow/i);
    expect(result.dimensions).toMatch(/16\.9/);
    expect(result.dimensions).not.toMatch(/10"/);
    expect(result.capacity).toMatch(/16/);
    expect(result.features.length).toBeGreaterThanOrEqual(3);
    expect(result.featuresText).toMatch(/LARGE STORAGE CAPACITY/i);
    expect(result.featuresText).toMatch(/ADJUSTABLE DIVIDERS/i);
    expect(result.featuresText).not.toMatch(/AFTER-SALES/i);
    expect(result.featuresText).not.toMatch(/24\/7 customer service/i);
  });

  it('keeps a single labeled Product Dimensions triple when no richer body dimensions exist', () => {
    const result = heuristicExtractProductSpecs(
      `Color: Grey\nMaterial: Linen\nProduct Dimensions: 15"L x 12"W x 10"H\nDecorative Linen File Storage Box with Lid`,
    );

    expect(result.productName).toMatch(/File Storage Box/i);
    expect(result.color).toBe('Grey');
    expect(result.material).toMatch(/Linen/i);
    expect(result.dimensions).toMatch(/15/);
    expect(result.dimensions).toMatch(/12/);
    expect(result.dimensions).toMatch(/10/);
  });

  it('returns empty strings instead of invented placeholders', () => {
    const result = heuristicExtractProductSpecs('just a short note');

    expect(result.productName).toBe('');
    expect(result.brand).toBe('');
    expect(result.material).toBe('');
    expect(result.dimensions).toBe('');
  });
});

describe('parseProductSpecsFromLlm', () => {
  it('maps LLM json and drops after-sales feature noise', () => {
    const result = parseProductSpecsFromLlm(
      {
        productName: '2 Pack Under Bed Shoe Organizer',
        brand: '',
        color: 'Beige-yellow',
        material: 'Fabric',
        dimensions: '16.9" × 8.45" × 11.8"',
        weight: '',
        capacity: '2 Pack / 16 pairs',
        features: [
          'Large storage capacity for 16 pairs',
          'AFTER-SALES SUPPORT: 24/7 customer service',
          'Adjustable dividers for boots',
        ],
      },
      'qwen-plus',
    );

    expect(result).not.toBeNull();
    expect(result!.extractor).toBe('LLM');
    expect(result!.model).toBe('qwen-plus');
    expect(result!.productName).toBe('2 Pack Under Bed Shoe Organizer');
    expect(result!.material).toMatch(/Fabric/);
    expect(result!.material).toMatch(/Beige-yellow/);
    expect(result!.weight).toMatch(/16 pairs/);
    expect(result!.featuresText).toMatch(/Adjustable dividers/);
    expect(result!.featuresText).not.toMatch(/24\/7/);
  });

  it('returns null when the model output has no usable fields', () => {
    expect(parseProductSpecsFromLlm({ features: [] }, 'qwen-plus')).toBeNull();
  });
});
