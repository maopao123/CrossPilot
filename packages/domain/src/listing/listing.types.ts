export type VisualFactType =
  | 'COLOR'
  | 'SHAPE'
  | 'COMPONENT'
  | 'VISIBLE_FEATURE'
  | 'PACKAGING'
  | 'USAGE_CONTEXT'
  | 'OTHER';

export type VisualFactStatus = 'EXTRACTED' | 'CONFIRMED' | 'REJECTED';

export interface VisualFact {
  id: string;
  productId: string;
  imageId: string;
  imageUrl?: string;
  type: VisualFactType;
  value: string;
  confidence: number;
  status: VisualFactStatus;
  evidenceRegion?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
}

export type KeywordSource = 'MANUAL' | 'TXT' | 'EXCEL' | 'VOC' | 'SEARCH_TERM';

export interface KeywordItem {
  keyword: string;
  normalizedKeyword: string;
  source: KeywordSource;
  priority?: number;
  volume?: number;
  relevance?: number;
  metadata?: Record<string, unknown>;
}

export interface RufusQaItem {
  id: string;
  question: string;
  answer: string;
  source?: 'MANUAL' | 'TXT' | 'EXCEL';
  mappedFactIds?: string[];
}

export interface MarketplacePolicyProfile {
  marketplace: string;
  locale: string;
  title: {
    maxLength: number;
    rules: string[];
  };
  bullets: {
    maxCount: number;
    totalMaxLength: number;
    rules: string[];
  };
  searchTerms: {
    maxLength: number;
    rules: string[];
  };
  forbiddenPatterns: string[];
  updatedAt: string;
  evidenceIds?: string[];
}

export interface ListingCreativeBrief {
  listingVersionId: string;
  productId: string;
  skuIds: string[];
  imageBriefs: Array<{
    slot: number;
    objective: string;
    keyMessage: string;
    factIds: string[];
    visualDirection: string;
    copy?: string[];
  }>;
  aPlusPlan?: {
    strategy: string;
    modules: Array<{
      moduleType: string;
      objective: string;
      factIds: string[];
      copy?: string;
      visualDirection?: string;
    }>;
  };
}

export interface ListingKnowledgeEvidence {
  sourceId: string;
  sourceType:
    | 'AMAZON_POLICY'
    | 'AMAZON_GUIDELINE'
    | 'SEO_REFERENCE'
    | 'COSMO_RESEARCH'
    | 'GEO_RESEARCH';
  authorityLevel: 'AUTHORITY' | 'OPTIMIZATION' | 'CONTEXT';
  quotedText: string;
}

export interface ListingDraftV2 {
  marketplace: string;
  locale: string;
  title: string;
  bulletPoints: string[];
  description: string;
  searchTerms: string;
  aPlusCopy?: Array<{
    headline: string;
    body: string;
  }>;
  imageBriefs: Array<{
    slot: number;
    objective: string;
    keyMessage: string;
    visualDirection: string;
    factIds: string[];
    copy?: string[];
  }>;
  aPlusPlan?: {
    strategy: string;
    modules: Array<{
      moduleType: string;
      objective: string;
      headline?: string;
      body?: string;
      visualBrief?: string;
      factIds: string[];
    }>;
  };
  usedKeywords: string[];
  unusedHighPriorityKeywords?: string[];
  rufusCoverage?: Array<{
    questionId?: string;
    question: string;
    coveredBy: ('TITLE' | 'BULLET' | 'DESCRIPTION' | 'A_PLUS')[];
    answerSnippet?: string;
  }>;
  claims: Array<{
    claim: string;
    factIds: string[];
  }>;
  knowledgeEvidence?: ListingKnowledgeEvidence[];
  generationSource: string;
  modelUsed?: string;
}
