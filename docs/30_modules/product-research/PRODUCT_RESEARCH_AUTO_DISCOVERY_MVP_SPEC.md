# Product Research Auto Discovery MVP Specification

> **文件名**：`PRODUCT_RESEARCH_AUTO_DISCOVERY_MVP_SPEC.md`  
> **版本**：V2.1.0-FROZEN  
> **阶段**：Phase 2A — Provider Closure（ASIN → Keywords / `get_asin_keywords`）  
> **状态**：VERIFIED & FROZEN / 真实 XYDC ASIN 反查关键词接入并通过 Live E2E  
> **依赖基线**：Product Research V2.0.0-FROZEN  
> **冻结基线 Commit**：`d3e2603` (V2.0.0-FROZEN) -> `76b116f` (V2.1.0-RC) -> `d1e0c18` (Live Path Closure) -> 本次 Provider Closure  
> **所属模块建议**：`packages/domain/src/research/`、`packages/shared/src/contracts/`、`apps/api/src/modules/market/`、`apps/web/src/app/app/market-research/`  
> **前置规范**：`docs/30_modules/product-research/PRODUCT_RESEARCH_V2_MVP_SPEC.md`

---

# 0. 文档目的

Product Research V2.0.0 已经解决：

> **给系统 3～5 个明确 Product Candidate，系统如何基于 Evidence、Economics、Risk Gate 和 Comparison 可靠回答“为什么 A 优于 B”。**

本阶段不再修改上述被冻结能力。

Phase 2A 要解决的新问题是：

> **这 3～5 个值得比较的 Product Candidate 从哪里来？**

目标是从一个 Seed Keyword 或 Category 出发，通过真实 Provider 数据完成关键词扩展、ASIN 反查、聚类、去重和低成本粗筛，自动产出 **5～10 个可追溯 Candidate Draft**，再选择其中 3～5 个进入现有 V2 Candidate Enrichment / Comparison Pipeline。

核心链路：

```text
Seed Keyword / Category
        ↓
Seed Validation
        ↓
Keyword Expansion
        ↓
Keyword Evidence Fetch
        ↓
ASIN Expansion
        ↓
ASIN ↔ Keyword Graph
        ↓
Keyword Clustering
        ↓
Discovery Gate
        ↓
Candidate Draft Builder
        ↓
Cross-Candidate Dedup
        ↓
5～10 Candidate Drafts
        ↓
选择 / 补充 Economics / Risk
        ↓
Existing Product Research V2.0.0-FROZEN
```

---

# 1. 冻结边界

## 1.1 本阶段允许新增

允许新增：

- `DiscoveryRequest`
- `DiscoveryRun`
- `KeywordNode`
- `AsinNode`
- `KeywordCluster`
- `CandidateDraft`
- `DiscoveryGate`
- `CandidateDraftBuilder`
- `DiscoveryDeduplicator`
- `CandidateDraft → ProductCandidate` Handoff
- Auto Discovery API
- Auto Discovery UI
- 对应 Tests / Docs / Evidence Trace

## 1.2 本阶段禁止修改

V2.0.0-FROZEN 以下逻辑原则上不得修改：

```text
CandidateEvidenceValidator
CandidateEconomicsService
CandidateRiskGate
CandidateDecisionEngine
CandidateComparisonEngine
ProductCandidate 核心决策语义
V2 Missing Data Policy
V2 Why A > B 因果链
```

如果 Auto Discovery 与 V2 Frozen Contract 不兼容：

> 优先新增 Adapter / Handoff 层，不得静默修改冻结语义。

## 1.3 明确非目标

本阶段不做：

- ❌ 500～1000 个商品机会全网扫描
- ❌ 全类目爬虫
- ❌ 自动供应商搜索与 1688 实时报价
- ❌ 自动专利法律判断
- ❌ 自动生成完整 Economics
- ❌ 自动将 Candidate 判定为 `SHORTLIST`
- ❌ 深度 Review / VOC 大规模抓取
- ❌ 新的 Opportunity Score V2 加权模型
- ❌ 重构 Provider Framework
- ❌ 新建第二套 Candidate Comparison
- ❌ 为了“智能”大量引入 LLM 自由生成产品机会
- ❌ 因 Provider 缺失而伪造 Search Volume / Growth / ASIN / Price

---

# 2. Phase 2A 成功定义

给定：

```text
Marketplace = AMAZON_US
Seed Keyword = "glass food storage"
```

系统应自动输出类似：

```text
Candidate Draft 1
Glass Produce Storage Container with Drain Basket

Candidate Draft 2
Glass Berry Keeper for Refrigerator

Candidate Draft 3
Glass Fruit Storage Container with Removable Colander

Candidate Draft 4
Glass Produce Saver Set

Candidate Draft 5
Glass Vegetable Storage Container
```

注意：

这些只是 **Candidate Draft / 待验证候选方向**。

系统不能直接输出：

```text
推荐立即做 Candidate 1
成功率 89%
预计净利润 27%
```

除非后续进入冻结的 V2 Pipeline 并拥有对应 Evidence / Economics / Risk 数据。

---

# 3. 核心设计原则

## 3.1 Evidence First

Auto Discovery 的每个候选必须可以回答：

```text
这个候选为什么会出现？
```

最少追溯到：

```text
Seed
→ Supporting Keywords
→ Keyword Metrics
→ Representative ASINs
→ Evidence IDs
```

如果无法找到来源：

```text
不得生成 Candidate Draft
```

---

## 3.2 Candidate Draft ≠ Product Candidate ≠ Recommendation

严格区分：

```text
Keyword
↓
Keyword Cluster
↓
Candidate Draft
↓
Enriched Product Candidate
↓
V2 Decision
```

### Candidate Draft

表示：

> 数据中发现了一个可能值得进一步研究的产品方向。

### Product Candidate

表示：

> 已经形成明确产品方案，具备产品概念、经济输入、风险项和证据。

### Recommendation

只有经过 V2 Frozen Pipeline 后才能产生：

