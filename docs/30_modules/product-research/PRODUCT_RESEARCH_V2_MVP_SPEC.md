# Product Research V2 MVP 选品与候选比较规范说明书 (Specification)

> **版本**: V2.0.0-MVP  
> **状态**: PROPOSED & IMPLEMENTED  
> **所属模块**: `packages/domain/src/research/` & `packages/shared/src/contracts/research-contracts.ts`  
> **前序版本**: V1.0.0 (`docs/30_modules/product-research/PRODUCT_RESEARCH_V1_BASELINE.md`)

---

## 1. 范围与非目标 (Scope & Non-Goals)

### 1.1 核心目标 (Scope)
- **解决核心问题**：给系统 3～5 个具体产品候选方案 (Product Candidate)，系统能够进行同口径、可追溯、确定性的横向比较，回答“为什么当前更倾向 Candidate A”、“Candidate B 为什么暂缓”、“Candidate C 为什么被阻断”。
- **修复 V1 真实性问题**：彻底消除固定 ASIN 回退兜底、剔除写死的牙刷架特定设计建议、补强证据主体范围 (Evidence Scope) 一致性校验、严谨量化 VOC 分母语义、收紧启发式决策。
- **构建 V2 核心机制**：
  1. 结构化 ProductCandidate 契约与 Provenance 数据源分级 (`FACT`, `ESTIMATE`, `ASSUMPTION`, `UNKNOWN`)。
  2. 显式财务利润测算模型（复用 `ProfitCalculationService` 数学核心，区分 Contribution Profit / Margin 与 Conservative / Base / Optimistic 三重情景，杜绝隐式默认值）。
  3. 严谨的缺失数据策略 (Missing Data Policy)：数据缺失直接触发 `NEEDS_VALIDATION`，严禁通过重新归一化获得排名优势。
  4. 风险硬门禁 (Risk Gate) 与多级候选决策 (`INSUFFICIENT_DATA`, `NEEDS_VALIDATION`, `BLOCKED`, `WATCH`, `SHORTLIST`)。
  5. 结构化可追溯的横向比较引擎与 "Why A > B" 因果链条 (结论 ➔ Metric ➔ 原始值 ➔ Evidence / Assumption)。

### 1.2 明确非目标 (Non-Goals)
- ❌ **不做 500 个关键词自动挖掘与聚类**（本阶段聚焦候选比较）。
- ❌ **不做全自动爬取亚马逊完整类目树**。
- ❌ **不拍脑门设计一套新的无依据综合加权评分公式**（保留 V1 机会评分作为市场参考，但不作为 V2 决策的唯一依据）。
- ❌ **不做大规模自主 Agent 重构**。
- ❌ **不重构 Provider Framework**，严格遵守真实数据通道边界。
- ❌ **不编造供应商自动实时比价与专利检索 API**。

---

## 2. ProductCandidate 数据契约 (ProductCandidate Contract)

每个候选方案代表一个具体、待验证的物理产品策划：

```ts
export interface ProductCandidate {
  id: string;
  marketplace: string;
  category?: string;

  concept: {
    productType: string;
    targetCustomer?: string;
    useCase?: string;
    targetPrice?: number;
    specifications?: Record<string, unknown>;
    differentiationHypotheses?: string[];
  };

  marketResearch?: {
    seedKeyword?: string;
    searchVolumeMonthly?: number | null;
    competitiveDifficulty?: number | null;
    opportunityScore?: number | null;
    competitorSampleSize?: number;
    representativeAsin?: string | null;
  };

  economics: CandidateEconomics;

  risks: CandidateRisk[];

  evidence: EvidenceItem[];

  assumptions: Assumption[];

  missingRequirements: MissingRequirement[];

  decision: CandidateDecision;
}
```

---

## 3. 证据主体一致性契约 (Evidence Scope Contract)

证据必须显式划分作用域与绑定主体，杜绝张冠李戴：

```ts
export type EvidenceScope = 'PRODUCT' | 'KEYWORD' | 'CATEGORY' | 'MARKET';

export interface EvidenceItem {
  id: string;
  scope: EvidenceScope;
  subjectId: string; // 对应的 ASIN / CandidateID / 关键词 / 类目标识
  source: string; // 如 'XYDC', 'AMAZON_REVIEWS', 'FIRECRAWL', 'SUPPLIER_QUOTE'
  content: string;
  sourceUrl?: string;
  capturedAt?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}
```

