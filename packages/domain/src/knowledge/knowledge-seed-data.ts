import crypto from 'node:crypto';
import { KnowledgeDocument } from '@crosspilot/shared';

function calculateChecksum(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex').substring(0, 16);
}

const DOC_AMZ_POLICY_CONTENT = `# Amazon US Product Detail Page Rules and Title Standards

## Title Requirements
- Amazon Product Detail Page Rules (Sec. 2.1): Titles must not exceed 200 characters including spaces.
- Capitalize the first letter of each word (Title Case), excluding articles, conjunctions, and prepositions of fewer than four letters.
- Do NOT include promotional phrases, subjective rankings, or temporary claims such as '#1 Best Seller', 'Top Rated', 'Free Shipping', 'Lowest Price', or '100% Quality Guaranteed'.
- Prohibit decorative symbols, punctuation strings, or emojis (&, !, *, $, etc. must not be used purely for decoration).
- Required Title elements: Brand name, Product series, Material or Key spec/size, Core Product Type, and Model/Variant if applicable.

## Bullet Points (Key Product Features)
- Maximum 5 bullet points, total combined length should not exceed 1000 characters for optimal mobile rendering.
- Start each bullet point with a capitalized feature or benefit headline in brackets or followed by a colon.
- Prioritize confirmed physical specifications and functional features in Bullets 1 and 2.
- Prohibit warranty terms, return policies, or company contact details inside bullet points.
- Strictly prohibit ungrounded medical, antimicrobial, or FDA claims (e.g., 'FDA approved', 'cures mold', 'hospital grade sanitation').

## Backend Search Terms
- Search Terms must strictly not exceed 250 bytes (Amazon US standard byte limit).
- Do not repeat brand name or product title words; separate terms with single spaces without commas or punctuation.`;

const DOC_AMZ_MATERIAL_CONTENT = `# Amazon Stone and Countertop Accessory Authenticity Guidelines

## Genuine Material Claims and Authenticity
- Natural Stone Policy: Products claimed as 'Natural Marble' or 'Genuine Stone' must be carved from authentic geological stone.
- Prohibit deceptive labeling: Synthetic resin, acrylic composite, or stone-powder mixed materials must NEVER be advertised as 'natural marble' or 'solid stone'.
- Veining and Appearance Disclosure: Sellers of handcrafted natural stone products must clearly disclose that natural geological veining, organic pattern variations, and mineral tones are inherent and vary between individual pieces.

## Countertop Safety and Moisture Protection
- Countertop bathroom accessories must disclose base protection specifications (e.g., cushioned EVA non-slip pads or silicone feet) to prevent scratching delicate vanity surfaces.
- Water-Resistant Care Instructions: Natural stone accessories in humid bathroom settings must provide care recommendations (e.g., wipe clean with a soft damp cloth, avoid harsh acidic cleaners) to maintain polished surface sealing.`;

const DOC_COSMO_SEO_CONTENT = `# Amazon COSMO Algorithm Alignment and Buyer Query Compatibility

## Semantic Query Alignment Principles
- Amazon COSMO (Common Sense Knowledge Graph) maps user search queries to implicit buyer needs and physical use-case requirements.
- When shoppers search for 'electric toothbrush holder', COSMO evaluates whether the listing explicitly satisfies the specific physical handle accommodation requirement (e.g., slot diameter up to 1.5 inches).
- Listings that connect verified product dimensions directly to user tasks (e.g., accommodating standard manual brushes and bulky rechargeable electric handles) achieve higher semantic relevance.

## Stability and Countertop Placement Relevance
- Weight is a primary conversion driver in bath organizers: buyers specifically search for 'heavy toothbrush holder' to solve tipping frustrations.
- Quantified base weight (e.g., 3.57 lbs solid stone) directly answers the stability intent and ranks higher in conversational and semantic discovery compared to generic assertions like 'very stable'.`;

const DOC_GEO_RUFUS_CONTENT = `# Generative Engine Optimization (GEO) and AI Shopping Assistant Specs Playbook

## Structured Specification Delivery for AI Assistants
- Generative Engine Optimization (GEO) prepares product copy for ingestion by conversational AI shopping assistants such as Amazon Rufus.
- AI shopping assistants extract structured facts from product copy to answer user questions directly in search sessions.
- Always state exact verified measurements (e.g., '1.5-inch diameter slots', '3.57 lbs substantial weight') and metric equivalents (38.1 mm, 1.62 kg) directly in bullet points.
- Explicit dimension and weight specifications allow AI shopping engines to answer direct compatibility questions (e.g., 'Will this fit my toothbrush?') with high factual confidence.

## Avoiding Ambiguity in Feature Descriptions
- Avoid subjective adjectives ('large slots', 'super heavy') without backing figures.
- Use concrete, factual phrases: 'engineered with 1.5" wide compartments' and 'weighted 3.57 lbs base stays firmly in place on countertops'.`;

