import { z } from 'zod';

export const ImageBriefItemSchema = z.object({
  slot: z.number().int().min(1).max(10),
  objective: z.string().min(3).default('Product Feature Visualization'),
  keyMessage: z.string().min(3).default('Visual representation of verified product facts'),
  visualDirection: z.string().min(5),
  factIds: z.array(z.string()).default([]),
  copy: z.array(z.string()).optional(),
});

export const APlusModuleItemSchema = z.object({
  moduleType: z.string().min(3),
  objective: z.string().min(3),
  headline: z.string().optional(),
  body: z.string().optional(),
  visualBrief: z.string().optional(),
  factIds: z.array(z.string()).default([]),
});

export const APlusPlanSchema = z.object({
  strategy: z.string().min(5),
  modules: z.array(APlusModuleItemSchema).min(1),
});

export const ClaimFactMappingSchema = z.object({
  claim: z.string().min(3),
  factIds: z.array(z.string()).min(1),
});

export const RufusCoverageItemSchema = z.object({
  questionId: z.string().optional(),
  question: z.string().min(5),
  coveredBy: z.array(z.enum(['TITLE', 'BULLET', 'DESCRIPTION', 'A_PLUS'])).min(1),
  answerSnippet: z.string().optional(),
});

export const normalizeListingPayload = (val: any): any => {
  if (!val || typeof val !== 'object') return val;
  const clone = { ...val };
  // Alias bullets -> bulletPoints
  if (!clone.bulletPoints && Array.isArray(clone.bullets)) {
    clone.bulletPoints = clone.bullets;
  }
  // Alias search_terms -> searchTerms
  if (!clone.searchTerms && typeof clone.search_terms === 'string') {
    clone.searchTerms = clone.search_terms;
  }
  // Alias image_briefs -> imageBriefs
  if (!clone.imageBriefs && Array.isArray(clone.image_briefs)) {
    clone.imageBriefs = clone.image_briefs;
  }
  // Normalize imageBriefs items if using short format like { slot, brief, factIds }
  if (Array.isArray(clone.imageBriefs)) {
    clone.imageBriefs = clone.imageBriefs.map((item: any) => {
      if (!item || typeof item !== 'object') return item;
      const brief = item.brief || item.description || item.visualDirection || item.keyMessage || 'Visual detail';
      return {
        slot: item.slot ?? 1,
        objective: item.objective || 'Feature Presentation',
        keyMessage: item.keyMessage || brief,
        visualDirection: item.visualDirection || brief,
        factIds: Array.isArray(item.factIds) ? item.factIds : [],
        copy: item.copy,
      };
    });
  }
  // Alias a_plus_plan -> aPlusPlan
  if (!clone.aPlusPlan && clone.a_plus_plan) {
    clone.aPlusPlan = clone.a_plus_plan;
  }
  // Alias rufus_coverage -> rufusCoverage
  if (!clone.rufusCoverage && Array.isArray(clone.rufus_coverage)) {
    clone.rufusCoverage = clone.rufus_coverage;
  }
  return clone;
};

const ListingOutputRawSchema = z.object({
  title: z.string().min(10).max(200),
  bulletPoints: z.array(z.string().min(15).max(600)).length(5),
  description: z.string().min(20),
  searchTerms: z.string().min(5).max(250),
  imageBriefs: z.array(ImageBriefItemSchema).min(1),
  aPlusPlan: APlusPlanSchema.optional(),
  claims: z.array(ClaimFactMappingSchema).min(1),
  rufusCoverage: z.array(RufusCoverageItemSchema).optional(),
});

export const ListingOutputStructuredSchema = z.preprocess(
  normalizeListingPayload,
  ListingOutputRawSchema,
);

export type ListingOutputStructured = z.infer<typeof ListingOutputRawSchema>;
