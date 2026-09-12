# CrossPilot V9 Epic 2 — Real Milvus RAG for Listing Studio V2 实施与验收报告

**执行时间**: 2026-09-11  
**状态**: ✅ VERIFIED & COMPLETED  
**对应 Epic**: CrossPilot V9 Epic 2 — Real Milvus RAG for Listing Studio V2  

---

## 1. 核心验收检查单 (Mandatory Executive Checklist)

| 验收项 | 目标规范 | 实际交付状态 | 验证方式 |
| :--- | :--- | :---: | :--- |
| **Real Embedding API** | 拒绝 Mock，接入真实 OpenAI-Compatible Embedding API | **YES** | DashScope `text-embedding-v3` (1024 维)，真实网络调用通过 |
| **Real Milvus Insert** | 真实向量入库与元数据落盘 | **YES** | 5 篇权威文档 -> 10 chunks -> 10 vectors 插入 `listing_knowledge_chunks` 集合并 Flush |
| **Real Milvus Search** | 真实 Top-K 余弦相似度向量检索与标量过滤 | **YES** | Milvus HNSW Cosine Index，按 Marketplace (`AMAZON_US` / `GLOBAL`) 布尔过滤成功 |
| **Citation Traceability** | 每一条召回知识具备稳定唯一 citationId 与来源回溯 | **YES** | `K-AUTH-*` / `K-OPT-*` / `K-INT-*` 100% 回溯至 Chunk、Doc ID 及来源 |
| **WF-02 Real RAG** | Step 8 真实调用向量检索，Step 9 真正注入 LLM 上下文 | **YES** | `ListingWorkflowDagService` Step 8 真实召回 7 条分层知识，Step 9 注入 `listing.generate.v2-rag` |
| **Hardcoded RAG in Prod** | 生产主路径绝对禁止硬编码/静态假数据引用 | **NO** | 生产路径全面调用 `KnowledgeRetrievalService`，降级时显式标记 `mode: STATIC_FALLBACK` |
| **Fact Boundary Axiom** | 知识库绝不可篡改或冒充确认的产品物理事实 | **YES** | 严格执行分层公理：Product Facts > Visual Facts > Authority > Optimization > Intent > VOC |
| **Final Surface Grounding** | Epic 1.2 Claim-Level Grounding 保持完好 | **YES** | 100.0% 终态表层可验证事实支撑率，0 不支持，0 违规 |
| **Compliance Gate** | 亚马逊政策合规判定完好 | **YES** | PASS (0 违规，4/4 检查通过) |
| **Golden Test Suite** | 覆盖全部 R1~R10 用例，全单测 0 回归 | **YES** | 27 个测试套件，113 个测试用例全部 PASS，Golden Benchmark 9/9 PASS |

---

## 2. 架构设计与实施明细

