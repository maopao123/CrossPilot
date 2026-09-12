# CrossPilot V9 Sku360 Cross-Domain Context Matrix

## 一、概述 (Overview)

`Sku360BusinessContext` 是 CrossPilot V9 WF-05 日常运营智能诊断的核心事实装配契约。
本矩阵详细规定了 7 大业务领域在装配层的源服务、字段定义、跨期比较、计算公式、可用性判定、证据链血缘与优雅降级策略。

核心架构公理：
```text
Load ≠ Detect ≠ Diagnose ≠ Recommend
```
`Sku360ContextLoader` 仅负责数据的加载、清洗、对齐、装配与溯源，绝对不在此处进行异常裁决、因果归因或行动建议生成。

---

## 二、7 大业务领域事实映射矩阵 (Cross-Domain Context Matrix)

| 领域 (Domain) | 数据源 / 现有服务 (Source Service) | 当前期字段 (Current Fields) | 基线期字段 (Baseline Fields) | 确定性计算指标 (Calculated Fields) | 可用性状态 (Availability) | 证据分类 (Evidence Type) | 时效性判定 (Freshness) | 优雅降级与兜底 (Fallback) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Sales** | `OrderService`<br>`OrderItem`<br>`ScenarioGeneratorService` | `ordersCount`<br>`unitsSold`<br>`revenue`<br>`averageSellingPrice`<br>`sessions?`<br>`pageViews?` | `ordersCount`<br>`unitsSold`<br>`revenue`<br>`averageSellingPrice`<br>`sessions?`<br>`pageViews?` | `delta`<br>`deltaPct`<br>`conversionRate = orders / sessions`<br>`asp = revenue / unitsSold` | `AVAILABLE`<br>`PARTIAL`<br>`UNAVAILABLE` | `DATABASE`<br>`CALCULATED_METRIC` | 按订单产生日期判定：<br>$\le 7$d $\rightarrow$ `FRESH`<br>$> 7$d $\rightarrow$ `STALE` | 缺失时补 0，不发明虚假流量数据；`conversionRate` 严格置 `undefined` |
| **Advertising** | `AdOptimizerService`<br>`Campaign`<br>`AdMetricDaily`<br>`SearchTermMetricDaily` | `spend`<br>`sales`<br>`orders`<br>`clicks`<br>`impressions`<br>`searchTerms[]` | `spend`<br>`sales`<br>`orders`<br>`clicks`<br>`impressions` | `delta`<br>`deltaPct`<br>`acos = spend / sales`<br>`roas = sales / spend`<br>`ctr = clicks / impr`<br>`cvr = orders / clicks` | `AVAILABLE`<br>`PARTIAL`<br>`UNAVAILABLE` | `DATABASE`<br>`CALCULATED_METRIC` | 按广告同步日历判定：<br>$\le 3$d $\rightarrow$ `FRESH`<br>$> 7$d $\rightarrow$ `STALE` | 缺失时标为 `UNAVAILABLE`，Detector 自动跳过或标记 `NOT_EVALUATED` |
| **Inventory** | `InventoryPlanningService`<br>`InventoryMovementService`<br>`InventoryBalance` | `fulfillableQuantity`<br>`inboundQuantity`<br>`reservedQuantity`<br>`avgDailySales`<br>`leadTimeDays`<br>`safetyStockDays` | `fulfillableQuantity?`<br>`daysCover?`<br>`avgDailySales?` | 复用 `InventoryPlanningService`：<br>`daysCover = fulfillable / avgDailySales`<br>`reorderPoint`<br>`recommendedQuantity`<br>`inventoryHealth` | `AVAILABLE`<br>`PARTIAL`<br>`UNAVAILABLE` | `DATABASE`<br>`CALCULATED_METRIC` | 实时库存快照：<br>当日 $\rightarrow$ `FRESH`<br>$> 3$d $\rightarrow$ `STALE` | 缺失入库/预留量时按 0 处理，`daysCover` 日均销量为 0 时封顶 999d |
| **Reviews** | `ReviewProductHealthTool`<br>`Review`<br>`VocAnalysisRun`<br>`VocTopic` | `overallRating`<br>`totalReviews`<br>`recentReviewCount`<br>`negativeReviewCount`<br>`topPainPoints[]`<br>`topPositiveThemes[]` | `overallRating?`<br>`totalReviews?` | `negativeReviewRatio = negativeCount / recentCount`<br>结构化 VOC 主题频次与占比 | `AVAILABLE`<br>`PARTIAL`<br>`UNAVAILABLE` | `EXTERNAL_DATA`<br>`CALCULATED_METRIC` | 爬虫与站内评价同步时刻：<br>$\le 7$d $\rightarrow$ `FRESH`<br>$> 7$d $\rightarrow$ `STALE` | 样本量 $< 5$ 条时保留数值，Detector 端小样本防御拦截误报 |
| **Returns** | `ProfitService`<br>`ReturnRecord` | `returnCount`<br>`deliveredUnits`<br>`returnCost`<br>`topReturnReasons[]` | `returnCount`<br>`deliveredUnits`<br>`returnCost` | `delta`<br>`deltaPct`<br>`returnRate = returnCount / deliveredUnits` | `AVAILABLE`<br>`PARTIAL`<br>`UNAVAILABLE` | `DATABASE`<br>`CALCULATED_METRIC` | 按退货落表时间：<br>$\le 7$d $\rightarrow$ `FRESH`<br>$> 14$d $\rightarrow$ `STALE` | 交付量 $< 20$ 时严格防小分母误报；Current 与 Baseline 采用同口径退款统计 |
| **Competitors** | `ProductCompetitor`<br>`CompetitorSnapshot`<br>`XYDC Provider` | `items[]` (含 ASIN, 价格, 星级, 评价量, 关系类型, 是否主竞品) | `baselinePrice?`<br>`baselineRating?` | `priceDelta = cur - base`<br>`priceDeltaPct`<br>`ratingDelta = our - comp` | `AVAILABLE`<br>`PARTIAL`<br>`UNAVAILABLE` | `EXTERNAL_DATA`<br>`DATABASE` | 抓取时间戳：<br>$\le 3$d $\rightarrow$ `FRESH`<br>$> 7$d $\rightarrow$ `STALE` | 竞品服务超时时独立降级为 `UNAVAILABLE`，记录错误凭证，不阻塞其他领域 |
| **Profit** | `ProfitCalculationService`<br>`VarianceAttributionService`<br>`ProfitDaily` | `revenue`<br>`cogs`<br>`amazonFees`<br>`fbaFee`<br>`adsCost`<br>`returnLoss`<br>`otherCosts` | `revenue`<br>`cogs`<br>`amazonFees`<br>`fbaFee`<br>`adsCost`<br>`returnLoss`<br>`otherCosts` | `netProfit = rev - cogs - fees - ads - ret - oth`<br>`netMargin = netProfit / rev`<br>复用 `VarianceAttributionService` 计算 Waterfall 闭环归因 | `AVAILABLE`<br>`PARTIAL`<br>`UNAVAILABLE` | `DATABASE`<br>`CALCULATED_METRIC` | 按日汇总对账时刻：<br>$\le 2$d $\rightarrow$ `FRESH`<br>$> 7$d $\rightarrow$ `STALE` | 财务字段采用双精度 `roundMoney` 截断，基线非正时安全返回 `deltaPct = 0` |

