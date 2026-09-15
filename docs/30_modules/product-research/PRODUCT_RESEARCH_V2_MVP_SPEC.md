# Product Research V2 MVP 选品与候选比较规范说明书 (Specification)

> **版本**: V2.0.0-MVP (Hardened Pre-Freeze)  
> **状态**: FROZEN (冻结状态)  
> **所属模块**: `packages/domain/src/research/` & `packages/shared/src/contracts/research-contracts.ts`  
> **前序版本**: V1.0.0 (`docs/30_modules/product-research/PRODUCT_RESEARCH_V1_BASELINE.md`)

---

## 1. 范围与非目标 (Scope & Non-Goals)

### 1.1 核心目标 (Scope)
- **解决核心问题**：给系统 3～5 个具体产品候选方案 (Product Candidate)，系统能够进行同口径、可追溯、确定性的横向比较，回答“为什么当前更倾向 Candidate A”、“Candidate B 为什么暂缓”、“Candidate C 为什么被阻断”。
- **修复 V1 真实性问题**：彻底消除固定 ASIN 回退兜底、剔除写死的牙刷架特定设计建议、补强证据主体范围 (Evidence Scope) 一致性校验、严谨量化 VOC 分母语义、收紧启发式决策。
- **构建 V2 核心机制**：
  1. 结构化 ProductCandidate 契约与 Provenance 数据源分级 (`FACT`, `ESTIMATE`, `ASSUMPTION`, `UNKNOWN`, `DEMO`)。
  2. 显式财务利润测算模型（复用 `ProfitCalculationService` 数学核心，区分 Contribution Profit / Margin 与 Conservative / Base / Optimistic 三重情景，彻底杜绝隐式默认值常量）。
  3. 严谨的缺失数据策略 (Missing Data Policy)：数据缺失直接触发 `NEEDS_VALIDATION` 或 `INSUFFICIENT_DATA`，严禁通过重新归一化获得排名优势；UNKNOWN 绝不等于 0。
  4. 严格证据门禁 (Evidence Gate) 与冒充防范：类目级证据严禁冒充单品买家原声，跨候选人证据污染直接拦截 `SHORTLIST`。
  5. 风险硬门禁 (Risk Gate) 真实性核验：合规与专利风险标 `PASS` 必须提供对应有效证据，否则自动降级为 `UNVERIFIED`。
  6. 结构化可追溯的双向横向比较引擎与 "Why A > B" 因果链条 (结论 ➔ Metric ➔ 原始值 ➔ 双边 Evidence / Assumption)。

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
  title: string;
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
    evidenceIds?: string[];
    assumptionIds?: string[];
  };

  economics: CandidateEconomics;

  risks: CandidateRisk[];

  evidence: EvidenceItem[];

  assumptions: Assumption[];

  missingRequirements: MissingRequirement[];

  decision: CandidateDecision;

  decisionDetail?: CandidateDecisionDetail;
}
```

---

## 3. 证据主体一致性契约与防冒充门禁 (Evidence Scope & Impersonation Gate)

证据必须显式划分作用域与绑定主体，杜绝张冠李戴：

```ts
export type EvidenceScope = 'PRODUCT' | 'KEYWORD' | 'CATEGORY' | 'MARKET';

export interface EvidenceItem {
  id: string;
  scope: EvidenceScope;
  subjectId: string; // 对应的 ASIN / CandidateID / 关键词 / 类目标识
  source: string; // 如 'XYDC', 'AMAZON_REVIEWS', 'FIRECRAWL', 'SUPPLIER_QUOTE', 'DEMO_FIXTURE'
  content: string;
  sourceUrl?: string;
  capturedAt?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}
```

### 校验规则
1. **PRODUCT 证据**：`subjectId` 必须严格等于当前 Candidate 的 ID 或关联 ASIN。Candidate B 的 PRODUCT 证据严禁挂载给 Candidate A。若发生交叉污染，证据校验置 `valid = false`。
2. **KEYWORD 证据**：只能直接支持目标搜索词市场层面的结论（如搜索量、CPC、ABA 排名）。
3. **CATEGORY 证据防冒充**：只能支持宏观类目级痛点与趋势，**严禁伪装为某特定 ASIN 单品的买家原声评价**（如包含“该商品买家”、“本产品评论”、“该asin用户”等措辞时，直接判定违规，置 `valid = false` 并阻断 `SHORTLIST`）。
4. **MARKET 证据**：只能支持大盘/站点级宏观事实。

---

## 4. 数值来源与证明分级契约 (Value Provenance Contract)

任何用于财务、运营和决策的关键数值必须标注明确来源：

```ts
export type ValueSource = 'FACT' | 'ESTIMATE' | 'ASSUMPTION' | 'UNKNOWN' | 'DEMO';

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
- **DEMO**：系统内置演示或测试演练数据，严禁标记为 FACT。

