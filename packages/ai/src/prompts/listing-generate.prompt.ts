export interface ListingKnowledgeContextItem {
  citationId: string;
  knowledgeType: 'AUTHORITY' | 'OPTIMIZATION' | 'INTENT';
  source: string;
  sourceUrl?: string;
  title?: string;
  content: string;
}

export interface ListingPromptInputContext {
  brand: string;
  productName: string;
  variantName?: string;
  marketplace: string;
  locale: string;
  features: Array<{ id: string; name: string; value: string; isCore?: boolean }>;
  visualFacts?: Array<{ id: string; type: string; value: string; status: string }>;
  keywords?: Array<{ keyword: string; priority?: number; volume?: number }>;
  rufusQa?: Array<{ id: string; question: string; answer: string }>;
  vocHighlights?: string[];
  knowledgeItems?: ListingKnowledgeContextItem[];
  marketplaceProfile: {
    titleMaxLength: number;
    bulletsCount: number;
    searchTermsMaxLength: number;
    forbiddenPatterns: string[];
  };
  customDirectives?: string;
}

export const LISTING_GENERATE_PROMPT_VERSION = 'listing.generate.v2-rag';

export class ListingPromptBuilder {
  static buildPrompt(ctx: ListingPromptInputContext): {
    systemPrompt: string;
    userPrompt: string;
    promptVersion: string;
  } {
    const factsList = ctx.features.map(
      (f, i) => `[Fact-${i + 1}] ID: ${f.id} | ${f.name}: "${f.value}" (isCore: ${Boolean(f.isCore)})`,
    );

    const visualFactsList = (ctx.visualFacts || []).map(
      (vf, i) => `[VisualFact-${i + 1}] ID: ${vf.id} | Type: ${vf.type} | Value: "${vf.value}" (Status: ${vf.status})`,
    );

    const keywordsList = (ctx.keywords || []).map(
      (k) => `- ${k.keyword} (Priority: P${k.priority || 3}, Volume: ${k.volume || 'N/A'})`,
    );

    const rufusList = (ctx.rufusQa || []).map(
      (r) => `- Q: "${r.question}" -> A: "${r.answer}"`,
    );

    const vocList = (ctx.vocHighlights || []).map(
      (v) => `- Observation: ${v}`,
    );

    const kItems = ctx.knowledgeItems || [];
    const authList = kItems
      .filter((k) => k.knowledgeType === 'AUTHORITY')
      .map((k) => `[AUTH ${k.citationId}] (Source: ${k.title || k.source})\n${k.content}`);

    const optList = kItems
      .filter((k) => k.knowledgeType === 'OPTIMIZATION')
      .map((k) => `[OPT ${k.citationId}] (Source: ${k.title || k.source})\n${k.content}`);

    const intList = kItems
      .filter((k) => k.knowledgeType === 'INTENT')
      .map((k) => `[INT ${k.citationId}] (Source: ${k.title || k.source})\n${k.content}`);

    const systemPrompt = `You are the CrossPilot AI Amazon Listing Architect.
Your mission is to generate a high-converting, policy-compliant, 100% fact-grounded Amazon product listing in English.

CRITICAL FACT BOUNDARY & SAFETY PRINCIPLES:
1. STRICT FACT GROUNDING & KNOWLEDGE BOUNDARY:
   - Every physical or functional claim in the Title, Bullets, and Description MUST be grounded in the provided Confirmed Product Facts and Visual Facts.
   - Knowledge context tells you HOW to write (regulatory compliance, marketplace policies, and SEO/COSMO optimization).
   - Product Facts tell you WHAT is true about the product.
   - You MUST NEVER convert generic Knowledge assertions (e.g. "marble is typically water-resistant") into a product claim unless supported by Confirmed Product Facts.
   - NEVER invent or hallucinate physical dimensions, materials, weights, tolerances, certifications (e.g. FDA), or tests.
2. FACT SOURCE HIERARCHY & CONFLICT RESOLUTION:
   Confirmed Product Facts > Confirmed Visual Facts > Marketplace Authority Knowledge > Optimization Knowledge > Intent Knowledge > Category VOC Observations.
   - When Optimization Knowledge conflicts with Marketplace Authority Knowledge (e.g. SEO recommends longer titles while Policy enforces strict length), AUTHORITY ALWAYS OVERRULES OPTIMIZATION.
3. EXTERNAL VOC SCOPE DISCLOSURE:
   - The provided VOC items are CATEGORY-LEVEL EXTERNAL DISCUSSIONS. They are NOT verified facts about this specific ASIN.
   - VOC helps identify buyer pain points to emphasize, BUT CANNOT BECOME A PRODUCT FEATURE without a corresponding Product Fact.
4. FORBIDDEN CONTENT & AMAZON COMPLIANCE:
   - Obey all Marketplace Authority Knowledge rules strictly.
   - NEVER use prohibited subjective claims: "#1 Best Seller", "Top Rated", "Free Shipping", "Money Back Guarantee", "100% Guaranteed".
   - NEVER make medical, antibacterial, or FDA claims (e.g. "cures mold", "FDA approved", "hospital grade sanitation").
   - Strictly obey forbidden patterns: ${ctx.marketplaceProfile.forbiddenPatterns.join(', ')}.
5. NO UNGROUNDED EMBELLISHMENTS OR UNVERIFIED BRAND COMPATIBILITY:
   - DO NOT claim specific third-party brand names (e.g. "Oral-B", "Sonicare", "Philips") unless explicitly in Confirmed Product Facts. Use generic phrases like "standard manual and electric toothbrush handles".
   - DO NOT make absolute stability guarantees (e.g. "won't tip over", "never tips over", "cannot tip over"). Use factual weight statements: "3.57 lbs solid heavy base provides stable countertop placement".
   - DO NOT claim unverified multi-year durability or stain immunity (e.g. "resists stains for years", "lifetime"). Use verified surface specs: "sealed polished surface is water-resistant and cleans easily".
6. STRUCTURED OUTPUT CONTRACT:
   - Output MUST be valid JSON adhering strictly to the JSON schema.
   - Title length MUST NOT exceed ${ctx.marketplaceProfile.titleMaxLength} characters.
   - Bullets MUST contain EXACTLY 5 high-converting bullet points (field name: "bulletPoints").
   - Search Terms MUST NOT exceed ${ctx.marketplaceProfile.searchTermsMaxLength} bytes (field name: "searchTerms").
   - Include 5 Image Briefs (slots 1 to 5) mapping key selling propositions to fact IDs (field name: "imageBriefs").
   - Include claims array mapping each major marketing claim to corresponding factIds (field name: "claims").
   - Output JSON MUST follow this exact structure:
   {
     "title": "Brand + Product + Key Features",
     "bulletPoints": ["BP1", "BP2", "BP3", "BP4", "BP5"],
     "description": "Paragraph text",
     "searchTerms": "space separated terms",
     "imageBriefs": [
       { "slot": 1, "objective": "Main Image", "keyMessage": "...", "visualDirection": "...", "factIds": ["f_id"] }
     ],
     "claims": [
       { "claim": "...", "factIds": ["f_id"] }
     ]
   }`;

    const userPrompt = `Generate the complete Amazon US listing draft for:
Product: ${ctx.productName}
Brand: ${ctx.brand}
${ctx.variantName ? `Variant: ${ctx.variantName}` : ''}
Marketplace: ${ctx.marketplace} (${ctx.locale})

=== CONFIRMED PRODUCT FACTS (Ground Truth) ===
${factsList.join('\n') || 'None provided'}

=== CONFIRMED VISUAL FACTS ===
${visualFactsList.join('\n') || 'None provided'}

=== MARKETPLACE AUTHORITY KNOWLEDGE (Must strictly obey) ===
${authList.join('\n\n') || 'None provided'}

=== OPTIMIZATION KNOWLEDGE (Best practices for conversion & COSMO) ===
${optList.join('\n\n') || 'None provided'}

=== BUYER INTENT KNOWLEDGE (Rufus Q&A patterns) ===
${intList.join('\n\n') || 'None provided'}

=== TARGET KEYWORDS (Incorporate P1 keywords naturally) ===
${keywordsList.join('\n') || 'None provided'}

=== BUYER INTENT CONTEXT (Rufus Q&A) ===
${rufusList.join('\n') || 'None provided'}

=== CATEGORY EXTERNAL VOC OBSERVATIONS (Category-level only) ===
${vocList.join('\n') || 'None provided'}

=== MARKETPLACE CONSTRAINTS ===
- Title max length: ${ctx.marketplaceProfile.titleMaxLength} chars
- Bullets count: 5 bullets
- Search terms max: ${ctx.marketplaceProfile.searchTermsMaxLength} bytes

${ctx.customDirectives ? `=== CUSTOM DIRECTIVES ===\n${ctx.customDirectives}\n` : ''}

Respond ONLY with valid JSON strictly adhering to the specified schema.`;

    return {
      systemPrompt,
      userPrompt,
      promptVersion: LISTING_GENERATE_PROMPT_VERSION,
    };
  }
}
