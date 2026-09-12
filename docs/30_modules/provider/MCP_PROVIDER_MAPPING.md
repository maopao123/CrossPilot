# CrossPilot V9 Integration Provider Framework & XYDC Mapping Report

> **文档性质：代码审查基线与实施映射资产**  
> **文档位置：`docs/30_modules/provider/MCP_PROVIDER_MAPPING.md`**  
> **实施原则：严格遵循《CrossPilot V9 FINAL》（Single Source of Truth）与《CrossPilot V9 增量方案：通用 Provider Framework + XYDC 首接》**

---

## 1. 扫描目标与执行概述

本映射报告旨在针对当前已上线的 CrossPilot V9 代码库进行无损扫描，明确现有业务资产、工具平台、执行器、数据流与认证机制，为在不破坏现有业务的前提下构建**通用 Integration Provider Framework** 及接入 **XYDC（西柚洞察）作为第一个真实 MCP Provider** 制定最小侵入式实施路径。

---

## 2. 17 项核心架构调研问答

### Q1: 当前 Tool Platform 在哪里？
- **代码位置**：`packages/tool-platform/`
- **模块结构**：
  - `src/contracts/tool.types.ts`：定义了 `ToolDefinition`, `ToolCategory`, `ToolExecutionContext`, `ToolExecutionResult`, `ToolError`, `ToolInputSchema` 等平台级契约。
  - `src/registry/tool.registry.ts`：提供了确定性的 `ToolRegistry`，支持根据 `id`、`category` 检索工具及提取工具元数据。
  - `src/executor/tool.executor.ts`：提供了标准的 `ToolExecutor`，内置权限校验（Permission）、入参模式校验（Schema Validation）、超时熔断控制（Timeout Limit）、TraceId 生成与执行耗时计量。
  - `src/tools/`：汇集了现有 10+ 业务工具（包括财务核算、Listing 合规质检、搜索词分析、竞价调整、补货计算、归因瀑布、素材工坊、运营自动化及视觉事实提取工具）。

### Q2: Tool Registry 在哪里？
- **代码位置**：`packages/tool-platform/src/registry/tool.registry.ts`
- **宿主实例化**：`apps/api/src/modules/tool-center/tool-center.service.ts` 的构造函数中通过 `createDefaultToolRegistry()` 实例化，并在全局单例中维护。
- **HTTP 接口**：`apps/api/src/modules/tool-center/tool-center.controller.ts` 暴露了 `/api/v1/tools` 与 `/api/v1/tools/:id` 供前端与 AI Agent 发现工具。

### Q3: Tool Executor 在哪里？
- **代码位置**：`packages/tool-platform/src/executor/tool.executor.ts`
- **执行宿主**：`apps/api/src/modules/tool-center/tool-center.service.ts` 中的 `executeTool(...)`。
- **调用流转**：前端手动调用、AI 决策调度、Workflow 编排均通过 `ToolExecutor.execute` 统一执行，并将执行记录同步至内存队列及 PostgreSQL `tool_executions` 数据表。

### Q4: Product Research 当前调用什么数据？
- **当前前端**：`apps/web/src/app/app/market-research/page.tsx`
- **API 端点**：
  - `/api/v1/market-research/snapshot` (`MarketService.getMarketSnapshot`)
  - `/api/v1/product-opportunities` (`MarketService.getProductOpportunities`)
  - `/api/v1/competitors` (`MarketService.getCompetitors`)
  - `/api/v1/voc/topics` (`MarketService.getVocTopics`)
- **底层数据链路**：当前直接查询 PostgreSQL Prisma 模型（`MarketResearchProject`, `MarketMetricsSnapshot`, `Competitor`, `ProductOpportunity` 等）。当数据库中无相关记录时，返回硬编码的大理石牙刷架 `defaultMarket` 对象。**目前尚未对接任何外部真实公网数据源或 MCP Provider。**

### Q5: Mock / Seed 从哪里进入？
- **静态种子数据**：`packages/db/prisma/seed.ts`，在执行 `pnpm seed` 时直接向 PostgreSQL 写入标杆商品（大理石牙刷架）、3 个变体 SKU、2 家真实竞品（`LuxStone Home`、`KES Home`）及 90 天完整损益/库存快照。
- **动态模拟生成**：`packages/domain/src/scenario/scenario-generator.ts`（`ScenarioGeneratorService.generate90Days()`），在 `/api/v1/scenario/reset-demo` 时动态生成或重置。
- **服务层缺省回退**：`MarketService.getMarketSnapshot` 中的局部静态对象。

