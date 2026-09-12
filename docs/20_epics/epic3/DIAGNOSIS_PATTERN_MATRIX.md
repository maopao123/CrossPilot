# CrossPilot V9 Diagnosis Pattern Matrix

## 一、概述 (Overview)

`CrossDomainDiagnosisService` 是 CrossPilot V9 WF-05 日常运营智能诊断的核心因果归因引擎。
本矩阵详细规范了 5 大核心诊断模式（Diagnosis Patterns）的目标信号、所需上下文、确定性计算公式、归因强度评级、证据链溯源与优雅降级策略。

### 核心架构公理
```text
Load ≠ Detect ≠ Diagnose ≠ Recommend
```
- **Phase 2 (`OperationAnomalyDetector`)** 回答：“**发生了什么异常？**”（产出 `BusinessSignal[]`）
- **Phase 3 (`Sku360ContextLoader`)** 回答：“**这个 SKU 的跨域客观经营事实是什么？**”（产出 `Sku360BusinessContext`）
- **Phase 4 (`CrossDomainDiagnosisService`)** 仅回答：“**为什么会发生这些异常？**”（产出 `DiagnosisResult[]`）
- **Phase 5 (`ActionRecommendationService`)** 后续回答：“**应该采取什么行动？**”（产出 `RecommendedAction[]`）

> [!IMPORTANT]
> Phase 4 严格禁止越界生成行动建议（如“下单补货 420 件”、“降低竞价 20%”）。Phase 4 的职责止步于客观根因确证与驱动因素分解。

---

## 二、5 大诊断模式归因矩阵 (Diagnosis Pattern Matrix)

