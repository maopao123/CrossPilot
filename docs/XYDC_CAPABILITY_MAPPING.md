# XYDC (西柚洞察) MCP Capability Mapping & Reality Audit Report

> **Generated At**: 2026-09-11T06:49:31.172Z  
> **XYDC Credentials Configured**: `NO`  
> **Real Connection Established**: `NO (NOT VERIFIED)`  
> **Real tools/list Executed**: `NO (NOT VERIFIED)`  
> **Real Data Received**: `NO (NOT VERIFIED)`  
> **Provisional Bindings Status**: `PENDING_REAL_DISCOVERY`  
> **Mock Fallback Verified**: `YES (MockMarketProvider is active and tested)`  

---

## 1. 真实性审计结论 (Reality Audit Verdict)

当前环境中：
- **未配置真实 XYDC_MCP_TOKEN 与 XYDC_MCP_ENDPOINT**。
- **未曾建立过与西柚洞察官方 MCP 服务器的真实网络连接**。
- **未曾执行过真实 MCP `tools/list` 或 `tools/call`**。
- **未曾接收过任何来自西柚洞察的真实业务数据**。
- 当前系统运行的完整链路是：
  ```text
  CrossPilot Tool (market.*)
  → Integration Gateway
  → Provider Router
  → MockMarketProvider (确定性降级仿真源)
  ```
- 验证通过的内容仅为：**通用 Provider Framework 架构、MCP 通用客户端与运行时代码、MockMarketProvider 降级机制、以及凭据脱敏保护**。

---

## 2. 5 大能力绑定真实状态 (Provisional vs Verified)

所有三方远程工具名称均为开发 Framework 阶段定义的**临时占位符 (Provisional Placeholder)**，严格禁止作为已确认事实：

| 序号 | CrossPilot 标准内部能力 ID | 临时占位工具名 (PROVISIONAL) | 真实 tools/list 验证状态 | 真实 Schema 状态 | 当前实际执行通道 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `market.product.search` | `PROVISIONAL_xydc_search_products` | **NOT VERIFIED** | **NOT VERIFIED** | `MockMarketProvider.products` |
| 2 | `market.product.detail` | `PROVISIONAL_xydc_get_product_detail` | **NOT VERIFIED** | **NOT VERIFIED** | `MockMarketProvider.product` |
| 3 | `market.market.overview` | `PROVISIONAL_xydc_get_market_overview` | **NOT VERIFIED** | **NOT VERIFIED** | `MockMarketProvider.overview` |
| 4 | `market.keyword.search` | `PROVISIONAL_xydc_search_keywords` | **NOT VERIFIED** | **NOT VERIFIED** | `MockMarketProvider.keywords` |
| 5 | `market.product.trend` | `PROVISIONAL_xydc_get_product_trends` | **NOT VERIFIED** | **NOT VERIFIED** | `MockMarketProvider.trend` |

---

## 3. 现场审计原始记录

```json
{
  "realConnectionEstablished": "NO (NOT VERIFIED)",
  "realToolsListExecuted": "NO (NOT VERIFIED)",
  "realToolsDiscovered": [],
  "realDataReceived": "NO (NOT VERIFIED)",
  "provisionalBindingsStatus": "PENDING_REAL_DISCOVERY",
  "runtimeFallbackVerified": "YES (MockMarketProvider is active and tested)",
  "note": "Credentials are not configured in current development environment. All remote XYDC capabilities remain unverified pending actual MCP authentication and tools/list discovery."
}
```

---

## 4. 后续拿到真实凭证后的接水步骤 (Next Steps)

一旦获得真实 `XYDC_MCP_ENDPOINT` 与 `XYDC_MCP_TOKEN`：
1. 注入环境变量：`XYDC_MCP_ENDPOINT` / `XYDC_MCP_TOKEN`。
2. 运行探测脚本：`node scripts/discover-xydc.cjs`，执行真实 MCP `tools/list`。
3. 获取真实 remote tool names 与 inputSchema。
4. 将 `xydc.config.ts` 中的 `PROVISIONAL_*` 替换为真实远程工具名。
5. 校准 `xydc.mapper.ts` 对齐真实返回结构。
6. 发起真实 `tools/call` 验证，观察 `mode: LIVE` 与 `providerId: xydc`。
