# CrossPilot V9 Action Recommendation Matrix

## 一、概述 (Overview)

`ActionRecommendationService` 是 CrossPilot V9 WF-05 日常运营智能诊断链路的核心行动决策引擎。
本矩阵系统化规范了从诊断结果（`DiagnosisResult[]`）到行动建议（`RecommendedAction[]`）的确定性映射规则、准入门禁、优先级评分模型、风险与执行模式判定、影响类型界定、证据链要求以及优雅降级策略。

### 核心架构公理
```text
Load ≠ Detect ≠ Diagnose ≠ Recommend ≠ Execute
```
- **Phase 2 (`OperationAnomalyDetector`)**：回答“**发生了什么异常？**”（输出 `BusinessSignal[]`）
- **Phase 3 (`Sku360ContextLoader`)**：回答“**客观经营事实是什么？**”（输出 `Sku360BusinessContext`）
- **Phase 4 (`CrossDomainDiagnosisService`)**：回答“**为什么会出现这些异常？**”（输出 `DiagnosisResult[]`）
- **Phase 5 (`ActionRecommendationService`)**：回答“**现在应该怎么办？**”（输出 `RecommendedAction[]`）
- **Phase 6 (`DailyOperationWorkflowService` / HITL)**：后续解决“**如何经由人工授权安全执行？**”

> [!IMPORTANT]
> **代码决定“可以建议什么”，LLM 最多负责“怎么说得更清楚”。**
> Phase 5 严禁由大模型随意发明行动建议、虚构补货量或臆造降价百分比；本阶段只生成建议，绝对不调用 Amazon API、Ads API 或修改任何系统真实数据。所有产出动作初始状态严格为 `PROPOSED`。

---

## 二、核心行动建议矩阵 (Action Recommendation Matrix)

