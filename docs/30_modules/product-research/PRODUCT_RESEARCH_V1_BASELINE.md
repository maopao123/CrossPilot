# Product Research V1 Baseline Specification (Phase 7.1 Frozen Baseline)

## 1. 决策层定位与模型性质 (Decision Engine Nature)

- **正式名称**: CrossPilot Product Research Decision Layer V1 (Heuristic Opportunity Score V1 / 规则型机会评分 V1)
- **模型方法论**: `methodology = 'HEURISTIC'` (启发式规则引擎)
- **模型版本**: `scoreVersion = 'v1.0.0'`
- **配置版本**: `scoreConfigVersion = 'v1.0.0'`
- **校准状态**: `calibrationStatus = 'UNCALIBRATED'` (未经过真实转化概率校准)
- **决策作用域**: `decisionScope = 'KEYWORD_CATEGORY_OPPORTUNITY'` (品类级/关键词级市场机会评级)
- **免责与定位声明 (Mandatory Disclaimer)**:
  > 本评分基于多维启发式规则与确定性加权公式进行相对排序，未经过真实销售转化概率校准，**绝不代表实际销量、销售额预测或推新成功概率保证**。严禁将分值解读为“成功率”（例如：58 分绝非 58% 成功率）。仅供卖家进行品类初筛与相对机会比较。

---

## 2. 作用域与主体边界披露 (Scope Disclosures)

每个决策评级输出必须明确附带 `OpportunityScopeDisclosure`，杜绝品类讨论与单品表现混淆：

| 维度 | 字段 | 作用域值 | 说明 |
| :--- | :--- | :--- | :--- |
| **决策整体范围** | `decisionScope` | `KEYWORD_CATEGORY_OPPORTUNITY` | 评估的是目标关键词/品类级市场机会 |
| **标杆参照商品** | `representativeAsin` | 动态传入 (如 `B0BFGNSXYL`) | 作为趋势与评价形态参照，非单品独立评级 |
| **头部竞品样本** | `productSampleSize` | 整数 (如 3 或 5) | TOP 榜单真实检索商品样本量 |
| **BSR 趋势样本** | `trendSampleSize` | 整数 (1) | 代表性商品历史 30d/90d BSR 轨迹 |
| **VOC 分析范围** | `vocScope` | `CATEGORY` | 外部搜索引擎关于品类的讨论摘要 |
| **VOC 内容形态** | `vocContentKind` | `SEARCH_SNIPPET` | 搜索摘要，可信度评级适度折减并明确提示 |
| **VOC 样本量** | `vocSampleSize` | 整数 (25) | 实际参与痛点聚类的真实外部讨论条数 |

---

## 3. 六大市场信号分段函数与作用域 (Piecewise Signal Formulas & Scopes)

每个信号必须严格标注独立作用域，分值 (0-100) 与置信度 (0.0-1.0) 严格解耦：

### 3.1 市场需求信号 (Demand Signal)
- **Scope**: `KEYWORD_MARKET` (`subjectId = keyword`, `sampleSize = 1`)
- **基础分段 (Search Volume)**:
  - $\text{vol} \ge 50,000 \implies 90 + \min(10, \text{round}((\text{vol}-50000)/10000))$
  - $20,000 \le \text{vol} < 50,000 \implies 80 + \text{round}(((\text{vol}-20000)/30000) \times 10)$
  - $5,000 \le \text{vol} < 20,000 \implies 65 + \text{round}(((\text{vol}-5000)/15000) \times 15)$
  - $1,000 \le \text{vol} < 5,000 \implies 45 + \text{round}(((\text{vol}-1000)/4000) \times 20)$
  - $0 \le \text{vol} < 1,000 \implies \max(10, \text{round}((\text{vol}/1000) \times 45))$
- **ABA 阶梯修正**:
  - $\text{abaRank} \le 5,000 \implies +8$
  - $5,000 < \text{abaRank} \le 25,000 \implies +4$
  - $\text{abaRank} > 100,000 \implies -8$
  - 其余区间无修正

### 3.2 竞争友好度信号 (Competition Signal - Inverted)
- **Scope**: `TOP_PRODUCTS` (`sampleSize = products.length`, `representativeAsin`)
- **壁垒难度分段 (Average Review Count)**:
  - $\text{reviews} \le 150 \implies \text{difficulty} = 20$
  - $150 < \text{reviews} \le 500 \implies \text{difficulty} = 35$
  - $500 < \text{reviews} \le 1,500 \implies \text{difficulty} = 55$
  - $1,500 < \text{reviews} \le 4,000 \implies \text{difficulty} = 75$
  - $\text{reviews} > 4,000 \implies \text{difficulty} = 90$
