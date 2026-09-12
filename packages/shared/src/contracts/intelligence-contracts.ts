export type RecommendationStatus =
  | 'GENERATED'
  | 'WAITING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXECUTED'
  | 'VERIFIED';

export interface CommerceFactRecord {
  id: string;
  workspaceId: string;
  factType: string;
  metric: string;
  valueJson: Record<string, unknown>;
  sourceProvider: string;
  sourceReference: string;
  observedAt: string;
  playbookRunId?: string;
  createdAt: string;
}

export interface CreateFactInput {
  factType: string;
  metric: string;
  valueJson: Record<string, unknown>;
  sourceProvider: string;
  sourceReference: string;
  observedAt?: string;
  playbookRunId?: string;
}

export interface EvidenceItemRecord {
  id: string;
  workspaceId: string;
  factId: string;
  sourceType: string;
  sourceId: string;
  quote: string;
  confidence: number;
  playbookRunId?: string;
  createdAt: string;
}

export interface CreateEvidenceInput {
  factId: string;
  sourceType: string;
  sourceId: string;
  quote: string;
  confidence: number;
  playbookRunId?: string;
}

export interface BusinessRecommendationRecord {
  id: string;
  workspaceId: string;
  decision: string;
  reason: string;
  confidence: number;
  evidenceIds: string[];
  status: RecommendationStatus;
  playbookRunId?: string;
  executionDispatched: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRecommendationInput {
  decision: string;
  reason: string;
  confidence: number;
  evidenceIds: string[];
  playbookRunId?: string;
}

export interface VocIntelligenceInput {
  reviews?: string[];
  listingText?: string;
  feedback?: string[];
}

export interface VocIntelligenceResult {
  cleanedTexts: string[];
  topics: Array<{ topicType: 'PAIN_POINT' | 'PRAISE' | 'FEATURE_REQUEST'; text: string }>;
  painPoints: string[];
  outputs: {
    productImprovement: string;
    listingImprovement: string;
    creativeBrief: string;
    customerServiceKnowledge: string;
  };
}

export interface AmazonResearchPlaybookInput {
  keyword: string;
  category: string;
  marketplace?: string;
  searchVolume?: number;
  products?: Array<{
    asin?: string;
    title?: string;
    price?: number;
    rating?: number;
    reviewCount?: number;
  }>;
  reviews?: string[];
  listingText?: string;
  feedback?: string[];
}
