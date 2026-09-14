# 调研来源与上游项目说明（Research Sources）

> **核验状态说明**：2026-09-14 复审确认，此前填写的 6 个短 Commit 哈希在直接访问时全部返回 404。本包彻底删除所有无依据的哈希与未经证实的日期断言，禁止补造另一组哈希。  
> 当前所有上游项目均仅以其 **GitHub 默认分支公开文档与代码** 作为架构设计模式参考，**未做离线版本锁定（未克隆离线归档，不作为版本锁定证据）**。  
> 本包 `skills/crosspilot-*` 仅为针对 CrossPilot 架构整理的审核规范模板，不是任何第三方代码的逐字复制。

## 1. 上游来源明细表

| 序号 | 仓库名称 / 组织 | 权威链接 | 版本状态 | 许可证类型 | 核心吸收机制与使用限制 |
|---|---|---|---|---|---|
| 1 | **Anthropic Commerce Agents**<br>`anthropics/commerce-agents` | [GitHub](https://github.com/anthropics/commerce-agents) | **【未锁定固定版本】**（核对默认分支公开文档） | `Apache-2.0` | **参考实现边界**：官方 README 明确声明为参考实现（unmaintained reference implementation），缺失生产认证和权限；仅吸收 Provenance Gate、Staged Write 思想，不复制代码。 |
| 2 | **Shopify Claude for Commerce**<br>`Shopify/claude-for-commerce-examples` | [GitHub](https://github.com/Shopify/claude-for-commerce-examples) | **【未锁定固定版本】**（核对默认分支公开代码） | `Apache-2.0` | **继承关系**：明确构建在 Anthropic 蓝图之上，非独立多源验证；吸收 Local Store 替身共用审批管道的同构设计，不复制代码。不自动套用 Anthropic 的 unmaintained 声明。 |
| 3 | **Kangise Ecommerce AI Skills**<br>`kangise/ecommerce-ai-skills` | [GitHub](https://github.com/kangise/ecommerce-ai-skills) | **【未锁定固定版本】**（核对默认分支公开文档） | `CC0-1.0` | 吸收实体契约（Ontology）、CI 门禁与恢复 Worker 设计；本轮未运行其 CI。 |
| 4 | **Kuudo Amazon Ads MCP**<br>`KuudoAI/amazon_ads_mcp` | [GitHub](https://github.com/KuudoAI/amazon_ads_mcp) | **【未锁定固定版本】**（核对默认分支公开代码） | `MIT` | 吸收 `ToolErrorEnvelope` 失败信息封装；严格区分“修改入参重试”与“写操作可安全重发”。 |
| 5 | **Zach Amazon Skills**<br>`zach22-1999/amazon-skills` | [GitHub](https://github.com/zach22-1999/amazon-skills) | **【未锁定固定版本】**（核对默认分支公开文档） | 根目录 `MIT`<br>子模块 `Apache-2.0` | 吸收业务 6 问门禁与 Baseline 对比评测方法论。 |
| 6 | **Sorftime Seller Agent**<br>`DannylydST/sorftime-seller-agent` | [GitHub](https://github.com/DannylydST/sorftime-seller-agent) | **【未锁定固定版本】**（核对默认分支公开文档） | `MIT` | 吸收业务风险 advisory 警示机制与选品独立复核；advisory 绝不可迁移为系统权限放行借口。 |
| 7 | **Lingxing ERP MCP**<br>`zach22-1999/lingxing-mcp` | [GitHub](https://github.com/zach22-1999/lingxing-mcp) | **【未锁定固定版本】**（核对默认分支公开文档） | `MIT` | 当前为**只读 ERP 接口**，无法证明采购写入与库存扣减能力。 |
| 8 | **Cross-Border E-Commerce**<br>`real-world-agents/cross-border-e-commerce` | [GitHub](https://github.com/real-world-agents/cross-border-e-commerce) | **【未锁定固定版本】**（核对默认分支公开文档） | `MIT` | 吸收市场研究中的多源佐证与显式 Data Gaps 标准。 |
| 9 | **Nexscope E-Commerce Skills**<br>`nexscope-ai/eCommerce-Skills` | [GitHub](https://github.com/nexscope-ai/eCommerce-Skills) | **【未锁定固定版本】**（核对默认分支公开文档） | `MIT` | 吸收调价策略的 Shadow → Pilot → Automation 渐进路径与硬限额。 |
| 10 | **LaunchFit AI**<br>`JuneYaooo/launchfit-ai` | [GitHub](https://github.com/JuneYaooo/launchfit-ai) | **【未锁定固定版本】**（核对默认分支公开文档） | **`PolyForm Noncommercial 1.0.0`** | **非商业限制**：严禁直接复制代码或 Skill；仅借鉴其合规材料缺失阻断（HOLD）设计。 |
| 11 | **Seller Second Brain**<br>`zach22-1999/seller-second-brain` | [GitHub](https://github.com/zach22-1999/seller-second-brain) | **【未锁定固定版本】**（核对默认分支公开文档） | **`CC BY-NC-SA 4.0`** | **非商业限制**：仅借鉴 Decision Memory 记录“为什么决策”的思想，暂缓实施。 |
| 12 | **Starsky Amazon Codex**<br>`wenjiany312-hub/starsky-amazon-codex-releases` | [GitHub](https://github.com/wenjiany312-hub/starsky-amazon-codex-releases) | **【未锁定固定版本】**（核对默认分支公开发布页） | **专有授权发布仓** | 专有发布仓，不可作为可商用开源代码直接复用；仅吸收 Evidence First 理念。 |
