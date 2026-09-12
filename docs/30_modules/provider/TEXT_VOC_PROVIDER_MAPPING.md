# CrossPilot Text VOC 架构扫描与第二 Provider 接入映射设计

> **编制时间**: 2026-09-11  
> **所属阶段**: Phase 6 — 第二 Provider 接入与真实文本级 VOC 补齐  
> **设计原则**: 严格复用现有 Provider Framework 稳定架构，坚决不重构已有基础设施，坚决不创造重复抽象，保证 100% 真实文本证据支撑。

---

## 一、当前 VOC 架构扫描与 8 大核心问题解答

在接入第二 Provider 之前，全面扫描了 CrossPilot 当前 Provider Framework 核心组件与数据模型：
- `ProviderRegistry` (`packages/integrations/src/provider-framework/core/provider-registry.ts`)
- `CapabilityBindingRegistry` (`packages/integrations/src/provider-framework/core/capability-binding.registry.ts`)
- `ProviderRouter` (`packages/integrations/src/provider-framework/core/provider-router.ts`)
- `IntegrationGateway` (`packages/integrations/src/provider-framework/core/integration-gateway.ts`)
- `review.product.health` 与 `voc.product.analyze` 能力契约
- `VocProductAnalysisResult`, `VocPainPoint`, `VocPraisePoint`, `VocBuyerMotivation`, `ResearchEvidence` 领域模型

针对系统架构与扩展性的 8 个核心问题，审计结论如下：

### 1. 当前 voc.product.analyze 是如何绑定 Provider 的？
在 `xydc.config.ts` 与 `mock-market.provider.ts` 中：
- `XYDC_CAPABILITY_BINDINGS` 声明了 `capabilityId: 'voc.product.analyze'`，`providerId: 'xydc'`，`priority: 100`，`remoteToolName: 'get_asin_info'`，并在 metadata 中标记为 `status: 'PARTIAL_LIVE'`。
- `MOCK_CAPABILITY_BINDINGS` 声明了 `capabilityId: 'voc.product.analyze'`，`providerId: 'mock'`，`priority: 10`。
- 在应用启动时，`createDefaultIntegrationGateway()` 将这些 bindings 注册至全局 `CapabilityBindingRegistry`。当业务发起能力调用时，`ProviderRouter` 按 priority 选出 Primary Provider，最终由 `IntegrationGateway` 调度执行对应 ProviderAdapter。

### 2. 当前是否已经允许：review.product.health → XYDC，voc.product.analyze → 第二 Provider？
**是的，架构上天然且完全支持。**
`CapabilityBindingRegistry` 的索引粒度是 `(capabilityId, providerId)`。每个 `capabilityId` 的路由决策是完全隔离独立的：
- `review.product.health` 独立查找其 bindings，匹配最高优先级的 XYDC（`priority: 100`）。
- `voc.product.analyze` 独立查找其 bindings。一旦注册第二 Provider 且优先级更高（如 `priority: 110`），`ProviderRouter` 就会将其 Primary 路由定向至第二 Provider。
两者在架构上互不干扰，完全解耦。

### 3. 一个 Capability 是否支持不同 Provider priority？
**是的，完全原生支持。**
在 `CapabilityBindingRegistry.getBindingsForCapability(capabilityId)` 实现中：
```typescript
return this.bindings
  .filter((b) => b.capabilityId === capabilityId)
  .sort((a, b) => b.priority - a.priority);
```
`ProviderRouter.resolveRoute` 过滤所有已启用的 Binding 与 Provider 后：
- `validBindings[0]` 自动作为 `primary`（主路由）；
- `validBindings[1]` 自动作为 `fallback`（降级路由）。
只要第二 Provider 对 `voc.product.analyze` 声明 `priority: 110`，即可自然抢占 Primary，同时保留 XYDC/Mock 作为容灾 Fallback。

### 4. Provider 是否能够声明自己只支持某些 dimensions？
**是的，契约与 Metadata 均支持。**
- 在 Phase 5.1 实施中，`CapabilityBinding.metadata.supportedDimensions` 与 `unsupportedDimensions` 已经正式规范化。
- XYDC 明确声明支持 `['averageRating', 'totalReviewCount', 'ratingTrend', 'reviewCountTrend']`，不支持单品文本挖掘。
- 第二 Provider（如 Firecrawl VOC）可声明其支持 `['painPoints', 'useCases', 'questions', 'desiredFeatures', 'buyerMotivations', 'evidenceQuotes']`，不支持星级与销量。
- 数据契约 `VocProductAnalysisResult` 自身亦具备 `supportedDimensions` 与 `unsupportedDimensions`，向消费端提供确定性的能力边界事实。

