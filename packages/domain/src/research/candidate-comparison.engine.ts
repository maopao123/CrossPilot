import {
  CandidateComparisonResult,
  CandidateRisk,
  ComparisonConclusion,
  ComparisonDimension,
  ComparisonReason,
  EvidenceItem,
  Assumption,
  ProductCandidate,
} from '@crosspilot/shared';
import { CandidateDecisionEngine } from './candidate-decision.engine.js';

export class CandidateComparisonEngine {
  /**
   * Deterministic horizontal comparison of 3-5 product candidates based on uniform accounting basis.
   * Emits structured, fully-traceable comparison reasons:
   * Conclusion -> Metric -> Raw Values -> Evidence / Assumption.
   */
  static compare(candidates: ProductCandidate[]): CandidateComparisonResult {
    const candidateIds = candidates.map((c) => c.id);

    if (candidates.length < 2) {
      return {
        candidateIds,
        ranking: candidateIds,
        pairwiseReasons: {},
        summary: '至少需要 2 个候选方案方可执行横向对比。',
        comparable: true,
      };
    }

    // 1. Uniform Basis & Comparability Check
    const marketplaces = new Set(candidates.map((c) => c.marketplace));
    const currencies = new Set(candidates.map((c) => c.economics.currency));

    if (marketplaces.size > 1 || currencies.size > 1) {
      const nonComparableReason = `数据口径不一致: 存在不同站点 [${Array.from(marketplaces).join(', ')}] 或不同币种 [${Array.from(currencies).join(', ')}]，严禁跨币种/跨站点强行排序。`;
      return {
        candidateIds,
        ranking: candidateIds,
        pairwiseReasons: {},
        summary: nonComparableReason,
        comparable: false,
        nonComparableReason,
      };
    }

    // 2. Refresh decisions for all candidates to guarantee deterministic state
    const evaluatedCandidates = candidates.map((c) => {
      const detail = CandidateDecisionEngine.evaluate(c);
      return {
        ...c,
        decision: detail.verdict,
        decisionDetail: detail,
      };
    });

    // 3. Perform Pairwise Comparisons
    const pairwiseReasons: Record<string, ComparisonReason[]> = {};

    for (let i = 0; i < evaluatedCandidates.length; i++) {
      for (let j = 0; j < evaluatedCandidates.length; j++) {
        if (i === j) continue;
        const candA = evaluatedCandidates[i];
        const candB = evaluatedCandidates[j];
        const pairKey = `${candA.id}_vs_${candB.id}`;
        pairwiseReasons[pairKey] = this.comparePair(candA, candB);
      }
    }

    // 4. Deterministic Ranking
    // Tier hierarchy: SHORTLIST (5) > WATCH (4) > NEEDS_VALIDATION (3) > INSUFFICIENT_DATA (2) > BLOCKED (1)
    const tierWeights: Record<string, number> = {
      SHORTLIST: 5,
      WATCH: 4,
      NEEDS_VALIDATION: 3,
      INSUFFICIENT_DATA: 2,
      BLOCKED: 1,
    };

    const sorted = [...evaluatedCandidates].sort((a, b) => {
      const weightA = tierWeights[a.decision] ?? 0;
      const weightB = tierWeights[b.decision] ?? 0;
      if (weightA !== weightB) {
        return weightB - weightA;
      }

      // Within same decision tier, complete economics rank ahead of incomplete
      const aEconComplete = a.economics.status === 'COMPLETE';
      const bEconComplete = b.economics.status === 'COMPLETE';
      if (aEconComplete !== bEconComplete) {
        return bEconComplete ? 1 : -1;
      }

      // If both complete, rank by Contribution Margin descending
      if (aEconComplete && bEconComplete) {
        const marginA = a.economics.scenarios.base.contributionMargin;
        const marginB = b.economics.scenarios.base.contributionMargin;
        if (Math.abs(marginA - marginB) > 0.0001) {
          return marginB - marginA;
        }
      }

      // Then by Evidence Coverage Heuristic
      const compA =
        a.decisionDetail?.evidenceCoverageHeuristic ?? a.decisionDetail?.evidenceCompleteness ?? 0;
      const compB =
        b.decisionDetail?.evidenceCoverageHeuristic ?? b.decisionDetail?.evidenceCompleteness ?? 0;
      if (Math.abs(compA - compB) > 0.0001) {
        return compB - compA;
      }

      // Tie-breaker by ID alphabetically
      return a.id.localeCompare(b.id);
    });

    const ranking = sorted.map((c) => c.id);
    const topCandidate = sorted[0];

    const isTopEconComplete = topCandidate.economics.status === 'COMPLETE';
    const topMarginText = isTopEconComplete
      ? `贡献利润率 ${(topCandidate.economics.scenarios.base.contributionMargin * 100).toFixed(1)}%`
      : '财务待核验 (无完整边际数据)';

    const summary = `在 ${candidates.length} 个候选方案的同口径测算中，当前最优先推荐【${topCandidate.title} (${topCandidate.id})】(决策状态: ${topCandidate.decision}，${topMarginText})。完整因果链条支持逐项下钻溯源。`;

    return {
      candidateIds,
      ranking,
      pairwiseReasons,
      summary,
      comparable: true,
    };
  }