### 校验规则
1. **PRODUCT 证据**：`subjectId` 必须严格等于当前 Candidate 的 ID 或关联 ASIN。Candidate B 的 PRODUCT 证据严禁挂载给 Candidate A。
2. **KEYWORD 证据**：只能直接支持目标搜索词市场层面的结论（如搜索量、CPC、ABA 排名）。
3. **CATEGORY 证据**：只能支持宏观类目级痛点与趋势，**严禁伪装为某特定 ASIN 单品的买家原声评价**。
4. **MARKET 证据**：只能支持大盘/站点级宏观事实。

---

## 4. 数值来源与证明分级契约 (Value Provenance Contract)

任何用于财务、运营和决策的关键数值必须标注明确来源：

```ts
export type ValueSource = 'FACT' | 'ESTIMATE' | 'ASSUMPTION' | 'UNKNOWN';

export interface ProvenanceValue<T = number> {
  value: T | null;
  source: ValueSource;
  basis?: string;
  evidenceId?: string;
  assumptionId?: string;
}
```

- **FACT**：有确凿供应商报价单、官方报表、平台官方已出账单流水。
- **ESTIMATE**：基于平台官方计费规则（如 FBA 尺寸分段表）推算出的预估值。
- **ASSUMPTION**：业务人员设定的假设（如预期退货率 5%、预估转化率 12%）。
- **UNKNOWN**：尚未获取。若关键字段为 `UNKNOWN`，系统严禁隐式填入默认常量，必须降级触发验证门禁。

---

## 5. 缺失数据策略 (Missing Data Policy)

### 核心铁律
1. **禁止隐式归一化获益 (Anti-Gaming Invariant)**：
   若 Candidate A 缺失关键采购成本或运费，**绝对不允许**通过把缺失维度的权重重新分配给高分的 Market 维度使得 A 的综合推荐排名反超数据完整的 Candidate B。
2. **状态降级机制**：
   关键输入（售价、采购成本、履约费）任一为 `UNKNOWN` 时，`economics.status = 'INCOMPLETE'`，候选方案最终决策必须被硬性判定为 **`NEEDS_VALIDATION`**。
3. **概念解耦**：
   严格区分以下四个概念，严禁混同为一个分数：
   - **Score (分值)**：相对吸引力计算指标。
   - **Confidence (置信度)**：数据证据的多样性与可靠性。
   - **Evidence Completeness (完整度)**：必要数据项的覆盖率。
   - **Decision (最终决策)**：综合门禁、风控与财务测算后的行动建议。

---

## 6. 经济学与财务测算契约 (Economics Contract)

在选品初期，由于未包含企业分摊税费、总部行政开支等，利润口径统一规范为 **边际贡献 (Contribution Profit)** 与 **贡献利润率 (Contribution Margin)**：

```text
Unit Selling Price
- Product Cost (采购成本)
- Amazon Referral Fee (平台佣金)
- FBA / Fulfillment Fee (履约配送费)
- Freight (头程运费)
- Duty (关税)
- Advertising Cost (获客广告摊销)
- Expected Return Loss (预估退货损失 = 退货率 × (退换处理费 + 货损))
- Storage (仓储分摊)
- Other Costs (包装、质检等)
= Contribution Profit (边际贡献)
```

### 多情景支持
- **Conservative (悲观/保守)**：高广告费、高退货率、低售价。
- **Base (基准)**：当前测算基准值。
- **Optimistic (乐观)**：采购规模效应降本、转化提升降低广告费。

---

## 7. 风险硬门禁契约 (Risk Gate Contract)

```ts
export type RiskStatus = 'UNVERIFIED' | 'PASS' | 'FAIL';

export interface CandidateRisk {
  riskId: string;
  category: 'PATENT' | 'COMPLIANCE' | 'QUALITY' | 'SUPPLY_CHAIN' | 'COMPETITION' | 'OTHER';
  title: string;
  status: RiskStatus;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  evidenceIds: string[];
  notes?: string;
}
```

- `UNVERIFIED`：尚未核验（绝不等于“没有风险”）。
- `PASS`：已通过专利/合规等核验。
- `FAIL`：核验发现侵权或合规硬伤。

