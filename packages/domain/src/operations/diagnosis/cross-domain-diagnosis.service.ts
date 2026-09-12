/**
 * Cross-Domain Diagnosis Service (Epic 3 Phase 4)
 *
 * Coordinates deterministic root-cause diagnosis across 7 operational domains:
 * Sku360BusinessContext + BusinessSignal[] -> CrossDomainDiagnosisService -> DiagnosisResult[]
 *
 * Core Architectural Axioms:
 * 1. Load != Detect != Diagnose != Recommend
 *    Strictly diagnoses "Why did these anomalies occur?".
 *    MUST NOT generate action recommendations or execution directives.
 * 2. Deterministic attribution first; zero LLM invention of metrics, drivers, ratios, or signals.
 * 3. Formal Causal vs. Correlational Distinction:
 *    - PROVEN: Mathematical closure (e.g. Profit Waterfall Residual = 0)
 *    - STRONG: Direct business causality + temporal consistency + multi-evidence
 *    - INDICATIVE: Correlated signals without closed causal proof
 *    - UNKNOWN: Unconfirmed root cause
 * 4. Diagnosis Evidence Gate:
 *    - SUPPORTED
 *    - PARTIALLY_SUPPORTED
 *    - INSUFFICIENT
 * 5. Special Cases:
 *    - D8: signals = [] -> 0 diagnoses, clean exit, no false alarms
 *    - D9: Partial / missing domain facts -> explicit unknowns, gate downgraded
 *    - D10: Conflicting signals (Sales up, Profit down) -> Profit dilution diagnosed
 */

import {
  Sku360BusinessContext,
  BusinessSignal,
  DiagnosisResult,
  CrossDomainDiagnosisInput,
  CrossDomainDiagnosisResponse,
  DiagnosisEvidenceGateStatus,
  SignalDomain,
} from '@crosspilot/shared';

import { IDiagnosisPattern, DiagnosisExecutionOptions } from './diagnosis.types.js';
import { ProfitDropPattern } from './diagnosis-patterns/profit-diagnosis.pattern.js';
import { AdvertisingEfficiencyPattern } from './diagnosis-patterns/advertising-diagnosis.pattern.js';
import { InventoryStockoutPattern } from './diagnosis-patterns/inventory-diagnosis.pattern.js';
import { ProductQualityIssuePattern } from './diagnosis-patterns/product-quality-diagnosis.pattern.js';
import { CompetitorPressurePattern } from './diagnosis-patterns/competitor-diagnosis.pattern.js';

export class CrossDomainDiagnosisService {
  private readonly patterns: IDiagnosisPattern[];

  constructor(customPatterns?: IDiagnosisPattern[]) {
    this.patterns = customPatterns || [
      new ProfitDropPattern(),
      new AdvertisingEfficiencyPattern(),
      new InventoryStockoutPattern(),
      new ProductQualityIssuePattern(),
      new CompetitorPressurePattern(),
    ];
  }

  /**
   * Static convenience method.
   */
  public static diagnose(input: CrossDomainDiagnosisInput): CrossDomainDiagnosisResponse {
    return new CrossDomainDiagnosisService().diagnose(input);
  }

