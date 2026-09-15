# Product Research Phase 2B — Candidate Enrichment Specification

> **版本**：V2.2.0-FROZEN  
> **阶段**：Phase 2B — Candidate Enrichment  
> **状态**：VERIFIED & FROZEN（Truthfulness Closure）  
> **前置基线**：Product Research V2.0.0-FROZEN + Auto Discovery V2.1.0-FROZEN  
> **实现 Commit**：`2853942`  
> **Truthfulness Closure**：本轮修复 Cross-Candidate KEYWORD/MARKET 过滤、VOC Scope 保真、手工成本来源选择器、realtime capturedAt、n=1 positioning=UNKNOWN

## 1. 核心目标

Phase 2A 已经解决：

```text
Seed Keyword / Category
→ Keyword / ASIN Expansion
→ Cluster
→ Candidate Draft
```

Phase 2B 要解决：

```text
Candidate Draft
→ Representative Competitors
→ Competitor Enrichment
→ VOC / Pain Points / Use Cases
→ Price Positioning
→ Product Concept
→ Differentiation Hypotheses
→ Enrichment Gate
→ Enriched Product Candidate
→ Existing V2 Frozen Pipeline
```

本阶段要回答：

> 这个 Candidate 到底是什么产品、用户为什么需要它、竞品有什么问题、我们可能如何差异化、应该处于什么价格带、哪些结论有证据、哪些仍是未知或假设？

## 2. 明确非目标

本阶段不做：

- 自动 1688 / Alibaba 供应商搜索
- 自动供应商询价 / MOQ / Lead Time
- 自动生成真实采购成本
- 自动完整 Patent / FTO 判断
- 自动法规最终判定
- Listing / PPC / Launch Plan
- 100 → 20 → 5 → 3 Scale Funnel
- 新 Opportunity Score / Success Probability
- 重写 V2 Economics / Risk / Comparison
- 修改 V2 Frozen Evidence 语义
- 把 External VOC 冒充 Amazon Review

## 3. 冻结边界

原则上不得修改：

```text
CandidateEvidenceValidator
CandidateEconomicsService
CandidateRiskGate
CandidateDecisionEngine
CandidateComparisonEngine
V2 Missing Data Policy
V2 Why A > B
V2.1 Auto Discovery Cluster / Gate / Dedup 核心语义
```

如需兼容，优先新增 Enrichment Adapter / Mapper。

## 4. Phase 2B 只做五件事

```text
1. 竞品事实补全
2. VOC / 用户需求证据补全
3. 市场价格与定位分析
4. 产品概念与差异化假设生成
5. 判断 Candidate 是否研究充分、可安全交给 V2
```

最终决策仍由 V2 负责。

## 5. 总体 Pipeline

```text
CandidateDraft
        ↓
Draft Validation
        ↓
Representative Competitor Selection
        ↓
Competitor Detail Enrichment
        ↓
Review Health / Trend Enrichment
        ↓
Text VOC / External VOC
        ↓
VOC Normalization + Evidence Binding
        ↓
Pain Point / Use Case / Desired Feature Themes
        ↓
Price Positioning
        ↓
Product Concept Synthesis
        ↓
Differentiation Hypotheses
        ↓
Enrichment Gate
        ↓
EnrichedCandidate
        ↓
ProductCandidate Adapter
        ↓
Existing V2 Frozen Pipeline
```

## 6. 共享契约

建议新增：

```text
packages/shared/src/contracts/candidate-enrichment-contracts.ts
```

必须尽量复用：

```text
EvidenceItem
ResearchEvidence
ProvenanceValue
ValueSource
ProductCandidate
ProductCandidateConcept
VocProductAnalysisResult
CandidateRisk
CandidateEconomics
```

禁止新建第二套 Evidence 真理。

## 7. Enrichment Request

```ts
export interface CandidateEnrichmentRequest {
  draft: CandidateDraft;
  marketplace: string;

  options?: {
    maxCompetitors?: number;
    enableProductTrend?: boolean;
    enableReviewHealth?: boolean;
    enableTextVoc?: boolean;
  };

  budget?: {
    maxProviderCalls?: number;
    maxCredits?: number;
    maxExpensiveCalls?: number;
  };

  manualInputs?: {
    targetSellingPrice?: ProvenanceValue<number>;
    productCost?: ProvenanceValue<number>;
    referralFeeRate?: ProvenanceValue<number>;
    fbaFeePerUnit?: ProvenanceValue<number>;
    freightPerUnit?: ProvenanceValue<number>;
  };
}
```

