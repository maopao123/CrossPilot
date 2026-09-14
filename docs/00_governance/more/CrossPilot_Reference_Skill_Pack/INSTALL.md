# Reference Skill Pack 使用与规范指引

> **注意**：本包**不是**产品运行时插件，不要尝试将其作为业务功能安装到 CrossPilot 生产系统。这些文件是面向开发、审核与统筹的**项目级规范审核提示词模板（Audit Prompts）**。

## 1. 推荐使用方式

1. **按需直接读取（推荐）**：  
   本地 AI 或审核工程师在处理具体模块任务时，直接使用 `view_file` 读取对应模板的 `SKILL.md` 作为该任务的检查基准，无需全局安装。
2. **存留文档库**：  
   保留在 `docs/00_governance/more/CrossPilot_Reference_Skill_Pack/` 作为设计参考档案。

## 2. 建议启动与使用阶段

- **高频必用（当前阶段）**：
  - `crosspilot-code-audit`：所有 PR / Patch 提交前的基线检查；
  - `crosspilot-evidence-auditor`：Mapper、DTO、分析指标与数据源改动时必查；
  - `crosspilot-action-safety-auditor`：写操作、审批流加固与 Router 变动时必查；
  - `crosspilot-store-scope-auditor`：多店支持、破坏性删除（如 reset）时必查。
- **特定任务使用**：
  - `crosspilot-adapter-contract-auditor`：新增 Adapter、Simulator 演进或错误信封改造时查阅；
  - `crosspilot-workflow-recovery-auditor`：DAG Checkpoint、自愈 Worker 或幂等租约调整时查阅。
- **后续阶段（条件成熟时使用）**：
  - `crosspilot-playbook-author`：当实际出现成熟、重复的第 3 个业务 SOP 时，指导新 Playbook 规范化；
  - `crosspilot-stage-gate-designer`：当业务跨越 3 个以上独立 Workflow 且出现真实人工跨阶段签字需求时方可参考。
