# CrossPilot 文档漂移与历史冲突事实审计报告
## DOCUMENT_DRIFT_REPORT.md

> **审计基准**：
> - 状态基线：`CrossPilot V9 Epic 3 — Daily Operations Intelligence` 正式发布验收并冻结 (`RELEASE VERIFIED & FROZEN`)
> - 审计时间：2026-09-12
> - 治理目标：系统性揭露从 V8 到 V9、经过 Epic 1、Epic 2、Epic 3 演进后，文档库中累积的**历史冲突、旧方案失效、同名 FINAL 泛滥、文档说 TODO 但代码已完成、文档说已完成但代码缺失**等现象。
> - **处理准则**：**本报告仅做事实揭露与标记，禁止擅自大规模修改或删除历史归档文档**。后续所有 AI 助手与团队成员在阅读历史文档时，必须以本文档的纠偏为准。

---

## 1. 核心漂移总览 (Executive Summary)

```text
┌────────────────────────────────────────────────────────────────────────┐
│ Document Drift Audit Scope: 35 Markdown Files                          │
├─────────────────────────┬───────┬──────────────────────────────────────┤
│ 漂移分类代码            │ 数量  │ 严重度与影响说明                     │
├─────────────────────────┼───────┼──────────────────────────────────────┤
│ DRIFT-01: 伪 FINAL 泛滥 │ 5 篇  │ 包含 "FINAL" 字样但已被后续事实覆盖  │
├─────────────────────────┼───────┼──────────────────────────────────────┤
│ DRIFT-02: Epic 规划漂移 │ 1 篇  │ 旧路线图与实际研发演进严重脱节       │
├─────────────────────────┼───────┼──────────────────────────────────────┤
│ DRIFT-03: 文档未更新已通│ 2 篇  │ 文档标为 TODO/未接入，但代码早已完成  │
├─────────────────────────┼───────┼──────────────────────────────────────┤
│ DRIFT-04: 宣称完成实为壳│ 2 处  │ 文档详细描述功能，但代码仅有空壳/Mock│
├─────────────────────────┼───────┼──────────────────────────────────────┤
│ DRIFT-05: 计划未标暂缓  │ 1 处  │ Epic 4 需从“推荐”更新为“SUSPENDED”   │
├─────────────────────────┼───────┼──────────────────────────────────────┤
│ DRIFT-06: 当前工作未对齐│ 1 处  │ 需明确当前正处于 V9.1 稳定化治理阶段 │
└─────────────────────────┴───────┴──────────────────────────────────────┘
```

---

## 2. 逐项深度漂移事实审查

### 2.1 [DRIFT-01] 5 篇名为“FINAL”的文档已被后续实现事实完全覆盖
历史上在 V9 整合阶段，产生了多篇文件名含 `FINAL` 或 `完整无损融合版` 的宏大设计文档（单篇均超 15~23 万字）。随着 Epic 1、Epic 2、Epic 3 的高强度迭代，这些文档中的大量设想已被更精准的模块代码和冻结基线替代：

| 涉及文档路径 | 文件大小 | 历史命名意图 | 实际代码事实与漂移分析 | 正式权威标记 |
| :--- | :---: | :--- | :--- | :---: |
| **`CrossPilot_Final_Overall_Design_V9.md`**<br>(根目录与 `docs/`) | 161 KB | V9 初始全景设计总案 | 规划了庞大的 Launch Center、Rufus 独立模块、多渠道发布等；实际代码未实现这些非核心分支，且核心业务规则已被 `PRODUCT_RESEARCH_V1_BASELINE.md` 及 `WF05_DAILY_OPERATION_WORKFLOW.md` 覆盖。 | **`SUPERSEDED`**<br>(已被实际实现覆盖) |
| **`docs/90_historical/CrossPilot_V9_FINAL_完整无损融合版_代码审查基线.md`** | 193 KB | 融合版代码审查基线 | 编写于 Epic 1 启动前；文中所述的技术债务清单（如未接 LLM、未接 Milvus）在后续已被消灭。 | **`SUPERSEDED`** |
| **`docs/90_historical/CrossPilot_V9_FINAL_完整无损融合版_含ListingIntelligence.md`** | 215 KB | ListingIntelligence 增量版 | 所述的 14-Step DAG 已在 `EPIC1_LLM_RUNTIME_LISTING_REPORT.md` 与 `EPIC2_REAL_MILVUS_RAG_REPORT.md` 中以真实代码交付。 | **`SUPERSEDED`** |
| **`docs/90_historical/CrossPilot_V9_FINAL_完整唯一总方案_含ProviderFramework_XYDC.md`** | 230 KB | 唯一总方案 (含 Provider) | 所述 Provider 框架和 XYDC 接通已被 `packages/integrations` 源码和 `MCP_PROVIDER_IMPLEMENTATION_REPORT.md` 实际交付覆盖。 | **`SUPERSEDED`** |
| **`docs/90_historical/V9_Final_跨境电商AI工作平台_增量升级开发方案.md`** | 28 KB | V9 早期立项升级方案 | 属于早期立项草案，已被后续正式实施覆盖。 | **`SUPERSEDED`** |