`manualInputs` 只负责把用户已有数据传给 V2，Phase 2B 不自行发明这些值。

## 8. EnrichedCandidate

```ts
export interface EnrichedCandidate {
  id: string;
  draftId: string;
  marketplace: string;
  title: string;
  productType: string;

  competitors: CompetitorSnapshot[];
  voc: CandidateVocSummary;
  pricePositioning: PricePositioning;
  concept: EnrichedProductConcept;
  differentiationHypotheses: DifferentiationHypothesis[];

  evidenceIds: string[];
  missingRequirements: string[];
  gate: EnrichmentGateResult;
  budgetUsage: EnrichmentBudgetUsage;
}
```

## 9. CompetitorSnapshot

```ts
export interface CompetitorSnapshot {
  asin: string;

  title?: ProvenanceValue<string>;
  price?: ProvenanceValue<number>;
  rating?: ProvenanceValue<number>;
  reviewCount?: ProvenanceValue<number>;

  trend?: {
    direction?: 'UP' | 'DOWN' | 'FLAT' | 'UNKNOWN';
    evidenceIds: string[];
  };

  sourceKeywordIds: string[];
  evidenceIds: string[];
}
```

Provider 没返回就保持 UNKNOWN / undefined，不得补 0。

## 10. Representative Competitor 策略

优先使用：

```text
CandidateDraft.representativeAsins
```

MVP 默认 3 个、最大 5 个，只是成本 Guardrail。

必须输出：

```text
requestedSampleSize
actualSampleSize
```

实际成功 2 个就写 2，不得叫 Top 5 Analysis。

## 11. Provider 能力

优先复用当前 Provider Framework：

```text
market.product.detail
review.product.health
market.product.trend
market.asin.keywords
voc.product.analyze
```

必须根据当前 Registry 判断 AVAILABLE / UNAVAILABLE。

Domain 不得直接调用 MCP Remote Tool。

## 12. VOC 数据边界

必须严格区分：

```text
AMAZON_REVIEW_VOC
EXTERNAL_VOC
```

`review.product.health` 只表示 rating / reviewCount / trends，不代表已经分析 Review 文本。

`voc.product.analyze` 若底层是 Firecrawl 等站外公开文本，只能描述为 External VOC。

禁止：

```text
“Amazon 买家评论中 44% 抱怨……”
```

除非底层真的是 Amazon Review 文本。

## 13. Evidence Scope

继续沿用：

```text
PRODUCT
KEYWORD
CATEGORY
MARKET
```

CATEGORY Evidence 只能支持类目观察，不能冒充某 ASIN 的买家原声。

## 14. CandidateVocSummary

```ts
export interface CandidateVocSummary {
  sourceType:
    | 'AMAZON_REVIEW_VOC'
    | 'EXTERNAL_VOC'
    | 'MIXED'
    | 'UNAVAILABLE';

  analyzedItemCount: number | null;

  painPoints: VocTheme[];
  praisePoints: VocTheme[];
  useCases: VocTheme[];
  desiredFeatures: VocTheme[];
  questions: VocTheme[];

  evidenceIds: string[];
  missingDimensions: string[];
}
```

## 15. VocTheme

```ts
export interface VocTheme {
  id: string;
  label: string;

  observationCount?: number | null;
  denominator?: number | null;
  percentage?: number | null;

  scope: 'PRODUCT' | 'KEYWORD' | 'CATEGORY' | 'MARKET';
  subjectIds: string[];
  evidenceIds: string[];
  confidence?: number;
}
```

只有真实 denominator 存在时才允许 percentage。

正确：

```text
11 / 25 collected external discussions mention drainage
percentage = 44%
```

错误：

```text
44% Amazon buyers complain about drainage
```

除非底层确实是 Amazon Review。

## 16. Quote 真实性

Quote 必须能定位到原始文本 Evidence。

LLM 不允许润色 Quote 后冒充原文。

## 17. 无 VOC 时

如果 VOC Provider 不可用或无文本：