| 诊断模式 (Diagnosis Pattern) | 行动类型 (Action Type) | 行动分类 (Category) | 准入门禁 (Eligibility Gate) | 确定性优先级规则 (Priority Rule) | 风险等级 (Risk Level) | 执行模式 (Execution Mode) | 影响类型 (Impact Type) | 证据链要求 (Evidence Requirement) | 兜底与防御 (Fallback & Defensiveness) | 金标用例 (Golden Case) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **广告低效与预算浪费**<br>`advertising-efficiency` | `REVIEW_NEGATIVE_KEYWORD` | `ADVERTISING` | `SUPPORTED`<br>含搜索词明细且 clicks $\ge 15$, orders $= 0$ | 浪费花费 $\ge \$100 \rightarrow$ **P1**；<br>浪费花费 $< \$100 \rightarrow$ **P2** | `LOW` | `APPROVAL_REQUIRED`<br>(否定词会截流，需人工核准) | `MEASURED`<br>(当前周期实际消耗的浪费广告费) | 必须绑定 SearchTerm 报表证据（clicks, spend, 0 orders） | 若缺少搜索词明细，仅能在汇总层提示审查花费，不得臆造具体否定词 | **D7**<br>(acrylic organizer 浪费 $185 $\rightarrow$ P1) |
| **广告低效与预算浪费**<br>`advertising-efficiency` | `REVIEW_AD_SPEND` | `ADVERTISING` | `SUPPORTED`<br>花费增幅 $> 20\%$ 且销售额停滞 | 关联严重利润骤降 $\rightarrow$ **P1**；<br>一般低效 $\rightarrow$ **P2** | `MEDIUM` | `APPROVAL_REQUIRED`<br>(调整日预算影响流量) | `MEASURED`<br>(花费增量额 $\Delta\text{Spend}$) | 必须绑定广告花费与销售额跨期对比数据 | 缺失销售基线时降级为查看广告活动，不强制减预算 | **D1**<br>(广告侵蚀利润 -$980 $\rightarrow$ P1) |
| **广告低效与预算浪费**<br>`advertising-efficiency` | `REVIEW_BID` | `ADVERTISING` | `SUPPORTED`<br>ACOS 显著超出目标值 | 超额花费 $> \$100 \rightarrow$ **P2**；<br>轻微超标 $\rightarrow$ **P3** | `MEDIUM` | `APPROVAL_REQUIRED`<br>(调价影响曝光份额) | `ESTIMATED`<br>(超出目标 ACOS 的超额花费) | 必须绑定当前 ACOS 与 Target ACOS 设定证据 | 订单量 $< 2$ 样本不足时抑制出价下调建议，避免低基数误判 | 广告效率常规巡检 |
| **库存缺货与断货周期**<br>`inventory-stockout` | `PREPARE_REPLENISHMENT` | `INVENTORY` | `SUPPORTED`<br>可售库存 $= 0$ 或周转天数 $\le$ 提前期 | 活跃断货 / 7天内断货 / 销量激增 $\rightarrow$ **P1**；<br>提前期标准断货风险 $\rightarrow$ **P2** | 补货金额 $> \$1,000$ 或数量 $\ge 200 \rightarrow$ **HIGH**；<br>其余 $\rightarrow$ **MEDIUM** | `APPROVAL_REQUIRED`<br>(采购涉及大额资金与库存积压风险) | `ESTIMATED`<br>(日均保护销售额 $\text{avgSales} \times \text{ASP}$) | 补货数量**必须**严格来自 `InventoryPlanningService.calculatePlanning` | 严禁大模型擅自算补货量；日均销量 $= 0$ 时周转天数钳位 999d，不建议补货 | **D2** (活跃断货, P1, 420件)<br>**D3** (销量激增逼近断货, P1) |
| **库存缺货与断货周期**<br>`inventory-stockout` | `INVESTIGATE_STOCKOUT` | `INVESTIGATION` | `SUPPORTED`<br>可售库存 $= 0$ | 活跃断货必然相伴发生 $\rightarrow$ **P1** | `LOW` | `ADVISORY`<br>(纯审查在途和物流) | `QUALITATIVE`<br>(减少自然排名和 BSR 下滑周期) | 需附带在途在仓库存明细（`inboundQuantity`） | 纯分析建议，绝不触发外部供应链指令 | **D2** (在途核查) |
| **商品质量与退换差评**<br>`product-quality-issue` | `INVESTIGATE_PRODUCT_FIT` | `INVESTIGATION` | `SUPPORTED` 或 `PARTIALLY_SUPPORTED` | 退货飙升 + 差评激增 $\rightarrow$ **P2** | `LOW` | `ADVISORY`<br>(纯质检与排查) | `QUALITATIVE`<br>(定位是物理批次缺陷还是预期错配) | 绑定退货率（$\ge 5\%$）及 VOC 负向主题证据 | 样本量交付 $< 20$ 件时防误报，证据不足时严禁直接归咎工厂缺陷 | **D4** (孔径偏小 VOC 痛点, P2) |
| **商品质量与退换差评**<br>`product-quality-issue` | `REVIEW_LISTING_SPECIFICATION` | `LISTING` | VOC 痛点高频聚焦于尺寸/兼容性/规格（Hole, Size, Fit 等） | 与质量排查协同建议 $\rightarrow$ **P2** | `MEDIUM` | `APPROVAL_REQUIRED`<br>(修改文案影响搜索权重) | `QUALITATIVE`<br>(减少买家预期不符导致的退货) | 必须逐字命中 VOC 痛点关键词 | 若证据无法区分是物理缺陷还是文案缺陷，优先推 `INVESTIGATE_PRODUCT_FIT` | **D4** (核实尺寸图与五点描述) |
| **利润骤降与方差归因**<br>`profit-drop` | 按 Waterfall 主驱动动态分发：<br>1. `REVIEW_AD_SPEND`<br>2. `REVIEW_RETURN_REASON`<br>3. `REVIEW_PRICE_COMPETITIVENESS`<br>4. `INVESTIGATE_PROFIT_DRIVER` | `ADVERTISING`<br>`REVIEW`<br>`PRICING`<br>`INVESTIGATION` | `SUPPORTED`<br>Waterfall 残差 $= 0$ 闭环 | 主驱动绝对影响 $> \$500 \rightarrow$ **P1**；<br>其余 $\rightarrow$ **P2** | 依动作类型而定：<br>Ads/Pricing $\rightarrow$ `MEDIUM`<br>Returns/Investigate $\rightarrow$ `LOW` | 依动作类型而定：<br>调研类 `ADVISORY`；<br>写操作前置类 `APPROVAL_REQUIRED` | `MEASURED`<br>(Waterfall 分解出的各领域确切差额) | 严格绑定 `VarianceAttributionService` 的方差分解证据项 | 严禁生成泛泛的“提高利润”假大空建议；每一条建议必须严格绑定具体领域驱动 | **D1** (广告驱动 -$980)<br>**D10** (增收不增利结构恶化) |
| **竞品竞争挤压**<br>`competitor-pressure` | `REVIEW_PRICE_COMPETITIVENESS` | `PRICING` | `SUPPORTED` 且竞品数据为 **`FRESH`**（$\le 3$天） | 竞品降价幅度 $> 10\% \rightarrow$ **P2** | `MEDIUM` | `APPROVAL_REQUIRED`<br>(调价直接影响单件毛利) | `QUALITATIVE`<br>(防守 Buy Box 与搜索转化率) | 必须绑定竞品 ASIN、竞品现价及我方现价价差证据 | **严禁直接建议修改定价**；仅建议审查定价与竞品动态 | **D5** (竞品降价 -$4.00, P2) |
| **竞品竞争挤压**<br>`competitor-pressure` | `REFRESH_COMPETITOR_DATA` | `INVESTIGATION` | 竞品数据为 **`STALE`**（$> 7$天） | 数据维护类任务 $\rightarrow$ **P3** | `LOW` | `ADVISORY`<br>(纯抓取请求，无商业风险) | `QUALITATIVE`<br>(避免基于陈旧价格做出错误决策) | 记录竞品抓取时间戳及过期状态 | **绝对红线：竞品数据陈旧时，坚决禁止生成任何调价建议**，强制降级为刷新数据 | **D6** (陈旧数据阻断调价, P3) |
| **健康状态 / 零异常** | `NO_ACTION_REQUIRED` | `INVESTIGATION` | 无异常信号或证据不足 | 无需关注 $\rightarrow$ **N/A** | `LOW` | `ADVISORY` | `UNKNOWN` | 无 | 干净退出，返回 0 个行动建议，绝不无病呻吟 | **D8** (健康 SKU, 0 Actions) |

