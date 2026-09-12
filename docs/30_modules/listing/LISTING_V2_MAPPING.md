# CrossPilot Listing Studio V2 / Listing Intelligence 代码映射与增量改造方案 (./LISTING_V2_MAPPING.md)

> **基线规范**：依据 `docs/90_historical/CrossPilot_V9_FINAL_完整无损融合版_含ListingIntelligence.md` 第 338.30 节与第 341 节要求。  
> **核心原则**：
> 1. **严禁推倒重构**：复用现有 Product、SKU、Product Brief、VOC、Listing Studio、WF-02、Compliance、Knowledge Base、Tool Platform、Creative Studio、Trace、Eval 等已落地资产。
> 2. **严禁重复开发独立 Agent**：不新建平行的 Listing Agent 或第二套工作流引擎，全面采用 Tool-first 与增量 Adapter/DAG 模式。
> 3. **事实锚定（Fact Grounding）**：所有关键 Claim 必须严格映射 `factIds`，官方 Policy 具备一票否决权，禁止 Rufus Q&A 伪造不存在的产品参数。
> 4. **视觉缓存（Visual Facts Reuse）**：多模态图像最多 10 张，首次解析后落盘 Visual Facts，后续生成与 Creative 消费默认复用缓存，杜绝重复调用视觉模型。

---

## 1. 现有资产扫描与位置映射 (As-Is Scan)

| 维度 | 当前代码位置 | 当前能力现状 | V2 改造与升级方向 |
| :--- | :--- | :--- | :--- |
| **前端页面** | `apps/web/src/app/app/listings/page.tsx` | 实现了 SKU 切换、文本生成、五点描述展示、版本对比、合规审查状态展示 | 增量补齐：10 张产品图上传与 Visual Facts 展示卡、关键词导入（Manual/TXT/Excel）、Rufus Q&A 卡片、站点选择（默认 US）、Model 路由卡（AUTO/Override）、结构化 Image Brief / A+ Plan、一键推送素材工坊（Send to Creative Studio） |
| **Listing API** | `apps/api/src/modules/listing/listing.controller.ts`<br>`apps/api/src/modules/listing/listing.service.ts` | 提供 `GET /listings/sku/:skuId`、`POST /listings/generate`、`POST /listings/compliance-check` | 保持现有 API 路径和出参向下兼容；新增/扩展支持多模态 Visual Facts 提取、关键词解析、Rufus Q&A 上下文、14 步 DAG 编排与 `ListingCreativeBrief` 导出接口 |
| **合规审查服务** | `packages/domain/src/compliance/compliance-judge.service.ts` | 实现了确定性规则匹配（FDA 医疗宣称、极值排名词、天然大理石真实性、孔径尺寸警告），输出 PASS/WARNING/BLOCK/INSUFFICIENT | **100% 直接复用**；作为 14 步 DAG 中的权威政策闸口，严格执行一票否决 |
| **WF-02 工作流** | 原实现在 `listing.service.ts` 的 `generateListing` 中内置串行调用 | 具备基础的产品事实提取与合规检查 | 升级为规范的 **14 步 DAG 编排器**（`ListingWorkflowDagService`），支持节点级输入输出跟踪与 Trace 记录 |
| **产品事实源** | `packages/db/prisma/schema.prisma` (`Product`, `ProductFeature`, `Sku`) | `Product.productBrief`, `ProductFeature` 提供了名称、材质、尺寸、重量等真实参数 | **100% 直接复用**；新增 `ProductVisualFact` 表或持久化事实快照，关联到 Product |
| **关键词数据** | `packages/db` (`SearchTermMetricDaily`)，内存处理 | 缺乏灵活的外部文件导入（TXT/Excel）和归一化清洗逻辑 | 新增 `@crosspilot/tool-platform` 工具：`keyword.file.extract` 与 `keyword.normalize`，支持多列识别与去重 |
| **知识库与 RAG** | `packages/db` (`KnowledgeDocument`, `KnowledgeChunk`)<br>`packages/integrations` (`MilvusVectorStore`) | 具备文档切片、元数据、向量存储与检索契约 | 增加分层元数据过滤：Layer 1 Authority (`AMAZON_POLICY`, `AMAZON_GUIDELINE`)，Layer 2 Optimization (`SEO_REFERENCE`, `COSMO_RESEARCH`, `GEO_RESEARCH`)，Layer 3 Context (`RUFUS_QA`) |
| **工具平台底座** | `packages/tool-platform/src/registry/tool.registry.ts`<br>`packages/tool-platform/src/executor/tool.executor.ts` | 统一的 ToolRegistry 与 ToolExecutor，支持 Schema 校验、TraceId、超时与权限 | 新增工具接入：`product.visual.extract`, `keyword.file.extract`, `keyword.normalize`，供 Tool Center 与 Workflow 共同复用 |
| **素材工坊集成** | `apps/api/src/modules/creative/creative.service.ts`<br>`packages/tool-platform/src/tools/creative-studio.tools.ts` | 具备 6 大素材工具与 `POST /api/v1/creative/pack` | 改造 `CreativeService.generateCreativePack` 接受并消费 `ListingCreativeBrief`，实现卖点与视觉指示无缝对齐 |
| **可观测与评测** | `apps/api/src/modules/agent-task/agent-task.service.ts`<br>`apps/api/src/modules/eval/eval.service.ts`<br>`scripts/run-evals.cjs` | 7 大金标基准用例，涵盖合规拦截、方差分解、广告优化、库存预警、PO 状态机 | 增补 Listing 专项评测（Fact Grounding Rate, Rufus Coverage, Policy Priority Gate 等），金标脚本持续 100% 通过 |

