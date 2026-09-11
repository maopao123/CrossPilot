# XYDC (西柚洞察) MCP Capability Mapping & Discovery Report

> **Generated At**: 2026-09-11T06:36:19.824Z  
> **Environment Status**: `OFFLINE / NOT CONFIGURED`  
> **Provider Framework Mode**: `MOCK`  

---

## 1. 架构定位与隔离保证

按照《CrossPilot V9 FINAL 完整唯一总方案》与《CrossPilot V9 增量方案：通用 Provider Framework & XYDC 首接》要求：
1. **零污染保证**：XYDC 仅作为外部数据集成 Provider，其私有 DTO、RPC 协议和供应商语义严格隔离在 `@crosspilot/integrations` 内部。
2. **标准契约映射**：所有数据经过 `XydcMapper` 统一映射为 CrossPilot 标准结构：
   - `MarketProduct`
   - `MarketMetric`
   - `KeywordMetric`
   - `MarketTrend`
   - `ResearchEvidence`
3. **确定性降级保证**：当 XYDC 未配置密钥、网络离线或限流时，`IntegrationGateway` 自动路由至 `MockMarketProvider`，返回标准 Mock 样本数据，模式标记为 `MOCK` / `DEGRADED`，保障业务链路永不中断。

---

## 2. 核心 5 大能力映射矩阵 (Capability Bindings)

| 序号 | CrossPilot 标准能力 ID | 对应 CrossPilot 工具 | 映射 XYDC 远程工具名 | 传输方式 | 目标标准化契约 | 降级机制 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `market.product.search` | `market.product.search` | `xydc_search_products` | MCP | `MarketProduct[]` | `MockMarketProvider.products` |
| 2 | `market.product.detail` | `market.product.detail` | `xydc_get_product_detail` | MCP | `MarketProduct` | `MockMarketProvider.product` |
| 3 | `market.market.overview` | `market.market.overview` | `xydc_get_market_overview` | MCP | `MarketOverviewSnapshot` | `MockMarketProvider.overview` |
| 4 | `market.keyword.search` | `market.keyword.search` | `xydc_get_keyword_metrics` | MCP | `KeywordMetric[]` | `MockMarketProvider.keywords` |
| 5 | `market.product.trend` | `market.product.trend` | `xydc_get_product_trend` | MCP | `MarketTrend` | `MockMarketProvider.trend` |

---

## 3. 现场探测结果

```json
{
  "status": "OFFLINE / NOT CONFIGURED",
  "mode": "MOCK",
  "tools": [
    {
      "name": "market.product.search",
      "mapping": "xydc_search_products",
      "status": "MOCK_READY"
    },
    {
      "name": "market.product.detail",
      "mapping": "xydc_get_product_detail",
      "status": "MOCK_READY"
    },
    {
      "name": "market.market.overview",
      "mapping": "xydc_get_market_overview",
      "status": "MOCK_READY"
    },
    {
      "name": "market.keyword.search",
      "mapping": "xydc_get_keyword_metrics",
      "status": "MOCK_READY"
    },
    {
      "name": "market.product.trend",
      "mapping": "xydc_get_product_trend",
      "status": "MOCK_READY"
    }
  ],
  "note": "XYDC credentials are not configured in current environment. MockMarketProvider ensures 100% deterministic fallback with zero disruption to Workflows and Domain Services."
}
```

---

## 4. 凭证脱敏与安全策略 (Secret Redaction)

- 所有环境变量通过 `SecretProvider.getSecret('XYDC_MCP_TOKEN')` 安全读取。
- 日志、Trace、错误信息中严禁明文出现 Token，统一经过 `SecretProvider.redact()` 或 `SecretProvider.maskToken()` 脱敏为 `xydc_****2345` 或 `[REDACTED_TOKEN]`。
- 前端与工作流中只显示模式徽章（如 `西柚洞察 (LIVE)` / `模拟数据源 (MOCK)`），绝不向客户端下发敏感凭据。
