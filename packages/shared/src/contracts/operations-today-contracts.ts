import type { BusinessRecommendationRecord, RecommendationStatus } from './intelligence-contracts.js';

export type InventoryHealthLevel = 'HEALTHY' | 'WATCH' | 'CRITICAL';

export type InsightSource = 'WF05' | 'SIMULATOR' | 'VOC' | 'PLAYBOOK';

export type InsightSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface OperationsTodayHealth {
  revenue: number;
  profit: number;
  orders: number;
  acos: number;
  roas: number;
  margin: number;
  adsCost: number;
  inventoryHealth: InventoryHealthLevel;
  inventoryNote: string;
}

export interface OperationsInsightCard {
  id: string;
  source: InsightSource;
  severity: InsightSeverity;
  title: string;
  problem: string;
  evidence: string[];
  impact: string;
  recommendation: string;
}

export interface OperationsRecommendationView {
  id: string;
  decision: string;
  reason: string;
  confidence: number;
  status: RecommendationStatus;
  evidenceIds: string[];
  evidenceQuotes: string[];
  generatedBy: string;
  playbookRunId?: string;
  executionDispatched: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OperationsVocView {
  factId?: string;
  painPoints: string[];
  listingSuggestion?: string;
  productImprovement?: string;
  negativeCount: number;
  sampleSize: number;
  recentReviews: string[];
}

export interface OperationsTodayDto {
  asOf: string;
  headline: string;
  sim: {
    initialized: boolean;
    simDate?: string;
    dayIndex?: number;
    status?: string;
  };
  health: OperationsTodayHealth;
  criticalIssues: OperationsInsightCard[];
  insights: OperationsInsightCard[];
  recommendations: OperationsRecommendationView[];
  voc: OperationsVocView | null;
  recentDecisions: Array<{
    id: string;
    decision: string;
    status: RecommendationStatus;
    updatedAt: string;
  }>;
  diagnosis: {
    taskId: string;
    status: string;
    healthStatus?: string;
  } | null;
}

export type { BusinessRecommendationRecord };
