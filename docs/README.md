# CrossPilot 文档中心 (Documentation Hub)

> **统一入口声明**：
> 本目录是 CrossPilot 研发、架构、治理与质量验收的唯一官方文档中心。
> 无论人类工程师还是 AI 助手（Claude Code / Codex / Cursor / Antigravity / Qoder），均以此目录为第一指引。

---

## 1. 当前版本与项目状态 (System Status)

```text
┌────────────────────────────────────────────────────────────────────────┐
│ Current Release: CrossPilot V9.1                                       │
│ Status:          RELEASE VERIFIED & FROZEN   tag v9.1.0 → b3d5607     │
│ Live HEAD:       e457d5a (post-V9.1 visual; frontend only)             │
│ Runtime:         http://116.198.230.217:2222                           │
├─────────────────────────┼──────────────────────────────────────────────┤
│ Epic 1 / 2 / 3          │ FROZEN                                       │
│ Epic 4                  │ SUSPENDED / NOT STARTED                      │
│ V9.2                    │ NOT STARTED                                  │
└─────────────────────────┴──────────────────────────────────────────────┘
```

当前交接：[`HANDOFF.md`](./HANDOFF.md)。Freeze 真相源：[`00_governance/V9_1_RELEASE_FREEZE.md`](./00_governance/V9_1_RELEASE_FREEZE.md)。

---

## 2. AI / 开发者审查必须首读入口 (Start Here)

在执行任何代码审查、Bug 判定、功能开发或重构前，**必须严格按以下顺序阅读**：

1. 🔗 **第一入口（唯一系统基线）**：
   [`00_governance/CURRENT_SYSTEM_AUDIT_BASELINE.md`](./00_governance/CURRENT_SYSTEM_AUDIT_BASELINE.md)  
   *规定了 11 项架构铁律不变量、23 个前端路由矩阵、57 个 API 矩阵、6 大缺陷分类与已知差距判定。*

2. 🔗 **第二入口（文档权威图谱）**：
   [`00_governance/DOCUMENT_AUTHORITY_MAP.md`](./00_governance/DOCUMENT_AUTHORITY_MAP.md)  
   *确立 Level 1~4 文档效力层级与冲突裁决流水线：代码事实与 Level 1 永远覆盖旧文档。*

3. 🔗 **第三入口（全能力矩阵与漂移报告）**：
   - [`00_governance/V9_PRODUCT_CAPABILITY_MATRIX.md`](./00_governance/V9_PRODUCT_CAPABILITY_MATRIX.md)（19 模块 5 级真实度审计）
   - [`00_governance/POST_V9_PRODUCT_REVIEW.md`](./00_governance/POST_V9_PRODUCT_REVIEW.md)（商业飞轮与 Next Epic 深度论证）
   - [`00_governance/DOCUMENT_DRIFT_REPORT.md`](./00_governance/DOCUMENT_DRIFT_REPORT.md)（历史冲突与漂移纠偏报告）

---

## 3. 文档目录层级指引 (Directory Map)

```text
docs/
├── README.md                          # [本文件] 唯一人工 / AI 文档总入口
│
├── 00_governance/                     # [Level 1] 全局治理、基线入口与审计规范
│   ├── CURRENT_SYSTEM_AUDIT_BASELINE.md
│   ├── DOCUMENT_AUTHORITY_MAP.md
│   ├── DOCUMENT_DRIFT_REPORT.md
│   ├── V9_PRODUCT_CAPABILITY_MATRIX.md
│   └── POST_V9_PRODUCT_REVIEW.md
│
├── 10_release/                        # [Level 1] 正式发布与冻结交付物
│   └── epic3/                         # Epic 3 最终交付物 (架构/验收报告/清单/演示)
│       ├── EPIC3_ARCHITECTURE.md
│       ├── EPIC3_RELEASE_VERIFICATION_REPORT.md
│       ├── EPIC3_RELEASE_CHECKLIST.md
│       └── EPIC3_DEMO_SCRIPT.md
│
├── 20_epics/                          # [Level 2] 核心 Epic 实施过程与设计规范
│   ├── epic1/                         # Epic 1: 真实 LLM 运行时与 Listing 创作
│   │   ├── EPIC1_LLM_RUNTIME_LISTING_REPORT.md
│   │   ├── EPIC1_1_CLAIM_GROUNDING_HARDENING_REPORT.md
│   │   └── EPIC1_2_FINAL_SURFACE_GROUNDING_REPORT.md
│   ├── epic2/                         # Epic 2: Milvus 真实 RAG 知识库
│   │   └── EPIC2_REAL_MILVUS_RAG_REPORT.md
│   ├── closed-loop/                   # Closed-loop Operations Layer 需求（Epic A-D，2026-09-13）
│   │   └── CLOSED_LOOP_OPERATIONS_LAYER_PRD.md
│   └── epic3/                         # Epic 3: WF-05 每日运营智能规范
│       ├── SKU360_CONTEXT_MATRIX.md
│       ├── DIAGNOSIS_PATTERN_MATRIX.md
│       ├── ACTION_RECOMMENDATION_MATRIX.md
│       ├── WF05_DAILY_OPERATION_WORKFLOW.md
│       ├── WF05_OPERATION_API.md
│       ├── OPERATIONS_TODAY_UI.md
│       └── history/                   # Epic 3 早期差距分析
│           └── EPIC3_GAP_ANALYSIS.md
│
├── 30_modules/                        # [Level 2] 专业子领域模块标准与数据映射
│   ├── product-research/              # 选品打分模型 V1 (已正式冻结)
│   │   └── PRODUCT_RESEARCH_V1_BASELINE.md
│   ├── listing/                       # Listing V2 字段映射与本地化
│   │   ├── LISTING_V2_MAPPING.md
│   │   └── UI_LOCALIZATION_AUDIT.md
│   └── provider/                      # 集成网关、XYDC MCP 与 VOC 原声抓取
│       ├── MCP_PROVIDER_MAPPING.md
│       ├── MCP_PROVIDER_IMPLEMENTATION_REPORT.md
│       ├── XYDC_CAPABILITY_MAPPING.md
│       ├── XYDC_TOOLS_SCHEMA.json
│       ├── TEXT_VOC_PROVIDER_MAPPING.md
│       └── EXTERNAL_VOC_SCOPE_AUDIT.md
│
└── 90_historical/                     # [Level 3 & 4] 历史设计、草案与已被覆盖版本
    ├── reviews/                       # 早期代码审查记录
    │   └── code-review-2026-09-11.md
    ├── CrossPilot_Final_Overall_Design_V9.md
    ├── CROSSPILOT_NEXT_3_EPICS.md
    ├── CROSSPILOT_V9_IMPLEMENTATION_AUDIT.md
    ├── CrossPilot_V9_FINAL_完整唯一总方案_含ProviderFramework_XYDC.md
    ├── CrossPilot_V9_FINAL_完整无损融合版_代码审查基线.md
    ├── CrossPilot_V9_FINAL_完整无损融合版_含ListingIntelligence.md
    ├── CrossPilot_V9_增量方案_通用ProviderFramework_XYDC首接.md
    ├── V8_TO_V9_MAPPING.md
    └── V9_Final_跨境电商AI工作平台_增量升级开发方案.md
```

> [!WARNING]
> **关于 `90_historical/` 目录的严格限制**：
> `90_historical/` 下的所有文档均已被后续实现事实覆盖或降级，**绝对不得作为当前需求、系统现状或 Bug Audit 的 Source of Truth**！
