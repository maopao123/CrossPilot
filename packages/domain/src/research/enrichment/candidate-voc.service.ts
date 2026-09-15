import type {
  CandidateVocSummary,
  EvidenceItem,
  EvidenceScope,
  VocProductAnalysisResult,
  VocTheme,
  VocThemeScope,
} from '@crosspilot/shared';

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'theme';
}

function percentageOf(count?: number | null, denominator?: number | null): number | null {
  if (count == null || denominator == null || denominator <= 0) return null;
  return Math.round((count / denominator) * 100);
}

const EVIDENCE_SCOPES: EvidenceScope[] = ['PRODUCT', 'KEYWORD', 'CATEGORY', 'MARKET'];

function preserveVocScope(raw: unknown): VocThemeScope {
  if (typeof raw !== 'string' || !raw.trim()) return 'UNKNOWN';
  return raw.trim() as VocThemeScope;
}

function toEvidenceScope(vocScope: VocThemeScope): EvidenceScope {
  if ((EVIDENCE_SCOPES as string[]).includes(vocScope)) return vocScope as EvidenceScope;
  return 'CATEGORY';
}

function isProductFactScope(scope: VocThemeScope): boolean {
  return scope === 'PRODUCT' || scope === 'EXACT_PRODUCT';
}

export class CandidateVocService {
  static unavailable(missing: string[] = ['textVoc']): CandidateVocSummary {
    return {
      sourceType: 'UNAVAILABLE',
      analyzedItemCount: null,
      painPoints: [],
      praisePoints: [],
      useCases: [],
      desiredFeatures: [],
      questions: [],
      evidenceIds: [],
      missingDimensions: missing,
    };
  }

  static normalize(params: {
    data: VocProductAnalysisResult | any;
    providerId?: string;
    allowedSubjectIds: Set<string>;
    evidenceSink: EvidenceItem[];
  }): CandidateVocSummary {
    const data = params.data || {};
    const painRaw = Array.isArray(data.painPoints) ? data.painPoints : [];
    const hasText =
      painRaw.length > 0 ||
      (Array.isArray(data.useCases) && data.useCases.length > 0) ||
      (Array.isArray(data.desiredFeatures) && data.desiredFeatures.length > 0) ||
      (Array.isArray(data.rawTexts) && data.rawTexts.length > 0);

    if (!hasText) {
      return this.unavailable(['textVoc']);
    }

    const sourceType =
      data.vocSourceType === 'AMAZON_REVIEW_VOC' || data.vocSourceType === 'EXTERNAL_VOC'
        ? data.vocSourceType
        : params.providerId === 'firecrawl'
          ? 'EXTERNAL_VOC'
          : 'EXTERNAL_VOC';

    const analyzedItemCount =
      typeof data.analyzedReviewCount === 'number'
        ? data.analyzedReviewCount
        : Array.isArray(data.rawTexts)
          ? data.rawTexts.length
          : null;

    const mapThemes = (items: any[], kind: string): VocTheme[] => {
      const themes: VocTheme[] = [];
      items.forEach((item, index) => {
        const label = (item?.topic || item?.useCase || item?.feature || item?.question || item?.label || '').toString().trim();
        if (!label) return;
        const scope = preserveVocScope(item?.scope);
        if (scope === 'CATEGORY' || scope === 'GENERIC') return;
        const subjectIds = (item?.subjectIds || [data.asin]).filter((id: string) => params.allowedSubjectIds.has(id) || id === data.asin);
        const observationCount = item?.frequency ?? item?.observationCount ?? null;
        const denominator = item?.sampleSize ?? item?.denominator ?? null;
        const eviId = `evi-voc-${kind}-${slug(label)}-${index}`;
        const quote = item?.quotes?.[0]?.quoteText || item?.quotes?.[0] || '';
        const evidenceScope = isProductFactScope(scope) ? 'PRODUCT' : toEvidenceScope(scope);
        params.evidenceSink.push({
          id: eviId,
          scope: evidenceScope,
          subjectId: subjectIds[0] || data.asin,
          source: params.providerId || 'UNKNOWN',
          content: `VOC ${kind}: ${label}${quote ? ` | quote: ${quote}` : ''} | n=${observationCount ?? 'UNKNOWN'}/${denominator ?? 'UNKNOWN'} | vocScope=${scope}`,
          sourceUrl: item?.quotes?.[0]?.url,
          capturedAt: new Date().toISOString(),
          metadata: { vocScope: scope },
        });
        themes.push({
          id: `voc-${kind}-${slug(label)}`,
          label,
          observationCount,
          denominator: denominator ?? null,
          percentage: percentageOf(observationCount, denominator),
          scope,
          subjectIds: subjectIds.length ? subjectIds : [data.asin],
          evidenceIds: [eviId],
          confidence: 0.7,
        });
      });
      return themes;
    };

    const painPoints = mapThemes(painRaw, 'pain');
    const praisePoints = mapThemes(Array.isArray(data.praisePoints) ? data.praisePoints : [], 'praise');
    const useCases = mapThemes(Array.isArray(data.useCases) ? data.useCases : [], 'usecase');
    const desiredFeatures = mapThemes(Array.isArray(data.desiredFeatures) ? data.desiredFeatures : [], 'feature');
    const questions = mapThemes(Array.isArray(data.questions) ? data.questions : [], 'question');
    const evidenceIds = [...painPoints, ...praisePoints, ...useCases, ...desiredFeatures, ...questions].flatMap((t) => t.evidenceIds);

    return {
      sourceType,
      analyzedItemCount,
      painPoints,
      praisePoints,
      useCases,
      desiredFeatures,
      questions,
      evidenceIds,
      missingDimensions: [],
    };
  }
}