const DOC_RUFUS_INTENT_CONTENT = `# Amazon Rufus Customer Questions and Intent Patterns for Bathroom Caddies

## Frequent Buyer Questions (Rufus Q&A Patterns)
- Question 1: 'Will this fit electric toothbrush handles or only skinny manual brushes?'
  Intent Insight: Buyers need reassurance that compartments are wide enough (1.5" diameter) for rechargeable handles without jamming.
- Question 2: 'Does it slide around or tip over when pulling a brush out with wet hands?'
  Intent Insight: Buyers look for substantial weight (over 3 lbs) and non-slip bottom protective pads so the holder stays anchored on wet vanity countertops.
- Question 3: 'How do you clean and maintain natural stone bathroom accessories?'
  Intent Insight: Buyers want simple care: non-porous polished finish that rinses clean or wipes down with a damp cloth without staining.
- Question 4: 'Is each piece identical in pattern?'
  Intent Insight: Natural marble veining variation is valued by luxury buyers as a bespoke artisan hallmark rather than a defect.`;

export const SEED_KNOWLEDGE_DOCUMENTS: KnowledgeDocument[] = [
  {
    id: 'DOC-AMZ-POL-2026-01',
    knowledgeType: 'AUTHORITY',
    sourceType: 'INTERNAL_GUIDE',
    title: 'Amazon US Product Detail Page Rules and Title Standards',
    source: 'Internal Guide (compiled from Amazon Seller Central PDP Rules)',
    sourceUrl: 'https://sellercentral.amazon.com/help/hub/reference/external/200390640',
    marketplace: 'AMAZON_US',
    category: 'Home & Kitchen',
    version: '2026.1',
    effectiveAt: '2026-01-01T00:00:00Z',
    capturedAt: '2026-09-01T00:00:00Z',
    content: DOC_AMZ_POLICY_CONTENT,
    checksum: calculateChecksum(DOC_AMZ_POLICY_CONTENT),
    status: 'INDEXED',
  },
  {
    id: 'DOC-AMZ-GUIDE-2026-04',
    knowledgeType: 'AUTHORITY',
    sourceType: 'INTERNAL_GUIDE',
    title: 'Amazon Stone and Countertop Accessory Authenticity Guidelines',
    source: 'Internal Guide (compiled from Amazon Authenticity & Material Claims Policy)',
    sourceUrl: 'https://sellercentral.amazon.com/help/hub/reference/external/201165970',
    marketplace: 'AMAZON_US',
    category: 'Home & Kitchen',
    version: '2026.1',
    effectiveAt: '2026-01-01T00:00:00Z',
    capturedAt: '2026-09-01T00:00:00Z',
    content: DOC_AMZ_MATERIAL_CONTENT,
    checksum: calculateChecksum(DOC_AMZ_MATERIAL_CONTENT),
    status: 'INDEXED',
  },
  {
    id: 'DOC-SEO-COSMO-01',
    knowledgeType: 'OPTIMIZATION',
    sourceType: 'COSMO_RESEARCH',
    title: 'Amazon COSMO Algorithm Alignment and Buyer Query Compatibility',
    source: 'COSMO Research Reference (Amazon User Intent & Common Sense Knowledge Graph)',
    marketplace: 'AMAZON_US',
    category: 'Home & Kitchen',
    version: '2026.1',
    effectiveAt: '2026-01-01T00:00:00Z',
    capturedAt: '2026-09-01T00:00:00Z',
    content: DOC_COSMO_SEO_CONTENT,
    checksum: calculateChecksum(DOC_COSMO_SEO_CONTENT),
    status: 'INDEXED',
  },
  {
    id: 'DOC-GEO-RUFUS-02',
    knowledgeType: 'OPTIMIZATION',
    sourceType: 'GEO_RESEARCH',
    title: 'Generative Engine Optimization (GEO) and AI Shopping Assistant Specs Playbook',
    source: 'GEO Research Playbook (Generative Engine Optimization for Shopping Assistants)',
    marketplace: 'GLOBAL',
    category: 'Home & Kitchen',
    version: '2026.1',
    effectiveAt: '2026-01-01T00:00:00Z',
    capturedAt: '2026-09-01T00:00:00Z',
    content: DOC_GEO_RUFUS_CONTENT,
    checksum: calculateChecksum(DOC_GEO_RUFUS_CONTENT),
    status: 'INDEXED',
  },
  {
    id: 'DOC-INT-RUFUS-01',
    knowledgeType: 'INTENT',
    sourceType: 'RUFUS_QA_PATTERN',
    title: 'Amazon Rufus Customer Questions and Intent Patterns for Bathroom Caddies',
    source: 'Rufus Q&A Intent Patterns Reference',
    marketplace: 'AMAZON_US',
    category: 'Home & Kitchen',
    version: '2026.1',
    effectiveAt: '2026-01-01T00:00:00Z',
    capturedAt: '2026-09-01T00:00:00Z',
    content: DOC_RUFUS_INTENT_CONTENT,
    checksum: calculateChecksum(DOC_RUFUS_INTENT_CONTENT),
    status: 'INDEXED',
  },
];