```text
sourceType = UNAVAILABLE
painPoints = []
missingDimensions += textVoc
```

Candidate 可继续 Enrich，但 Gate 降级。

禁止让 LLM 自动补“用户常见痛点”。

## 18. Price Positioning

```ts
export interface PricePositioning {
  sampleSize: number;

  observedPrices: Array<{
    asin: string;
    price: number;
    evidenceId: string;
  }>;

  min?: number | null;
  median?: number | null;
  max?: number | null;

  suggestedTargetPrice?: ProvenanceValue<number>;

  positioning:
    | 'VALUE'
    | 'MAINSTREAM'
    | 'PREMIUM'
    | 'UNKNOWN';

  evidenceIds: string[];
}
```

MVP 小样本使用 min / median / max，不强行做复杂分位数。

竞品价格可以是 FACT；系统建议目标价只能是 ESTIMATE / ASSUMPTION，不能标 FACT。

## 19. Product Concept

```ts
export interface EnrichedProductConcept {
  productType: string;
  targetCustomer?: string;
  useCase?: string;
  targetPrice?: ProvenanceValue<number>;

  specifications?: Array<{
    name: string;
    proposedValue: unknown;
    status: 'FACT' | 'HYPOTHESIS' | 'USER_INPUT';
    evidenceIds: string[];
    rationale?: string;
  }>;

  evidenceIds: string[];
}
```

必须区分：

```text
Competitor Fact
vs
Our Candidate Hypothesis
```

竞品是 glass body 是竞品事实；“我们应该做 glass body”是 Hypothesis。

## 20. Differentiation Hypothesis

```ts
export interface DifferentiationHypothesis {
  id: string;
  title: string;
  description: string;

  basedOn:
    | 'PAIN_POINT'
    | 'USE_CASE'
    | 'PRICE_GAP'
    | 'COMPETITOR_GAP'
    | 'DESIRED_FEATURE';

  evidenceIds: string[];
  affectedCompetitorAsins: string[];

  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  validationRequired: boolean;
}
```

Phase 2B 只生成 Hypothesis，不自动做完整产品设计。

## 21. LLM 使用边界

允许：

```text
VOC Theme Label
Pain Point Summary
Use Case Summary
Product Concept 文案化
Differentiation Hypothesis
```

禁止 LLM 新增：

```text
ASIN
Search Volume
Price
Rating
Review Count
销量
材质事实
尺寸事实
认证事实
成本
Patent 状态
```

LLM 输出必须带 Evidence IDs。

没有 Evidence 的建议：

```text
confidence = LOW
validationRequired = true
```

且不得标 FACT。

## 22. Enrichment Gate

不要新增综合 Score。

```ts
export type EnrichmentGateStatus =
  | 'READY_FOR_HANDOFF'
  | 'DEGRADED_READY'
  | 'INSUFFICIENT_DATA';
```

### READY_FOR_HANDOFF

至少满足：

```text
1. Candidate Draft 合法
2. >=1 个有效 Representative Competitor
3. 至少一项真实 Market / Demand Evidence
4. 无 Cross-subject contamination
5. Product Concept 有明确 productType / useCase
6. Differentiation 全部可追溯或显式 validationRequired
7. Price Positioning 有真实样本，或明确 UNKNOWN
```

`READY_FOR_HANDOFF` 不等于 `SHORTLIST`。

### DEGRADED_READY

例如 Competitor / Demand / Concept 都有，但 Text VOC unavailable。

### INSUFFICIENT_DATA

例如无有效 competitor、无市场证据、Evidence 污染、Concept 纯靠 LLM 自由生成。

## 23. Economics 边界

Phase 2B 不创建新 Economics Engine。

已有 manual inputs：按原 Provenance 传给 V2。

没有：保持 UNKNOWN。

V2 返回 `NEEDS_VALIDATION` 是正确行为。

UI 可选增加轻量 Business Inputs：

```text
Target Selling Price
Product Cost
Referral Fee Rate
FBA Fee
Freight
```

每项必须标 FACT / ESTIMATE / ASSUMPTION，并允许 basis。

不自动做 Supplier Search。

## 24. Risk 边界

无真实 Patent / Compliance Evidence：

```text
PATENT = UNVERIFIED
COMPLIANCE = UNVERIFIED
```