- **CPC 修正**:
  - $\text{CPC} > \$2.50 \implies \text{difficulty} = \min(95, \text{difficulty} + 10)$
  - $\text{CPC} < \$1.00 \implies \text{difficulty} = \max(10, \text{difficulty} - 10)$
- **反向映射**: $\text{normalizedScore} = 100 - \text{difficulty}$

### 3.3 商业价格信号 (Commercial Signal)
- **Scope**: `TOP_PRODUCTS` (`sampleSize = products.length`, `representativeAsin`)
- **价格区间分段 (Retail Avg Price)**:
  - $\text{price} < \$15.00 \implies 45$ (低价红海，毛利与 FBA 运费挤压)
  - $\$15.00 \le \text{price} < \$20.00 \implies 65$ (大众入门区间)
  - $\$20.00 \le \text{price} < \$25.00 \implies 80$ (良好价格带)
  - $\$25.00 \le \text{price} \le \$45.00 \implies 90$ (黄金客单价 Sweet Spot)
  - $\$45.00 < \text{price} \le \$80.00 \implies 80$ (中高客单价)
  - $\text{price} > \$80.00 \implies 65$ (高客单价，需审视退货与售后)
- **稳定性修正**:
  - $(\text{maxPrice} - \text{minPrice}) / \text{avgPrice} < 0.6 \implies +5$ (STABLE)

### 3.4 趋势动量信号 (Trend Signal)
- **Scope**: `REPRESENTATIVE_PRODUCT` (`subjectId = asin`, `sampleSize = 1`)
- **BSR 趋势方向映射**:
  - `RANK_IMPROVED` / `IMPROVED` $\implies 50 + 25 = 75$ (排名数字下降 = 销量上升)
  - `RANK_DECLINED` / `DECLINED` $\implies 50 - 20 = 30$ (排名数字上升 = 销量走弱)
  - `STABLE` / 其余 $\implies 50 + 5 = 55$

### 3.5 评价健康度信号 (Review Health Signal)
- **Scope**: `REPRESENTATIVE_PRODUCT` (`subjectId = asin`, `sampleSize = 1`)
- **星级分段**:
  - $\text{rating} < 3.8 \implies 50$ (WEAK，可能存在结构性缺陷)
  - $3.8 \le \text{rating} \le 4.3 \implies 88$ (MODERATE，有需求有痛点，新品改良颠覆空间最大)
  - $4.3 < \text{rating} \le 4.6 \implies 75$ (STRONG，口碑良好，需在特定功能点突破)
  - $\text{rating} > 4.6 \implies 60$ (STRONG，竞品成熟度极高，颠覆阻力较大)

### 3.6 VOC 用户心声机会信号 (VOC Opportunity Signal)
- **Scope**: `CATEGORY_EXTERNAL_VOC` (`sampleSize = analyzedReviewCount`)
- **痛点提及率阶梯**:
  - $\text{topPainPointPercentage} \ge 25.0\% \implies 50 + 25 = 75$
  - $15.0\% \le \text{topPainPointPercentage} < 25.0\% \implies 50 + 15 = 65$
  - $\text{topPainPointPercentage} < 15.0\% \implies 50 + 5 = 55$
- **功能期望加成**:
  - $+\min(15, \text{desiredFeatures.length} \times 6)$
- **置信度校准**:
  - `SEARCH_SNIPPET` $\implies \text{confidence} = 0.70$
  - 样本量 $< 15 \implies$ 置信度额外折减 0.15

---

## 4. 证据门禁与关键信号要求 (Evidence Gate Architecture)

- **核心关键信号 (Critical Signals)**: `['demand', 'competition']`
- **门禁状态评定规则**:
  1. **`SUFFICIENT` (证据充足)**:
     - 必须**同时具备** `demand` 与 `competition`（两项均不可为 MISSING）
     - 且可用信号总数 $\ge 4$
  2. **`DEGRADED_PASS` (降级通过)**:
     - 必须**至少具备一项**核心关键信号（`demand` 或 `competition` 至少一项可用）
     - 且可用信号总数 $\ge 3$
  3. **`INSUFFICIENT` (证据不足)**:
     - `demand` 与 `competition` 两项均缺失，或者可用信号总数 $< 3$
     - **硬性动作**: 当处于 `INSUFFICIENT` 时，`overallScore = null`，禁止给出任何虚构或降级评分。

