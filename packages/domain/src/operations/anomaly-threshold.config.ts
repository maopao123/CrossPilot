/**
 * CrossPilot Anomaly Threshold Configuration & Multi-Tier Resolver (Epic 3)
 *
 * Centralizes all 12 core anomaly detection rules and their numeric thresholds.
 * Strictly prohibits hardcoded magic numbers across detection, diagnosis, and action workflows.
 *
 * Implements Tiered Hierarchy:
 * System Default
 *       ↓
 * Marketplace / Category Default
 *       ↓
 * Workspace Override
 *       ↓
 * SKU Override
 */

// ============================================================================
// 1. Threshold Configuration Types
// ============================================================================

export interface AnomalyThresholdValues {
  // Profit Rules (R-PROF-01, R-PROF-02)
  profitDropPctThreshold: number; // e.g. 0.20 = 20% drop compared to baseline
  criticalMarginRateThreshold: number; // e.g. 0.05 = 5% net margin floor

  // Advertising Rules (R-ADS-01, R-ADS-02, R-ADS-03)
  maxAcosThreshold: number; // e.g. 0.35 = 35% absolute ACOS ceiling
  acosTargetDeviationThreshold: number; // e.g. 0.30 = 30% above target ACOS
  adSpendGrowthMaxThreshold: number; // e.g. 0.25 = 25% spend growth with non-positive sales growth
  zeroConversionClicksThreshold: number; // e.g. 20 clicks with 0 orders

  // Inventory Rules (R-INV-01, R-INV-02, R-INV-03)
  minDaysCoverLeadTimeFactor: number; // e.g. 1.0 = daysCover <= leadTimeDays * factor
  criticalDaysCoverFloor: number; // e.g. 15 days absolute minimum
  stockoutUnitsThreshold: number; // e.g. 0 available units
  excessDaysCoverThreshold: number; // e.g. 90 days

  // Returns Rules (R-RET-01)
  returnRateSpikeThreshold: number; // e.g. 0.05 = 5% return rate
  returnRateGrowthThreshold: number; // e.g. 0.50 = 50% relative growth

  // Reviews Rules (R-REV-01)
  ratingDeteriorationFloor: number; // e.g. 4.3 stars
  recentNegativeReviewRatioThreshold: number; // e.g. 0.20 = 20% 1-2 star reviews

  // Competitor Rules (R-COMP-01, R-COMP-02)
  competitorPriceDropPctThreshold: number; // e.g. 0.10 = 10% drop in competitor price
  competitorRatingAdvantageDelta: number; // e.g. 0.30 stars higher than our product
}

export interface AnomalyThresholdConfig extends AnomalyThresholdValues {
  version: string;
}

// ============================================================================
// 2. Default System Thresholds (Demo / Baseline Defaults)
// ============================================================================

export const DEFAULT_ANOMALY_THRESHOLDS: Readonly<AnomalyThresholdConfig> = Object.freeze({
  version: '1.0.0',

  // Profit
  profitDropPctThreshold: 0.20,
  criticalMarginRateThreshold: 0.05,

  // Advertising
  maxAcosThreshold: 0.35,
  acosTargetDeviationThreshold: 0.30,
  adSpendGrowthMaxThreshold: 0.25,
  zeroConversionClicksThreshold: 20,

  // Inventory
  minDaysCoverLeadTimeFactor: 1.0,
  criticalDaysCoverFloor: 15,
  stockoutUnitsThreshold: 0,
  excessDaysCoverThreshold: 90,

  // Returns
  returnRateSpikeThreshold: 0.05,
  returnRateGrowthThreshold: 0.50,

  // Reviews
  ratingDeteriorationFloor: 4.3,
  recentNegativeReviewRatioThreshold: 0.20,

  // Competitor
  competitorPriceDropPctThreshold: 0.10,
  competitorRatingAdvantageDelta: 0.30,
});

// ============================================================================
// 3. Multi-Tier Override Models
// ============================================================================

export type ThresholdOverrideScope =
  | 'SYSTEM'
  | 'MARKETPLACE_CATEGORY'
  | 'WORKSPACE'
  | 'SKU';