| 模式名称 (Pattern) | 标识符 (ID) | 目标信号 (Target Signals) | 所需领域事实 (Required Context) | 确定性计算与归因逻辑 (Deterministic Attribution Logic) | 因果强度判定 (Causal Strength) | 证据门禁 (Evidence Gate) | 降级与兜底 (Fallback & Defensiveness) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **利润骤降与结构性方差归因**<br>`ProfitDropPattern` | `profit-drop` | `R-PROF-01`<br>`R-PROF-02`<br>D10 销售上升利润稀释 | `profit`<br>`sales?`<br>`advertising?`<br>`returns?`<br>`inventory?` | 复用 `VarianceAttributionService.attributeVariance` 进行标准 Waterfall 闭环方差分解：<br>$\Delta\text{Profit} = \Delta\text{Ads} + \Delta\text{Returns} + \Delta\text{Inventory} + \Delta\text{Price} + \Delta\text{Other}$<br>残差严格等于 0，定位主要亏损驱动领域。 | 当 Waterfall 完全闭环且方差解释率 $100\%$ 时判定为 **`PROVEN`**；缺失部分明细时为 **`STRONG`** | `SUPPORTED`<br>(方差闭环且驱动因素可信) | 若无有效基线期或利润数据为 `UNAVAILABLE`，生成降级描述，证据门禁置 `PARTIALLY_SUPPORTED` |
| **广告低效与预算浪费分解**<br>`AdvertisingEfficiencyPattern` | `advertising-efficiency` | `R-ADS-01`<br>`R-ADS-02`<br>`R-ADS-03` | `advertising`<br>`sales?` | 1. **搜索词预算浪费**：提取转化量为 0 且花费大于阈值的 Search Terms，按花费降序排列，计算浪费金额与占比；<br>2. **脱节式消耗激增**：对比花费增幅与广告销售额增幅（$+\Delta\text{Spend} \gg +\Delta\text{Sales}$）；<br>3. **ACOS 结构性恶化**：对比 ACOS 与目标 ACOS。 | 零转化词明确消耗：**`PROVEN`**；<br>花费增幅远超销售增幅：**`STRONG`**；<br>泛 ACOS 抬升：**`INDICATIVE`** | `SUPPORTED`<br>(含搜索词明细)<br>`PARTIALLY_SUPPORTED`<br>(仅有汇总指标) | 若缺乏搜索词明细（`searchTerms` 为空），退化至汇总层 ACOS 与花费比率分析，强度上限设为 `STRONG` |
| **库存缺货与断货周期归因**<br>`InventoryStockoutPattern` | `inventory-stockout` | `R-INV-01`<br>`R-INV-02`<br>`R-INV-03` | `inventory`<br>`sales?` | 1. **补货提前期缺口**：$\text{daysCover} < \text{leadTimeDays}$，计算可用库存断供倒计时；<br>2. **活跃断货状态**：可售库存为 0，估算日均断货损失（$\text{lostDailyRevenue} = \text{avgDailySales} \times \text{asp}$）；<br>3. **销量提速相关性**：比对当前日均销量与基线日均销量，识别加速断货动因。 | 可售库存为 0 且断货确发生：**`PROVEN`**；<br>周转天数低于提前期且销量维持/提速：**`STRONG`**；<br>销量大幅下滑下的低库存：**`INDICATIVE`** | `SUPPORTED`<br>(库存参数齐全) | 若日均销量为 0，安全钳位周转天数为 999 天，防除零崩溃；积压库存（Overstock）独立归因为呆滞资金占用 |
| **商品质量与退换差评跨域合成**<br>`ProductQualityIssuePattern` | `product-quality-issue` | `R-RET-01`<br>`R-REV-01` | `returns`<br>`reviews` | **跨域因果合成 (Cross-Domain Synthesis)**：<br>1. 将退货率飙升（R-RET-01）与买家评分恶化/差评激增（R-REV-01）交叉对齐；<br>2. 聚合结构化 VOC 痛点（如 “Hole size too small”）与主退货原因（如 “Defective / Missing parts”）；<br>3. 识别共性物理质量缺陷主题，计算缺陷提及集中度。 | 退货率激增与差评激增同时触发，且 VOC 痛点高频聚焦同一物理缺陷：**`STRONG`**；<br>单领域异常或无明确 VOC 聚集：**`INDICATIVE`** | `SUPPORTED`<br>(退货与评价皆可用)<br>`PARTIALLY_SUPPORTED`<br>(单域可用) | 样本量防御：交付量 $< 20$ 或近期评论 $< 5$ 时，严禁夸大为重大批次缺陷，强度降为 `INDICATIVE` |
| **竞品竞争挤压与定价异动分析**<br>`CompetitorPressurePattern` | `competitor-pressure` | `R-COMP-01`<br>`R-COMP-02` | `competitors`<br>`sales?` | 1. **价格剪刀差**：计算竞品降价幅度及与我方当前售价价差（$\text{priceGap} = \text{compPrice} - \text{ourPrice}$）；<br>2. **评分反超差距**：计算竞品评分超越值（$\Delta\text{Rating} = \text{compRating} - \text{ourRating}$）；<br>3. **销量关联度**：分析我方订单量/访客量是否在竞品调价期间同步发生下滑。 | 竞品数据新鲜（$\le 3$天）且我方销量发生负向关联：**`STRONG`**；<br>竞品数据过期（$> 7$天）：**强制降级为 `INDICATIVE` 并注入时效性告警** | `SUPPORTED`<br>(主竞品存在且时效新鲜)<br>`PARTIALLY_SUPPORTED`<br>(时效过期或缺少销量关联) | 若竞品数据服务不可用（`UNAVAILABLE`），模式自动安全跳过，不阻塞其他领域的诊断执行 |

---

## 三、因果强度标准定义 (Causal Strength Axiom)

诊断引擎必须严谨区分事实与推测，通过 `CausalStrength` 枚举显式标定确定性程度：

1. **`PROVEN` (事实闭环/数学自洽)**：
   - 具有直接数学恒等式或无可辩驳的物理状态支持。
   - 例 1：Waterfall 方差分解中各领域成本差额精确对齐总利润差额（残差为 0）。
   - 例 2：可售库存真实降至 0 件，断货状态客观存在。
   - 例 3：特定 Search Term 发生实际广告花费且带来订单数严格为 0。

2. **`STRONG` (高置信度多源相关)**：
   - 多领域证据链相互交叉验证，或单领域具备充足高质量事实样本支持。
   - 例 1：退货率激增同时伴随评分下滑，且 VOC 高频聚焦于孔径不匹配。
   - 例 2：补货周转天数严重低于工厂交付提前期，且近期日均销量持续走强。
   - 例 3：直接竞品大幅降价 20%，同时我方自然搜索转化与订单量出现同步骤降。

