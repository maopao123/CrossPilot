# CrossPilot Reference Skill Pack

> **定位声明**：本包**不是** CrossPilot 已建成的业务 Skill 平台或生产运行时插件，亦不包含可执行脚本或自动化评测 Harness；而是针对 CrossPilot 项目架构整理的 8 个**代码审核与设计规范模板（Review Checklists）**。  
> **规范效力边界**：本包的设计与模板参考以主方案文档为准：  
> `docs/00_governance/more/CrossPilot_External_Design_Absorption_Plan.md`。  
> **重要限制**：本方案与本包的规范效力**仅限于本外部参考设计包本身**（解决参考模板与方案之间的词汇一致性）；**绝对不超越、不覆盖项目的用户规则、AGENTS.md、HANDOFF.md、Freeze 纪律以及已由统筹裁定通过的既有架构契约（如 AI Automation v1）**。

## 1. 模板职责划分

- `crosspilot-code-audit`：总审计入口，坚守 Workflow-first、防越权与增量原则。
- `crosspilot-evidence-auditor`：审计证据真实性，严格解耦取值状态（Value Status）与时效状态（Freshness），严禁假默认值。
- `crosspilot-action-safety-auditor`：写操作防御，严格解耦业务风险严重度（`riskLevel`）与自动化权限（`automationLevel`），保留本期采购全人工审批与高风险约束。
- `crosspilot-store-scope-auditor`：租户、渠道、店铺与实物 Sku 数据隔离，严格把关破坏性操作的 Scope 范围。
- `crosspilot-workflow-recovery-auditor`：编排 Checkpoint 与底座外部操作自愈 Worker（复用 `AutomationRecoveryProcessor`）。
- `crosspilot-adapter-contract-auditor`：多端 Adapter 契约同构、错误信封、模式隔离（MOCK / SIMULATOR / LIVE）与真实度透传。
- `crosspilot-playbook-author`：将重复度高的成熟 SOP 规范化为 Playbook/Skill 设计标准，明确输入输出与评测基线。
- `crosspilot-stage-gate-designer`：仅当出现跨多个 Workflow 的真实多阶段产品生命周期时作为条件触发参考，不提前引入。

## 2. 上游引用与使用纪律

详见 `UPSTREAM_SKILLS.md` 与 `SOURCES.md`。上游参考仓库均已删除无效哈希，诚实标注为默认分支公开参考，未做版本锁定。明确 Anthropic 与 Shopify 继承关系及参考实现边界；明确非商业（NC）许可证隔离。本包严格不直接复制代码，防止版本漂移与合规风险。