export interface ThresholdOverrideRule {
  scope: ThresholdOverrideScope;
  /**
   * Scope key matching criteria:
   * - MARKETPLACE_CATEGORY: e.g. "AMAZON_US:HOME_KITCHEN", "AMAZON_US", or "category:HOME_KITCHEN"
   * - WORKSPACE: workspaceId (e.g. "ws-default")
   * - SKU: skuId (e.g. "SKU-MARBLE-001")
   */
  scopeKey: string;
  overrides: Partial<AnomalyThresholdValues>;
  description?: string;
  effectiveFrom?: string; // ISO 8601
  effectiveTo?: string; // ISO 8601
}

export interface ThresholdResolutionContext {
  marketplaceId?: string;
  category?: string;
  workspaceId?: string;
  skuId?: string;
  asOf?: string; // ISO 8601 evaluation timestamp
}

export interface AppliedOverrideInfo {
  scope: ThresholdOverrideScope;
  scopeKey: string;
  overriddenKeys: Array<keyof AnomalyThresholdValues>;
  values: Partial<AnomalyThresholdValues>;
}

export interface ThresholdResolutionTrace {
  context: ThresholdResolutionContext;
  resolutionHierarchy: ThresholdOverrideScope[];
  appliedOverrides: AppliedOverrideInfo[];
}

export interface ThresholdResolutionResult {
  config: AnomalyThresholdConfig;
  trace: ThresholdResolutionTrace;
}

// ============================================================================
// 4. Validation
// ============================================================================

export class AnomalyThresholdValidationError extends Error {
  public readonly errors: string[];

  constructor(message: string, errors: string[] = []) {
    super(`${message}${errors.length > 0 ? `: ${errors.join('; ')}` : ''}`);
    this.name = 'AnomalyThresholdValidationError';
    this.errors = errors;
  }
}

/**
 * Validates partial or full threshold configurations for physical & mathematical sanity.
 */