  /**
   * Evaluates pairwise differences across 4 core dimensions for candidate pair (A, B).
   * Ensures complete dual-sided traceability: candidateAEvidenceIds & candidateBEvidenceIds.
   */
  static comparePair(candA: ProductCandidate, candB: ProductCandidate): ComparisonReason[] {
    const reasons: ComparisonReason[] = [];

    // Dimension 1: ECONOMICS
    const econA = candA.economics;
    const econB = candB.economics;
    const isEconAComplete = econA.status === 'COMPLETE';
    const isEconBComplete = econB.status === 'COMPLETE';

    let econConclusion: ComparisonConclusion = 'SIMILAR';
    let econExplanation = '';
    const econMetricIds = ['contributionMargin', 'contributionProfit', 'sellingPrice', 'productCost'];

    const aEconEvi = [
      econA.inputs.productCost.evidenceId,
      econA.inputs.sellingPrice.evidenceId,
    ].filter(Boolean) as string[];
    const bEconEvi = [
      econB.inputs.productCost.evidenceId,
      econB.inputs.sellingPrice.evidenceId,
    ].filter(Boolean) as string[];

    const aEconAsm = [
      econA.inputs.productCost.assumptionId,
      econA.inputs.adsCostPerUnit.assumptionId,
      econA.inputs.returnRate.assumptionId,
    ].filter(Boolean) as string[];
    const bEconAsm = [
      econB.inputs.productCost.assumptionId,
      econB.inputs.adsCostPerUnit.assumptionId,
      econB.inputs.returnRate.assumptionId,
    ].filter(Boolean) as string[];

    if (!isEconAComplete && isEconBComplete) {
      econConclusion = 'B_BETTER';
      econExplanation = `Candidate A 缺失关键财务数据 [${econA.missingInputs.join(', ')}]，而 Candidate B 具备完整财务测算 (贡献利润率 ${(econB.scenarios.base.contributionMargin * 100).toFixed(1)}%)，B 财务确定性优于 A。`;
    } else if (isEconAComplete && !isEconBComplete) {
      econConclusion = 'A_BETTER';
      econExplanation = `Candidate A 具备完整财务测算 (贡献利润率 ${(econA.scenarios.base.contributionMargin * 100).toFixed(1)}%)，而 Candidate B 缺失关键财务数据 [${econB.missingInputs.join(', ')}]，A 财务确定性显著优于 B。`;
    } else if (!isEconAComplete && !isEconBComplete) {
      econConclusion = 'SIMILAR';
      econExplanation = '双方均存在财务数据缺失，处于待核验状态。';
    } else {
      const marginA = econA.scenarios.base.contributionMargin;
      const marginB = econB.scenarios.base.contributionMargin;
      const profitA = econA.scenarios.base.contributionProfit;
      const profitB = econB.scenarios.base.contributionProfit;

      if (marginA > marginB + 0.02) {
        econConclusion = 'A_BETTER';
        econExplanation = `Candidate A 基准贡献利润率 ${(marginA * 100).toFixed(1)}% (单件利润 $${profitA.toFixed(2)}) 优于 Candidate B 的 ${(marginB * 100).toFixed(1)}% (单件利润 $${profitB.toFixed(2)})，具备更充足的抗风险与广告空间。`;
      } else if (marginB > marginA + 0.02) {
        econConclusion = 'B_BETTER';
        econExplanation = `Candidate B 基准贡献利润率 ${(marginB * 100).toFixed(1)}% (单件利润 $${profitB.toFixed(2)}) 优于 Candidate A 的 ${(marginA * 100).toFixed(1)}% (单件利润 $${profitA.toFixed(2)})。`;
      } else {
        econConclusion = 'SIMILAR';
        econExplanation = `双方贡献利润率处于同一区间 (A: ${(marginA * 100).toFixed(1)}% vs B: ${(marginB * 100).toFixed(1)}%)。`;
      }
    }

    reasons.push({
      candidateA: candA.id,
      candidateB: candB.id,
      dimension: 'ECONOMICS',
      conclusion: econConclusion,
      metricIds: econMetricIds,
      evidenceIds: Array.from(new Set([...aEconEvi, ...bEconEvi])),
      assumptionIds: Array.from(new Set([...aEconAsm, ...bEconAsm])),
      candidateAEvidenceIds: aEconEvi,
      candidateBEvidenceIds: bEconEvi,
      candidateAAssumptionIds: aEconAsm,
      candidateBAssumptionIds: bEconAsm,
      explanation: econExplanation,
    });

    // Dimension 2: RISK_PROFILE
    const riskA = candA.risks;
    const riskB = candB.risks;
    const hasFailA = riskA.some((r: CandidateRisk) => r.status === 'FAIL');
    const hasFailB = riskB.some((r: CandidateRisk) => r.status === 'FAIL');
    const unverifiedA = riskA.filter((r: CandidateRisk) => r.status === 'UNVERIFIED').length;
    const unverifiedB = riskB.filter((r: CandidateRisk) => r.status === 'UNVERIFIED').length;

    let riskConclusion: ComparisonConclusion = 'SIMILAR';
    let riskExplanation = '';

    const aRiskEvi = candA.risks.flatMap((r: CandidateRisk) => r.evidenceIds || []);
    const bRiskEvi = candB.risks.flatMap((r: CandidateRisk) => r.evidenceIds || []);

    if (hasFailA && !hasFailB) {
      riskConclusion = 'B_BETTER';
      riskExplanation = `Candidate A 触发严重风险拦截 (如专利/合规硬伤)，而 Candidate B 无阻断性风险。`;
    } else if (!hasFailA && hasFailB) {
      riskConclusion = 'A_BETTER';
      riskExplanation = `Candidate A 无阻断性风险，而 Candidate B 存在严重风险拦截。`;
    } else if (unverifiedA < unverifiedB) {
      riskConclusion = 'A_BETTER';
      riskExplanation = `Candidate A 风险合规尽调更充分 (未核验项 ${unverifiedA} 项 vs B 的 ${unverifiedB} 项)。`;
    } else if (unverifiedB < unverifiedA) {
      riskConclusion = 'B_BETTER';
      riskExplanation = `Candidate B 风险合规尽调更充分 (未核验项 ${unverifiedB} 项 vs A 的 ${unverifiedA} 项)。`;
    } else {
      riskConclusion = 'SIMILAR';
      riskExplanation = `双方风险合规评级基本对等。`;
    }

    reasons.push({
      candidateA: candA.id,
      candidateB: candB.id,
      dimension: 'RISK_PROFILE',
      conclusion: riskConclusion,
      metricIds: ['riskFailCount', 'riskUnverifiedCount'],
      evidenceIds: Array.from(new Set([...aRiskEvi, ...bRiskEvi])),
      assumptionIds: [],
      candidateAEvidenceIds: aRiskEvi,
      candidateBEvidenceIds: bRiskEvi,
      explanation: riskExplanation,
    });

    // Dimension 3: EVIDENCE_CONFIDENCE & PROVENANCE
    const compA =
      candA.decisionDetail?.evidenceCoverageHeuristic ?? candA.decisionDetail?.evidenceCompleteness ?? 0.5;
    const compB =
      candB.decisionDetail?.evidenceCoverageHeuristic ?? candB.decisionDetail?.evidenceCompleteness ?? 0.5;
    let evidenceConclusion: ComparisonConclusion = 'SIMILAR';
    let evidenceExplanation = '';

    if (compA > compB + 0.15) {
      evidenceConclusion = 'A_BETTER';
      evidenceExplanation = `Candidate A 事实凭证覆盖度 (${(compA * 100).toFixed(0)}%) 显著高于 Candidate B (${(compB * 100).toFixed(0)}%)。`;
    } else if (compB > compA + 0.15) {
      evidenceConclusion = 'B_BETTER';
      evidenceExplanation = `Candidate B 事实凭证覆盖度 (${(compB * 100).toFixed(0)}%) 显著高于 Candidate A (${(compA * 100).toFixed(0)}%)。`;
    } else {
      evidenceConclusion = 'SIMILAR';
      evidenceExplanation = `双方证据依据链覆盖度相近 (${(compA * 100).toFixed(0)}% vs ${(compB * 100).toFixed(0)}%)。`;
    }

    const aConfEvi = candA.evidence.map((e: EvidenceItem) => e.id);
    const bConfEvi = candB.evidence.map((e: EvidenceItem) => e.id);
    const aConfAsm = candA.assumptions.map((a: Assumption) => a.id);
    const bConfAsm = candB.assumptions.map((a: Assumption) => a.id);

    reasons.push({
      candidateA: candA.id,
      candidateB: candB.id,
      dimension: 'EVIDENCE_CONFIDENCE',
      conclusion: evidenceConclusion,
      metricIds: ['evidenceCoverageHeuristic'],
      evidenceIds: Array.from(new Set([...aConfEvi, ...bConfEvi])),
      assumptionIds: Array.from(new Set([...aConfAsm, ...bConfAsm])),
      candidateAEvidenceIds: aConfEvi,
      candidateBEvidenceIds: bConfEvi,
      candidateAAssumptionIds: aConfAsm,
      candidateBAssumptionIds: bConfAsm,
      explanation: evidenceExplanation,
    });

    // Dimension 4: MARKET_DEMAND (with dual-sided evidence/assumption provenance)
    if (candA.marketResearch && candB.marketResearch) {
      const volA = candA.marketResearch.searchVolumeMonthly ?? 0;
      const volB = candB.marketResearch.searchVolumeMonthly ?? 0;
      let mktConclusion: ComparisonConclusion = 'SIMILAR';
      let mktExplanation = '';

      if (volA > volB * 1.2) {
        mktConclusion = 'A_BETTER';
        mktExplanation = `Candidate A 关联品类月搜索量 (${volA.toLocaleString()}) 高于 B (${volB.toLocaleString()})。`;
      } else if (volB > volA * 1.2) {
        mktConclusion = 'B_BETTER';
        mktExplanation = `Candidate B 关联品类月搜索量 (${volB.toLocaleString()}) 高于 A (${volA.toLocaleString()})。`;
      } else {
        mktConclusion = 'SIMILAR';
        mktExplanation = `双方所属关键词市场体量相近 (${volA.toLocaleString()} vs ${volB.toLocaleString()})。`;
      }

      // Collect market demand evidence from both candidates
      const aMktEvi = [
        ...(candA.marketResearch.evidenceIds || []),
        ...candA.evidence.filter((e) => e.scope === 'KEYWORD' || e.scope === 'MARKET').map((e) => e.id),
      ];
      const bMktEvi = [
        ...(candB.marketResearch.evidenceIds || []),
        ...candB.evidence.filter((e) => e.scope === 'KEYWORD' || e.scope === 'MARKET').map((e) => e.id),
      ];
      const aMktAsm = [
        ...(candA.marketResearch.assumptionIds || []),
        ...candA.assumptions
          .filter(
            (a) =>
              a.field.toLowerCase().includes('demand') || a.field.toLowerCase().includes('search'),
          )
          .map((a) => a.id),
      ];
      const bMktAsm = [
        ...(candB.marketResearch.assumptionIds || []),
        ...candB.assumptions
          .filter(
            (a) =>
              a.field.toLowerCase().includes('demand') || a.field.toLowerCase().includes('search'),
          )
          .map((a) => a.id),
      ];

      reasons.push({
        candidateA: candA.id,
        candidateB: candB.id,
        dimension: 'MARKET_DEMAND',
        conclusion: mktConclusion,
        metricIds: ['searchVolumeMonthly'],
        evidenceIds: Array.from(new Set([...aMktEvi, ...bMktEvi])),
        assumptionIds: Array.from(new Set([...aMktAsm, ...bMktAsm])),
        candidateAEvidenceIds: Array.from(new Set(aMktEvi)),
        candidateBEvidenceIds: Array.from(new Set(bMktEvi)),
        candidateAAssumptionIds: Array.from(new Set(aMktAsm)),
        candidateBAssumptionIds: Array.from(new Set(bMktAsm)),
        explanation: mktExplanation,
      });
    }

    return reasons;
  }
}
