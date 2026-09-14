# CrossPilot 外部设计吸收与实施方案（归档镜像与规范入口）

> **【主方案唯一入口说明】**  
> 本文件为归档包内的指针说明。为避免版本漂移与多份长文档的内容冲突，本方案的**唯一权威规范源**为工作区主方案文件：  
> [`docs/00_governance/more/CrossPilot_External_Design_Absorption_Plan.md`](../CrossPilot_External_Design_Absorption_Plan.md)  
>
> - **当前版本：** 2026-09-14 R2 修订版
> - **文档状态：** `READY_FOR_REVIEW`（已完成 ER2-01～ER2-06 统筹意见闭环，待统筹独立复验；未经授权不开工业务实现）
> - **上游参考状态：** 所有外部来源均基于公开默认分支核对，未做版本锁定（已删除全部无效哈希）
> - **规范效力边界：** 仅限约束本参考设计包内部模板的一致性，绝不超越项目整体规则、AGENTS.md、HANDOFF.md、Freeze 纪律及既有 AI Automation v1 契约。
> - **实施批次：** 分解为 Batch A ～ Batch E，本期不放行全量 P1 实施，首批优先处理封闭不安全 legacy reset 与修复 xydc.mapper 假默认值。

请所有开发与审核工程师直接查阅并编辑上述主方案文档。