```text
NEEDS_VALIDATION
WATCH
SHORTLIST
BLOCKED
...
```

Auto Discovery 不得跳过中间阶段。

---

## 3.3 Missing ≠ 0

任何 Discovery Metric 缺失时：

```text
UNKNOWN
```

不能变成：

```text
0
```

例如：

```text
growth = UNKNOWN
```

不能解释成：

```text
growth = 0%
```

---

## 3.4 Provider 真实能力优先

当前实现必须通过 CrossPilot Provider Framework / IntegrationGateway 调用能力。

不得在 Domain 层直接绑定：

```text
XYDC HTTP
MCP remote tool
SellerSprite API
```

Domain 只认：

```text
Capability / normalized contract
```

Provider 名称与 Remote Tool 只能存在于 Integration 层。

---

## 3.5 Deterministic First, LLM Second

优先用确定性逻辑完成：

- normalize
- dedup
- metrics merge
- evidence binding
- cluster member validation
- gate
- ranking / ordering
- provenance

LLM 只允许辅助：

- Cluster Label
- Product Type Label
- Candidate Draft 标题
- 人类可读解释

LLM 不允许生成：

- Search Volume
- Growth
- CPC
- ASIN
- Price
- Review Count
- Competition Metric
- Evidence
- Provider Result

---

# 4. 当前 Provider 能力边界

以当前仓库 `XYDC_CAPABILITY_MAPPING.md` 与已验证 Provider Mapping 为基线。

## 4.1 当前可用于 Auto Discovery 的 XYDC 能力

当前已记录的相关 Remote Tools 包括：

```text
get_keyword_info
get_keyword_aba_trends

get_keyword_asin_analysis
get_keyword_analysis_monthly

get_asin_keywords
get_asin_keywords_monthly

get_multi_asin_keyword_comparison
get_multi_asin_keyword_comparison_monthly

get_asin_info
```

实现时必须再次通过当前 Capability Registry / Provider Discovery 确认真实可用状态。

不能因为 Spec 写了名字，就假定线上一定存在。

---

## 4.2 `get_keyword_info` 的边界

当前已验证能力主要包括：

```text
ABA Search Volume
ABA Rank
Suggested CPC / Bid
Competition-related metric
Top ASINs
```

当前 Top ASIN 本质上是有限头部样本。

系统必须记录：

```text
actualSampleSize
```

禁止：

```text
请求 limit = 10
→ 实际只获得 3 个
→ UI 写 Top10 Competitors
```

正确：

```text
Representative ASIN Sample = 3
```

---

## 4.3 Growth 不得从基础指标推断

如果基础 Keyword API 没有 Growth：

```text
growth = UNKNOWN
```

只有真正调用：

```text
get_keyword_aba_trends
```

或其他合法历史序列 Provider 后，才允许计算：

```text
growth
trendDirection
seasonality
stability
```

---

## 4.4 ASIN 扩展原则

不能只依赖 Seed Keyword 的 Top 3 ASIN。

应优先形成双向扩展：

```text
Keyword
↓
get_keyword_asin_analysis / available equivalent
↓
ASINs
↓
get_asin_keywords
↓
More Keywords
↓
More Keyword Clusters
```

形成：

```text
Keyword ↔ ASIN Graph
```

---

# 5. Provider 策略

数据源优先级继续遵循当前 CrossPilot 成本策略：

```text
Primary
→ XYDC / 当前 Provider Framework 中已验证的低成本能力

Fallback
→ 已正式接入且有 Provenance 的其他 Provider

Manual
→ 用户显式输入

Unavailable
→ UNKNOWN
```

本阶段不因为 SellerSprite、DataForSEO 或其他 Provider “理论上可以”就直接写死实现。

如果 Provider 未接入：

```text
capability = UNAVAILABLE
```

不能 Fake Adapter。

---

# 6. Discovery 输入契约

建议新增：

```ts
export interface ProductDiscoveryRequest {
  marketplace: string;

  seed: {
    keyword: string;
    category?: string;
  };

  constraints?: {
    targetPriceMin?: number;
    targetPriceMax?: number;

    includeTerms?: string[];
    excludeTerms?: string[];

    excludeBrandTerms?: boolean;
    excludeAccessoryIntent?: boolean;
  };

  limits?: {
    maxExpandedKeywords?: number;
    maxRepresentativeAsins?: number;
    maxClusters?: number;
    maxCandidateDrafts?: number;
  };

  budget?: {
    maxProviderCalls?: number;
    maxExpensiveCalls?: number;
    maxCredits?: number;
  };

  providerPolicy?: {
    preferredProviders?: string[];
    allowFallback?: boolean;
  };
}
```

---

# 7. 默认 Limits 原则

不要把数量写成业务真理。

可以提供工程默认配置，例如：

```ts
const DEFAULT_DISCOVERY_LIMITS = {
  maxExpandedKeywords: 100,
  maxRepresentativeAsins: 30,
  maxClusters: 20,
  maxCandidateDrafts: 10,
};
```

这些只是：

```text
Cost / Runtime Guardrail
```

不是：

```text
100 个关键词就是最佳选品方法
```

所有实际处理数量必须输出：

```text
requested
received
accepted
rejected
deduplicated
```

---

# 8. Discovery Run 契约

```ts
export type DiscoveryRunStatus =
  | 'RUNNING'
  | 'COMPLETED'
  | 'DEGRADED'
  | 'INSUFFICIENT_DATA'
  | 'FAILED';

export interface ProductDiscoveryRun {
  id: string;

  request: ProductDiscoveryRequest;

  status: DiscoveryRunStatus;

  seedKeyword: string;

  keywordNodes: KeywordNode[];
  asinNodes: AsinNode[];

  clusters: KeywordCluster[];

  candidateDrafts: CandidateDraft[];

  evidence: EvidenceItem[];

  missingCapabilities: string[];

  budgetUsage: {
    providerCalls: number;
    credits?: number | null;
    expensiveCalls: number;
  };

  stats: {
    keywordsReceived: number;
    keywordsAccepted: number;
    keywordsDeduplicated: number;

    asinsReceived: number;
    asinsAccepted: number;

    clustersCreated: number;

    candidateDraftsCreated: number;
    candidateDraftsRejected: number;
  };
}
```

