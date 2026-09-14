# 上游项目参考边界与单独引入指引（Upstream Skills & Repos）

> **纪律准则**：将“外部参考设计模式”与“上游可直接复用代码”严格区分。外部项目的公开描述不等于其已经能在 CrossPilot 中运行，更不等于证明 CrossPilot 已经具备其能力。  
> 经 2026-09-14 复审，此前列出的 Commit 链接存在无效 404 情况，现已全数删除无依据的哈希与未经证实的日期。当前各项目均仅核对 GitHub 默认分支公开内容，**未锁定固定版本**。  
> 为避免版本漂移与契约破坏，本包默认不把任何第三方代码作为生产运行时引入。

## 1. 核心参考项目与使用边界

### 1.1 `kangise/ecommerce-ai-skills`
- **仓库与协议**：https://github.com/kangise/ecommerce-ai-skills (默认分支公开文档, `CC0-1.0`)
- **版本状态**：【未锁定固定版本】
- **复用定位**：设计模式参考（Ontology 契约、CI Gate、可恢复 Worker 机制）。
- **边界说明**：本轮未运行其 CI，其高阶业务 Skill 缺乏对 CrossPilot 现有 Tool 的接线适配，不得作为现成业务包直接部署。

### 1.2 `zach22-1999/amazon-skills`
- **仓库与协议**：https://github.com/zach22-1999/amazon-skills (默认分支公开文档, Root: `MIT`, Sub: `Apache-2.0`)
- **版本状态**：【未锁定固定版本】
- **复用定位**：方法论参考（`zach-seller-skill-creator` 的业务 6 问门禁、Baseline 对比与 Eval 评测）。
- **边界说明**：安装作者 Skill 绝不会自动完成 CrossPilot 的 Tool/Workflow 接线，只能参考其评测设计。

### 1.3 `anthropics/commerce-agents`
- **仓库与协议**：https://github.com/anthropics/commerce-agents (默认分支公开文档, `Apache-2.0`)
- **版本状态**：【未锁定固定版本】
- **复用定位**：安全架构参考（Provenance Gate、Staged Write 暂存、Host 独立 Apply、Apply 前二次安全校验）。
- **边界说明**：**官方 README 明确声明为不予维护的参考实现（unmaintained reference implementation）**。其认证、鉴权及多租户机制完全缺失，不能将示例门禁当做生产安全防线，不复制代码。

### 1.4 `Shopify/claude-for-commerce-examples`
- **仓库与协议**：https://github.com/Shopify/claude-for-commerce-examples (默认分支公开代码, `Apache-2.0`)
- **版本状态**：【未锁定固定版本】
- **复用定位**：架构同构参考（Local Store 替身与真实客户端共用 Backend / Ledger / Gate / Router 管道）。
- **边界说明**：**直接继承并构建于 Anthropic 蓝图之上，非独立多源验证**；本地替身通过绝不等于真实平台契约通过。不自动套用 Anthropic 的 unmaintained 声明，但同样不直接复制代码。

### 1.5 `KuudoAI/amazon_ads_mcp`
- **仓库与协议**：https://github.com/KuudoAI/amazon_ads_mcp (默认分支公开代码, `MIT`)
- **版本状态**：【未锁定固定版本】
- **复用定位**：接口与错误信封参考（`ToolErrorEnvelope` 包含 why 与 suggested_fix）。
- **边界说明**：必须严格区分“修改入参重试”与“写操作可安全重发”；非幂等写操作绝不放行盲目重发。

### 1.6 `DannylydST/sorftime-seller-agent`
- **仓库与协议**：https://github.com/DannylydST/sorftime-seller-agent (默认分支公开文档, `MIT`)
- **版本状态**：【未锁定固定版本】
- **复用定位**：选品流程参考（多源数据闭环、独立复核、业务风险 advisory 警示）。
- **边界说明**：业务层 advisory 警示绝不能迁移为系统权限与数据隔离边界的 advisory。

### 1.7 `nexscope-ai/eCommerce-Skills`
- **仓库与协议**：https://github.com/nexscope-ai/eCommerce-Skills (默认分支公开代码, `MIT`)
- **版本状态**：【未锁定固定版本】
- **复用定位**：自动化调价路径参考（Shadow → Pilot → Bounded Automation 渐进式发布、硬限额与熔断）。
- **边界说明**：具体调价阈值与自动化权限由 CrossPilot 租户策略独立裁定，不套用其默认参数。

---

## 2. 严格隔离与禁止直接打包项目（合规与许可风险）

- **`JuneYaooo/launchfit-ai`**：包含 **`PolyForm Noncommercial 1.0.0`** 明确的非商业限制。CrossPilot 具有商用属性，**严禁复制其任何代码、模板或 Skill 文本**，仅可借鉴其合规材料缺失即阻断（HOLD）的业务设计思想。
- **`zach22-1999/seller-second-brain`**：协议为 **`CC BY-NC-SA 4.0`**，包含非商业与相同方式共享限制。仅作为 Decision Memory 方法论讨论，暂缓实施且不复制代码。
- **`wenjiany312-hub/starsky-amazon-codex-releases`**：需授权的专有发布仓，不可作为可商用开源代码直接复用；仅吸收 Evidence First 理念。
- **`nexscope-ai/nexscope-ecommerce-skills`**：当前 README 声明为专有（proprietary），不得作为本工程代码复制来源。