### 5. VOC Provider 返回的数据如何进入 Evidence？
在 Provider 的 Mapper 层：
1. 抓取外部真实原始文本后，为每条去噪文本生成一条合法的 `ResearchEvidence`，包含 `evidenceId`、`source`、`providerId`、`type: 'EXTERNAL_VOC'`、`title`、`content: rawText`、`capturedAt`、`metadata: { url, author, publishedAt }`。
2. 提取并聚合后的各 VOC 主题（如痛点、使用场景）关联到对应的 `evidenceIds`。
3. Mapper 将整套 `ResearchEvidence[]` 注入 `VocProductAnalysisResult.evidence` 并随 `ProviderExecutionResult.data` 返回。
4. 结果由 `IntegrationGateway` 统筹脱敏后交付给 Tool Platform / Agent / 前端，成为全局可追溯的凭据节点。

### 6. 现有 VocProductAnalysisResult 是否足以表达真实文本 VOC？
**主体结构非常完备，仅需微小增量扩展。**
- 现有结构已包含：`asin`, `marketplace`, `totalReviewCount`, `analyzedReviewCount`, `painPoints` (含 `quotes: VocEvidenceQuote[]`), `praisePoints`, `buyerMotivations`, `summary`, `evidenceNotice`, `evidence`。
- 为满足 Phase 6 的全维度外部 VOC 规范，仅需在 `@crosspilot/shared` 增量增加 4 个可选扩展字段：
  - `vocSourceType?: 'AMAZON_REVIEW' | 'EXTERNAL_VOC'`：严格区分数据源大类，杜绝冒充；
  - `useCases?: VocUseCase[]`：买家使用场景提炼；
  - `questions?: VocQuestion[]`：买家常见困惑与疑问；
  - `desiredFeatures?: VocDesiredFeature[]`：买家期待的新增特性。
原现有字段 100% 保持向前兼容。

### 7. 是否需要新增 ExternalVocSource / TextVocProvider，还是现有 ProviderAdapter 已经足够？
**现有 ProviderAdapter 已经 100% 足够，坚决不增加多余抽象。**
CrossPilot 的通用 Provider 哲学是“面向 Capability 编程，非面向供应商或垂直场景造轮子”：
```typescript
export interface ProviderAdapter<TInput = any, TRawOutput = any, TNormalizedOutput = any> {
  providerId: string;
  transport: ProviderTransport;
  execute(
    capabilityId: string,
    binding: CapabilityBinding,
    input: TInput,
    context: ProviderExecutionContext,
  ): Promise<ProviderExecutionResult<TNormalizedOutput>>;
  checkHealth?(): Promise<ProviderHealth>;
}
```
第二 Provider 直接实现 `ProviderAdapter` 接口，在 `packages/integrations/src/provider-framework/providers/firecrawl/` 中封装自身的网络交互、缓存与映射逻辑即可。

### 8. 最小增量改造点是什么？
1. **协议层 (`@crosspilot/shared`)**：
   - `EvidenceType` 增加 `'EXTERNAL_VOC'` 与 `'AMAZON_REVIEW_VOC'`（保留 `'VOC'` 兼容）；
   - 定义通用 `RawTextItem` 结构；
   - 在 `VocProductAnalysisResult` 增加 `vocSourceType`, `useCases`, `questions`, `desiredFeatures` 可选字段。
2. **集成层 (`packages/integrations`)**：
   - 新增 `FirecrawlVocProvider`（实现 `ProviderAdapter`）；
   - 编写 `FirecrawlClient`（调用真实 API，集成脱敏与 Proxy）；
   - 编写 `FirecrawlMapper`（负责去噪、去重、纯代码频率计算、原文 Quote 严格核验）；
   - 配置 `FIRECRAWL_CAPABILITY_BINDINGS`（`voc.product.analyze` priority: 110）；
   - 在 `createDefaultIntegrationGateway()` 中完成适配器注册。
3. **缓存层**：
   - 复用现有 `ProviderCache`（Redis + InMemory 降级），缓存键：`provider:firecrawl:voc.product.analyze:{marketplace}:{subject}:default:v1`。
4. **业务层与表现层**：
   - 保持业务层透明调用 `voc.product.analyze`；
   - UI 弹窗根据 `vocSourceType` 渲染“外部讨论与声量分析 (External VOC)”标签与数据边界提示。

---

## 二、两类 VOC 边界与数据源分类标准

CrossPilot 正式确立 VOC 分类标准，并在类型系统与 UI 呈现上设立硬边界：