3. **`INDICATIVE` (指向性/低置信度推测)**：
   - 存在单点指标异常，但缺乏充分的多维交叉证据，或数据时效性已陈旧。
   - 例 1：竞品抓取数据已超过 7 天（`STALE`），无法证明近期销量下滑系竞品降价所致。
   - 例 2：样本量较小（如退货交付量 $< 20$ 件），指标波动可能受小样本偶然性干扰。

4. **`UNKNOWN` (未知/无法判定)**：
   - 核心数据缺失或不可用，无法进行因果推演。

---

## 四、证据门禁状态标准 (Diagnosis Evidence Gate Status)

每个诊断结果通过 `DiagnosisEvidenceGateStatus` 明确自身的论据完备度：

```text
┌─────────────────────────────────────────────────────────┐
│                    Evidence Gate                        │
├──────────────────────┬──────────────────────────────────┤
│ SUPPORTED            │ 所需领域数据全齐，证据链完整，指标闭环    │
├──────────────────────┼──────────────────────────────────┤
│ PARTIALLY_SUPPORTED  │ 核心异常已捕捉，但缺少部分明细（如无词明细）│
├──────────────────────┼──────────────────────────────────┤
│ INSUFFICIENT         │ 缺少必要领域事实，无法支撑根因诊断        │
└──────────────────────┴──────────────────────────────────┘
```

---

## 五、D1~D10 金标测试场景映射 (Golden Scenarios Mapping)

| 场景编号 | 场景名称 | 输入信号组合 | 命中模式 | 核心诊断产出与特征 | 因果强度 | 验收结论 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **D1** | 广告激增侵蚀利润 | `R-PROF-01` + `R-ADS-01` | `ProfitDropPattern`<br>`AdvertisingEfficiencyPattern` | 利润 Waterfall 中 Ads Cost 为主要侵蚀源（-$980）；广告诊断指出花费激增远超销售增长 | `PROVEN`<br>`STRONG` | PASS |
| **D2** | 活跃完全断货 | `R-INV-02` | `InventoryStockoutPattern` | 可售库存为 0，断货状态客观成立，估算每日损失销售额 | `PROVEN` | PASS |
| **D3** | 销量激增逼近断货 | `R-INV-01` | `InventoryStockoutPattern` | 剩余天数低于提前期，叠加日均销量环比上升，加速断料动因成立 | `STRONG` | PASS |
| **D4** | 结构性质量缺陷 | `R-RET-01` + `R-REV-01` | `ProductQualityIssuePattern` | 退货率异常（12%）与星级下滑交叉，VOC 提取 “Hole size too small” 主因 | `STRONG` | PASS |
| **D5** | 竞品价格战挤压 | `R-COMP-01` | `CompetitorPressurePattern` | 竞品调价 -$4.00 (-20%)，竞品数据新鲜，关联我方订单量下滑 | `STRONG` | PASS |
| **D6** | 竞品陈旧数据告警 | `R-COMP-01` (Stale) | `CompetitorPressurePattern` | 竞品价格存在剪刀差，但数据源时效超 7 天，强制降级并注入告警 | `INDICATIVE` | PASS |
| **D7** | 搜索词预算无效消耗 | `R-ADS-03` | `AdvertisingEfficiencyPattern` | 定位 0 转化搜索词明细，计算总浪费金额与占比 | `PROVEN` | PASS |
| **D8** | 健康状态零异常 | 0 条信号 | 0 个诊断 | 引擎安全退出，产出 0 个诊断结果，不臆造虚假因果 | N/A | PASS |
| **D9** | 局部数据源不可用 | `R-PROF-01` (竞品故障) | `ProfitDropPattern` | 竞品领域服务不可用时，利润诊断依然正常执行，故障隔离有效 | `PROVEN` | PASS |
| **D10** | 增收不增利结构恶化 | `R-PROF-02` (销售上升) | `ProfitDropPattern` | 销售额上升但利润率恶化，Waterfall 揭示售价下降与广告/成本上升的综合稀释 | `PROVEN` | PASS |