  /**
   * Primary entry point: Evaluates SKU context and detected signals across diagnosis patterns.
   */
  public diagnose(input: CrossDomainDiagnosisInput): CrossDomainDiagnosisResponse {
    const executedAt = new Date().toISOString();
    const { context, signals, options } = input;

    // Special Case D8: Clean healthy state, 0 signals triggered
    if (!signals || signals.length === 0) {
      return {
        diagnoses: [],
        summary: {
          totalDiagnoses: 0,
          supportedCount: 0,
          partiallySupportedCount: 0,
          insufficientCount: 0,
          hasUnconfirmedRootCauses: false,
        },
        evaluatedSignalsCount: 0,
        unattributedSignalIds: [],
        executedAt,
      };
    }

    const diagnoses: DiagnosisResult[] = [];
    const attributedSignalIds = new Set<string>();

    // Execute patterns in priority sequence
    for (const pattern of this.patterns) {
      if (pattern.canDiagnose(context, signals)) {
        try {
          const result = pattern.diagnose(context, signals, options);
          if (result) {
            diagnoses.push(result);

            // Record attributed signals
            if (result.targetSignalIds) {
              result.targetSignalIds.forEach((id) => attributedSignalIds.add(id));
            }
            if (result.primaryDriver.relatedSignalIds) {
              result.primaryDriver.relatedSignalIds.forEach((id) => attributedSignalIds.add(id));
            }
            result.secondaryDrivers.forEach((d) => {
              d.relatedSignalIds?.forEach((id) => attributedSignalIds.add(id));
            });
          }
        } catch (err: any) {
          // Catch and isolate pattern-level unexpected errors, creating a degraded diagnosis record
          diagnoses.push({
            diagnosisId: `DIAG-ERR-${pattern.patternId}-${context.identity.skuId}`,
            workspaceId: context.identity.workspaceId,
            skuId: context.identity.skuId,
            asin: context.identity.asin,
            title: `Diagnosis Error in ${pattern.patternId}`,
            summary: `Diagnosis pattern failed during execution: ${err?.message || 'Unknown error'}`,
            primaryDriver: {
              domain: 'PROFIT',
              metric: 'executionError',
              direction: 'DOWN',
              causalStrength: 'UNKNOWN',
              description: `Pattern error: ${err?.message || 'Unknown'}`,
            },
            secondaryDrivers: [],
            confidence: 0.1,
            evidence: [],
            affectedDomains: ['PROFIT'],
            affectedSkus: [context.identity.skuId],
            gateStatus: 'INSUFFICIENT',
            rootCauseCode: 'ROOT_CAUSE_UNCONFIRMED',
            unknowns: [`Pattern execution crashed: ${err?.message || 'Unknown'}`],
            calculatedAt: executedAt,
          });
        }
      }
    }

    // Determine unattributed signals
    const allSignalIds = signals.map((s) => s.signalId);
    const unattributedSignalIds = allSignalIds.filter((id) => !attributedSignalIds.has(id));

    // If signals exist but no pattern could diagnose them, create a fallback unconfirmed diagnosis
    if (signals.length > 0 && diagnoses.length === 0) {
      const topSig = signals[0];
      diagnoses.push({
        diagnosisId: `DIAG-UNATTRIBUTED-${context.identity.skuId}`,
        workspaceId: context.identity.workspaceId,
        skuId: context.identity.skuId,
        asin: context.identity.asin,
        title: `Unconfirmed Operational Anomaly: ${topSig.code}`,
        summary: `Detected signal ${topSig.code} (${topSig.metric}) does not match known deterministic causal patterns. Domain evidence is insufficient to prove root cause.`,
        primaryDriver: {
          domain: topSig.domain,
          metric: topSig.metric,
          direction: topSig.direction,
          causalStrength: 'UNKNOWN',
          relatedSignalIds: [topSig.signalId],
          description: topSig.description,
        },
        secondaryDrivers: [],
        confidence: 0.3,
        evidence: topSig.evidence,
        affectedDomains: [topSig.domain],
        affectedSkus: [context.identity.skuId],
        gateStatus: 'INSUFFICIENT',
        targetSignalIds: [topSig.signalId],
        rootCauseCode: 'ROOT_CAUSE_UNCONFIRMED',
        unknowns: ['Root cause could not be established; domain telemetry lacks causal closure.'],
        calculatedAt: executedAt,
      });
      attributedSignalIds.add(topSig.signalId);
    }

    // Compute Summary
    const supportedCount = diagnoses.filter((d) => d.gateStatus === 'SUPPORTED').length;
    const partiallySupportedCount = diagnoses.filter(
      (d) => d.gateStatus === 'PARTIALLY_SUPPORTED'
    ).length;
    const insufficientCount = diagnoses.filter((d) => d.gateStatus === 'INSUFFICIENT').length;
    const hasUnconfirmedRootCauses = diagnoses.some(
      (d) => d.rootCauseCode === 'ROOT_CAUSE_UNCONFIRMED' || d.primaryDriver.causalStrength === 'UNKNOWN'
    );

    return {
      diagnoses,
      summary: {
        totalDiagnoses: diagnoses.length,
        supportedCount,
        partiallySupportedCount,
        insufficientCount,
        hasUnconfirmedRootCauses,
      },
      evaluatedSignalsCount: signals.length,
      unattributedSignalIds,
      executedAt,
    };
  }
}