export function validateAnomalyThresholdConfig(
  config: Partial<AnomalyThresholdValues>,
  parentFloor?: number
): string[] {
  const errors: string[] = [];

  const isFiniteNumber = (val: unknown): val is number =>
    typeof val === 'number' && Number.isFinite(val);

  if (config.profitDropPctThreshold !== undefined) {
    if (!isFiniteNumber(config.profitDropPctThreshold) || config.profitDropPctThreshold <= 0 || config.profitDropPctThreshold > 1.0) {
      errors.push(`profitDropPctThreshold must be a number between (0, 1.0], got ${config.profitDropPctThreshold}`);
    }
  }

  if (config.criticalMarginRateThreshold !== undefined) {
    if (!isFiniteNumber(config.criticalMarginRateThreshold) || config.criticalMarginRateThreshold < -1.0 || config.criticalMarginRateThreshold > 1.0) {
      errors.push(`criticalMarginRateThreshold must be between [-1.0, 1.0], got ${config.criticalMarginRateThreshold}`);
    }
  }

  if (config.maxAcosThreshold !== undefined) {
    if (!isFiniteNumber(config.maxAcosThreshold) || config.maxAcosThreshold <= 0) {
      errors.push(`maxAcosThreshold must be a positive number > 0, got ${config.maxAcosThreshold}`);
    }
  }

  if (config.acosTargetDeviationThreshold !== undefined) {
    if (!isFiniteNumber(config.acosTargetDeviationThreshold) || config.acosTargetDeviationThreshold < 0) {
      errors.push(`acosTargetDeviationThreshold must be non-negative >= 0, got ${config.acosTargetDeviationThreshold}`);
    }
  }

  if (config.adSpendGrowthMaxThreshold !== undefined) {
    if (!isFiniteNumber(config.adSpendGrowthMaxThreshold) || config.adSpendGrowthMaxThreshold < 0) {
      errors.push(`adSpendGrowthMaxThreshold must be non-negative >= 0, got ${config.adSpendGrowthMaxThreshold}`);
    }
  }

  if (config.zeroConversionClicksThreshold !== undefined) {
    if (!isFiniteNumber(config.zeroConversionClicksThreshold) || !Number.isInteger(config.zeroConversionClicksThreshold) || config.zeroConversionClicksThreshold < 1) {
      errors.push(`zeroConversionClicksThreshold must be an integer >= 1, got ${config.zeroConversionClicksThreshold}`);
    }
  }

  if (config.minDaysCoverLeadTimeFactor !== undefined) {
    if (!isFiniteNumber(config.minDaysCoverLeadTimeFactor) || config.minDaysCoverLeadTimeFactor <= 0) {
      errors.push(`minDaysCoverLeadTimeFactor must be positive > 0, got ${config.minDaysCoverLeadTimeFactor}`);
    }
  }

  if (config.criticalDaysCoverFloor !== undefined) {
    if (!isFiniteNumber(config.criticalDaysCoverFloor) || config.criticalDaysCoverFloor < 0) {
      errors.push(`criticalDaysCoverFloor must be non-negative >= 0, got ${config.criticalDaysCoverFloor}`);
    }
  }

  if (config.stockoutUnitsThreshold !== undefined) {
    if (!isFiniteNumber(config.stockoutUnitsThreshold) || config.stockoutUnitsThreshold < 0) {
      errors.push(`stockoutUnitsThreshold must be non-negative >= 0, got ${config.stockoutUnitsThreshold}`);
    }
  }

  if (config.excessDaysCoverThreshold !== undefined) {
    const floor = config.criticalDaysCoverFloor ?? parentFloor ?? DEFAULT_ANOMALY_THRESHOLDS.criticalDaysCoverFloor;
    if (!isFiniteNumber(config.excessDaysCoverThreshold) || config.excessDaysCoverThreshold <= floor) {
      errors.push(`excessDaysCoverThreshold must be strictly greater than criticalDaysCoverFloor (${floor}), got ${config.excessDaysCoverThreshold}`);
    }
  }

  if (config.returnRateSpikeThreshold !== undefined) {
    if (!isFiniteNumber(config.returnRateSpikeThreshold) || config.returnRateSpikeThreshold < 0 || config.returnRateSpikeThreshold > 1.0) {
      errors.push(`returnRateSpikeThreshold must be between [0, 1.0], got ${config.returnRateSpikeThreshold}`);
    }
  }

  if (config.returnRateGrowthThreshold !== undefined) {
    if (!isFiniteNumber(config.returnRateGrowthThreshold) || config.returnRateGrowthThreshold < 0) {
      errors.push(`returnRateGrowthThreshold must be non-negative >= 0, got ${config.returnRateGrowthThreshold}`);
    }
  }

  if (config.ratingDeteriorationFloor !== undefined) {
    if (!isFiniteNumber(config.ratingDeteriorationFloor) || config.ratingDeteriorationFloor < 1.0 || config.ratingDeteriorationFloor > 5.0) {
      errors.push(`ratingDeteriorationFloor must be between [1.0, 5.0], got ${config.ratingDeteriorationFloor}`);
    }
  }

  if (config.recentNegativeReviewRatioThreshold !== undefined) {
    if (!isFiniteNumber(config.recentNegativeReviewRatioThreshold) || config.recentNegativeReviewRatioThreshold < 0 || config.recentNegativeReviewRatioThreshold > 1.0) {
      errors.push(`recentNegativeReviewRatioThreshold must be between [0, 1.0], got ${config.recentNegativeReviewRatioThreshold}`);
    }
  }

  if (config.competitorPriceDropPctThreshold !== undefined) {
    if (!isFiniteNumber(config.competitorPriceDropPctThreshold) || config.competitorPriceDropPctThreshold < 0 || config.competitorPriceDropPctThreshold > 1.0) {
      errors.push(`competitorPriceDropPctThreshold must be between [0, 1.0], got ${config.competitorPriceDropPctThreshold}`);
    }
  }

  if (config.competitorRatingAdvantageDelta !== undefined) {
    if (!isFiniteNumber(config.competitorRatingAdvantageDelta) || config.competitorRatingAdvantageDelta < 0) {
      errors.push(`competitorRatingAdvantageDelta must be non-negative >= 0, got ${config.competitorRatingAdvantageDelta}`);
    }
  }

  return errors;
}

