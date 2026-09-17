import { Assumption, CandidateRisk, ProductCandidateConcept } from '@crosspilot/shared';

export interface ApplicableRiskResult {
  applicableRisks: CandidateRisk[];
  assumptions: Assumption[];
}

export class RiskApplicabilityPolicy {
  /**
   * P0-12 & P0-13: 轻量化风险适用性映射政策
   * 根据产品概念与材质特征识别必须尽调的风险项，默认均为 UNVERIFIED
   * 严禁自动给 PASS，严禁自动宣称合法无风险
   * 针对玻璃等特殊材质，显式生成 Assumption 供用户确认，坚决杜绝后台隐藏魔数乘数
   */
  static determineApplicability(
    concept: ProductCandidateConcept,
    category?: string,
  ): ApplicableRiskResult {
    const text = `${concept.productType} ${category ?? ''} ${
      concept.useCase ?? ''
    } ${JSON.stringify(concept.specifications ?? {})}`.toLowerCase();

    const applicableRisks: CandidateRisk[] = [];
    const assumptions: Assumption[] = [];

    // 1. 专利风险（所有跨境电商单品出海前必须核验）
    applicableRisks.push({
      riskId: 'risk-patent-check',
      category: 'PATENT',
      title: '外观设计与实用新型专利排查',
      status: 'UNVERIFIED',
      severity: 'HIGH',
      evidenceIds: [],
      notes: '需确认模具属于公模或已完成 USPTO 专利侵权检索，杜绝侵权下架与资金冻结',
    });

    // 2. 食品接触材料风险 (Food Contact)
    const isFoodContact =
      text.includes('水果') ||
      text.includes('保鲜') ||
      text.includes('餐') ||
      text.includes('食品') ||
      text.includes('沥水') ||
      text.includes('杯') ||
      text.includes('壶') ||
      text.includes('盒') ||
      text.includes('food') ||
      text.includes('fruit') ||
      text.includes('kitchen') ||
      text.includes('container');

    if (isFoodContact) {
      applicableRisks.push({
        riskId: 'risk-food-contact',
        category: 'COMPLIANCE',
        title: '食品接触材料安全合规 (FDA / Food Contact Certification)',
        status: 'UNVERIFIED',
        severity: 'HIGH',
        evidenceIds: [],
        notes: '玻璃本体及塑料沥水篮需向工厂索取材质合格检测报告与 FDA 食品级符合性声明',
      });
    }

    // 3. 易碎品运输破损与包装风险 (Glass Breakage)
    const isGlass =
      text.includes('玻璃') ||
      text.includes('陶瓷') ||
      text.includes('易碎') ||
      text.includes('glass') ||
      text.includes('ceramic');

    if (isGlass) {
      applicableRisks.push({
        riskId: 'risk-fragile-packaging',
        category: 'QUALITY',
        title: '玻璃易碎品跨境长途运输破损及退货风险',
        status: 'UNVERIFIED',
        severity: 'HIGH',
        evidenceIds: [],
        notes: '玻璃产品在头程海运与亚马逊 FBA 派送中存在跌落破损风险，需定制珍珠棉/加强瓦楞外盒',
      });

      // P0-12 & §26: 显式生成 Assumption，严禁隐藏写死 returnRate * 1.3
      assumptions.push({
        id: 'asm-glass-packaging-protection',
        field: 'returnRate',
        description:
          '玻璃保鲜盒易碎风险：假定在加强珍珠棉瓦楞外盒防护下，全流程综合退货率受控在 4.5%~6.0%',
        assumedValue: 0.05,
        sourceReason: '基于玻璃家居日用大盘经验估算，待实际打样跌落测试 (Drop Test) 校验',
        impactLevel: 'HIGH',
        validated: false,
      });
    }

    // 4. 儿童/母婴安全风险 (Children Safety)
    const isChild =
      text.includes('儿童') ||
      text.includes('婴儿') ||
      text.includes('玩具') ||
      text.includes('baby') ||
      text.includes('child') ||
      text.includes('kid') ||
      text.includes('toy');

    if (isChild) {
      applicableRisks.push({
        riskId: 'risk-cpc-compliance',
        category: 'COMPLIANCE',
        title: '儿童产品安全证书合规 (CPC / ASTM F963)',
        status: 'UNVERIFIED',
        severity: 'HIGH',
        evidenceIds: [],
        notes: '必须取得第三方 CPSC 认可实验室出具的检测报告并上传 CPC 证书方可销售',
      });
    }

    // 5. 电气安全风险 (Electrical)
    const isElectrical =
      text.includes('电') ||
      text.includes('电池') ||
      text.includes('充电') ||
      text.includes('usb') ||
      text.includes('battery') ||
      text.includes('bluetooth');

    if (isElectrical) {
      applicableRisks.push({
        riskId: 'risk-fcc-compliance',
        category: 'COMPLIANCE',
        title: '电气安全与无线合规 (FCC / UL / CE)',
        status: 'UNVERIFIED',
        severity: 'HIGH',
        evidenceIds: [],
        notes: '带电/带电池产品必须提供 UN38.3、MSDS 及 FCC 认证以符合亚马逊上架合规',
      });
    }

    return {
      applicableRisks,
      assumptions,
    };
  }
}
