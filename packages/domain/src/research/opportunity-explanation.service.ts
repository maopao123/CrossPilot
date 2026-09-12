import {
  OpportunityExplanation,
  ProductOpportunity,
  StructuredFact,
} from '@crosspilot/shared';

export interface OpportunityExplanationPromptTemplate {
  systemPrompt: string;
  userPrompt: string;
  contextData: Record<string, unknown>;
}

export class OpportunityExplanationService {
  /**
   * Builds an LLM explanation prompt that strictly constrains the model:
   * 1. The LLM MUST NOT recalculate, modify, or fabricate scores or metrics.
   * 2. Every claim must strictly reference the provided StructuredFacts and evidenceIds.
   * 3. Explanations must be split into FACT, SIGNAL, INFERENCE, and RECOMMENDATION.
   */
  static buildExplanationPrompt(opportunity: ProductOpportunity): OpportunityExplanationPromptTemplate {
    const factsList = [
      ...opportunity.strengths,
      ...opportunity.risks,
      ...opportunity.opportunities,
    ].map(
      (f, idx) =>
        `[${idx + 1}] Level: ${f.level} | Code: ${f.code} | Statement: ${f.statement} | EvidenceIds: [${f.evidenceIds.join(', ')}]`,
    );

    const signalsSummary = Object.entries(opportunity.signals).map(
      ([key, s]) =>
        `- Signal ${key.toUpperCase()} (${s.label}): Status=${s.status}, Score=${s.normalizedScore ?? 'NULL'}, Weight=${s.weight}, Findings: ${s.findings.join('; ')}`,
    );

    const systemPrompt = `You are CrossPilot Research Decision Layer Assistant.
CRITICAL ENFORCEMENT RULES:
1. You MUST NEVER recalculate, invent, hallucinate, or alter any numeric scores, weights, frequencies, percentages, or prices.
2. The overall opportunity score is a HEURISTIC RELATIVE RANKING (规则型机会评分) FIXED at ${opportunity.overallScore ?? 'INSUFFICIENT_EVIDENCE'}/100. You MUST NEVER refer to it as a "success probability" (e.g., NEVER "58% 成功率") or sales guarantee.
3. Recommendations MUST be directional (e.g. "扩大插槽兼容范围，实测主流手柄尺寸后再确定孔径公差"). You MUST NEVER invent or hallucinate exact engineering tolerances or physical dimensions (e.g. "3.2cm") unless verbatim in evidence.
4. Every factual statement or recommendation MUST cite the corresponding evidenceId(s) or StructuredFact code.
5. Maintain strict boundaries between:
   - [FACT]: Verifiable raw data from providers
   - [SIGNAL]: Algorithmic calculated metrics
   - [INFERENCE]: Deductions from combined signals
   - [RECOMMENDATION]: Actionable seller strategies.`;

    const userPrompt = `Please generate an executive product opportunity review for keyword "${opportunity.keyword}" in marketplace "${opportunity.marketplace}".

Available Deterministic Signals:
${signalsSummary.join('\n')}

Structured Facts & Evidence:
${factsList.join('\n')}

Please output the explanation adhering to the OpportunityExplanation schema:
- summary: High-level executive synthesis with overall score
- demandAnalysis: Concrete demand volume and ABA rank synthesis
- competitionAnalysis: Barrier evaluation based on review counts and CPC
- differentiationOpportunity: Specific VOC pain points and feature opportunities
- actionableRecommendations: Concrete design and launch steps`;

    return {
      systemPrompt,
      userPrompt,
      contextData: {
        opportunityId: opportunity.opportunityId,
        keyword: opportunity.keyword,
        overallScore: opportunity.overallScore,
        confidence: opportunity.confidence,
        signals: opportunity.signals,
      },
    };
  }

  /**
   * Formats structured facts for display in UI or logs with color and level tags
   */
  static formatFactTag(fact: StructuredFact): string {
    switch (fact.level) {
      case 'FACT':
        return `[事实 FACT] ${fact.statement}`;
      case 'SIGNAL':
        return `[信号 SIGNAL] ${fact.statement}`;
      case 'INFERENCE':
        return `[推断 INFERENCE] ${fact.statement}`;
      case 'RECOMMENDATION':
        return `[建议 RECOMMENDATION] ${fact.statement}`;
      default:
        return fact.statement;
    }
  }
}