---

## 三、确定性优先级评分算法 (`ActionPriorityScorer`)

优先级绝不允许由 LLM 自由发挥，由纯代码进行多因子综合加权评分（0 ~ 100 分）：

$$\text{Priority Score} = \text{BaseScore} + \text{ImpactBonus} + \text{UrgencyBonus} + \text{CausalModifier} + \text{EvidenceModifier} - \text{FreshnessPenalty}$$

1. **基础分（BaseScore）**：
   - 活跃断货（`OUT_OF_STOCK`，0 件）：85 分
   - 7 天内即将断货 / 销量激增导致提前期缺口：80 分
   - 提前期标准缺货风险（`daysCover < leadTime`）：70 分
   - 严重利润骤降（`R-PROF-01` 降幅 $> 25\%$ 或亏损 $> \$1,000$）：75 分
   - 严重广告浪费（零转化消耗 $\ge \$100$）：75 分
   - 产品质量与差评双重恶化：65 分
   - 新鲜竞品降价冲击：55 分
   - 广告脱节式花费激增 / ACOS 扩张：60 分
   - 冗余库存积压（Overstock）：35 分
   - 陈旧竞品数据刷新：30 分
2. **影响增益（ImpactBonus）**：
   - 实测已发生成本/浪费 $\ge \$500$：+15 分；$\ge \$100$：+10 分；$\ge \$20$：+5 分
   - 估算日损失暴露 $\ge \$300$：+8 分；$\ge \$100$：+5 分
3. **紧迫度增益（UrgencyBonus）**：
   - 活跃完全断货：+15 分
   - 周转天数 $\le 7$ 天：+10 分
4. **因果与证据修正（Causal & Evidence Modifier）**：
   - `PROVEN`：+5 分；`STRONG`：+3 分；`INDICATIVE`：-5 分；`UNKNOWN`：-15 分
   - `SUPPORTED`：+5 分；`PARTIALLY_SUPPORTED`：-10 分；`INSUFFICIENT`：-25 分
5. **时效性惩罚（FreshnessPenalty）**：
   - 涉及领域数据为 `STALE`（如竞品超过 7 天）：-20 分
6. **优先级区间映射**：
   - $\ge 75 \rightarrow$ **`P1`**（立即关注 / 紧迫度极高）
   - $50 \sim 74 \rightarrow$ **`P2`**（本周期内处理 / 核心业务议题）
   - $< 50 \rightarrow$ **`P3`**（优化 / 巡检 / 数据维护）

---

## 四、风险等级与执行模式分立 (`Risk != Priority`)

- **`priority`**：衡量**业务紧迫度**（何时需要处理）。
- **`riskLevel`**：衡量**动作潜在破坏性与资金风险**（如果做错了代价多大）。
- **`executionMode`**：
  - **`ADVISORY`**：只读查看、数据刷新、归因分析、质检调研。
  - **`APPROVAL_REQUIRED`**：涉及写操作、采购资金、否定词阻断流量、调出价、改售价、改文案。

```text
┌─────────────────────────┬──────────────────────────────────────────┐
│ P1 + LOW RISK           │ 零转化否定词审查、断货在途物流审查         │
├─────────────────────────┼──────────────────────────────────────────┤
│ P1 + HIGH RISK          │ 紧急大额补货 PO（如 420 件，资金占用大） │
├─────────────────────────┼──────────────────────────────────────────┤
│ P2 + MEDIUM RISK        │ 竞品调价审查、优惠券策略审查、五点文案审查 │
├─────────────────────────┼──────────────────────────────────────────┤
│ P3 + LOW RISK           │ 刷新过期竞品数据、冗余库存常规促销调研     │
└─────────────────────────┴──────────────────────────────────────────┘
```