### 门禁逻辑
- **任何 HIGH 风险 `FAIL`** ➔ 直接触发 **`BLOCKED`**，阻断推进。
- **关键风险项为 `UNVERIFIED`** ➔ 决策上限为 **`NEEDS_VALIDATION`**，不得直接入围 `SHORTLIST`。

---

## 8. 候选横向比较契约 (Candidate Comparison Contract)

支持 3～5 个候选方案同口径对比：

```ts
export interface ComparisonReason {
  candidateA: string;
  candidateB: string;
  dimension: 'ECONOMICS' | 'MARKET_DEMAND' | 'COMPETITION_BARRIER' | 'RISK_PROFILE' | 'DIFFERENTIATION' | 'EVIDENCE_CONFIDENCE';
  conclusion: 'A_BETTER' | 'B_BETTER' | 'SIMILAR' | 'NOT_COMPARABLE';
  metricIds: string[];
  evidenceIds: string[];
  assumptionIds: string[];
  explanation: string;
}

export interface CandidateComparisonResult {
  candidateIds: string[];
  ranking: string[];
  pairwiseReasons: Record<string, ComparisonReason[]>;
  summary: string;
  comparable: boolean;
  nonComparableReason?: string;
}
```

- 口径不同（如站点、币种不同）时输出 `NOT_COMPARABLE`，严禁强行排序。
- 每条比较结论必须能够向上追溯：`结论 ➔ 指标 ➔ 原始值 ➔ 支撑证据 / 假设`。

---

## 9. 最终候选决策状态机 (Decision Contract)

```ts
export type CandidateDecision =
  | 'INSUFFICIENT_DATA'   // 数据严重缺乏
  | 'NEEDS_VALIDATION'    // 关键财务或风险项待核验
  | 'BLOCKED'             // 遭遇风险硬阻断或不可行
  | 'WATCH'               // 财务偏薄或市场壁垒较高，保持观察
  | 'SHORTLIST';          // 证据链完整、门禁通过、财务健康的精选候选
```

---

## 10. 验收测试矩阵 (Acceptance Tests)

1. **Case 1 (Missing Economics Gate)**：A 缺采购成本，B 完整 ➔ A 必为 `NEEDS_VALIDATION`，不可通过重新归一化胜出。
2. **Case 2 (Determinism)**：相同输入连续运行两次 ➔ 指标、财务、门禁、决策 100% 确定性完全一致。
3. **Case 3 (Monotonicity & Gate Transition)**：仅提高 A 采购成本 ➔ 利润与利润率严格单调下降；跌破门禁后决策自动降级。
4. **Case 4 (Explainability Traceability)**：查询“Why A > B” ➔ 每条比较理由必带 Metric，并关联 Evidence 或 Assumption，无野结论。
5. **Case 5 (Subject Consistency Violation)**：向 A 注入 B 的 PRODUCT 证据 ➔ 触发验证失败，被剔除出 A 的产品事实。
6. **Case 6 (No-ASIN Category Fallback)**：无有效 ASIN 时 ➔ Product Trend = MISSING, Product Review = MISSING, Category VOC = AVAILABLE (scope=CATEGORY)，不伪充单品证据。

---

## 11. V1 ➔ V1.1 兼容性与迁移说明 (V1 Compatibility)

- 保留 `OpportunityScoreEngine.evaluate()` 作为宏观类目市场参考指标。
- 修复 V1 的固定 ASIN 回退、特定牙刷架设计文案、VOC 百分比分母语义，收紧决策文案为 `SHORTLIST` / `WATCH` / `INSUFFICIENT_DATA`。
- V1 既有回归单测（包括 58 分基线用例）保持 100% PASS。

---

## 12. 当前 Provider 数据能力真实边界 (Data Boundaries)

- **XYDC MCP**：提供 ABA 关键词周搜索量、排名、建议 CPC；商品搜索基于 ABA Top ASIN，每次返回实际有效 ASIN 为 1～3 个。严禁假装 Top10/Top20 分析。
- **Firecrawl VOC**：基于真实外部网页抓取或搜索摘要。内容形态为 `SEARCH_SNIPPET` 时标注可信度折减。
- **计费接口**：XYDC / Firecrawl 无实时美元账单 API，美元估算保持 `null`，严禁伪造。
