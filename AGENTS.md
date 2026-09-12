# CrossPilot 项目约定

## 语言口径（界面文案 / 介绍 / 文档 / 对话回复一律适用）

- **保留英文**：项目自有名称与编号（CrossPilot、Operations Today、Listing Studio、Tool Center、Commerce Simulator、SKU 360、WF-05、Epic 1-4、V9.1、Approval ≠ Execute、Known Gap 等）；技术术语（LLM、RAG、DAG、HITL、MCP、SP-API、Milvus、BullMQ、SSE、ACOS/ROAS、SKU、ASIN、FBA、PPC、VOC、Claim Grounding 等）；平台实体词（Action、Agent、Workflow、Tool、Planner、Mock Executor、Viewer 等）；真实度分级（REAL / PARTIAL / MOCK / DEMO_ONLY / MISSING）。
- **一律中文**：界面文案与所有解释、描述、操作指引、结论性文字（如「收入」「重新诊断」「证据」「收起」「暂无数据」）。
- 状态枚举统一走 `apps/web/src/constants/ui-labels.ts` 的中文映射（`getStatusLabel` / `getSeverityLabel`），严禁改动后端 API / Prisma Enum 值。
- 后端生成的业务内容（诊断文案、Simulator 事件模板、VOC 原声引用）是数据不是界面文案，受 Freeze 约束，不随本口径改动。
- 把握原则：词是项目的，保留原文；话是我们的，说中文。

## 入口

- 文档中心：`docs/README.md`
- 当前交接状态：`docs/HANDOFF.md`
- 下一任执行说明书：`docs/00_governance/V10_NEXT_AGENT_HANDOFF.md`