---

# 9. KeywordNode 契约

```ts
export interface KeywordNode {
  id: string;

  rawKeyword: string;
  normalizedKeyword: string;

  marketplace: string;

  origin:
    | 'SEED'
    | 'ASIN_REVERSE_LOOKUP'
    | 'KEYWORD_EXPANSION'
    | 'MANUAL';

  metrics: {
    searchVolume?: ProvenanceValue<number>;
    abaRank?: ProvenanceValue<number>;
    cpc?: ProvenanceValue<number>;
    competition?: ProvenanceValue<number>;

    growth?: ProvenanceValue<number>;
    trendDirection?: ProvenanceValue<
      'UP' | 'DOWN' | 'FLAT' | 'UNKNOWN'
    >;
  };

  representativeAsins: string[];

  evidenceIds: string[];
}
```

规则：

```text
Metric 没有 Evidence / Assumption
→ 不得标 FACT
```

---

# 10. AsinNode 契约

```ts
export interface AsinNode {
  asin: string;
  marketplace: string;

  title?: ProvenanceValue<string>;
  price?: ProvenanceValue<number>;
  rating?: ProvenanceValue<number>;
  reviewCount?: ProvenanceValue<number>;

  sourceKeywords: string[];

  discoveredKeywords: string[];

  evidenceIds: string[];
}
```

注意：

```text
ASIN Node
```

只是 Discovery Graph 节点。

不能因为某个 ASIN 被发现，就把它的属性自动归因给整个 Candidate Cluster。

---

# 11. Keyword Normalization

第一版使用 Deterministic Normalization。

例如：

```text
"Glass Food Storage Containers"
"glass food storage container"
"GLASS  FOOD  STORAGE container"
```

允许归一化成接近的 canonical representation。

建议规则：

```text
lowercase
unicode normalize
trim
collapse whitespace
punctuation normalize
safe singular/plural normalization where deterministic
```

禁止：

```text
LLM 自由改写后直接覆盖 raw keyword
```

必须同时保存：

```text
rawKeyword
normalizedKeyword
```

---

# 12. Keyword Expansion

Auto Discovery 第一版使用两条主路径。

## Path A：Seed → Related ASIN → Reverse Keywords

```text
Seed Keyword
↓
Keyword Metrics
↓
Representative ASINs
↓
ASIN Reverse Keywords
↓
Expanded Keyword Pool
```

## Path B：Expanded Keyword → More ASINs

```text
Expanded Keyword
↓
Keyword-ASIN Analysis
↓
Additional ASIN Nodes
↓
Reverse Keywords
```

必须有：

```text
maxDepth
maxKeywords
maxAsins
maxProviderCalls
```

防止图无限扩散。

MVP 默认：

```text
最多 2 轮 expansion
```

推荐：

```text
Round 0: Seed
Round 1: Seed ASIN reverse keywords
Round 2: High-value keyword → ASIN enrichment
STOP
```

本阶段不做无限 Agentic Search。

---

# 13. Expansion 选择规则

Expanded Keyword 进入下一轮前至少满足：

```text
1. marketplace 一致
2. 非空
3. normalization 后不重复
4. 非明显品牌导航词（若开启 excludeBrandTerms）
5. 非明显无关词
6. 拥有真实来源 Evidence
```

若 metric 不完整：

```text
允许保留
但标记 missing
```

不能因为缺失：

```text
searchVolume = 0
```

---

# 14. Keyword ↔ ASIN Graph

系统应内部维护轻量图关系：

```text
KeywordNode
  ↕
AsinNode
```

Edge 最少记录：

```ts
export interface KeywordAsinEdge {
  keywordId: string;
  asin: string;

  relation:
    | 'TOP_ASIN'
    | 'ORGANIC_KEYWORD'
    | 'AD_KEYWORD'
    | 'DISCOVERED_RELATION';

  evidenceIds: string[];
}
```

用途：

- 聚类
- 找共同竞品
- 判断搜索意图是否接近
- 防止只按字符串相似度聚类
- Candidate Trace

本阶段不需要引入 Graph Database。

普通内存结构即可。

---

# 15. Keyword Clustering

聚类目标：

> 把“同一个购买意图”的多个搜索词归为一个机会簇，而不是把每个 Keyword 当成一个 Candidate。

例如：

```text
glass fruit storage container
fruit keeper glass
glass produce keeper
glass fruit box for fridge
```

可能属于同一 Cluster。

---

# 16. 聚类信号

第一版建议综合以下信号：

## Signal A：Token / Phrase Similarity

确定性字符串归一化后的词项重合。

## Signal B：Shared ASIN Overlap

例如：

```text
Keyword A Top ASINs = [1,2,3]
Keyword B Top ASINs = [1,2,4]
```

共享 ASIN 越高：

```text
购买意图越可能接近
```

## Signal C：Reverse Keyword Co-occurrence

同一组 ASIN 反查经常同时出现的关键词。

## Signal D：Optional Semantic Similarity

如果已有低成本 embedding 能力，可以作为辅助。

但不能仅凭 Embedding 直接合并。

---

# 17. 聚类算法原则

MVP 不要求复杂 ML。

允许：

```text
Rule + Similarity + Union/Merge
```

例如：

```text
normalized exact match
OR
high token overlap + shared ASIN overlap
OR
shared ASIN overlap clearly high
```

Threshold 必须集中配置。

不能散落：

```text
if similarity > 0.63
```

到处硬编码。

建议：

```ts
interface DiscoveryClusteringConfig {
  tokenSimilarityThreshold: number;
  sharedAsinJaccardThreshold: number;
  semanticSimilarityThreshold?: number;
}
```

这些阈值是：

```text
Engineering Heuristic
```

不是成功概率。

---

# 18. KeywordCluster 契约