---

## 2. 11 大核心功能需求实施细则

### 2.1 产品图片视觉提取与缓存（`product.visual.extract`）
- **输入上限**：最多 10 张图片 URL / Base64。
- **缓存策略**：首次解析后生成结构化 Visual Facts 并存储；第二次生成 Listing 或 Creative 消费时，直接读取已持久化的 Visual Facts，**绝不发起重复视觉分析**。
- **事实可信度边界**：
  - 仅提取“外观可见事实”（如颜色、形状、组件、外观包装、表面质感等）；
  - 严禁从图片推断无法直观证明的硬指标（如：100% 天然材质纯度、FDA 认证、耐摔/耐磨年限、内部机械结构等）；
  - 状态分为：`EXTRACTED`（模型抽取）、`CONFIRMED`（人工核准）、`REJECTED`（人工驳回）。

### 2.2 多来源关键词库（Manual / TXT / Excel）
- **实现工具**：`keyword.file.extract` + `keyword.normalize`。
- **智能解析策略**：
  - 支持多列 Excel：自动识别包含 `keyword`, `search_term`, `query`, `关键词`, `搜索词` 等列名的字段；其余列保留在 raw metadata 中，不污染产品事实；
  - 自动清洗：去除特殊字符、全角转半角、小写归一化、去除重复项；
  - 优先级与元数据：保留优先级（Priority）、搜索量（Volume）、来源（MANUAL / TXT / EXCEL）。

### 2.3 结构化 Rufus Q&A 意图上下文
- **定位**：Rufus Q&A 是买家搜索与咨询的意图上下文（Intent Context），用于指导标题与五点更自然地回应买家关切（如“能不能放电动牙刷？”）。
- **红线**：严禁利用 Rufus Q&A 无中生有制造产品规格；若 Q&A 涉及具体产品特性，必须与 Product Feature (`factIds`) 校验匹配，无事实支撑时禁止进入 Claim。

### 2.4 三层知识库分层与 RAG 检索
- **Layer 1 (最高权威 / 一票否决)**：Amazon Official Policy / Seller Guidelines（违规直接拦截，返回 BLOCK / WARNING）；
- **Layer 2 (生成优化)**：SEO Best Practices, Amazon COSMO Algorithm Insights, GEO / AI Overview 优化；
- **Layer 3 (意图上下文)**：Rufus 问答库与买家真实意图；
- **规则隔离**：优化层知识绝不允许覆盖或抵消官方合规政策。

### 2.5 MarketplacePolicyProfile 配置化
- 剥离 Prompt 中写死的硬编码限制，建立 `MarketplacePolicyProfile` 契约：
  - `marketplace`: "AMAZON_US" (默认)；
  - `locale`: "en-US"；
  - `title`: `{ maxLength: 200, rules: [...] }`；
  - `bullets`: `{ maxCount: 5, totalMaxLength: 1000, rules: [...] }`；
  - `searchTerms`: `{ maxLength: 250, rules: [...] }`；
  - `forbiddenPatterns`: `RegExp[]`。