不自动 PASS。

## 25. 成本策略

只对 Phase 2A 已筛出的少量 Candidate 做深研。

建议每个 Candidate 3～5 个代表竞品。

调用顺序：

```text
1. market.product.detail
2. review.product.health
3. market.product.trend（可选）
4. voc.product.analyze（finalists / budget allowed）
```

Text VOC 如果较贵，应放后面。

## 26. Budget

```ts
export interface EnrichmentBudgetUsage {
  providerCalls: number;
  credits?: number | null;
  expensiveCalls: number;
  stoppedByBudget: boolean;
}
```

预算耗尽时返回已有结果，不得整次丢弃。

## 27. API

最小新增：

```http
POST /api/v1/market-research/enrichment/run
```

Input：`CandidateEnrichmentRequest`  
Output：`CandidateEnrichmentRun`

可选：

```http
POST /api/v1/market-research/enrichment/handoff
```

用于 EnrichedCandidate → ProductCandidate → Existing V2。

## 28. UI MVP

Auto Discovery Candidate Draft 卡片新增：

```text
Deep Research / Enrich
```

Enrichment Panel 建议：

```text
Overview
Competitors
VOC
Price Positioning
Product Concept
Differentiation
Economics Readiness
Evidence
```

Competitor UI 必须显示 Sample n。

VOC UI 必须显示：Source Type / Sample / Denominator / Scope / Evidence。

External VOC 必须标：`External Public Discussions`。

## 29. Handoff to V2

转换：

```text
EnrichedCandidate
→ ProductCandidate
```

填充：

```text
concept.productType
concept.targetCustomer
concept.useCase
concept.targetPrice
concept.specifications
concept.differentiationHypotheses
marketResearch
evidence
manual economics inputs（若存在）
```

不得自动填未知 Economics，也不得把 Risk 设 PASS。

## 30. Evidence Immutable

继续保持 Phase 2A P0 红线：

```text
Evidence subjectId 不可改写
Evidence scope 不可改写
找不到 Evidence 不造 Stub
Cross Candidate Evidence 不挂载
```

## 31. Acceptance Cases

至少覆盖以下 18 个用例。

### Case 1 — Draft → EnrichedCandidate
合法 Draft 可生成 EnrichedCandidate，含 competitors / pricePositioning / concept / gate / evidenceIds。

### Case 2 — Competitor Sample Truthfulness
请求 5 个、实际成功 2 个，则 actualSampleSize=2。

### Case 3 — Missing Competitor Field
Provider 无 price，保持 UNKNOWN / undefined，不得 0。

### Case 4 — External VOC Scope
External VOC 必须 sourceType=EXTERNAL_VOC，Summary/UI 不得写 Amazon buyer review。

### Case 5 — VOC Denominator Integrity
11/25 → 44%；没有 denominator → percentage=null。

### Case 6 — No VOC Fabrication
VOC 无数据 → painPoints=[]，missingDimensions 包含 textVoc，LLM 不补。

### Case 7 — Evidence Scope Protection
CATEGORY Evidence 不得成为 Candidate ASIN buyer pain point FACT。

### Case 8 — Price Positioning Determinism
固定价格 Fixture → 相同 min/median/max/positioning。

### Case 9 — Target Price Provenance
系统建议目标价只能 ESTIMATE / ASSUMPTION。

### Case 10 — Differentiation Provenance
每个 DifferentiationHypothesis 必须有 evidenceIds；否则 LOW + validationRequired。

### Case 11 — Unsupported Feature Protection
LLM 生成无 Evidence 的客观规格时只能标 HYPOTHESIS，不能 FACT。

### Case 12 — Cross Candidate Evidence
Candidate A Evidence 注入 B → reject/exclude。

### Case 13 — Evidence Immutability
Handoff 前后 evidence.id / subjectId / scope 完全一致。

### Case 14 — Manual Economics Provenance
用户输入 productCost=8, FACT，Handoff 后仍为 FACT。

### Case 15 — Missing Economics
Critical Economics 缺失 → V2 NEEDS_VALIDATION。

### Case 16 — Risk Integrity
无 Patent/Compliance Evidence → UNVERIFIED。

### Case 17 — Budget Degradation
Text VOC 前预算耗尽 → 已有 competitor data 保留，run DEGRADED。