// ============================================================================
// 5. Tiered Threshold Resolver Implementation
// ============================================================================

export interface ThresholdResolverOptions {
  systemDefaults?: AnomalyThresholdConfig;
  initialRules?: ThresholdOverrideRule[];
}

export class ThresholdResolver {
  private readonly systemDefaults: AnomalyThresholdConfig;
  private readonly rules: ThresholdOverrideRule[] = [];

  constructor(options: ThresholdResolverOptions = {}) {
    this.systemDefaults = options.systemDefaults ?? DEFAULT_ANOMALY_THRESHOLDS;
    const errors = validateAnomalyThresholdConfig(this.systemDefaults);
    if (errors.length > 0) {
      throw new AnomalyThresholdValidationError('Invalid system default threshold configuration', errors);
    }

    if (options.initialRules && options.initialRules.length > 0) {
      this.registerRules(options.initialRules);
    }
  }

  /**
   * Registers a single override rule after validating its values.
   */
  public registerRule(rule: ThresholdOverrideRule): void {
    const errors = validateAnomalyThresholdConfig(rule.overrides);
    if (errors.length > 0) {
      throw new AnomalyThresholdValidationError(
        `Failed to register override rule for scope ${rule.scope} (${rule.scopeKey})`,
        errors
      );
    }
    this.rules.push(rule);
  }

  /**
   * Registers multiple override rules.
   */
  public registerRules(rules: ThresholdOverrideRule[]): void {
    for (const rule of rules) {
      this.registerRule(rule);
    }
  }

  /**
   * Clears rules by scope or all rules if scope is omitted.
   */
  public clearRules(scope?: ThresholdOverrideScope): void {
    if (!scope) {
      this.rules.length = 0;
      return;
    }
    const filtered = this.rules.filter((r) => r.scope !== scope);
    this.rules.length = 0;
    this.rules.push(...filtered);
  }

  /**
   * Returns all active registered rules.
   */
  public getRules(): readonly ThresholdOverrideRule[] {
    return this.rules;
  }

  /**
   * Resolves thresholds for given context, cascading through:
   * SYSTEM -> MARKETPLACE_CATEGORY -> WORKSPACE -> SKU.
   */
  public resolve(context: ThresholdResolutionContext = {}): AnomalyThresholdConfig {
    return this.resolveWithTrace(context).config;
  }

