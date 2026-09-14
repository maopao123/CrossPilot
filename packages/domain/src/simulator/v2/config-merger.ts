import type { V2Config, V2SkuConfig } from './types.js';

/**
 * Deeply merges a V2Config with a scenario configOverride or customConfig.
 * Handles both top-level shorthand aliases (organicConversionRate, adConversionRate, priceElasticity)
 * and detailed per-SKU configuration overrides.
 */
export function mergeV2Config(baseConfig: V2Config, override?: Partial<V2Config> | any): V2Config {
  if (!override || typeof override !== 'object') {
    return {
      ...baseConfig,
      skus: baseConfig.skus.map((s) => ({ ...s })),
      plannedShipments: (baseConfig.plannedShipments || []).map((p) => ({ ...p })),
    };
  }

  const mergedSkus: V2SkuConfig[] = baseConfig.skus.map((baseSku) => {
    const sku = { ...baseSku };

    // Apply shorthand aliases to all SKUs if specified at top level
    if (override.organicConversionRate !== undefined) {
      sku.baseNaturalCVR = Number(override.organicConversionRate);
    }
    if (override.baseNaturalCVR !== undefined) {
      sku.baseNaturalCVR = Number(override.baseNaturalCVR);
    }
    if (override.adConversionRate !== undefined) {
      sku.baseAdCVR = Number(override.adConversionRate);
    }
    if (override.baseAdCVR !== undefined) {
      sku.baseAdCVR = Number(override.baseAdCVR);
    }
    if (override.priceElasticity !== undefined) {
      sku.priceElasticity = Number(override.priceElasticity);
    }

    // Apply per-SKU specific override if matched by skuCode
    if (Array.isArray(override.skus)) {
      const skuOverride = override.skus.find((s: any) => s.skuCode === sku.skuCode);
      if (skuOverride) {
        Object.assign(sku, skuOverride);
      }
    }

    return sku;
  });

  const merged: V2Config = {
    ...baseConfig,
    ...override,
    skus: mergedSkus,
    plannedShipments: override.plannedShipments
      ? override.plannedShipments.map((p: any) => ({ ...p }))
      : (baseConfig.plannedShipments || []).map((p) => ({ ...p })),
  };

  return merged;
}