### 2.6 WF-02 升级为 14 步 DAG
定义清晰的执行链路：
```text
1. validate_input
   ↓
2. load_product_facts
   ↓
3. load_or_extract_visual_facts (优先命中缓存)
   ↓
4. load_voc
   ↓
5. load_keywords (多来源清洗后结果)
   ↓
6. load_rufus_qa
   ↓
7. load_marketplace_profile
   ↓
8. retrieve_listing_knowledge (三层分层检索)
   ↓
9. generate_listing (AUTO 模型路由)
   ↓
10. structured_output_validation (Zod Schema 校验)
   ↓
11. product_fact_grounding (Claim → factIds 映射校验)
   ↓
12. keyword_coverage_check (关键词覆盖率计算)
   ↓
13. compliance (官方 Policy 审查 & 一票否决闸口)
   ↓
14. human_review & persist_version (人工审批待命与版本持久化)
```

### 2.7 扩展 Listing Output Schema (兼容历史)
```typescript
interface ListingDraftV2 {
  // 原有字段完全兼容
  title: string;
  bulletPoints: string[];
  description: string;
  searchTerms: string;
  generationSource: string;
  claims: Array<{ claim: string; factIds: string[] }>;

  // V2 增量字段
  marketplace: string;
  locale: string;
  imageBriefs: Array<{
    slot: number;
    objective: string;
    keyMessage: string;
    visualDirection: string;
    factIds: string[];
    copy?: string[];
  }>;
  aPlusPlan?: {
    strategy: string;
    modules: Array<{
      moduleType: string;
      objective: string;
      headline?: string;
      body?: string;
      visualBrief?: string;
      factIds: string[];
    }>;
  };
  usedKeywords: string[];
  unusedHighPriorityKeywords?: string[];
  rufusCoverage?: Array<{
    question: string;
    coveredBy: ('TITLE' | 'BULLET' | 'DESCRIPTION' | 'A_PLUS')[];
    answerSnippet?: string;
  }>;
  knowledgeEvidence?: Array<{
    sourceId: string;
    sourceType: 'AMAZON_POLICY' | 'AMAZON_GUIDELINE' | 'SEO_REFERENCE' | 'COSMO_RESEARCH' | 'GEO_RESEARCH';
    authorityLevel: 'AUTHORITY' | 'OPTIMIZATION' | 'CONTEXT';
    quotedText: string;
  }>;
}
```

### 2.8 Listing → Creative Studio 契约衔接 (`ListingCreativeBrief`)
输出标准结构，作为 `CreativeService.generateCreativePack` 的直接入参，避免素材团队自创卖点。

### 2.9 Model Router
默认 `AUTO`（依据任务属性自动匹配最优模型），Tool Center 提供高级覆盖能力。

### 2.10 可观测性 Trace 与 Eval 评测集扩充
在 `EvalService` 和 `scripts/run-evals.cjs` 中增补 Listing Intelligence 专项评测用例。

---

## 3. 数据库与 Schema 变更分析 (Database Delta)

由于当前生产与本地 PostgreSQL 正在稳定运行，且已灌装 52 张表与 90 天经营基准，**数据库迁移方案必须 100% 向下兼容（Additive Only），绝不破坏或丢弃现有数据**。

### 3.1 `ListingVersion` 表扩展字段（全为可选字段，零破坏性）
- `image_briefs_json` (`Text?`): 存放结构化 Image Briefs
- `a_plus_plan_json` (`Text?`): 存放 A+ 页面模块规划
- `rufus_coverage_json` (`Text?`): 存放 Rufus 意图覆盖审计
- `keyword_coverage_json` (`Text?`): 存放关键词使用与未覆盖列表
- `claims_json` (`Text?`): 存放 Claim → factIds 结构化映射
- `knowledge_evidence_json` (`Text?`): 存放引用的知识与政策依据快照
- `marketplace` (`String? @default("AMAZON_US")`): 站点标识
- `locale` (`String? @default("en-US")`): 语言区域