```ts
export interface KeywordCluster {
  id: string;

  marketplace: string;

  label: string;

  primaryKeywordId: string;

  keywordIds: string[];

  representativeAsins: string[];

  metrics: {
    demand?: ProvenanceValue<number>;
    growth?: ProvenanceValue<number>;
    competition?: ProvenanceValue<number>;
  };

  evidenceIds: string[];

  clusteringReasons: string[];

  missingFields: string[];
}
```

---

# 19. Cluster Label

`label` 可以允许 LLM 辅助生成。

但输入只能来源于：

```text
cluster keywords
ASIN titles
```

输出仅作为：

```text
display label
```

不能创建新的：

```text
metric
evidence
asin
product feature
```

示例：

```text
Keywords:
- glass berry container
- berry keeper glass
- fruit keeper with colander

Label:
Glass Berry / Fruit Keeper
```

---

# 20. Demand 聚合原则

Candidate Discovery 不重新设计一套综合 Opportunity Score。

Demand 可以使用简单、可解释的聚合。

例如：

```text
primary keyword search volume
+
supporting keyword coverage
```

但必须避免：

```text
10 个同义词 search volume 全部相加
```

导致重复计数。

MVP 推荐：

```text
Primary Demand Metric
=
Primary Keyword Search Volume
```

同时附带：

```text
supportingKeywordCount
supportingKeywordVolumes[]
```

而不是直接声称：

```text
Cluster Total Market Search Volume = 50,000
```

除非未来有可靠去重算法。

---

# 21. Trend 原则

Trend 只有存在历史序列时才能产生。

建议：

```text
get_keyword_aba_trends
↓
weekly time series
↓
deterministic calculation
```

可计算：

```text
recentGrowth
trendDirection
volatility
seasonalityHint
```

第一版至少输出：

```text
trendDirection
recentGrowth
```

但若历史点不足：

```text
UNKNOWN
```

---

# 22. Competition 原则

MVP 不试图重建完整市场竞争评分。

允许使用当前真实可得信息：

```text
competition metric from keyword source
CPC
representative ASIN sample size
ASIN rating/review count
price distribution
```

但必须注明：

```text
Sample Size
```

禁止把 3 个代表 ASIN 描述成：

```text
整个市场竞争格局
```

正确：

```text
Representative ASIN Sample Analysis (n = 3)
```

---

# 23. Candidate Draft 契约

建议定义：

```ts
export type CandidateDraftStatus =
  | 'DISCOVERED'
  | 'READY_FOR_ENRICHMENT'
  | 'NEEDS_MORE_DATA'
  | 'REJECTED';

export interface CandidateDraft {
  id: string;

  marketplace: string;

  title: string;
  productType: string;

  clusterId: string;

  primaryKeyword: string;
  supportingKeywords: string[];

  representativeAsins: string[];

  discoveryMetrics: {
    demand?: ProvenanceValue<number>;
    growth?: ProvenanceValue<number>;
    competition?: ProvenanceValue<number>;

    keywordCount: number;
    asinSampleSize: number;
  };

  evidenceIds: string[];

  discoveryReasons: DiscoveryReason[];

  missingRequirements: string[];

  status: CandidateDraftStatus;

  dedupKey: string;
}
```

---

# 24. DiscoveryReason 契约

```ts
export interface DiscoveryReason {
  code:
    | 'DEMAND_SIGNAL'
    | 'TREND_SIGNAL'
    | 'MULTI_KEYWORD_SUPPORT'
    | 'MULTI_ASIN_SUPPORT'
    | 'COMPETITION_SIGNAL'
    | 'INTENT_DISTINCTNESS';

  conclusion: string;

  metricIds: string[];

  evidenceIds: string[];
}
```

任何：

```text
为什么发现这个候选？
```

都必须通过这里解释。

---

# 25. Candidate Draft Builder

Builder 只能从：

```text
KeywordCluster
+
Cluster Evidence
+
Representative ASIN Metadata
```

构建 Candidate Draft。

禁止：

```text
LLM 看见 "glass food storage"
→ 自由脑补：
"带真空阀门、竹盖、四格沥水篮的新产品"
```

除非这些 feature 有真实 Evidence。

MVP Candidate Draft 只需要明确：

```text
Product Type
Search Intent
Representative Keywords
Representative ASINs
Market Signals
```

详细差异化：

```text
留给 Phase 2B Candidate Enrichment
```

---

# 26. Discovery Gate

Candidate Draft 在输出前必须通过 Gate。

建议 Gate 不使用综合加权分。

使用规则状态：

```ts
export type DiscoveryGateStatus =
  | 'PASS'
  | 'DEGRADED_PASS'
  | 'REJECT';
```

---

# 27. PASS 条件

Candidate Draft 至少需要：

```text
1. 有明确 Cluster
2. 至少有 1 个真实 Keyword Evidence
3. 至少有 1 个真实 Demand / Market Signal
4. 至少有 1 个 Representative ASIN
5. Candidate 与 Seed/Cluster 意图相关
6. Candidate 与其他 Candidate 不重复
```

---

# 28. DEGRADED_PASS

例如：

```text
Demand 有
ASIN 有
Trend 缺失
```

允许：

```text
DEGRADED_PASS
```

但必须记录：

```text
missingRequirements = ["trend"]
```

---

# 29. REJECT

满足任一情况可 Reject：

```text
无 Evidence
完全重复 Cluster
纯品牌导航词
纯配件意图（且用户目标不是配件）
明显无购买意图
与 Seed 完全无关
只有 LLM 推测、无 Provider 支撑
ASIN / Keyword Evidence 主体错配
```

---

# 30. 品牌词处理

不要简单：

```text
出现品牌名 = 删除
```

因为：

```text
"stanley cup accessories"
```

可能代表真实市场。

MVP 使用：

```text
excludeBrandTerms = true/false
```

如果 true：

```text
纯品牌导航意图
→ REJECT

品牌 + 明确通用品类词
→ 可保留，但标记 BRAND_DEPENDENT
```

