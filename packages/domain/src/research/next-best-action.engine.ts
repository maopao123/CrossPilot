import { NextBestAction, ProductCandidate } from '@crosspilot/shared';

export class NextBestActionEngine {
  /**
   * P0-14: Next Best Action 确定性规则引擎（纯函数，无状态机复杂度）
   * 严格按照 5 级固定优先级排序，每次仅推荐 1 条最关键的下一步动作（严格单动作，禁止合并文案）:
   * ① 致命阻断 (BLOCKED) -> STOP，不推荐盲目下一步
   * ② 决定做不做的重大未验证风险 (HIGH 严重度且 UNVERIFIED):
   *    - 先推“向工厂索取食品接触材料报告”
   *    - 核验后下一轮再推“检索目标市场外观与实用新型专利 (USPTO)”
   *    - 其他 HIGH 未验证风险依序单条推进
   * ③ 缺失即无法算账的关键财务输入 (sellingPrice, productCost, referralFeeRate, fbaFeePerUnit, freightPerUnit)
   * ④ 决定能不能启动的启动资金项 (MOQ、样品费、开模费、首批头程；缺项时推进补齐)
   * ⑤ 其他非阻断优化项 (完善箱规、跌落测试、多竞品深挖)
   */
  static getNextBestAction(candidate: ProductCandidate): NextBestAction | null {
    // 优先级 ①: 致命阻断 (BLOCKED)
    if (candidate.decision === 'BLOCKED') {
      const blockerReason =
        candidate.decisionDetail?.reasons.find(
          (r) => r.includes('阻断') || r.includes('亏损') || r.includes('FAIL'),
        ) ?? '当前产品方案存在严重合规硬伤或单件财务亏损';

      return {
        id: 'nba-blocked-stop',
        priority: 1,
        title: '已触发致命阻断，停止继续投入',
        category: 'BLOCKED_STOP',
        description: `阻断原因: ${blockerReason}。建议放弃该产品或彻底推翻重构。`,
        actionType: 'STOP',
        buttonText: '查看阻断原因',
      };
    }

    // 优先级 ②: 决定 Go / No-Go 的重大未验证风险 (HIGH 严重度且 UNVERIFIED)
    // 冻结规约 (P0-2 闭环): 每次只推 1 条单一动作，严禁将两个动作合并在同一条文案里
    const unverifiedRisks = (candidate.risks ?? []).filter(
      (r) => r.status === 'UNVERIFIED' && r.severity === 'HIGH',
    );

    // 1. 优先推食品安全与材质合规（工厂端即可索取验证，是产前样制作前置）
    const foodContactRisk = unverifiedRisks.find(
      (r) => r.riskId === 'risk-food-contact' || r.title.includes('食品接触'),
    );
    if (foodContactRisk) {
      return {
        id: 'nba-risk-food-contact',
        priority: 2,
        title: '向工厂索取食品接触材料报告 (FDA/合规证明)',
        category: 'RISK_VERIFICATION',
        targetField: 'FOOD_CONTACT',
        description: '玻璃主体与 PP 沥水篮需向工厂索取材质合格检测报告，以确保亚马逊合规入仓。',
        actionType: 'VERIFY_RISK',
        buttonText: '核验材料证明',
      };
    }

    // 2. 其次推目标市场专利排查（核验食品接触后，下一轮再推检索 USPTO 专利）
    const patentRisk = unverifiedRisks.find((r) => r.category === 'PATENT');
    if (patentRisk) {
      return {
        id: 'nba-risk-patent',
        priority: 2,
        title: '检索目标市场外观与实用新型专利 (USPTO)',
        category: 'RISK_VERIFICATION',
        targetField: 'PATENT',
        description: '在向工厂支付模具费或大货定金前，必须先确认公模属性或检索 USPTO 专利。',
        actionType: 'VERIFY_RISK',
        buttonText: '核验专利证明',
      };
    }

    // 3. 其他 HIGH 未验证风险（每次仅取第 1 个单动作）
    if (unverifiedRisks.length > 0) {
      const firstRisk = unverifiedRisks[0];
      return {
        id: `nba-risk-${firstRisk.riskId}`,
        priority: 2,
        title: `核验关键风险: ${firstRisk.title}`,
        category: 'RISK_VERIFICATION',
        targetField: firstRisk.category,
        description: firstRisk.notes ?? '该项关键合规风险尚未验证，需提供凭据后方可入围。',
        actionType: 'VERIFY_RISK',
        buttonText: '上传核验证据',
      };
    }

    // 优先级 ③: 关键财务数据缺失
    const inputs = candidate.economics?.inputs;

    if (!inputs?.productCost?.value || inputs.productCost.source === 'UNKNOWN') {
      return {
        id: 'nba-fill-product-cost',
        priority: 3,
        title: '录入工厂正式报价并选定主选算账工厂',
        category: 'CRITICAL_INPUT',
        targetField: 'productCost',
        description: '尚未确认大货出厂单价与包装费，填入工厂报价以核算单件采购成本。',
        actionType: 'FILL_CRITICAL_INPUT',
        buttonText: '录入工厂报价',
      };
    }

    if (!inputs?.fbaFeePerUnit?.value || inputs.fbaFeePerUnit.source === 'UNKNOWN') {
      return {
        id: 'nba-fill-fba-fee',
        priority: 3,
        title: '填入亚马逊 FBA 配送费用',
        category: 'CRITICAL_INPUT',
        targetField: 'fbaFeePerUnit',
        description: '根据包装后尺寸和毛重核算标准 FBA 单件派送费。',
        actionType: 'FILL_CRITICAL_INPUT',
        buttonText: '填入 FBA 费用',
      };
    }

    if (!inputs?.freightPerUnit?.value || inputs.freightPerUnit.source === 'UNKNOWN') {
      return {
        id: 'nba-fill-freight-fee',
        priority: 3,
        title: '填入单件头程海运/空运运费',
        category: 'CRITICAL_INPUT',
        targetField: 'freightPerUnit',
        description: '根据箱规毛重和当前货代海运单价折算单件跨境头程物流成本。',
        actionType: 'FILL_CRITICAL_INPUT',
        buttonText: '填入头程费用',
      };
    }

    if (!inputs?.sellingPrice?.value || inputs.sellingPrice.source === 'UNKNOWN') {
      return {
        id: 'nba-fill-selling-price',
        priority: 3,
        title: '确认亚马逊建议零售定价',
        category: 'CRITICAL_INPUT',
        targetField: 'sellingPrice',
        description: '参考主流竞品价格带，设定单件计划销售价格。',
        actionType: 'FILL_CRITICAL_INPUT',
        buttonText: '确认售价',
      };
    }

    if (!inputs?.referralFeeRate?.value || inputs.referralFeeRate.source === 'UNKNOWN') {
      return {
        id: 'nba-fill-referral-rate',
        priority: 3,
        title: '确认亚马逊品类佣金比例 (通常为 15%)',
        category: 'CRITICAL_INPUT',
        targetField: 'referralFeeRate',
        description: '填入所属类目的平台佣金费率。',
        actionType: 'FILL_CRITICAL_INPUT',
        buttonText: '确认佣金费率',
      };
    }

    // 优先级 ④: 启动资金项与可行性 (缺少 MOQ 或启动资金不完整)
    if (!candidate.initialCash || candidate.initialCash.moq <= 0) {
      return {
        id: 'nba-confirm-launch-cash',
        priority: 4,
        title: '核算首单起订量 (MOQ) 与首期启动资金总额',
        category: 'LAUNCH_CASH',
        targetField: 'initialCash',
        description: '核实 MOQ 备货款、样品费与首批头程运费，明确第一次启动掏多少真金白银。',
        actionType: 'CONFIRM_LAUNCH_CASH',
        buttonText: '核算启动现金',
      };
    }

    if (candidate.initialCash.status === 'INCOMPLETE') {
      const missingText = candidate.initialCash.missingItems?.join('/') || '样品费/首批头程';
      return {
        id: 'nba-complete-launch-cash',
        priority: 4,
        title: `补全首单启动资金项 (缺${missingText})`,
        category: 'LAUNCH_CASH',
        targetField: 'initialCash',
        description: '首单启动资金至少需补齐样品费与首批头程物流费，才能核实首次真金白银启动门槛。',
        actionType: 'CONFIRM_LAUNCH_CASH',
        buttonText: '补齐启动资金',
      };
    }

    // 优先级 ⑤: 非阻断项与尽职调查优化
    const activeSpec = candidate.specifications?.find(
      (s) => s.id === candidate.activeSpecVersionId,
    );
    if (activeSpec && (!activeSpec.cartonGrossWeight || !activeSpec.cartonDimensions)) {
      return {
        id: 'nba-optimize-carton-specs',
        priority: 5,
        title: '完善外箱箱规与整箱毛重数据',
        category: 'NON_BLOCKING_IMPROVEMENT',
        targetField: 'cartonSpecs',
        description: '向工厂索取准确外箱箱规尺寸，以便校准头程分摊与海外仓月度仓储费。',
        actionType: 'OPTIMIZE',
        buttonText: '完善箱规数据',
      };
    }

    // 已完全齐备
    if (candidate.decision === 'SHORTLIST') {
      return {
        id: 'nba-proceed-sampling',
        priority: 5,
        title: '各项条件已全部达标，建议向工厂正式下单制作产前样',
        category: 'NON_BLOCKING_IMPROVEMENT',
        description: '单件利润与首单现金符合预期，核心风险已排查，进入打样与实物跌落质检。',
        actionType: 'OPTIMIZE',
        buttonText: '推进产前样品',
      };
    }

    return null;
  }
}