### 2.1 基础设施与连接拓扑
- **Milvus 服务端**: 远端生产宿主机 `116.198.230.217:19530` 运行 Milvus Standalone v2.3.3。
- **本地桥接通道**: 本机 Windows 环境无原生 Docker，通过加密 SSH 端口转发 (`localhost:19530` $\leftrightarrow$ `116.198.230.217:19530`) 结合 `ServerAliveInterval=15` 心跳保活建立通道。
- **向量客户端**: `@zilliz/milvus2-sdk-node` (v2.6.17)，封装于 [`packages/integrations/src/vector/milvus-vector-store.ts`](file:///E:/AiSecondBrain/vault/Work/Projects/CrossPilot/packages/integrations/src/vector/milvus-vector-store.ts)，支持集合生命周期管理（Safe Release before Drop）、HNSW Cosine 索引构建、`flushSync` 强制刷盘、以及带强一致性（`consistency_level: 'Strong'`）的标量过滤搜索。

### 2.2 统一 Embedding 运行时体系
- **标准契约**: [`packages/ai/src/contracts/embedding.types.ts`](file:///E:/AiSecondBrain/vault/Work/Projects/CrossPilot/packages/ai/src/contracts/embedding.types.ts) 定义 `EmbeddingProvider` 与 `EmbeddingRuntime` 接口、`EmbeddingResult`、`BatchEmbeddingResult`、`RagError` 及错误码枚举（`EMBEDDING_AUTH_FAILED`, `EMBEDDING_RATE_LIMIT`, `EMBEDDING_TIMEOUT`, `MILVUS_CONNECTION_FAILED`, `RAG_INSUFFICIENT_KNOWLEDGE` 等）。
- **生产 Provider**: [`packages/ai/src/providers/openai-compatible-embedding.provider.ts`](file:///E:/AiSecondBrain/vault/Work/Projects/CrossPilot/packages/ai/src/providers/openai-compatible-embedding.provider.ts) 实现标准 OpenAI 兼容协议，支持批量数组输入、自适应指数退避重试（最多 3 次）、严格超时控制（默认 30s）、以及 Token 用量审计。
- **平台单例运行时**: [`packages/ai/src/runtime/embedding-runtime.ts`](file:///E:/AiSecondBrain/vault/Work/Projects/CrossPilot/packages/ai/src/runtime/embedding-runtime.ts) 提供 `PlatformEmbeddingRuntime` 单例。在缺少 API Key 时提供 Deterministic Hash 兜底，严禁 Silent Crash。

### 2.3 知识模型、分块与种子知识库
- **分层知识契约**: [`packages/shared/src/contracts/knowledge-contracts.ts`](file:///E:/AiSecondBrain/vault/Work/Projects/CrossPilot/packages/shared/src/contracts/knowledge-contracts.ts) 定义三层知识架构：
  1. `AUTHORITY`: 平台合规规则、法律监管红线、分类目政策。
  2. `OPTIMIZATION`: COSMO 常识图谱意图对齐、GEO（生成式引擎优化）、Rufus 导购推荐规则。
  3. `INTENT`: 真实买家提问习惯、隐式顾虑、意图分类。
- **智能分块服务**: [`packages/domain/src/knowledge/knowledge-chunker.service.ts`](file:///E:/AiSecondBrain/vault/Work/Projects/CrossPilot/packages/domain/src/knowledge/knowledge-chunker.service.ts) 基于 Markdown 标题与语义段落切分，维护段落完整性，注入元数据签名与版本哈希。
- **5 份真实业务种子知识**: [`packages/domain/src/knowledge/knowledge-seed-data.ts`](file:///E:/AiSecondBrain/vault/Work/Projects/CrossPilot/packages/domain/src/knowledge/knowledge-seed-data.ts)
  1. `DOC-AMZ-POL-2026-01`: 《Amazon US PDP 标题规范与政策标准》（来源：内部卖家运营手册/官方卖家中心规则，分块数：3）
  2. `DOC-AMZ-GUIDE-2026-04`: 《天然石材及台面配件真实性宣称指引》（来源：官方商品质量指南，分块数：2）
  3. `DOC-SEO-COSMO-01`: 《Amazon COSMO 算法对齐与买家意图扩展手册》（来源：COSMO 意图图谱研究，分块数：2）
  4. `DOC-GEO-RUFUS-02`: 《生成式引擎优化 (GEO) 与 AI 导购推荐实操白皮书》（来源：GEO 规范研究，分块数：2）
  5. `DOC-INT-RUFUS-01`: 《卫浴置物类目买家高频提问与意图模式》（来源：Rufus Q&A 意图语料，分块数：1）
- **入库管道**: [`packages/domain/src/knowledge/knowledge-ingestion.service.ts`](file:///E:/AiSecondBrain/vault/Work/Projects/CrossPilot/packages/domain/src/knowledge/knowledge-ingestion.service.ts) 实现幂等清理与批量 Embedding 向量入库。

### 2.4 检索服务与证据门禁 (Evidence Gate)
- **多路分层检索**: [`packages/domain/src/knowledge/knowledge-retrieval.service.ts`](file:///E:/AiSecondBrain/vault/Work/Projects/CrossPilot/packages/domain/src/knowledge/knowledge-retrieval.service.ts)
  - 动态 Top-K 配置：Authority=3, Optimization=3, Intent=2
  - 布尔过滤表达式：`knowledgeType == "${kType}" and (marketplace == "${marketplace}" or marketplace == "GLOBAL")`
  - 近重复段落前置去重（Deduplication Filter）
  - 生成格式化稳定引用 ID：`K-AUTH-001`, `K-OPT-001`, `K-INT-001`
- **证据门禁状态计算**:
  - `SUFFICIENT`: 包含有效 Authority 且包含至少一条 Optimization 或 Intent 知识。
  - `DEGRADED_PASS`: 缺失 Authority 或次级知识，降级通过但必须带告警标签。
  - `INSUFFICIENT`: 未召回任何有效知识，显式标记降级模式 `STATIC_FALLBACK`。

### 2.5 Prompt 结构与事实边界公理
- **Prompt 升级**: [`packages/ai/src/prompts/listing-generate.prompt.ts`](file:///E:/AiSecondBrain/vault/Work/Projects/CrossPilot/packages/ai/src/prompts/listing-generate.prompt.ts) 升级为 `listing.generate.v2-rag`，在 Prompt 中显式划分：
  - `[AUTHORITY KNOWLEDGE CONTEXT]`
  - `[OPTIMIZATION KNOWLEDGE CONTEXT]`
  - `[BUYER INTENT CONTEXT]`
- **事实边界绝对公理**:
  ```text
  Confirmed Product Facts > Confirmed Visual Facts > Marketplace Authority Knowledge > Optimization Knowledge > Intent Knowledge > Category VOC Observations
  ```
  Prompt 中严格申明：
  - 知识库告诉模型“怎么写以及合规限制（HOW）”；
  - 产品事实告诉模型“产品到底是什么（WHAT）”；
  - 严禁将通用知识断言（例如“大理石通常耐酸”）转化为产品特性，除非有确认的产品事实支撑；
  - 当优化建议与平台政策冲突时，政策权威知识具有绝对否决权。

---

## 3. 10 个 Golden Cases (R1 ~ R10) 验收结果

完整测试位于 [`packages/domain/test/listing-rag-golden-cases.spec.ts`](file:///E:/AiSecondBrain/vault/Work/Projects/CrossPilot/packages/domain/test/listing-rag-golden-cases.spec.ts)，10/10 全部通过：

| Case 编号 | 测试用例名称 | 核心验证逻辑 | 执行结果 |
| :---: | :--- | :--- | :---: |
| **Case R1** | Authority Retrieval Prioritization | 检索必须优先召回监管政策与平台规范，返回 `K-AUTH-*` 稳定引用 | ✅ PASS |
| **Case R2** | Strict Marketplace Policy Filtering | 当站点为 `AMAZON_US` 时，非当前站点（如 `AMAZON_JP`）的政策被严格过滤排除 | ✅ PASS |
| **Case R3** | Optimization & Intent Context Ingestion | 召回结果中包含 COSMO 意图对齐与 Rufus 买家高频疑问知识 | ✅ PASS |
| **Case R4** | Insufficient Knowledge Degradation Gate | 当检索不到任何知识时，证据门禁判定为 `INSUFFICIENT`，进入控制回退 | ✅ PASS |
| **Case R5** | Milvus Network Failure Graceful Fallback | 当 Milvus 连接异常时，捕获异常并不崩溃，平滑降级为 `STATIC_FALLBACK` | ✅ PASS |
| **Case R6** | Duplicate Chunk Suppression Filter | 近重复语义分块被去重过滤器拦截，`dedupedCount >= 1`，保证上下文高效 | ✅ PASS |
| **Case R7** | Complete Citation Lineage Traceability | 每一条召回知识具备明确的 chunkId、documentId、title 与来源追溯 | ✅ PASS |
| **Case R8** | Fact Boundary: Knowledge Cannot Invent Product Fact | 知识库提及的通用耐用性断言，在无产品事实支撑时无法通过事实支撑性校验 | ✅ PASS |
| **Case R9** | Priority Axiom: Authority Overrules Optimization | 当 SEO 建议冗长标题时，权威政策 200 字符上限规则具备最高否决权 | ✅ PASS |
| **Case R10** | End-to-End WF-02 DAG Assembly with RAG Context | WF-02 完整 14 步 DAG 执行，Step 8 真实召回并把分层知识打包进入 ListingDraft | ✅ PASS |

---

## 4. 真实端到端 Live 验证记录

### 4.1 独立 Milvus 向量入库与召回验证 (`scripts/verify-real-milvus-rag.ts`)
- **执行命令**: `.\apps\web\node_modules\.bin\tsx.cmd scripts/verify-real-milvus-rag.ts`
- **执行结果**:
  ```text
  --- Step 1: Rebuilding Knowledge Index & Ingesting Seed Documents ---
  [INGESTED] DOC-AMZ-POL-2026-01 | Chunks: 3, Vectors: 3, Dim: 1024
  [INGESTED] DOC-AMZ-GUIDE-2026-04 | Chunks: 2, Vectors: 2, Dim: 1024
  [INGESTED] DOC-SEO-COSMO-01 | Chunks: 2, Vectors: 2, Dim: 1024
  [INGESTED] DOC-GEO-RUFUS-02 | Chunks: 2, Vectors: 2, Dim: 1024
  [INGESTED] DOC-INT-RUFUS-01 | Chunks: 1, Vectors: 1, Dim: 1024
  Total Documents: 5, Total Chunks: 10, Total Vectors: 10, Dim: 1024

  --- Step 2: Query A (Authority Focus) ---
  Mode: LIVE | Gate: SUFFICIENT | Top Hit: K-AUTH-001 (Score: 0.6241) Doc: DOC-AMZ-POL-2026-01

  --- Step 3: Query B (Optimization Focus) ---
  Mode: LIVE | Gate: SUFFICIENT | Top Hit: K-OPT-001 (Score: 0.6844) Doc: DOC-SEO-COSMO-01

  --- Step 4: Query C (Intent Focus) ---
  Mode: LIVE | Gate: SUFFICIENT | Top Hit: K-INT-001 (Score: 0.6971) Doc: DOC-INT-RUFUS-01

  --- Step 5: Citation Lineage Verification ---
  Lineage 100% Validated. 0 Orphan Citations.
  ```

### 4.2 真实模型与真实 RAG 全链路 Listing 生成验证 (`scripts/verify-live-llm-listing.ts`)
- **执行环境**: DeepSeek API (`deepseek-chat`) + DashScope API (`text-embedding-v3`) + 生产 Milvus v2.3.3。
- **执行结果**:
  ```text
  Step 1 [validate_input]: Input validated (0ms)
  Step 2 [load_product_facts]: Loaded 5 features (0ms)
  Step 3 [load_or_extract_visual_facts]: Visual facts ready (0ms)
  Step 4 [load_voc]: Loaded 3 VOC pain-point & praise vectors (0ms)
  Step 5 [load_keywords]: Loaded 3 normalized target keywords (0ms)
  Step 6 [load_rufus_qa]: Loaded 2 Rufus Q&A intent context items (0ms)
  Step 7 [load_marketplace_profile]: Profile loaded for AMAZON_US (0ms)
  Step 8 [retrieve_listing_knowledge]: Retrieved 7 knowledge chunks via LIVE (Gate: SUFFICIENT, Auth: 3, Opt: 3, Intent: 1) (2264ms)
  Step 9 [generate_listing]: Listing copy generated via LLM Runtime (deepseek-chat, 4621ms, 3498 tokens) (4624ms)
  Step 10 [structured_output_validation]: Zod/Contract validation passed: Title (167 chars <= 200) (0ms)
  Step 11 [product_fact_grounding]: Surface Claim Entailment Grounding: 100.0% (Declared: 5/5, Surface: 16/16 verifiable supported, 0 partial, 0 unsupported, 1 repaired, postRepairRescan=true) (12ms)
  Step 12 [keyword_coverage_check]: Keyword Coverage: 100.0% (3/3), Unused High-Priority: 0 (0ms)
  Step 13 [compliance]: Amazon Policy Judge: PASS (Violations: 0, Passed: 4/4) (1ms)
  Step 14 [human_review]: Human Review Gate activated. Status: WAITING_APPROVAL for publish (Mode: AI) (0ms)

  ✅ Epic 2 Real Milvus RAG Quality Assertions Passed (Mode: LIVE, Gate: SUFFICIENT, Citations Valid)
  🎉 LIVE VERIFICATION SUCCESSFUL: Epic 2 Real Milvus RAG is 100% OPERATIONAL
  ```

---

## 5. 质量保证与回归防护

1. **单测套件全绿**: `pnpm test`
   - 全工作区 27 个测试套件，113 个单测全部通过。
   - `packages/domain`: 15 个套件，66 个测试用例全部 PASS（包含 Epic 1.1/1.2 事实支撑性测试与 Epic 2 R1~R10 RAG 黄金用例）。
   - `apps/api`: 6 个套件，25 个集成测试全部 PASS。
2. **基准回归全绿**: `node scripts/run-evals.cjs`
   - 9/9 核心业务用例（合规、财务瀑布流、广告否定词、库存补货、PO 状态机、Listing DAG、市场配置）100% 通过。
3. **前端生产构建通过**: `pnpm --filter @crosspilot/web run build`
   - Next.js 14 编译完成，22/22 个静态页面与路由成功生成，0 类型错误。

---

## 6. 关键交付文件索引

- **数据契约**:
  - [`packages/shared/src/contracts/knowledge-contracts.ts`](file:///E:/AiSecondBrain/vault/Work/Projects/CrossPilot/packages/shared/src/contracts/knowledge-contracts.ts)
  - [`packages/shared/src/contracts/research-contracts.ts`](file:///E:/AiSecondBrain/vault/Work/Projects/CrossPilot/packages/shared/src/contracts/research-contracts.ts)
  - [`packages/domain/src/listing/listing.types.ts`](file:///E:/AiSecondBrain/vault/Work/Projects/CrossPilot/packages/domain/src/listing/listing.types.ts)
- **AI 运行时与 Prompt**:
  - [`packages/ai/src/contracts/embedding.types.ts`](file:///E:/AiSecondBrain/vault/Work/Projects/CrossPilot/packages/ai/src/contracts/embedding.types.ts)
  - [`packages/ai/src/providers/openai-compatible-embedding.provider.ts`](file:///E:/AiSecondBrain/vault/Work/Projects/CrossPilot/packages/ai/src/providers/openai-compatible-embedding.provider.ts)
  - [`packages/ai/src/runtime/embedding-runtime.ts`](file:///E:/AiSecondBrain/vault/Work/Projects/CrossPilot/packages/ai/src/runtime/embedding-runtime.ts)
  - [`packages/ai/src/prompts/listing-generate.prompt.ts`](file:///E:/AiSecondBrain/vault/Work/Projects/CrossPilot/packages/ai/src/prompts/listing-generate.prompt.ts)
- **向量数据库与知识领域服务**:
  - [`packages/integrations/src/vector/milvus-vector-store.ts`](file:///E:/AiSecondBrain/vault/Work/Projects/CrossPilot/packages/integrations/src/vector/milvus-vector-store.ts)
  - [`packages/domain/src/knowledge/knowledge-chunker.service.ts`](file:///E:/AiSecondBrain/vault/Work/Projects/CrossPilot/packages/domain/src/knowledge/knowledge-chunker.service.ts)
  - [`packages/domain/src/knowledge/knowledge-seed-data.ts`](file:///E:/AiSecondBrain/vault/Work/Projects/CrossPilot/packages/domain/src/knowledge/knowledge-seed-data.ts)
  - [`packages/domain/src/knowledge/knowledge-ingestion.service.ts`](file:///E:/AiSecondBrain/vault/Work/Projects/CrossPilot/packages/domain/src/knowledge/knowledge-ingestion.service.ts)
  - [`packages/domain/src/knowledge/knowledge-retrieval.service.ts`](file:///E:/AiSecondBrain/vault/Work/Projects/CrossPilot/packages/domain/src/knowledge/knowledge-retrieval.service.ts)
  - [`packages/domain/src/listing/listing-workflow-dag.service.ts`](file:///E:/AiSecondBrain/vault/Work/Projects/CrossPilot/packages/domain/src/listing/listing-workflow-dag.service.ts)
- **测试与验证脚本**:
  - [`packages/domain/test/listing-rag-golden-cases.spec.ts`](file:///E:/AiSecondBrain/vault/Work/Projects/CrossPilot/packages/domain/test/listing-rag-golden-cases.spec.ts)
  - [`scripts/verify-real-milvus-rag.ts`](file:///E:/AiSecondBrain/vault/Work/Projects/CrossPilot/scripts/verify-real-milvus-rag.ts)
  - [`scripts/verify-live-llm-listing.ts`](file:///E:/AiSecondBrain/vault/Work/Projects/CrossPilot/scripts/verify-live-llm-listing.ts)

---

## 7. 结论与冻结声明

CrossPilot V9 Epic 2（Real Milvus RAG for Listing Studio V2）已全量实施完毕。Listing Studio V2 的知识召回节点已彻底脱离 Mock 阶段，进入由真实 DashScope Embedding 驱动、生产级 Milvus HNSW 索引支撑、具有严密分层引用追踪与绝对事实边界防护的工业化 RAG 架构。

按照工作原则，在此宣布 **Epic 2 验证完毕并正式冻结**。不进入 Epic 3，等待下一步指示。
