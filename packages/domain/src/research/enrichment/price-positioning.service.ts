import type { CompetitorSnapshot, PricePositioning } from '@crosspilot/shared';

export class PricePositioningService {
  static fromCompetitors(competitors: CompetitorSnapshot[]): PricePositioning {
    const observed: PricePositioning['observedPrices'] = [];
    for (const c of competitors) {
      const price = c.price?.value;
      if (typeof price === 'number' && Number.isFinite(price) && c.price?.source === 'FACT') {
        observed.push({
          asin: c.asin,
          price,
          evidenceId: c.price.evidenceId || c.evidenceIds[0] || `evi-comp-${c.asin}-detail`,
        });
      }
    }
    observed.sort((a, b) => a.asin.localeCompare(b.asin) || a.price - b.price);

    if (observed.length === 0) {
      return {
        sampleSize: 0,
        observedPrices: [],
        min: null,
        median: null,
        max: null,
        positioning: 'UNKNOWN',
        evidenceIds: [],
      };
    }

    const prices = observed.map((o) => o.price).sort((a, b) => a - b);
    const min = prices[0];
    const max = prices[prices.length - 1];
    const median = this.median(prices);
    const sampleSize = observed.length;
    const positioning = sampleSize < 2 ? 'UNKNOWN' : this.positioningOf(min, median, max);

    return {
      sampleSize,
      observedPrices: observed,
      min,
      median,
      max,
      suggestedTargetPrice: {
        value: median,
        source: 'ESTIMATE',
        basis:
          sampleSize < 2
            ? `single observed competitor FACT price; sample too small for market positioning`
            : `median of ${sampleSize} observed competitor FACT prices`,
      },
      positioning,
      evidenceIds: observed.map((o) => o.evidenceId),
    };
  }

  static median(sorted: number[]): number {
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) return sorted[mid];
    return Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));
  }

  static positioningOf(min: number, median: number, max: number): PricePositioning['positioning'] {
    const range = max - min;
    if (range === 0) return 'MAINSTREAM';
    const third = range / 3;
    if (median <= min + third) return 'VALUE';
    if (median >= max - third) return 'PREMIUM';
    return 'MAINSTREAM';
  }
}