### Q6: 目前是否已有 Provider / Adapter 抽象？
- **局部已有**：
  - `packages/integrations/src/rpa/` 已经实现基于 Adapter 模式的 `RpaAdapter` 接口、`MockRpaAdapter`、`YingdaoRpaAdapter` 与 `RpaRegistry`。
  - `packages/integrations/src/vector/` 实现了 `VectorStore` 与 `MilvusVectorStore` 抽象。
- **平台级缺失**：尚未建立跨 `MCP`、`HTTP`、`NATIVE`、`RPA` 的统一 `IntegrationProviderDefinition`、`CapabilityBinding`、`ProviderRegistry`、`ProviderRouter` 与 `IntegrationGateway`。

### Q7: 目前是否已经有 MCP Client？
- **否**。当前代码库尚未包含任何通用 MCP Client，也没有安装 `@modelcontextprotocol/sdk`。需要建立纯轻量、无外部重依赖的通用 MCP Runtime。

### Q8: Mastra MCP 能力是否已经使用？
- **否**。方案总纲中提及了 Mastra 作为技术选型参考，但在 CrossPilot V8/V9 代码实现中，为了极致性能与纯粹的确定性控制，全 Monorepo 均采用 TypeScript Native 架构，没有引入 Mastra 外部运行时。本次改造严格延续 Native 架构，不引入臃肿依赖。

### Q9: 当前 Trace 怎么记录 Tool Call？
- **数据库持久化**：Prisma 模型 `ToolExecution`（映射至 PostgreSQL 表 `tool_executions`），记录 `id`, `taskId`, `agentStepId`, `toolName`, `inputJson`, `outputJson`, `status`, `latencyMs`, `errorMessage`, `createdAt`。
- **业务任务串联**：通过 `AgentTask` -> `AgentStep` -> `ToolExecution` 级联关联。
- **运行时内存审计**：`ToolCenterService.recentExecutions` 缓存最近 50 次执行记录（含 `traceId`, `toolId`, `toolName`, `durationMs`, `cost`, `source`）。

### Q10: 当前 Secret 如何加载？
- **现状**：散落在各模块通过 `process.env` 获取环境变量（如 `DATABASE_URL`, `JWT_SECRET`, `REDIS_HOST` 等）。
- **改造要求**：禁止业务代码或工具层直接调用 `process.env.XYDC_MCP_TOKEN`。统一由 `SecretProvider` -> `ProviderConfigService` 提供受管访问，并对所有输出进行脱敏处理。

### Q11: 当前 Error Contract 是什么？
- **Tool 内部错误标准**：`ToolError { code: string; message: string; retryable?: boolean; details?: any; }`
- **规范错误码**：`TOOL_NOT_FOUND`, `PERMISSION_DENIED`, `VALIDATION_ERROR`, `TIMEOUT`, `EXECUTION_ERROR`。
- **本轮扩充**：规范化映射 Provider 异常错误码（如 `PROVIDER_AUTH_ERROR`, `PROVIDER_TIMEOUT`, `PROVIDER_RATE_LIMIT`, `PROVIDER_UNAVAILABLE`, `PROVIDER_TOOL_NOT_FOUND`, `PROVIDER_SCHEMA_MISMATCH`, `PROVIDER_INVALID_RESPONSE`, `PROVIDER_MAPPING_ERROR`）。

### Q12: 哪些现有代码可以直接复用？
- `packages/tool-platform/`:
  - `ToolDefinition`, `ToolRegistry`, `ToolExecutor` 契约与逻辑 100% 复用。
  - 所有现有 10+ 工具继续正常工作。
- `packages/integrations/`:
  - 现有的 `redis/`, `vector/`, `rpa/` 模块 100% 保持不动。
- `apps/api/src/modules/tool-center/`:
  - `ToolCenterService` 维持上层工具注册与执行中心定位。
- `packages/db/prisma/schema.prisma`:
  - 复用 `MarketResearchProject`, `MarketMetricsSnapshot`, `Competitor`, `ProductOpportunity`, `ToolExecution`。

### Q13: 哪些文件需要修改？
1. `packages/tool-platform/src/index.ts`：导出新增的 Market Tools。
2. `packages/tool-platform/src/tools/default-tools.ts`：注册 5 大稳定 Market Tools。
3. `packages/integrations/src/index.ts`：导出 Provider Framework 与 MCP Runtime。
4. `apps/api/src/modules/market/market.service.ts`：重构数据入口，优先通过 Tool Platform 调度，支持 Evidence 证据构建与 Mock 降级。
5. `apps/api/src/modules/market/market.controller.ts`：扩展数据源状态与 Evidence 查询接口。
6. `apps/web/src/app/app/market-research/page.tsx`：增加数据源卡片（显示西柚洞察、LIVE/MOCK 模式、更新时间与证据列表）。

