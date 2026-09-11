# CrossPilot V9 通用 Integration Provider Framework 实施报告与真实性审计

> **日期**: 2026-09-11  
> **实施状态声明**:  
> - **Generic Provider Framework**: `IMPLEMENTED`  
> - **Generic MCP Runtime**: `IMPLEMENTED`  
> - **Mock Provider Fallback**: `VERIFIED`  
> - **XYDC Provider Skeleton**: `IMPLEMENTED`  
> - **XYDC Authentication**: `PENDING` (未提供凭证)  
> - **XYDC MCP Discovery**: `PENDING` (未执行真实 tools/list)  
> - **XYDC Capability Mapping**: `PENDING REAL DISCOVERY` (当前为 PROVISIONAL 占位符)  
> - **XYDC Live Tool Call**: `PENDING` (未执行真实 tools/call)  
> - **XYDC Real Data**: `PENDING` (未接收真实三方数据)  

---

## 一、真实性审计核心结论 (Reality Audit Verdict)

本轮增量开发的核心目标是**构建通用的 Integration Provider Framework**，并为首个真实三方 MCP Provider（西柚洞察 XYDC）搭建适配器骨架与映射层。

**审计确认的关键事实**：
1. **未曾建立真实 XYDC MCP 连接**：开发与测试环境中从未配置过真实的 `XYDC_MCP_ENDPOINT` 与 `XYDC_MCP_TOKEN`。
2. **未曾获取真实 tools/list 与 Schema**：所有 `PROVISIONAL_xydc_*` 远程工具名称和字段均为框架骨架开发阶段预设的**临时占位符 (Provisional Placeholder)**，绝非来自真实 MCP 探测结果。
3. **真实运行全部由 MockMarketProvider 兜底完成**：控制台与接口实测结果 `provider=mock`、`transport=NATIVE`、`mode=DEGRADED`，100% 证实当前仅跑通了**从 CrossPilot Tool 到网关、再到 Mock 降级源**的链路。
4. **绝不可将 Mock 降级成功等同于第三方真实集成成功**。

---

## 二、当前架构完成度 (What Is Actually Implemented vs Verified)

### 1. 已实现且已验证部分 (IMPLEMENTED & VERIFIED)
- **标准契约层 (`packages/shared`)**:
  - 独立定义 `MarketProduct`、`MarketMetric`、`KeywordMetric`、`MarketTrend`、`ResearchEvidence`、`MarketOverviewSnapshot`。
  - 完全解耦业务与外部三方 DTO。
- **通用 Provider Framework (`packages/integrations`)**:
  - `ProviderRegistry`、`CapabilityBindingRegistry`、`ProviderRouter`、`IntegrationGateway`。
  - 优先级决断（Primary vs Fallback）、故障自动熔断与转移。
- **确定性降级源 (`MockMarketProvider`)**:
  - 覆盖 5 大标准能力，提供高拟真结构化数据。
- **凭据脱敏保护 (`SecretProvider`)**:
  - 环境变量隔离、全局递归正则脱敏，单元测试 100% 验证通过。
- **5 大市场标准工具 (`packages/tool-platform`)**:
  - `market.product.search`、`market.product.detail`、`market.market.overview`、`market.keyword.search`、`market.product.trend`。
- **API 与前端展示层联动 (`apps/api` + `apps/web`)**:
  - `MarketService` / `MarketController` 统一经由网关查询。
  - 前端 `/app/market-research` 增加通道状态卡片与事实凭证链展示。

### 2. 已实现但待真实环境验证部分 (IMPLEMENTED BUT NOT VERIFIED)
- **通用 MCP 传输层运行时 (`packages/integrations/src/provider-framework/transports/mcp/`)**:
  - `McpClient` (JSON-RPC 2.0)、`McpConnectionManager`、`McpExecutor`、`McpDiscovery` 代码已就绪，具备超时控制与错误重试逻辑。
  - 状态：**代码已实现，待连接真实 MCP Server 验证**。
- **XYDC Provider 骨架 (`packages/integrations/src/provider-framework/providers/xydc/`)**:
  - `XydcProvider` 类与 `XydcMapper` 映射器骨架已就绪。
  - 状态：**代码已实现，待真实工具名与报文校准**。

### 3. 待办与未验证部分 (PENDING / UNVERIFIED)
- **XYDC MCP Authentication**: 未配置 Token 与 Endpoint。
- **XYDC tools/list Discovery**: 未获取官方工具清单。
- **XYDC Schema & Mapping Alignment**: 待对齐真实请求/响应 Schema。
- **XYDC Live tools/call**: 未产生真实调用。
- **XYDC Live Data & Mode**: 生产端到端未产生 `mode: LIVE` 或 `provider: xydc` 记录。

---

## 三、硬编码占位符检查与隔离保护

在 `packages/integrations/src/provider-framework/providers/xydc/xydc.config.ts` 中定义的 5 个远程工具名称已全面重命名并标注为占位符：

```text
PROVISIONAL_xydc_search_products    (待真实 tools/list 替换)
PROVISIONAL_xydc_get_product_detail (待真实 tools/list 替换)
PROVISIONAL_xydc_get_market_overview(待真实 tools/list 替换)
PROVISIONAL_xydc_search_keywords    (待真实 tools/list 替换)
PROVISIONAL_xydc_get_product_trends  (待真实 tools/list 替换)
```

**隔离审计结果**：
- 经全文检索，`apps/api`、`apps/web`、`packages/tool-platform`、`packages/domain` 中**绝对没有**引用上述任何一个占位符。
- 业务层与工作流仅依赖内部能力标识符：`market.product.search` 等。
- 架构分层完全合规，占位符仅存在于 Provider 内部配置中。

---

## 四、拿到真实凭据后的具体接入操作 (Next Steps)

1. 在服务器环境注入环境变量：
   ```bash
   export XYDC_MCP_ENDPOINT="https://<real-endpoint>/rpc"
   export XYDC_MCP_TOKEN="<real-token>"
   ```
2. 运行真实探测：
   ```bash
   node scripts/discover-xydc.cjs
   ```
3. 根据返回的 `tools/list`：
   - 将 `xydc.config.ts` 中的 `PROVISIONAL_*` 替换为真实 remoteToolName。
   - 对齐 `xydc.mapper.ts` 的入参出参字段。
4. 运行 `node scripts/test-remote-api.cjs`，验证返回结果出现：
   ```text
   Provider: xydc
   Transport: MCP
   Mode: LIVE
   ```