---

## 三、跨期对比设计 (Current vs Baseline Comparative Model)

所有适合对比的指标统一使用强类型结构封装：
```ts
export interface MetricComparison {
  current: number;
  baseline: number;
  delta: number;
  deltaPct: number; // 相对变动率，如 -0.2770 表示下降 27.70%
}
```
- **比较精度与边界防御**：
  - 金额与数量使用 `roundMoney`（2 位小数），比率与费率使用 `roundMargin`（4 位小数）；
  - 当基线值 $\le 0$ 时，禁止除以零或负数翻转误导，`deltaPct` 严格置 0 或安全标示；
  - 自动推导能力：若请求方未指定 `baselinePeriod`，Loader 自动根据 `currentPeriod` 的天数，推导紧邻的前置周期作为默认基线。

---

## 四、数据完备度与局部故障隔离 (Partial Failure & Isolation)

1. **并行加载架构**：
   ```text
   loadSku360()
        ├─ Promise.allSettled
        │    ├─ getSales()       -> AVAILABLE
        │    ├─ getAdvertising() -> AVAILABLE
        │    ├─ getInventory()   -> AVAILABLE
        │    ├─ getReviews()     -> AVAILABLE
        │    ├─ getReturns()     -> AVAILABLE
        │    ├─ getCompetitors() -> TIMEOUT / REJECTED (Fallback to UNAVAILABLE)
        │    └─ getProfit()      -> AVAILABLE
        ↓
   Sku360BusinessContext (availability.overall = "PARTIAL")
   ```
2. **局部降级原则**：
   - 任何单一 Domain 的异常或超时（默认 5,000ms 超时熔断）均由 `extractDomainResult` 安全捕获；
   - 异常 Domain 自动降级为 `availability: 'UNAVAILABLE'`，注入错误追溯凭证 `EVI-ERR-${DOMAIN}`；
   - 整体请求保持成功，保障上层 Detector 能对可用领域正常检测，未就绪领域安全跳过 (`SKIPPED` / `NOT_EVALUATED`)。

---

## 五、证据链血缘追踪体系 (Evidence Lineage)

每个由 Loader 装配的核心事实，均必须携带可追溯的 `OperationEvidenceItem`：
- **`category` 严守事实边界**：
  - 严禁将数据库指标标为 `RAG`；
  - 原始交易与事实快照标注为 `DATABASE`；
  - 由领域服务计算的复合指标标注为 `CALCULATED_METRIC`；
  - 三方平台抓取数据标注为 `EXTERNAL_DATA`；
  - 异常降级与系统策略记录标注为 `RULE`。
- **追溯元数据**：
  - 包含 `domain`, `skuId`, `period: "from..to"`, `metric`, `current`, `baseline` 等完整审计血缘。

---

## 六、与 OperationAnomalyDetector 无缝桥接

`Sku360ContextLoader` 提供静态桥接方法：
```ts
const detectorInput = Sku360ContextLoader.toAnomalyDetectorInput(context, thresholdResolver);
const result = OperationAnomalyDetector.detect(detectorInput);
```
该方法将 7 大领域 Facts 一键映射为 Phase 2 确定性异常检测引擎的入参结构，100% 消除手工组装 JSON 的样板代码与人为失误。