### Case 18 — Determinism
相同 Frozen Fixture → competitor selection / price positioning / gate / evidence mapping 一致。

## 32. Live Verification

至少选择一个 Phase 2A 真实 Candidate Draft 做 Live Enrichment。

推荐使用真实 seed `toothbrush holder` 产生的 Draft，但不得写死业务逻辑。

必须记录：

```text
Candidate Draft
Representative ASINs
Competitor Details Retrieved
Review Health
VOC Provider
VOC Source Type
VOC Sample Count
Price Sample
Differentiation Hypotheses
Provider Calls
Credits
Missing Dimensions
Gate Status
```

## 33. 不要求必须 SHORTLIST

如果 Economics Critical Inputs 仍 UNKNOWN，进入 V2 得到 NEEDS_VALIDATION 完全正确。

Phase 2B 成功标准是：

> Candidate 研究完整、Evidence 透明、Hypothesis 明确、可安全进入 V2。

不是强行产生 SHORTLIST。

## 34. 推荐代码组织

```text
packages/domain/src/research/enrichment/

candidate-enrichment.service.ts
competitor-enrichment.service.ts
candidate-voc.service.ts
price-positioning.service.ts
product-concept.builder.ts
differentiation-hypothesis.builder.ts
enrichment-gate.ts
enriched-candidate-handoff.service.ts
```

文件名可以按现有 Convention 调整，不要为了形式过度拆分。

## 35. 质量门禁

至少执行：

```text
pnpm --filter @crosspilot/domain test
pnpm --filter @crosspilot/integrations test
pnpm --filter @crosspilot/api test
pnpm --filter @crosspilot/web test
pnpm -r typecheck
pnpm --filter @crosspilot/web build
```

API 全量测试若因本地 DB 不可达失败，必须区分环境失败与本轮代码失败，不得宣称全量 PASS。

## 36. Freeze 条件

全部满足才允许标 `V2.2.0-FROZEN`：

```text
1. CandidateDraft 可真实 Enrich
2. Competitor Sample 如实
3. VOC Source 不冒充
4. VOC Count / Denominator 可追溯
5. 无 VOC 时不造内容
6. Product Fact / Hypothesis 明确分离
7. Differentiation 有 Evidence
8. Price Positioning 可复现
9. Suggested Target Price 非 FACT
10. Evidence Immutable
11. Cross Candidate Evidence 被阻断
12. Manual Economics Provenance 不丢失
13. Missing Economics 仍诚实 NEEDS_VALIDATION
14. Risk 未验证保持 UNVERIFIED
15. Budget 可降级
16. V2.0 / V2.1 Frozen Regression 全绿
17. 至少一次真实 Enrichment Live Verification
```

## 37. Definition of Done

最终交付报告必须回答：

```text
1. 输入哪个 Candidate Draft？
2. 选了几个 Representative Competitors？
3. 实际成功获取几个？
4. 每个 Competitor 有哪些真实字段？
5. VOC 来源是什么？
6. VOC Sample / Denominator 是多少？
7. 哪些 Pain Points / Use Cases / Desired Features 有 Evidence？
8. 价格样本与 Positioning 是什么？
9. Product Concept 是什么？
10. 哪些是 FACT，哪些是 HYPOTHESIS？
11. Differentiation 为什么成立？
12. 哪些仍 UNKNOWN？
13. Enrichment Gate 是什么？
14. Handoff 到 V2 后 Decision 是什么？
15. 如果仍 NEEDS_VALIDATION，缺什么？
16. Provider Calls / Credits？
17. Acceptance Cases 是否全部 PASS？
18. 是否修改 V2.0/V2.1 Frozen 核心代码？
19. Commit SHA？
```

## 38. 完成后的系统定位

```text
Phase 2A
Seed → Candidate Draft

Phase 2B
Candidate Draft
→ Competitor / VOC / Price / Concept / Differentiation
→ Enriched Product Candidate

V2 Frozen
Enriched Product Candidate
→ Economics / Risk / Comparison
→ Why A > B
```

Phase 2B 冻结后，下一阶段才进入：

```text
Phase 2C — Scale Funnel
100 → 20 → 5 → 3
```

不要继续无限扩 Phase 2B。
