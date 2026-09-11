import {
  createDefaultToolRegistry,
  ToolExecutor,
  ProductVisualExtractTool,
  KeywordFileExtractTool,
  KeywordNormalizeTool,
} from '../src/index.js';

describe('Listing Intelligence Tools (V2)', () => {
  const ctx = {
    workspaceId: 'ws_demo',
    traceId: 'trace-test-v2',
    source: 'WORKFLOW' as const,
  };

  describe('product.visual.extract', () => {
    it('should extract structured visual facts and support cache reuse (§338.30.2)', () => {
      // 1. First extraction
      const firstRes = ProductVisualExtractTool.execute(
        {
          productId: 'prod_test',
          images: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
        },
        ctx,
      );

      expect(firstRes.cacheHit).toBe(false);
      expect(firstRes.visualFacts.length).toBeGreaterThanOrEqual(4);
      expect(firstRes.visualFacts[0].status).toBe('EXTRACTED');

      // 2. Second extraction with existing facts (Cache Hit)
      const cachedRes = ProductVisualExtractTool.execute(
        {
          productId: 'prod_test',
          images: ['https://example.com/img1.jpg'],
          existingFacts: firstRes.visualFacts,
        },
        ctx,
      );

      expect(cachedRes.cacheHit).toBe(true);
      expect(cachedRes.message).toContain('Vision model was NOT invoked');
      expect(cachedRes.visualFacts).toEqual(firstRes.visualFacts);
    });

    it('should throw error when exceeding 10 images (§338.30.1)', () => {
      const eleven = Array.from({ length: 11 }, (_, i) => `https://example.com/shot-${i}.jpg`);
      expect(() => {
        ProductVisualExtractTool.execute(
          {
            productId: 'prod_test',
            images: eleven,
          },
          ctx,
        );
      }).toThrow('Maximum 10 images allowed');
    });
  });

  describe('keyword.file.extract & keyword.normalize', () => {
    it('should extract and normalize multi-column CSV keywords (§338.30.3)', () => {
      const csv = `keyword,search_volume,priority\nmarble toothbrush holder,14500,1\nelectric toothbrush stand,9800,1\nMARBLE TOOTHBRUSH HOLDER,14500,1\n`;

      const extractRes = KeywordFileExtractTool.execute(
        {
          content: csv,
          sourceType: 'EXCEL',
        },
        ctx,
      );

      expect(extractRes.extractedCount).toBe(3);

      const normRes = KeywordNormalizeTool.execute(
        {
          keywords: extractRes.keywords,
        },
        ctx,
      );

      expect(normRes.deduplicatedCount).toBe(1);
      expect(normRes.normalizedCount).toBe(2);
      expect(normRes.keywords[0].normalizedKeyword).toBe('marble toothbrush holder');
      expect(normRes.keywords[1].normalizedKeyword).toBe('electric toothbrush stand');
    });
  });
});