  /**
   * Resolves thresholds and returns full audit trace of all applied overrides.
   */
  public resolveWithTrace(context: ThresholdResolutionContext = {}): ThresholdResolutionResult {
    const appliedOverrides: AppliedOverrideInfo[] = [];
    const resolutionHierarchy: ThresholdOverrideScope[] = [
      'SYSTEM',
      'MARKETPLACE_CATEGORY',
      'WORKSPACE',
      'SKU',
    ];

    // 1. SYSTEM DEFAULT
    let resolved: AnomalyThresholdValues = {
      profitDropPctThreshold: this.systemDefaults.profitDropPctThreshold,
      criticalMarginRateThreshold: this.systemDefaults.criticalMarginRateThreshold,
      maxAcosThreshold: this.systemDefaults.maxAcosThreshold,
      acosTargetDeviationThreshold: this.systemDefaults.acosTargetDeviationThreshold,
      adSpendGrowthMaxThreshold: this.systemDefaults.adSpendGrowthMaxThreshold,
      zeroConversionClicksThreshold: this.systemDefaults.zeroConversionClicksThreshold,
      minDaysCoverLeadTimeFactor: this.systemDefaults.minDaysCoverLeadTimeFactor,
      criticalDaysCoverFloor: this.systemDefaults.criticalDaysCoverFloor,
      stockoutUnitsThreshold: this.systemDefaults.stockoutUnitsThreshold,
      excessDaysCoverThreshold: this.systemDefaults.excessDaysCoverThreshold,
      returnRateSpikeThreshold: this.systemDefaults.returnRateSpikeThreshold,
      returnRateGrowthThreshold: this.systemDefaults.returnRateGrowthThreshold,
      ratingDeteriorationFloor: this.systemDefaults.ratingDeteriorationFloor,
      recentNegativeReviewRatioThreshold: this.systemDefaults.recentNegativeReviewRatioThreshold,
      competitorPriceDropPctThreshold: this.systemDefaults.competitorPriceDropPctThreshold,
      competitorRatingAdvantageDelta: this.systemDefaults.competitorRatingAdvantageDelta,
    };

    const asOfTime = context.asOf ? new Date(context.asOf).getTime() : Date.now();

    const isRuleActive = (r: ThresholdOverrideRule): boolean => {
      if (r.effectiveFrom && new Date(r.effectiveFrom).getTime() > asOfTime) {
        return false;
      }
      if (r.effectiveTo && new Date(r.effectiveTo).getTime() < asOfTime) {
        return false;
      }
      return true;
    };

    // 2. MARKETPLACE_CATEGORY TIER
    // Priority within tier: `${marketplaceId}:${category}` > `${marketplaceId}` > `category:${category}`
    const mpRules = this.rules.filter((r) => r.scope === 'MARKETPLACE_CATEGORY' && isRuleActive(r));
    const targetMp = context.marketplaceId;
    const targetCat = context.category;

    const applicableMpRules: ThresholdOverrideRule[] = [];

    // Broad category rule
    if (targetCat) {
      const catRule = mpRules.find((r) => r.scopeKey === `category:${targetCat}`);
      if (catRule) applicableMpRules.push(catRule);
    }
    // Broad marketplace rule
    if (targetMp) {
      const mpRule = mpRules.find((r) => r.scopeKey === targetMp);
      if (mpRule) applicableMpRules.push(mpRule);
    }
    // Specific marketplace:category rule (highest within this tier)
    if (targetMp && targetCat) {
      const exactRule = mpRules.find((r) => r.scopeKey === `${targetMp}:${targetCat}`);
      if (exactRule) applicableMpRules.push(exactRule);
    }

    for (const rule of applicableMpRules) {
      this.applyOverrides(resolved, rule, appliedOverrides);
    }

    // 3. WORKSPACE TIER
    if (context.workspaceId) {
      const wsRules = this.rules.filter(
        (r) => r.scope === 'WORKSPACE' && r.scopeKey === context.workspaceId && isRuleActive(r)
      );
      for (const rule of wsRules) {
        this.applyOverrides(resolved, rule, appliedOverrides);
      }
    }

    // 4. SKU TIER
    if (context.skuId) {
      const skuRules = this.rules.filter(
        (r) => r.scope === 'SKU' && r.scopeKey === context.skuId && isRuleActive(r)
      );
      for (const rule of skuRules) {
        this.applyOverrides(resolved, rule, appliedOverrides);
      }
    }

    // Final sanity check
    const finalErrors = validateAnomalyThresholdConfig(resolved);
    if (finalErrors.length > 0) {
      throw new AnomalyThresholdValidationError('Resolved anomaly threshold configuration is invalid', finalErrors);
    }

    const finalConfig: AnomalyThresholdConfig = {
      version: this.systemDefaults.version,
      ...resolved,
    };

    return {
      config: Object.freeze(finalConfig),
      trace: {
        context,
        resolutionHierarchy,
        appliedOverrides,
      },
    };
  }

  private applyOverrides(
    target: AnomalyThresholdValues,
    rule: ThresholdOverrideRule,
    appliedOverrides: AppliedOverrideInfo[]
  ): void {
    const overriddenKeys: Array<keyof AnomalyThresholdValues> = [];
    const values: Partial<AnomalyThresholdValues> = {};

    for (const key of Object.keys(rule.overrides) as Array<keyof AnomalyThresholdValues>) {
      const val = rule.overrides[key];
      if (val !== undefined) {
        (target as any)[key] = val;
        overriddenKeys.push(key);
        (values as any)[key] = val;
      }
    }

    if (overriddenKeys.length > 0) {
      appliedOverrides.push({
        scope: rule.scope,
        scopeKey: rule.scopeKey,
        overriddenKeys,
        values,
      });
    }
  }
}