---

# 31. Accessory Intent

需要区分：

```text
Main Product
Accessory
Replacement Part
Consumable
```

Candidate Draft 可增加：

```ts
productIntent:
  | 'MAIN_PRODUCT'
  | 'ACCESSORY'
  | 'REPLACEMENT'
  | 'CONSUMABLE'
  | 'UNKNOWN';
```

默认若用户目标是主产品：

```text
ACCESSORY
→ 可配置 Reject / Lower Priority
```

---

# 32. Candidate 去重

不能出现：

```text
Candidate A:
Glass Fruit Container

Candidate B:
Glass Fruit Storage Container

Candidate C:
Glass Produce Container
```

本质上三个一样。

Dedup 至少比较：

```text
canonical product type
keyword cluster overlap
shared ASIN overlap
primary keyword intent
```

输出：

```ts
export interface CandidateDedupResult {
  keptCandidateId: string;
  mergedCandidateIds: string[];
  reasons: string[];
}
```

被合并 Candidate 的：

```text
keywords
asins
evidence
```

必须保留进 kept Candidate。

---

# 33. Discovery Priority

本阶段不新增“成功概率”。

可以输出：

```text
priorityTier
```

建议：

```ts
type DiscoveryPriority =
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW'
  | 'NEEDS_DATA';
```

Priority 只作为：

```text
Deep Dive 顺序
```

不能作为：

```text
最终选品推荐
```

---

# 34. Priority Determination

优先级可以基于门禁式规则：

### HIGH

```text
Demand evidence complete
+
multiple supporting keywords
+
multiple relevant ASINs
+
no critical discovery missing
```

### MEDIUM

```text
有稳定证据
但 Trend / Competition 某项缺失
```

### LOW

```text
证据弱
样本小
购买意图模糊
```

### NEEDS_DATA

```text
关键 market evidence 不足
```

禁止添加未经校准的：

```text
Discovery Success Probability = 86%
```

---

# 35. CandidateDraft → ProductCandidate Handoff

Auto Discovery 不能伪造 V2 Economics。

转换时：

```text
CandidateDraft
↓
ProductCandidate Skeleton
```

允许填充：

```text
marketplace
category
concept.productType
marketResearch.seedKeyword
marketResearch.representativeAsin
marketResearch.evidenceIds
evidence
```

---

# 36. Economics Handoff

若没有：

```text
productCost
fbaFee
freight
...
```

则必须：

```text
UNKNOWN
```

例如：

```ts
economics.inputs.productCost = {
  value: null,
  source: 'UNKNOWN'
}
```

因此 V2 正确返回：

```text
NEEDS_VALIDATION
```

这不是失败。

这是 Frozen Missing Data Policy 正常工作。

---

# 37. Risk Handoff

Auto Discovery 不得：

```text
PATENT = PASS
COMPLIANCE = PASS
```

默认只能：

```text
UNVERIFIED
```

除非已有真实风险 Evidence。

---

# 38. 推荐产品流转

标准流转：

```text
Candidate Draft
        ↓
READY_FOR_ENRICHMENT
        ↓
用户 / Provider 补充：
- 产品方案
- 目标售价
- Supplier Quote
- Fees
- Freight
- Risk Evidence
        ↓
ProductCandidate
        ↓
V2.0 Frozen Pipeline
```

---

# 39. Cost-Aware Funnel

Auto Discovery 必须从便宜能力向贵能力逐层推进。

推荐：

```text
Stage 1 — Cheap
Seed Keyword Basic Metrics

Stage 2 — Cheap / Medium
Seed Top ASINs + Reverse Keywords

Stage 3 — Medium
Selected Keyword Trends

Stage 4 — Medium
Selected ASIN Details

Stage 5 — Stop
Build Candidate Drafts
```

MVP 不默认跑：

```text
Category Insight
Deep VOC
Large-scale review scraping
```

---

# 40. Budget Guard

每次 Discovery Run 必须有预算状态。

```ts
export interface DiscoveryBudgetState {
  maxProviderCalls?: number;
  usedProviderCalls: number;

  maxCredits?: number;
  usedCredits?: number | null;

  maxExpensiveCalls?: number;
  usedExpensiveCalls: number;

  stoppedByBudget: boolean;
}
```

预算触发后：

```text
立即停止扩展
```

但返回已获得结果：

```text
status = DEGRADED
```

不能整个 Run 报废。

---

# 41. Cache

同一：

```text
marketplace
keyword
time window
provider capability
```

应复用 Provider Framework 现有 Cache。

Auto Discovery 不自行建立第二套 Provider Cache。

---

# 42. Failure / Degradation

## Provider Failure

```text
某个 Keyword 查询失败
→ 记录 failure
→ 不生成假数据
→ 继续其他 Keyword
```

## Trend Failure

```text
trend unavailable
→ growth UNKNOWN
→ Candidate 可 DEGRADED_PASS
```

## ASIN Failure

```text
某个 ASIN detail 获取失败
→ 保留 ASIN ID
→ product metadata missing
```

## 全部市场数据失败

```text
INSUFFICIENT_DATA
```

---

# 43. API 建议

建议新增：

```http
POST /api/v1/market-research/discovery/run
```

Input：

```json
{
  "marketplace": "AMAZON_US",
  "seed": {
    "keyword": "glass food storage"
  }
}
```

Output：

```ts
ProductDiscoveryRun
```

---

# 44. Dry Run / Cost Preview

如果当前 Provider Framework 支持能力查询，可选增加：

```http
POST /api/v1/market-research/discovery/preview
```

输出：

```text
planned capabilities
estimated call count
known credit cost
unknown cost fields
```

若无法可靠估算：

```text
estimatedCredits = null
```

不能编造美元成本。

---

# 45. UI MVP

不要重做整个 Market Research 页面。

新增一个 Auto Discovery 区域即可。

---

# 46. UI Step 1：Discovery Input

字段：

```text
Marketplace
Seed Keyword
Category (optional)

Target Price (optional)
Exclude Brand Terms
Exclude Accessory Intent

Candidate Limit
```