### 3.2 新增 `ProductVisualFact` 模型（用于视觉事实沉淀与跨模块复用）
```prisma
model ProductVisualFact {
  id                 String   @id @default(uuid())
  workspaceId        String   @map("workspace_id")
  productId          String   @map("product_id")
  imageId            String   @map("image_id")
  imageUrl           String?  @map("image_url")
  type               String   @map("type") // COLOR, SHAPE, COMPONENT, VISIBLE_FEATURE, PACKAGING, USAGE_CONTEXT, OTHER
  value              String   @map("value")
  confidence         Decimal  @default(1.0) @db.Decimal(3, 2)
  status             String   @default("EXTRACTED") // EXTRACTED, CONFIRMED, REJECTED
  evidenceRegionJson String?  @map("evidence_region_json") @db.Text
  createdAt          DateTime @default(now()) @map("created_at")
  updatedAt          DateTime @updatedAt @map("updated_at")

  product            Product  @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@index([workspaceId])
  @@index([productId])
  @@map("product_visual_facts")
}
```

执行方案：
1. 更新 `packages/db/prisma/schema.prisma`；
2. 运行 `pnpm db:generate` 重新生成 Prisma Client；
3. 执行 `npx prisma db push` 安全应用结构变更（非破坏性增加列与新表）。

---

## 4. 拟修改与新增文件清单 (File Touch Plan)

### 4.1 新增文件 (Files to Add)
1. `packages/tool-platform/src/tools/product-visual-extract.tool.ts`：图片多模态视觉提取工具
2. `packages/tool-platform/src/tools/keyword-intake.tools.ts`：关键词文件提取与清洗工具 (`keyword.file.extract`, `keyword.normalize`)
3. `packages/domain/src/listing/marketplace-policy.profile.ts`：站点政策 Profile 与规则定义
4. `packages/domain/src/listing/listing-workflow-dag.service.ts`：WF-02 14 步 DAG 编排引擎与契约定义
5. `packages/domain/src/listing/listing.types.ts`：VisualFact, KeywordItem, RufusQa, ListingCreativeBrief, ListingDraftV2 共享类型定义

### 4.2 修改文件 (Files to Modify)
1. `packages/domain/src/index.ts`：导出新增的 Listing 领域服务与 Profile
2. `packages/tool-platform/src/tools/default-tools.ts`：注册新增工具到 ToolRegistry
3. `packages/tool-platform/src/index.ts`：导出新工具类型
4. `packages/db/prisma/schema.prisma`：增加 ListingVersion 字段与 ProductVisualFact 模型
5. `apps/api/src/modules/listing/listing.service.ts`：接入 14 步 DAG、视觉事实持久化与复用逻辑、关键词导入支持
6. `apps/api/src/modules/listing/listing.controller.ts`：新增/扩充视觉提取、关键词上传、Rufus Q&A 解析与生成端点
7. `apps/api/src/modules/creative/creative.service.ts`：接受 `ListingCreativeBrief` 作为输入源
8. `apps/api/src/modules/eval/eval.service.ts`：增补 Listing Intelligence 专项评测用例
9. `scripts/run-evals.cjs`：增补金标回归测试断言
10. `apps/web/src/app/app/listings/page.tsx`：升级前端 Listing Studio V2 交互界面（多模态图片、关键词库、Rufus Q&A、三层证据展示、A+ 与素材工坊联动）

---

## 5. V8/V9 零回归风险与防御验证策略

1. **API 兼容性防御**：
   - 现有的 `GET /api/v1/listings/sku/:skuId` 和 `POST /api/v1/listings/generate` 请求体与响应结构保持完全向后兼容；原有调用方所依赖的 `title`, `bulletPoints`, `description`, `searchTerms`, `claims`, `compliance` 字段继续原样提供，新增属性为可选增量。
2. **合规审查（Compliance Judge）零污染**：
   - 保留现有的 4 条刚性审查规则与 `evaluateListing` 函数签名，确保 Milestone 4 和 Milestone 8 的所有历史测试无缝通过。
3. **视觉分析防重复机制**：
   - 在 `ProductVisualFact` 查询层建立 SKU/Product 检查拦截：若当前 Product 存在未过期的 Visual Facts 且用户未主动传递 `forceRefresh: true`，直接从数据库读取，日志标记 `VISUAL_FACTS_CACHE_HIT`，绝不调用视觉模型。
4. **全量门禁检查**：
   - 每次代码变更后严格运行：
     - `pnpm -r typecheck`（10 个 package 0 错误）
     - `pnpm test`（所有单元测试全绿）
     - `pnpm test:eval`（金标评测集 100% PASS）
     - `pnpm build`（Next.js 与 NestJS 构建全绿）
   - 云端部署后执行在线健康探针与热重载。