---

## 五、去重与多诊断合并引擎 (`ActionDeduplicator`)

1. **幂等 Action ID**：
   $$\text{actionId} = \text{ACT-}\{\text{workspaceId}\}\text{-}\{\text{skuId}\}\text{-}\{\text{actionType}\}\text{[-}\{\text{targetKey}\}\text{]}$$
   相同输入重试保证 ID 恒定幂等。
2. **多源合并（Merge）**：
   - 当利润诊断指出 Ads Cost 侵蚀 -$980，且广告诊断指出 ACOS 激增时，均产生 `REVIEW_AD_SPEND`；
   - 系统自动将其合并为一条主 Action，`sourceDiagnosisIds` 与 `sourceSignalIds` 取并集；
   - 证据项去重合并；优先级取最高（$\text{P1} > \text{P2} > \text{P3}$）；风险等级取最高；原因描述多维拼接。

---

## 六、行动冲突检测引擎 (`ActionConflictDetector`)

自动排查同 SKU 下互斥的策略冲突：
- **库存断料 vs 促销降价冲突**：
  - 当库存处于 `PREPARE_REPLENISHMENT` 或 `INVESTIGATE_STOCKOUT`（断货风险），而同时存在 `REVIEW_COUPON_STRATEGY` 或 `REVIEW_PRICE_COMPETITIVENESS`（降价促销）；
  - **冲突认定**：在货源枯竭时降价或发券将加速断货，严重损害产品长期加权排名；
  - **处置方式**：双方均打标 `conflictDetected: true`，互填 `conflictingActionIds`，证据门禁降级为 `NEEDS_REVIEW`，提示人工仲裁。

---

## 七、D1~D10 金标用例验收结果

| 场景 | 诊断触发事实 | 产生主行动建议 | 优先级 | 风险等级 | 执行模式 | 影响额与类型 | 验收结论 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **D1** | 利润骤降（Ads -$980） | `REVIEW_AD_SPEND` | P1 | MEDIUM | APPROVAL_REQUIRED | -$980.00 (MEASURED) | ✅ PASS |
| **D2** | 活跃完全断货（0件） | `PREPARE_REPLENISHMENT` (420件)<br>`INVESTIGATE_STOCKOUT` | P1<br>P1 | HIGH<br>LOW | APPROVAL_REQUIRED<br>ADVISORY | -$420.00/d (ESTIMATED)<br>QUALITATIVE | ✅ PASS |
| **D3** | 销量激增逼近断货 | `PREPARE_REPLENISHMENT` (865件) | P1 | HIGH | APPROVAL_REQUIRED | -$1,015.00/d (ESTIMATED) | ✅ PASS |
| **D4** | 退货率 12% + 差评 + VOC 孔径偏小 | `INVESTIGATE_PRODUCT_FIT`<br>`REVIEW_LISTING_SPECIFICATION` | P2<br>P2 | LOW<br>MEDIUM | ADVISORY<br>APPROVAL_REQUIRED | QUALITATIVE<br>QUALITATIVE | ✅ PASS |
| **D5** | 竞品降价 -$4.00 (新鲜数据) | `REVIEW_PRICE_COMPETITIVENESS` | P2 | MEDIUM | APPROVAL_REQUIRED | -$4.00 (QUALITATIVE) | ✅ PASS |
| **D6** | 竞品降价 (陈旧数据 > 7天) | `REFRESH_COMPETITOR_DATA` (禁止调价) | P3 | LOW | ADVISORY | QUALITATIVE | ✅ PASS |
| **D7** | 搜索词 0 转化浪费 $185 | `REVIEW_NEGATIVE_KEYWORD` | P1 | LOW | APPROVAL_REQUIRED | -$185.00 (MEASURED) | ✅ PASS |
| **D8** | 健康状态（0 异常信号） | `NO_ACTION_REQUIRED` (0 Actions) | N/A | LOW | ADVISORY | UNKNOWN | ✅ PASS |
| **D9** | 竞品服务离线局部故障 | 仅产出非受损领域的行动建议 | P1/P2 | 按领域 | 按领域 | 按领域 | ✅ PASS |
| **D10**| 增收不增利（利润稀释） | `REVIEW_AD_SPEND` (特定驱动) | P1/P2 | MEDIUM | APPROVAL_REQUIRED | 驱动实测差额 (MEASURED) | ✅ PASS |