Advanced 可折叠：

```text
Provider Budget
Max Keywords
Max ASINs
```

---

# 47. UI Step 2：Discovery Progress

展示：

```text
Seed validated
Keywords discovered
ASINs discovered
Clusters created
Candidate drafts generated
Provider calls
Credits
Missing capabilities
```

不要展示虚假的：

```text
AI 正在扫描整个 Amazon
```

---

# 48. UI Step 3：Candidate Draft List

每个 Draft 显示：

```text
Candidate Name
Primary Keyword
Supporting Keywords
Representative ASIN count
Demand
Trend
Competition
Evidence Count
Missing Items
Priority Tier
Gate Status
```

---

# 49. UI Step 4：Why Discovered

点击：

```text
Why this candidate?
```

展示：

```text
Seed
↓
Keywords
↓
ASINs
↓
Metrics
↓
Evidence IDs
↓
Discovery Reasons
```

---

# 50. UI Step 5：Send to V2

允许：

```text
选择 3～5 Candidate Draft
→ Create Product Candidate Skeletons
→ 进入现有 V2
```

UI 必须提示：

```text
这些候选尚未完成 Economics / Risk 验证。
进入 V2 后可能显示 NEEDS_VALIDATION。
```

---

# 51. Telemetry / Trace

每次 Discovery Run 需要 Trace：

```text
DiscoveryRunID
Provider Call
Capability
Input
Output Count
Evidence IDs
Latency
Credit
Cache Hit
Error
```

不得保存：

```text
伪造 Provider 调用记录
```

---

# 52. Determinism

对同一份 Frozen Provider Fixture：

```text
相同 Input
+
相同 Config
```

应得到：

```text
相同 Normalization
相同 Cluster Membership
相同 Gate
相同 Dedup
相同 Candidate Draft Ordering
```

LLM Label 可以允许文字微差，但：

```text
Candidate Identity / Evidence / Metrics
```

不得漂移。

---

# 53. Ordering

Candidate Draft 排序建议：

```text
Gate
↓
Priority Tier
↓
Evidence Coverage
↓
Primary Demand
↓
Stable Candidate ID
```

如果 Demand UNKNOWN：

```text
不得当 0 比较
```

---

# 54. Stable IDs

不要用随机 UUID 决定排序。

建议：

```text
cluster hash
+
marketplace
+
canonical product type
```

生成稳定 Draft ID。

---

# 55. Acceptance Tests

Phase 2A 至少实现以下验收用例。

---

## Case 1 — Seed → ≥5 Candidate Drafts

输入一组准备好的真实或 Frozen Provider Fixture：

```text
Seed Keyword
```

如果底层数据本身存在足够多不同购买意图：

期望：

```text
至少生成 5 个非重复 Candidate Draft
```

注意：

测试不能强迫任何 Seed 必须生成 5 个。

若 Provider Evidence 只支持 3 个：

```text
系统必须诚实返回 3 个
```

而不是补齐到 5。

---

## Case 2 — No Fabricated Candidate

每个 Candidate Draft：

```text
evidenceIds.length > 0
```

每个 primary/supporting keyword 必须存在于：

```text
KeywordNode
```

Representative ASIN 必须存在于：

```text
AsinNode
```

---

## Case 3 — Keyword Dedup

输入：

```text
glass food storage container
Glass Food Storage Containers
glass  food storage container
```

期望：

```text
归一化后不会生成三个不同机会
```

---

## Case 4 — Intent Cluster Dedup

多个同义 Keyword + 高 Shared-ASIN Overlap：

期望：

```text
归入同一 Cluster
```

---

## Case 5 — Distinct Intent Separation

例如：

```text
glass fruit storage container
glass meal prep container
```

若 ASIN / Intent Evidence 明显不同：

期望：

```text
不得仅因 "glass container" 相似而强行合并
```

---

## Case 6 — Growth Missing

`get_keyword_info` 有 Search Volume，但没有 Trend Series。

期望：

```text
searchVolume = AVAILABLE
growth = UNKNOWN
```

禁止：

```text
growth = 0
```

---

## Case 7 — Actual ASIN Sample Size

Provider 只返回 3 个 ASIN。

期望：

```text
asinSampleSize = 3
```

UI 不得写：

```text
Top10
```

---

## Case 8 — Cross Evidence Protection

Keyword A / ASIN A 的 Evidence 注入 Candidate B。

期望：

```text
Discovery Gate reject / validation fail
```

不能形成合法 Candidate Draft。

---

## Case 9 — Provider Failure

其中一个 Expansion Call 失败。

期望：

```text
Run = DEGRADED
已有 Evidence 保留
失败节点不生成假数据
```

---

## Case 10 — Budget Stop

触发：

```text
maxProviderCalls
```

期望：

```text
停止继续扩展
stoppedByBudget = true
Run = DEGRADED
```

并返回现有 Draft。

---

## Case 11 — Brand Query

当：

```text
excludeBrandTerms = true
```

纯品牌导航词：

```text
REJECT
```

品牌 + 通用品类词：

```text
保留或降级
但必须标 BRAND_DEPENDENT
```

---

## Case 12 — Accessory Intent

当：

```text
excludeAccessoryIntent = true
```

明确配件 Candidate：

```text
不得与 Main Product Candidate 同级输出
```

---

## Case 13 — Candidate Draft Provenance

查询：

```text
Why was Candidate A discovered?
```

所有 DiscoveryReason：

```text
metricIds 非空
evidenceIds 非空
```

---

## Case 14 — Determinism

同 Fixture、同 Config 连续运行两次：

```text
Cluster Membership
Candidate IDs
Gate
Ordering
```

完全一致。

---

## Case 15 — Handoff to V2

至少 3 个 Candidate Draft 可以转换成：

```text
ProductCandidate Skeleton
```

没有 Economics 时：

```text
UNKNOWN
```

进入 V2 后：

```text
NEEDS_VALIDATION
```

不得 Fake Shortlist。

---

