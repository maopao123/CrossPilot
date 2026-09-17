import {
  CORE_SPEC_FIELDS,
  CoreSpecField,
  ProductSpecification,
  ReturnedPhysicalSpecs,
  SpecificationStatus,
  SupplierQuote,
} from '@crosspilot/shared';

export interface SpecificationUpdateResult {
  updatedSpec: ProductSpecification;
  isNewVersion: boolean;
  invalidatedQuotes: SupplierQuote[];
  invalidationNotice?: string;
}

export class SpecificationManager {
  /**
   * P0-1: 创建初始草稿规格（询价前录入）
   */
  static createDraftSpecification(
    candidateId: string,
    params: {
      material: string;
      capacity: string;
      dimensions: string;
      targetSellingPrice: number;
      specialRequirements?: string[];
      version?: number;
    },
  ): ProductSpecification {
    const now = new Date().toISOString();
    const version = params.version ?? 1;

    return {
      id: `${candidateId}-spec-v${version}`,
      candidateId,
      version,
      status: 'DRAFT',
      material: params.material.trim(),
      capacity: params.capacity.trim(),
      dimensions: params.dimensions.trim(),
      targetSellingPrice: Number(params.targetSellingPrice),
      specialRequirements: params.specialRequirements ?? [],
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * P0-1: 询价前冻结规格 ("按这个去询价")
   * 必须校验核心 4 大规格非空且合理
   */
  static freezeSpecification(spec: ProductSpecification): ProductSpecification {
    const missingCore: string[] = [];

    if (!spec.material || spec.material.trim() === '') missingCore.push('material (材质)');
    if (!spec.capacity || spec.capacity.trim() === '') missingCore.push('capacity (容量)');
    if (!spec.dimensions || spec.dimensions.trim() === '') missingCore.push('dimensions (尺寸)');
    if (spec.targetSellingPrice == null || spec.targetSellingPrice <= 0)
      missingCore.push('targetSellingPrice (计划售价)');

    if (missingCore.length > 0) {
      throw new Error(
        `无法冻结规格进入询价，以下核心规格字段缺失或无效: [${missingCore.join(', ')}]`,
      );
    }

    const now = new Date().toISOString();
    return {
      ...spec,
      status: 'FROZEN',
      frozenAt: now,
      updatedAt: now,
    };
  }

  /**
   * P0-8: 字段级 Diff 与失效机制
   * 若 CORE_SPEC_FIELDS 中任一字段发生实质性变更：
   * 1. 自动生成 Spec V(n+1) 草稿
   * 2. 旧规格关联的所有 Quote 状态置为 STALE
   * 3. 产出失效提示（通知 FBA / Freight 等旧成本归零）
   * 若仅为补齐或修改非核心字段（如净重、箱规）：
   * 直接写回当前 Spec，保持当前版本与关联 Quote 生效
   */
  static updateSpecification(
    currentSpec: ProductSpecification,
    updates: Partial<ProductSpecification>,
    existingQuotes: SupplierQuote[] = [],
  ): SpecificationUpdateResult {
    const now = new Date().toISOString();
    const changedCoreFields: CoreSpecField[] = [];

    for (const field of CORE_SPEC_FIELDS) {
      if (updates[field] !== undefined) {
        const oldVal = currentSpec[field];
        const newVal = updates[field];
        if (oldVal !== newVal) {
          changedCoreFields.push(field);
        }
      }
    }

    // 核心规格改变 -> 产生新版本，旧报价全部 STALE
    if (changedCoreFields.length > 0) {
      const newVersion = currentSpec.version + 1;
      const newSpec: ProductSpecification = {
        ...currentSpec,
        ...updates,
        id: `${currentSpec.candidateId}-spec-v${newVersion}`,
        version: newVersion,
        status: 'DRAFT',
        frozenAt: null,
        createdAt: now,
        updatedAt: now,
      };

      const invalidatedQuotes = existingQuotes.map((q) => {
        if (q.specVersionId === currentSpec.id) {
          return {
            ...q,
            status: 'STALE' as const,
          };
        }
        return q;
      });

      const notice = `核心规格发生变更: [${changedCoreFields.join(
        ', ',
      )}]，已自动升级为 Spec V${newVersion} 草稿。历史报价已全部置为失效 (STALE)，原 FBA 与头程费用需按新规格重新测算。`;

      return {
        updatedSpec: newSpec,
        isNewVersion: true,
        invalidatedQuotes,
        invalidationNotice: notice,
      };
    }

    // 仅非核心规格更新 -> 原地更新当前规格，Quote 保持 ACTIVE
    const mergedSpec: ProductSpecification = {
      ...currentSpec,
      ...updates,
      updatedAt: now,
    };

    return {
      updatedSpec: mergedSpec,
      isNewVersion: false,
      invalidatedQuotes: existingQuotes,
    };
  }

  /**
   * P0-7: 工厂报价自动回填非核心规格
   * 当工厂返回毛净重、箱规、包装尺寸时，自动写入当前 Spec，来源标记为 FACT
   */
  static backfillFromQuote(
    currentSpec: ProductSpecification,
    returnedSpecs: ReturnedPhysicalSpecs,
  ): ProductSpecification {
    const now = new Date().toISOString();
    const updated: ProductSpecification = { ...currentSpec, updatedAt: now };

    if (returnedSpecs.netWeight !== undefined) {
      updated.netWeight = {
        value: returnedSpecs.netWeight,
        source: 'FACT',
        basis: 'SUPPLIER_QUOTE',
      };
    }

    if (returnedSpecs.packagingDimensions !== undefined) {
      updated.packagingDimensions = {
        value: returnedSpecs.packagingDimensions,
        source: 'FACT',
        basis: 'SUPPLIER_QUOTE',
      };
    }

    if (returnedSpecs.packagedWeight !== undefined) {
      updated.packagedWeight = {
        value: returnedSpecs.packagedWeight,
        source: 'FACT',
        basis: 'SUPPLIER_QUOTE',
      };
    }

    if (returnedSpecs.unitsPerCarton !== undefined) {
      updated.unitsPerCarton = {
        value: returnedSpecs.unitsPerCarton,
        source: 'FACT',
        basis: 'SUPPLIER_QUOTE',
      };
    }

    if (returnedSpecs.cartonDimensions !== undefined) {
      updated.cartonDimensions = {
        value: returnedSpecs.cartonDimensions,
        source: 'FACT',
        basis: 'SUPPLIER_QUOTE',
      };
    }

    if (returnedSpecs.cartonGrossWeight !== undefined) {
      updated.cartonGrossWeight = {
        value: returnedSpecs.cartonGrossWeight,
        source: 'FACT',
        basis: 'SUPPLIER_QUOTE',
      };
    }

    return updated;
  }
}