---

## 5. 缺省重归一化机制 (Dynamic Re-normalization: Missing ≠ 0)

- 默认基础权重:
  `demand: 0.25`, `competition: 0.20`, `commercial: 0.15`, `trend: 0.15`, `reviewHealth: 0.10`, `voc: 0.15` (合计 1.00)。
- 当某一信号状态为 `MISSING` 时：
  - 严禁将其视为 0 分拉低总分。
  - 其有效权重置为 0，其余可用信号的权重按其相对比例动态重归一化至 1.00。
  - 各可用信号贡献 = $\text{normalizedScore} \times \text{effectiveWeight}$。
  - 综合机会评分 = $\text{Math.round}(\sum \text{contributions})$。

---

## 6. 事实分界与工程参数验真门禁 (Numeric Grounding Gate)

- **四层事实分界**:
  - `FACT`: 真实 Provider 返回的原生数据（搜索量、ABA 排名、价格分布、评价数）。
  - `SIGNAL`: 经确定性算法规则计算出的标准化信号分值。
  - `INFERENCE`: 跨信号逻辑推导得出的结论。
  - `RECOMMENDATION`: 面向卖家的差异化行动策略。
- **参数真实性门禁 (`ExplanationNumericGroundingValidator`)**:
  - **彻底移除无证据支持的精确工程数值**（如已剔除的 `3.2cm`）。
  - 所有设计建议统一转换为**方向性建议**（例如：“建议扩大插槽兼容范围，在打样阶段实测主流电动牙刷手柄尺寸后再确定孔径公差”）。
  - 运行期自动化校验：凡未在证据或指标中出现的物理尺寸量纲（`cm`, `mm`, `inch` 等）一律拦截。
- **LLM 数值不可变性**:
  - LLM 仅负责执行综述与语言表达，严禁篡改、重算、虚构任何分值、权重、搜索量或频次百分比。

---

## 7. 资源与成本真实性基线 (Cost Grounding)

- **真实整数指标 (Strict Integers)**:
  - `xydcCredits`: 实际调用的 XYDC 积分。
  - `firecrawlCredits`: 实际调用的 Firecrawl 抓取页数/积分。
  - `totalRequests`: 实际发起的网关请求总数。
  - `cacheHits`: 命中缓存的请求数。
- **美元估算真实性**:
  - `estimatedCostUsd = null`。
  - 原因：当前 XYDC 与 Firecrawl 官方未提供公开、实时的计费 API 合约，系统严格不编造无依据的估算美元金额（杜绝虚构的 `$0.008`）。

---

## 8. 正式回归基线快照 (Regression Baseline Fixture)

以真实实测商品 `marble toothbrush holder`（标杆 ASIN `B0BFGNSXYL`）固化回归基线：

- **固化快照文件**: `packages/domain/test/fixtures/real-marble-case.fixture.json`
- **回归测试套件**: `packages/domain/test/real-case-regression.spec.ts`
- **基线输入特征**:
  - 周搜索量: 1,432 (ABA: #133,475)
  - 竞品均评: 2,101 条 (CPC: $0.88)
  - 均价: $19.66
  - 标杆 BSR: `RANK_IMPROVED`
  - 评价星级: ⭐4.6 (5,147 条评价)
  - 外部 VOC: 25 条搜索摘要，核心痛点提及率 28%
- **基线输出确认**:
  - `overallScore`: **58 / 100**
  - `evidenceStatus`: **`SUFFICIENT`**
  - `confidence`: **`HIGH` (85%)**
  - `signals.demand.normalizedScore`: **39** (贡献 +9.75)
  - `signals.competition.normalizedScore`: **35** (贡献 +7.00)
  - `signals.commercial.normalizedScore`: **65** (贡献 +9.75)
  - `signals.trend.normalizedScore`: **75** (贡献 +11.25)
  - `signals.reviewHealth.normalizedScore`: **75** (贡献 +7.50)
  - `signals.voc.normalizedScore`: **87** (贡献 +13.05)
  - **总分验算**: $9.75 + 7.00 + 9.75 + 11.25 + 7.50 + 13.05 = 58.30 \implies 58$ 分。