> **治理裁决**：
> 以上 5 篇文档**全部降级为 LEVEL 4 (SUPERSEDED / PLANNING ONLY)**。在后续 Bug Audit 中，**严禁引用上述文档中的未实现段落来质疑当前代码**！

---

### 2.2 [DRIFT-02] `CROSSPILOT_NEXT_3_EPICS.md` 的路线图与实际研发严重脱节
- **文档事实**：
  `docs/90_historical/CROSSPILOT_NEXT_3_EPICS.md`（编写于 2026-09-11）规划的核心三大 Epic 为：
  - Epic 1: 统一大模型运行时与真实 Listing 生成引擎
  - Epic 2: Milvus 真实向量知识库与三层 RAG
  - **Epic 3: 异步发布与 RPA 闭环 (BullMQ Worker + RPA / SP-API 沙箱真实刊登)**
- **实际代码事实**：
  - Epic 1 与 Epic 2 如期按计划保质交付；
  - **Epic 3 在实施中发生了重大战略转向**：经过对商业价值与核心痛点的深度研判，研发团队并未去建设高风险的“RPA 假刊登”，而是集中攻坚了**“WF-05 每日运营全景诊断链路（Operations Today + Sku360 + 因果诊断 + 推荐矩阵 + PostgreSQL 事务持久化 + OCC 并发控制 + REST/SSE）”**，并以 38 套套件 300 个测试 100% 通过完成了最终交付与冻结！
- **治理裁决**：
  `docs/90_historical/CROSSPILOT_NEXT_3_EPICS.md` 已完成其历史使命，其原定 Epic 3 计划已被实际交付的 Epic 3 事实覆盖。**该文档正式归入 LEVEL 4 (SUPERSEDED)**。

---

### 2.3 [DRIFT-03] 文档描述为“TODO / 未接入”，但代码实际早已闭环完成
在历史审查文档中记录的“缺陷”或“待办”，已在后续 Epic 中被彻底解决，但历史文档未做回写更新：

1. **`docs/90_historical/CROSSPILOT_V9_IMPLEMENTATION_AUDIT.md` 第 105 行**：
   - **文档声称**：*“Step 9 (generate_listing) 内部完全是模版字符串插值拼接，尚未接入真实 LLM API 进行动态长文本创作。”*
   - **代码事实**：在 Epic 1 中，`ListingWorkflowDagService` 已彻底重构，引入 `@crosspilot/ai` 的 `PlatformLlmRuntime`，支持 DeepSeek、OpenAI、Claude 真实多模型结构化 JSON 输出，模版拼接已被彻底废除。
2. **`docs/90_historical/CROSSPILOT_V9_IMPLEMENTATION_AUDIT.md` 第 108 行**：
   - **文档声称**：*“Step 8 标称为三层 RAG 架构，实际写死返回 4 条静态政策引用，并未向 Milvus 发起向量检索。”*
   - **代码事实**：在 Epic 2 中，`packages/integrations` 引入了真实的 `MilvusVectorStore` 2.4，`ListingWorkflowDagService` Step 8 真实执行 Top-K 向量相似度召回并注入上下文。
3. **`docs/90_historical/CROSSPILOT_V9_IMPLEMENTATION_AUDIT.md` 第 25 行**：
   - **文档声称**：*“操作自动化与行动层：底层 RPA 为 Mock 模拟，WF-05 待建。”*
   - **代码事实**：在 Epic 3（Phase 1 ~ Phase 9）中，WF-05 实现了完备的 9 步固定 DAG、Postgres 事务持久化、OCC 版本控制与 Operations Today 前端工作台。
4. **`docs/20_epics/epic3/history/EPIC3_GAP_ANALYSIS.md` 全文**：
   - **文档声称**：列举了 WF-05 从 Detector 到 UI 的 20 项能力差距。
   - **代码事实**：所有 20 项差距在 Epic 3 Phase 1~9 中均已 100% 建设完成并通过金标测试。

> **治理裁决**：
> 以上两篇文档归入 **LEVEL 3 (HISTORICAL RECORD)**。后续审计时，不得将文中提到的历史待办项重新翻出当成当前缺陷。

---

### 2.4 [DRIFT-04] 文档声称已规划/完成，但代码实际为空桩或 Mock
在早期宏大设计方案中，存在个别功能在文档中描绘详尽，但在代码库中从未开发或仅为占位：