---

## 5. 缺失数据策略 (Missing Data Policy)

### 核心铁律
1. **禁止隐式归一化获益 (Anti-Gaming Invariant)**：
   若 Candidate A 缺失关键采购成本或运费，**绝对不允许**通过把缺失维度的权重重新分配给高分的 Market 维度使得 A 的综合推荐排名反超数据完整的 Candidate B。
2. **状态降级机制**：
   关键输入（售价、采购成本、佣金率、履约费、头程运费）任一为 `UNKNOWN` 或缺失时，`economics.status = 'INCOMPLETE'`，候选方案最终决策必须被硬性判定为 **`NEEDS_VALIDATION`** 或 **`INSUFFICIENT_DATA`**，绝不允许进入 `SHORTLIST`。
3. **UNKNOWN $\neq$ 0 准则**：
   财务计算中，UNKNOWN 的利润率必须严格与真实 0% 利润率区分（`UNKNOWN` 利润率劣后于正利润，且不得通过把未知当作 0 参与常规数值比较操纵排序）。
4. **概念解耦**：
   严格区分以下概念：
   - **Score (分值)**：相对吸引力计算指标。
   - **Confidence (置信度)**：数据证据的多样性与可靠性。
   - **Evidence Coverage Heuristic (维度覆盖率)**：概念、市场、财务、风险四维度的覆盖广度。
   - **Decision (最终决策)**：综合门禁、风控与财务测算后的行动建议。

---

## 6. 经济学与财务测算契约 (Economics Contract)

利润口径统一规范为 **边际贡献 (Contribution Profit)** 与 **贡献利润率 (Contribution Margin)**：

```text
Unit Selling Price
- Product Cost (采购成本)
- Amazon Referral Fee (平台佣金 = Selling Price × ReferralFeeRate)
- FBA / Fulfillment Fee (履约配送费)
- Freight (头程运费)
- Duty (关税)
- Advertising Cost (获客广告摊销)
- Expected Return Loss (预估退货损失)
- Storage (仓储分摊)
- Other Costs (包装、质检等)
= Contribution Profit (边际贡献)
```

### 关键输入与非关键输入分类
- **Critical Inputs (缺失即阻断)**：
  - `sellingPrice`
  - `productCost`
  - `referralFeeRate`
  - `fbaFeePerUnit`
  - `freightPerUnit`
- **Non-Critical Inputs (缺失记入 `excludedInputs`)**：
  - `dutyPerUnit`, `adsCostPerUnit`, `returnRate`, `returnLossPerUnit`, `storageFeePerUnit`, `otherCostsPerUnit`
  - 缺失时记入 `excludedInputs: string[]`（标记为 `EXCLUDED_FROM_CALCULATION`），不伪充为客观真实 0 成本。

### 显式三情景乘数定义 (`DEFAULT_SCENARIO_CONFIG`)
系统杜绝任何隐式浮动魔法常量，严格使用下列经审定乘数：
- **Conservative (悲观/保守)**：
  - 售价乘数: `0.95` (降价 5% 促销)
  - 采购成本乘数: `1.05` (原材料上浮 5%)
  - 运费乘数: `1.10` (头程上涨 10%)
  - 广告费用乘数: `1.25` (获客成本增加 25%)
  - 退货率乘数: `1.30` (退货率上升 30%)
  - 仓储费乘数: `1.20` (动销变慢仓储费用增加 20%)
- **Base (基准)**：各项乘数均为 `1.00`
- **Optimistic (乐观)**：
  - 售价乘数: `1.00` (维持原价)
  - 采购成本乘数: `0.92` (规模采购降本 8%)
  - 运费乘数: `0.95` (整柜拼箱节约 5%)
  - 广告费用乘数: `0.85` (自然流提升广告节约 15%)
  - 退货率乘数: `0.80` (做工提升退货减少 20%)
  - 仓储费乘数: `1.00` (正常流转)

---

## 7. 风险硬门禁契约与凭证检验 (Risk Gate Contract)

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

### 凭证校验与门禁逻辑
1. **PASS 必须有据**：`PATENT` 与 `COMPLIANCE` 类风险若标记为 `PASS`，必须在 `evidenceIds` 中提供至少 1 项已核实的有效证据 ID。若证据缺失或不在有效证据列表中，系统**自动降级为 `UNVERIFIED`**，并将其记入 `downgradedRisks`。
2. **任何 HIGH 风险 `FAIL`** ➔ 直接触发 **`BLOCKED`**，硬性阻断推进。
3. **关键风险项为 `UNVERIFIED`** ➔ 决策上限为 **`NEEDS_VALIDATION`**，绝对不得直接入围 `SHORTLIST`。