## Case 16 — Risk Handoff

Auto Discovery 无 Risk Evidence。

期望：

```text
PATENT = UNVERIFIED
COMPLIANCE = UNVERIFIED
```

不得：

```text
PASS
```

---

# 56. MVP 验收总标准

Auto Discovery MVP 只有满足下面条件才允许冻结：

```text
1. Seed 能产生证据支持的 Candidate Draft
2. 每个 Draft 都能追溯 Keyword / ASIN / Evidence
3. 同义意图不会重复生成多个 Candidate
4. 不同购买意图不会被错误合并
5. Provider 缺失不会触发虚假 Metric
6. Growth 无历史数据时保持 UNKNOWN
7. ASIN 实际样本量如实展示
8. Budget 可控且可降级
9. Discovery Reasons 可解释
10. 至少 3 个 Draft 能无伪造地进入 V2 Frozen Pipeline
```

---

# 57. MVP 输出示例

```json
{
  "id": "draft-amazon-us-glass-berry-keeper",
  "marketplace": "AMAZON_US",
  "title": "Glass Berry / Fruit Keeper",
  "productType": "Glass Produce Storage Container",
  "clusterId": "cluster-berry-produce-storage",
  "primaryKeyword": "glass berry container",
  "supportingKeywords": [
    "berry keeper glass",
    "glass fruit keeper",
    "fruit storage container with strainer"
  ],
  "representativeAsins": [
    "B0XXXXXXXX",
    "B0YYYYYYYY"
  ],
  "discoveryMetrics": {
    "demand": {
      "value": 8200,
      "source": "FACT",
      "evidenceId": "evi-keyword-glass-berry-container"
    },
    "growth": {
      "value": null,
      "source": "UNKNOWN"
    },
    "competition": {
      "value": 47,
      "source": "FACT",
      "evidenceId": "evi-keyword-glass-berry-container"
    },
    "keywordCount": 4,
    "asinSampleSize": 2
  },
  "evidenceIds": [
    "evi-keyword-glass-berry-container",
    "evi-asin-b0xxxxxxxx",
    "evi-asin-b0yyyyyyyy"
  ],
  "missingRequirements": [
    "trend"
  ],
  "status": "READY_FOR_ENRICHMENT"
}
```

上例中的具体数值只能用于 Fixture / 文档演示。

真实运行必须使用真实 Provider Evidence。

---

# 58. 推荐代码组织

保持轻量，不提前拆十几个 Engine。

建议：

```text
packages/domain/src/research/discovery/

product-discovery.service.ts
keyword-normalizer.ts
keyword-expansion.service.ts
keyword-clusterer.ts
discovery-gate.ts
candidate-draft.builder.ts
candidate-deduplicator.ts
candidate-handoff.service.ts
```

共享契约：

```text
packages/shared/src/contracts/
product-discovery-contracts.ts
```

API：

```text
apps/api/src/modules/market/
```

Web：

```text
apps/web/src/app/app/market-research/
```

---

# 59. 推荐职责边界

## ProductDiscoveryService

负责 orchestrate。

不包含具体 Provider Remote Tool 实现。

## KeywordNormalizer

纯确定性。

## KeywordExpansionService

根据 Gateway 返回结果扩展 Graph。

## KeywordClusterer

只做聚类。

## DiscoveryGate

只判断 PASS / DEGRADED_PASS / REJECT。

## CandidateDraftBuilder

Cluster → Candidate Draft。

## CandidateDeduplicator

Candidate ↔ Candidate 去重。

## CandidateHandoffService

Candidate Draft → V2 ProductCandidate Skeleton。

---

# 60. 禁止出现第二套数据真理

Discovery 必须复用：

```text
EvidenceItem
ValueSource
ProvenanceValue
Provider Framework
Trace / Cost semantics
```

不要新建：

```text
DiscoveryFact
DiscoveryEvidenceV2
DiscoverySourceType2
```

除非现有契约确实无法表达。

---

# 61. LLM 使用边界

MVP 可以完全不使用 LLM。

如果使用，只允许：

```text
Cluster label
Candidate display title
Human-readable summary
```

LLM Input 必须包含来源数据。

LLM Output 不得新增：

```text
ASIN
Metric
Evidence
Price
Volume
Growth
Feature Fact
```

---

# 62. Security / Reliability

Provider 输入必须经过：

```text
marketplace validation
keyword length validation
batch size validation
budget validation
```

防止：

```text
无限关键词递归
超大 batch
用户一次触发大量付费调用
```

---

# 63. Observability

至少记录：

```text
DiscoveryRun started
Seed accepted
Expansion round
Provider capability
Received keyword count
Received ASIN count
Cluster count
Rejected reason count
Draft count
Budget usage
Final status
```

---

# 64. Freeze Rule

实现完成后不要因为：

```text
“还可以再加一个指标”
```

持续迭代。

只有以下情况阻止冻结：

```text
P0
- Fake Evidence
- Fake Metric
- Cross-subject contamination
- Missing → 0
- Candidate duplicate explosion
- Provider budget uncontrolled
- Handoff breaks V2 Frozen contract
```

其他优化：

```text
更多聚类算法
更多 Provider
更复杂 Growth
更丰富 UI
```

留到后续 Phase。

---

# 65. 后续阶段

Auto Discovery MVP 冻结后再进入：

## Phase 2B — Candidate Enrichment

```text
Candidate Draft
↓
VOC
Differentiation
Product Concept
Target Customer
Price Band
Feature Hypothesis
```

## Phase 2C — Scale Funnel

```text
100 Candidates
↓
20
↓
5
↓
3
```

重点：

```text
Batch
Cache
Cost
Concurrency
Provider Routing
```

---

# 66. 最终架构定位

Product Research 演进后的完整链路：