| 维度 | AMAZON_REVIEW_VOC (站内评论原声) | EXTERNAL_VOC (站外声量与讨论原声) |
| :--- | :--- | :--- |
| **数据源定义** | 必须来自真实 Amazon Review 文本，或以 Amazon 评论为底层抓取源的专有 Provider。 | 来自 Reddit、各类垂直论坛 (Forums)、YouTube 视频评论、社交媒体、独立博客、公开搜索讨论。 |
| **核心支撑维度** | 买家差评痛点、赞誉点、星级相关性、购买动机、真实留评日期、带 Verified Purchase 标识的 Quote。 | 真实使用场景 (Use Cases)、买家疑虑 (Questions)、期待改进特性 (Desired Features)、横向竞品对比、外溢抱怨。 |
| **事实红线** | 必须有单条真实 Review 文本支持，严禁仅凭星级 4.6 伪造“5,147 篇分析样本”。 | **绝对禁止宣称自己来自 Amazon Review**，必须标注真实发帖平台、URL 与作者信息。 |
| **EvidenceType** | `'AMAZON_REVIEW_VOC'` | `'EXTERNAL_VOC'` |

---

## 三、第二 Provider 选型审计：Firecrawl Web/Forum/Social Search

### 1. 选型背景与实机验证
在系统环境审查中，发现本机已具备生产级配置的 **Firecrawl**：
- **凭据载体**: `FIRECRAWL_API_KEY` 已就绪于安全凭据环境中，`SecretProvider` 提供统一代理与掩码保护；
- **真实连通性测试**:
  - `firecrawl_search` 在实机成功执行，单次检索获取多个权威公开讨论与测评页（含 Reddit、Walmart 买家长评、CB2 专卖评测等）；
  - `firecrawl_scrape` 实测成功抓取目标商品讨论页，获取长达 6,790 字符的真实买家原声长文本；
- **协议适配**: 原生支持 HTTP REST API（`https://api.firecrawl.dev/v1/search` 及 `/scrape`），网络层自动兼容开发机本地代理，响应迅速。

### 2. 真实文本依据流向设计
```text
Firecrawl Search / Scrape
        ↓ (20~100 条真实外部文本项)
RawTextItem: { sourceId, sourceType, text, url, author?, publishedAt? }
        ↓
Text Normalization & Deduplication (去除重复项、过滤低质量短文本与系统噪声)
        ↓
Topic Classification & Semantic Grouping
        ↓
Code-based Frequency & Percentage Calculation: count(topic) / totalItems
        ↓
Quote Verification: 严格校验 quoteText 是否为 rawText 的子串 (100% 存在校验)
        ↓
Evidence Generation: 每条入选文本生成独立的 ResearchEvidence (type = EXTERNAL_VOC)
        ↓
VocProductAnalysisResult (vocSourceType = 'EXTERNAL_VOC')
        ↓
ProviderCache (Redis 6h / InMemory Fallback)
```

---

## 四、代码计算与防伪造机制 (Deterministic Rules)

1. **频率与占比必须由纯代码计算**:
   - 严禁 LLM 捏造“23% 用户认为太轻”；
   - 规则：`frequency = matchingItems.length`；`percentage = Number(((matchingItems.length / totalAnalyzed) * 100).toFixed(1))`。
2. **Quote 必须 100% 存在于原文**:
   - 对每一个提炼的 `quoteText`，必须在对应 `rawText` 中执行 `rawText.includes(quoteText.trim())` 校验；
   - 校验不通过者坚决剔除，彻底杜绝“大模型润色篡改后冒充原文引用”。
3. **零事实污染 (No Product Fact Pollution)**:
   - External VOC 中的一切用户表达均界定为 `VOC Observation`（主观讨论观点），绝不污染 `Product Facts`（官方规格、重量、材质等客观物理事实）。

---

## 五、实施落地步骤计划

1. **Step 1**: 在 `@crosspilot/shared` 中增量扩展 `EvidenceType`、`RawTextItem` 及 `VocProductAnalysisResult` 结构，并构建共享包。
2. **Step 2**: 在 `packages/integrations` 中新建 `providers/firecrawl/` 模块，实现客户端、数据清洗、确定性频率计算与原文 Quote 校验。
3. **Step 3**: 在 `xydc.config.ts` 与 `firecrawl.config.ts` 中完成优先级路由配置（`voc.product.analyze` 优先绑定 Firecrawl）。
4. **Step 4**: 编写并执行 Live 验证脚本，针对测试商品（如牙刷架 `B0BFGNSXYL` / `toothbrush holder`），真实抓取 20+ 条外部文本，全链路核验文本真实性、Quote 匹配率、频率数学准确性与缓存命中。
5. **Step 5**: 更新前端展示与单元/集成测试，确保质量门禁全绿，输出 Phase 6 总结报告。
