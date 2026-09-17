import { GeneratedRfq, ProductCandidate, ProductSpecification } from '@crosspilot/shared';

export class RfqGeneratorService {
  /**
   * P0-2: 生成标准化可复制询价单
   * 支持一键复制发送给 1688 / Alibaba / 微信供应商
   */
  static generateRfq(candidate: ProductCandidate, spec: ProductSpecification): GeneratedRfq {
    const inquiryItems = [
      '单价 (含出厂标准包装)',
      '最小起订量 (MOQ)',
      '定制包装费用 (彩盒/白盒/防震包装)',
      'Logo 丝印/激光费用',
      '样品费用及打样周期',
      '大货生产交期 (天)',
      '产品单件净重 (g/kg)',
      '单件独立包装尺寸 (长×宽×高 cm)',
      '单件包装后毛重 (g/kg)',
      '外箱装箱数 (每箱几件)',
      '外箱箱规尺寸 (长×宽×高 cm)',
      '外箱毛重 (kg)',
    ];

    const requirements =
      spec.specialRequirements && spec.specialRequirements.length > 0
        ? spec.specialRequirements.map((r) => `• ${r}`).join('\n')
        : '• 标准跨境电商出口防护包装\n• 材质结构耐用稳定，满足食品接触/日用级品质要求';

    const copyableText = `【CrossPilot 跨境电商定制产品询价函】
产品名称：${candidate.title}
材质工艺：${spec.material}
产品容量：${spec.capacity}
产品尺寸：${spec.dimensions}
${spec.targetSellingPrice ? `计划销售参考：$${spec.targetSellingPrice.toFixed(2)} USD` : ''}

核心功能与特性需求：
${requirements}

请工厂业务经理协助提供以下详细报价及包装数据（用于核算跨境海运及亚马逊仓储费）：
1. 阶梯单价（出厂价 CNY）及起订量（MOQ）
2. 包装定制费用（彩盒/加强防破损瓦楞盒）
3. 单件净重、单套包装尺寸及毛重
4. 外箱箱规（长×宽×高 cm）、每箱装箱数（PCS）、整箱毛重（KG）
5. 样品费、样品发货交期及大货生产周期（天）
6. 是否具备材质检测报告（如 FDA 食品接触级/材质证明）

期待您的正式报价，谢谢！`;

    return {
      candidateId: candidate.id,
      specVersionId: spec.id,
      productTitle: candidate.title,
      specifications: {
        material: spec.material,
        capacity: spec.capacity,
        dimensions: spec.dimensions,
        targetSellingPrice: spec.targetSellingPrice,
        specialRequirements: spec.specialRequirements,
      },
      inquiryItems,
      copyableText,
      generatedAt: new Date().toISOString(),
    };
  }
}