1. **Launch Center (新品中心)**：
   - **文档描述**：`CrossPilot_Final_Overall_Design_V9.md` 规划了 `/app/launch` 新品发布全景中心；
   - **代码事实**：`packages/db/prisma/schema.prisma` 仅定义了 `LaunchPlan` 模型，全工程**无 `/app/launch` 前端页面、无对应后端 API 控制器、无领域服务**；
   - **裁决**：在 `docs/00_governance/V9_PRODUCT_CAPABILITY_MATRIX.md` 中已客观定性为 **`MISSING` (完全缺失)**。它属于已废弃的早期规划，**绝不是当前 Bug**。
2. **Creative Studio 6 大生图工具**：
   - **文档描述**：宣称支持商品白底图生成、生活场景图融合、信息图自动排版、尺寸调整与营销短视频生成；
   - **代码事实**：`packages/tool-platform/src/tools/creative-studio.tools.ts` 中这 6 个工具**100% 返回固定的 Unsplash 图片链接或内联 SVG，使用 `Math.random` 伪造种子**，未接入任何真实扩散模型（Stable Diffusion / Flux）；
   - **裁决**：已在能力矩阵中定性为 `PARTIAL`（前端卡片真实，后端算法为 Mock）。

---

### 2.5 [DRIFT-05] Epic 4 计划状态变更：从“推荐”更新为“暂缓推进 (SUSPENDED)”
- **文档现状**：
  在刚完成的 `docs/00_governance/POST_V9_PRODUCT_REVIEW.md` 中，根据商业飞轮分析，推荐了 Next Epic 为：
  *`Epic 4 — Real Store Data Ingestion & Automated Morning Operations`*。
- **最新决策事实**：
  根据用户与项目总指挥部的最新战略决议：
  > **目前没有真实 Amazon 店铺，不准备继续用模拟数据扩充 Real Store Data 功能。因此 Epic 4 正式置为 `SUSPENDED`（暂缓推进，但不废弃）**。
- **治理裁决**：
  所有后续文档在提及 Epic 4 时，统一标注状态为 **`SUSPENDED (暂缓)`**。禁止在未经许可的情况下自发启动 Epic 4 相关的代码编写。

---

### 2.6 [DRIFT-06] 当前开发阶段正式明确：CrossPilot V9.1 稳定化与体验打磨
- **当前开发重心**：
  **CrossPilot V9.1 — Product Stabilization & UX Polish**
- **核心目标**：
  1. 全站 21 个业务页面与 57 个 API 端点的全量 Functional Bug Audit；
  2. Loading / Empty / Error / Partial Data / Permission / Responsive 全状态一致性打磨；
  3. 导航与信息架构（Information Architecture）优化；
  4. 浏览器控制台清洁度治理（消灭 React Warning 与未捕获异常）。
- **红线约束**：
  **绝对不增加任何新的业务大功能，不改动已冻结的 WF-01 ~ WF-05 算法！**

---

## 3. 文档漂移治理对照总结表

| 文档名称 | 历史声明内容 | 真实代码事实 | 正式治理动作与当前权威性 |
| :--- | :--- | :--- | :--- |
| `CROSSPILOT_NEXT_3_EPICS.md` | E3 为 RPA 刊登与 BullMQ | E3 实际交付为 WF-05 每日运营智能全套 | 降级为 **LEVEL 4 (SUPERSEDED)** |
| `CrossPilot_Final_Overall_Design_V9.md` | 16 万字全景总案含 Launch/Rufus | Launch 未开发，Rufus 降级为 DTO | 降级为 **LEVEL 4 (SUPERSEDED)** |
| 各融合版/总方案 FINAL 文档 (4 篇) | 历史过渡期总方案 | 已被各模块实际代码和单项冻结基线替代 | 降级为 **LEVEL 4 (SUPERSEDED)** |
| `CROSSPILOT_V9_IMPLEMENTATION_AUDIT.md` | 记录 Listing 模版拼接、假向量 | E1 接入真实 LLM，E2 接入真实 Milvus | 归入 **LEVEL 3 (HISTORICAL RECORD)** |
| `EPIC3_GAP_ANALYSIS.md` | 记录 WF-05 20 项未建差距 | E3 Phase 1~9 20 项差距 100% 闭环 | 归入 **LEVEL 3 (HISTORICAL RECORD)** |
| `POST_V9_PRODUCT_REVIEW.md` | 推荐启动 Epic 4 真实店铺数据 | 最新战略决议 Epic 4 暂缓 (SUSPENDED) | 更新判定：**E4 暂缓，当前进入 V9.1** |
| `CURRENT_SYSTEM_AUDIT_BASELINE.md` | 整合全系统最新事实 | 汇总 12 大审查章节，与当前代码 100% 对齐 | 确立为 **LEVEL 1 (最高审计入口)** |