### Q14: 哪些文件需要新增？
- **通用 Provider Framework**（`packages/integrations/src/provider-framework/`）：
  - `core/provider.types.ts`
  - `core/provider-registry.ts`
  - `core/capability-binding.registry.ts`
  - `core/provider-router.ts`
  - `core/integration-gateway.ts`
  - `secrets/secret-provider.ts`
- **通用 MCP Runtime**（`packages/integrations/src/provider-framework/transports/mcp/`）：
  - `mcp.types.ts`
  - `mcp-client.ts`
  - `mcp-connection-manager.ts`
  - `mcp-executor.ts`
  - `mcp-discovery.ts`
- **标准数据契约**（`packages/shared/src/contracts/research-contracts.ts`）：
  - `MarketProduct`, `MarketMetric`, `KeywordMetric`, `MarketTrend`, `ResearchEvidence`
- **XYDC Provider 实现**（`packages/integrations/src/provider-framework/providers/xydc/`）：
  - `xydc.config.ts`, `xydc.types.ts`, `xydc.mapper.ts`, `xydc.provider.ts`
- **Mock Provider 实现**（`packages/integrations/src/provider-framework/providers/mock/`）：
  - `mock-market.provider.ts`
- **稳定 CrossPilot Market Tools**（`packages/tool-platform/src/tools/market/`）：
  - `market-product-search.tool.ts`
  - `market-product-detail.tool.ts`
  - `market-market-overview.tool.ts`
  - `market-keyword-search.tool.ts`
  - `market-product-trend.tool.ts`
- **工程资产文档**：
  - `docs/30_modules/provider/MCP_PROVIDER_MAPPING.md`（本文档）
  - `docs/30_modules/provider/XYDC_CAPABILITY_MAPPING.md`
  - `docs/30_modules/provider/MCP_PROVIDER_IMPLEMENTATION_REPORT.md`

### Q15: 是否真的需要数据库 Migration？
- **明确结论：不需要进行破坏性数据库迁移！**
- **理由**：
  1. 现有 `tool_executions` 表的 `inputJson` 与 `outputJson` 字段天然具备非结构化扩展能力，能够无损记录 `providerId`, `transport`, `remoteToolName`, `fallbackUsed`, `mode` 等执行溯源字段。
  2. 现有 `MarketResearchProject`, `MarketMetricsSnapshot`, `Competitor`, `ProductOpportunity` 业务表已能满足归一化数据的快照存储与展示。
  3. Provider 基础配置与 Capability Binding 在首期采用 Code-as-Config 管理，既轻量又便于多环境维护。

### Q16: 最小侵入式实现路径是什么？
```text
Phase 0: Mapping 审计定界（docs/30_modules/provider/MCP_PROVIDER_MAPPING.md）
   ↓
Phase 1: Provider Framework 核心骨架（Core + Router + Registry + Gateway）
   ↓
Phase 2: 通用轻量 MCP Runtime（Client + ConnectionManager + Executor + Discovery）
   ↓
Phase 3: XYDC 真实 Discovery 探测与映射（docs/30_modules/provider/XYDC_CAPABILITY_MAPPING.md）
   ↓
Phase 4: 标准化 Contract 与 XydcMapper 数据转换
   ↓
Phase 5: 接入 Tool Platform（注册 5 大稳定 CrossPilot Market Tools）
   ↓
Phase 6: 增量切入 Product Research（优先 Live XYDC，故障 Fallback 到 Mock）
   ↓
Phase 7: 前端数据源与 Evidence 看板呈现（LIVE / MOCK / DEGRADED 标识）
   ↓
Phase 8: 全量质量门禁与测试回归（Unit, Contract, Integration, Regression）
```

### Q17: 有哪些 V8/V9 Regression Risk？
| 风险项 | 潜在影响 | 防御机制 |
| :--- | :--- | :--- |
| **外部网络/MCP 服务宕机** | 接口超时阻断选品分析 | 严格设置 5 秒熔断，支持 1 次重试后自动平滑 Fallback 至 Mock/快照，标记 `DEGRADED` 模式 |
| **第三方 DTO 字段污染** | 供应商字段蔓延至业务与前端 | 严格通过 `XydcMapper` 进行清洗，业务层与 Domain 仅感知标准 `MarketProduct` 等模型 |
| **敏感 Token 泄露** | 生产安全合规风险 | 封装 `SecretProvider`，在所有 Trace、日志与 Error 过滤脱敏，前端严禁获取 Token |
| **既有测试与页面回归** | 现有 17 个测试套件受损 | 遵循“扩展现有，不改旧有”原则，保留所有 Mock 数据与默认工具，运行全量回归 |

---

**Mapping 审计完成。严格按照本报告规划进入 Phase 1 框架骨架实施。**