---

## 8. 候选横向比较契约与全双向因果链 (Candidate Comparison Contract)

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
  candidateAEvidenceIds?: string[];
  candidateBEvidenceIds?: string[];
  candidateAAssumptionIds?: string[];
  candidateBAssumptionIds?: string[];
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

- 口径不同（如跨站点、跨币种）时输出 `NOT_COMPARABLE`，严禁强行排序。
- 每条比较结论必须携带完整的双边证据 ID (`candidateAEvidenceIds`, `candidateBEvidenceIds`)，杜绝空泛结论。

---

## 9. 最终候选决策 6 级门禁流水线 (6-Stage Decision Pipeline)

候选决策严格依序经过 6 级流水线：
1. **Stage 1: Evidence Validation Gate**
   - 校验主体一致性与类目冒充。若 `!evidenceValidation.valid`，直接阻断 `SHORTLIST`，降级为 `NEEDS_VALIDATION` 或 `INSUFFICIENT_DATA`。
2. **Stage 2: Critical Missing Data Gate**
   - 检查 5 项关键财务输入与核心规格。任一缺失 ➔ `NEEDS_VALIDATION` 或 `INSUFFICIENT_DATA`。
3. **Stage 3: Hard Risk Gate**
   - 任一 HIGH 风险 FAIL ➔ `BLOCKED`。
4. **Stage 4: Economics Gate**
   - 基准利润 $\le 0$ 或利润率 $< 5\%$ ➔ 降级为 `WATCH`。
5. **Stage 5: Assumption & Unverified Gate**
   - 存在未核验风险、关键假设或覆盖率不充分 ➔ 降级为 `NEEDS_VALIDATION` 或 `WATCH`。
6. **Stage 6: Shortlist Verdict**
   - 门禁全部通过且财务稳健 ➔ 准予 `SHORTLIST`。

---

## 10. 验收测试矩阵 (Acceptance Tests: Cases 1～14)

1. **Case 1 (Missing Economics Gate)**：A 缺采购成本，B 完整 ➔ A 必为 `NEEDS_VALIDATION`，不可通过重新归一化胜出。
2. **Case 2 (Determinism)**：相同输入连续运行两次 ➔ 指标、财务、门禁、决策 100% 确定性完全一致。
3. **Case 3 (Monotonicity & Gate Transition)**：仅提高 A 采购成本 ➔ 利润与利润率严格单调下降；跌破门禁后决策自动降级。
4. **Case 4 (Explainability Traceability)**：查询“Why A > B” ➔ 每条比较理由必带 Metric，并关联 Evidence 或 Assumption，无野结论。
5. **Case 5 (Subject Consistency Violation)**：向 A 注入 B 的 PRODUCT 证据 ➔ 触发验证失败，被剔除出 A 的产品事实。
6. **Case 6 (No-ASIN Category Fallback)**：无有效 ASIN 时 ➔ Product Trend = MISSING, Product Review = MISSING, Category VOC = AVAILABLE (scope=CATEGORY)，不伪充单品证据。
7. **Case 7 (Demo Provenance)**：默认内置夹具数据来源必须为 `DEMO`，严禁伪充 `FACT` 或虚构官方报价单。
8. **Case 8 (Economics Unknown Critical Inputs)**：当 `fbaFeePerUnit` 为 null/UNKNOWN 时，计入 `missingInputs`，严禁隐式回退到 4.5。
9. **Case 9 (Hidden Default Prohibition)**：验证 `referralFeeRate`, `fbaFeePerUnit`, `freightPerUnit`, `returnRate`, `storageFeePerUnit` 缺失时均无隐藏硬编码常量兜底。
10. **Case 10 (Cross-Candidate Evidence Blocks Shortlist)**：向 Candidate A 注入 Candidate B 的 PRODUCT 证据时，`validateCandidateEvidence` 返回 `valid: false`，且决策严禁输出 `SHORTLIST`。
11. **Case 11 (Category VOC Impersonation Blocks Shortlist)**：类目级证据包含“该商品买家普遍认为...”单品原声冒充措辞时，校验失败并阻断 `SHORTLIST`。
12. **Case 12 (Market Reason Dual Provenance)**：`MARKET_DEMAND` 比较理由必须同时包含 Candidate A 与 Candidate B 的支撑证据/假设 ID。
13. **Case 13 (Risk PASS Evidence Requirement)**：声明为 `PASS` 但缺少匹配证据 ID 的 `PATENT` 风险项自动降级为 `UNVERIFIED`。
14. **Case 14 (Unknown Margin Not Equals Zero)**：缺失财务数据的候选（UNKNOWN 边际贡献）被确切识别，与 0% 利润率区分开，且不得抢占完整候选排序。

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