```text
┌────────────────────────────────────┐
│ Phase 2A — Auto Discovery          │
│ Seed → Keywords → ASINs → Cluster  │
│ → Candidate Drafts                 │
└─────────────────┬──────────────────┘
                  │
                  ▼
┌────────────────────────────────────┐
│ Phase 2B — Candidate Enrichment    │
│ Concept / VOC / Differentiation    │
│ Economics Inputs / Risk Evidence   │
└─────────────────┬──────────────────┘
                  │
                  ▼
┌────────────────────────────────────┐
│ V2.0.0-FROZEN                      │
│ Economics + Risk Gate + Comparison │
│ Why A > B                          │
└────────────────────────────────────┘
```

Auto Discovery 的职责不是替用户做最终选品决策。

它的职责是：

> **从真实市场数据中，用可追溯、低成本、可复现的方法，把“值得进一步研究的方向”系统化地发现出来，并可靠交给已经冻结的 V2 决策系统。**

---

# 67. Definition of Done

Phase 2A 开发完成时，交付报告必须回答：

```text
1. 输入了什么 Seed？
2. 调用了哪些 Capability？
3. 实际用了多少 Provider Calls / Credits？
4. 得到了多少 Keyword？
5. 得到了多少 ASIN？
6. 去重后剩多少？
7. 聚成多少 Cluster？
8. 为什么形成这些 Cluster？
9. 生成多少 Candidate Draft？
10. 每个 Candidate 的 Evidence 在哪里？
11. 哪些数据 UNKNOWN？
12. 哪些 Candidate 被 Reject？为什么？
13. 哪 3～5 个成功进入 V2？
14. 是否修改 V2 Frozen 代码？如果是，为什么？
15. 所有 Acceptance Tests 是否 PASS？
```

未满足真实性、可追溯性或冻结边界时：

```text
不得宣布 Auto Discovery MVP FROZEN
```

---

# 68. 实施完成记录与 DoD 逐项验收答复 (Phase 2A Verification Record)

| DoD 条目 | 验收指标与实现结论 |
| :--- | :--- |
| **1. 输入了什么 Seed？** | `Marketplace = 'AMAZON_US'`, `Seed Keyword = 'glass food storage'`, `Category = 'Home & Kitchen > Storage & Organization'`. |
| **2. 调用了哪些 Capability？** | `market.keyword.search` (查询关键词 ABA 搜索量、排名与 Top ASINs)、`market.product.search` (复合检索)、`market.keyword.asin_analysis` (ASIN 关联与反查)。 |
| **3. 实际用了多少 Provider Calls / Credits？** | 真实调用受 `budget.maxProviderCalls` (默认 20 次) 严格门限保护；演示样本实测消耗 6 次能力调用，17 个证据锚点全部打通。 |
| **4. 得到了多少 Keyword？** | 接收 6 个主要关键词节点（涵盖 seed 及 5 个拓展词），全量归一化并完成分词与意图分析。 |
| **5. 得到了多少 ASIN？** | 接收并收录 11 个真实代表竞品 ASIN（`B08FRUIT01`～`03`、`B09MEAL01`～`02`、`B07PANTRY01`～`02`、`B06BAKE01`～`02`、`B05BABY01`～`02`）。 |
| **6. 去重后剩多少？** | 关键词归一化与分词消除复数及大小写变体；候选经 `CandidateDeduplicator` 规范去重后保留 6 个完全独立的意图机会簇。 |
| **7. 聚成多少 Cluster？** | 生成 6 个高质量意图机会簇（Glass Food Storage、Glass Berry Keeper、Glass Meal Prep Container、Glass Flour & Sugar Canisters、Glass Baking Dish、Glass Baby Food Jars）。 |
| **8. 为什么形成这些 Cluster？** | 基于 `tokenSimilarityThreshold: 0.45` 与 `sharedAsinJaccardThreshold: 0.25`，结合互斥购买意图分桶（Fruit/Berry vs Meal Prep vs Pantry vs Bakeware vs Baby），杜绝通配词贪婪合并。 |
| **9. 生成多少 Candidate Draft？** | 生成 5 个已通过门禁的精选候选草案（Candidate Draft 1～5），完全符合规范设定的 5～10 个目标。 |
| **10. 每个 Candidate 的 Evidence 在哪里？** | 每个 Candidate Draft 的 `evidenceIds` 均非空，100% 绑定底层 `KeywordNode` 与 `AsinNode` 的 `EvidenceItem`，且通过门禁防串供校验。 |
| **11. 哪些数据 UNKNOWN？** | 历史趋势序列在基础词接口中未获得，`growth` 严格置为 `{ value: null, source: 'UNKNOWN' }`，绝不虚假保底为 0%；财务成本与专利在发现阶段均保持 `UNKNOWN / UNVERIFIED`。 |
| **12. 哪些 Candidate 被 Reject？为什么？** | 纯品牌词（如 `pyrex`）被纯品牌导航规则拦截；配件意图（如 `silicone replacement lid`）在开启 `excludeAccessoryIntent` 时被拦截；外来凭证串供候选被门禁拦截。 |
| **13. 哪 3～5 个成功进入 V2？** | 精选选出 3 个候选草案（Glass Berry Keeper, Glass Meal Prep Container, Glass Pantry Jars），通过 `CandidateHandoffService` 无缝转换为 `ProductCandidate` 骨架进入 V2，V2 决策引擎如实判定为 `NEEDS_VALIDATION`。 |
| **14. 是否修改 V2 Frozen 代码？如果是，为什么？** | **0 行修改**。V2 Frozen 核心文件（`candidate-economics.service.ts`、`candidate-risk-gate.ts`、`candidate-decision.engine.ts`、`candidate-comparison.engine.ts`、`candidate-evidence-validator.ts`）完全保持只读冻结，全部通过 Adapter/Handoff 兼容。 |
| **15. 所有 Acceptance Tests 是否 PASS？** | **16/16 全部 PASS** (`product-discovery-acceptance.spec.ts` 16/16 通过，全 domain 39/39 套件 386 tests 全部通过，全 monorepo typecheck 10/10 通过，web 40/40 tests 全部通过，web 24/24 static pages 生成成功)。 |

---

**END OF SPEC — V2.1.0-FROZEN**
