# AI Automation G1 二次独立复审

> 2026-09-14。结论：**CHANGES_REQUESTED（二次）**。
> 原G1-R01～R05已有部分修复，但完整要求仍未关闭。保持第一批范围，第二批A3～A6不放行。
> 根目录：`E:/AiSecondBrain/vault/Work/Projects/CrossPilot`。

## 1. 先确认已完成的修复

- 执行报告15项源码SHA256与当前文件全部一致，HEAD仍为`be4b8f635fb5261a4c8ec09878a7b4f7c6e53055`，未提交。
- 上轮10项探针脚本未修改，SHA256仍为`7ea8d44a7ab6ec61530827c1c0bda7c78188edfe7d3015e7fa7a63ba2bd23fe8`；本轮复制到新目录独立执行，**10/10通过**。
- shared/integrations/actions重新构建通过；actions **21/21**、API automation **3/3**、新增页面handler测试 **2/2**，独立重跑全部通过。
- 具体进展成立：200空响应/处理中不再直接成功；MOCK显式选择影刀被拦截；SIMULATOR无provider不默认影刀；一般抛异常保留UNKNOWN；未审批先过闸门；AUTH_REQUIRED不再永久缓存；页面404与FAILED响应的两个旧反例已修。
- 本轮继续复验上轮书面修复要求中未覆盖的条件，新增9项探针，**0通过、9失败**。这些是原5项要求的剩余分支，不是要求新增ERP、Runtime或生产接入。

工件目录：`artifacts/automation-v1/g1-review-round2/`。

| 工件 | 内容 |
|---|---|
| review-manifest.json / reviewed-code.diff | 当前受审源码指纹与业务diff |
| fingerprints.json | 15项执行报告SHA256核对 |
| review-probes.cjs / probe-results.json | 原脚本副本及10/10通过结果 |
| remaining-probes.cjs / remaining-results.json | 9项未闭合条件及实际反例 |
| actions-test.log / api-test.log / web-test.log | 本轮独立重跑26项测试日志 |

业务diff SHA256：`36a2cb4f3a0db3a7c79d03096eca20845672feb094f965b950c7965c2374fd4d`。

本轮没有外部网络或数据库调用。HTTP响应为隔离fetch替身；上层服务执行的是实际方法源码；UI为实际组件初次渲染和handler的隔离执行，不是浏览器E2E。未独立重跑整仓typecheck/Web build/其余回归，不把执行方报告改称统筹已验证。

## 2. 原问题的剩余缺口

### G1-R01 / P1：只去掉时间戳，没有建立生效证据门槛

**位置：** `packages/integrations/src/rpa/yingdao.adapter.ts:107`；`packages/actions/src/action.router.ts:204`。

**反例：** 真实YingdaoAdapter收到HTTP200、body=`{status:'SUCCESS'}`，没有jobId、没有目标状态或查询证据，Router仍返回`SUCCEEDED + LIVE + APPLIED`。移除verifiedAt没有改变这个误判。

**对应原要求：** 首轮G1-R01修复要求1～4明确规定“不以泛化SUCCESS充当业务生效证据”“未核实LIVE合同可UNSUPPORTED”“不臆造厂商接口”。

**建议本轮最小修法：** 既然影刀合同和getStatus仍未核实，把影刀LIVE execute明确设为UNSUPPORTED且不发HTTP。不要为了本轮验收继续猜远端状态枚举。Router对测试/未来provider的SUCCESS仍需要区分提交接受与生效证据；仅Mock可按照显式模拟合同完成，不允许所有provider均被拒绝来绕过正常流程测试。

**复验：** 裸SUCCESS/缺jobId/仅jobId/未知status均无LIVE APPLIED；未实现影刀不发请求；显式Mock正常完成且有MOCK标识。

### G1-R02 / P1：合法Simulator的成功回执仍被标成LIVE

**位置：** `packages/actions/src/action.router.ts:213`。

**反例：** 注册` supportedModes:['SIMULATOR'] `的有效测试provider，以SIMULATOR模式调用，执行1次且成功，但回执mode变成LIVE，因为成功分支仍写`isMock ? 'MOCK' : 'LIVE'`。

模式越界的旧反例已通过，但**环境标识可信**仍未通过。这是首轮G1-R02要求4～5“证据来自校验后的绑定、匹配模式成功/失败保持环境一致”的直接验收。

**修复：** 统一从已核实binding传递mode；成功/失败/异常/缓存回放不重新猜测。补正常SIMULATOR成功测试，不能只测它被拒绝的路径。

### G1-R03 / P1：错误字符串、假查询能力与上层证据丢失仍存在

**位置：** `packages/actions/src/action.router.ts:263`、`:278`；`packages/integrations/src/rpa/yingdao.adapter.ts:119`、`:136`；`apps/api/src/modules/operation-automation/operation-automation.service.ts:245`。

本轮3项反例：

1. 远端返回`{jobId:'remote-job',status:'CANCELLED'}`，Adapter产生`UNSUPPORTED_STATUS`；Router用`error.includes('UNSUPPORTED')`认成提交前拒绝，输出`NOT_APPLIED + REAUTHORIZE + AUTH_REQUIRED`。实际远端已有job，效果未知，不能证明未生效。
2. RUNNING结果建议QUERY，但调用Yingdao.getStatus实际恒抛UNSUPPORTED。函数存在不等于查询能力可用。
3. 把RUNNING/UNKNOWN/externalId交给实际`executePublishRpa`方法，上层仍将run改FAILED，并丢弃executionEvidence。服务文件SHA256与上轮完全相同，故“上层UNKNOWN已闭环修复”的报告不成立。

**对应原要求：** 首轮G1-R03要求1～5已明确类型化错误、查询不可用转人工、UNKNOWN贯穿上层且RUNNING不改最终失败。

**修复：**
- 前置拒绝必须有可信阶段/类型字段，不能从远端错误文案推断。Unknown status保持UNKNOWN。
- 显式声明查询能力；无有效查询实现则UNKNOWN + NEEDS_ATTENTION/MANUAL，不能指向必抛错的占位方法。
- Service返回值保留executionEvidence、externalId、phase/effect/recovery。RUNNING仍为RUNNING，必要时增加待处理展示映射；不要求新建持久化表。
- 无需实现本期以外的真实查询；关闭未支持的LIVE路径是允许且推荐的收敛方式。

### G1-R04 / P1：缓存身份仍不完整

**位置：** `packages/actions/src/action.router.ts:65`。

先用同actionId/operationId完成Mock，再分别改变providerId、targetId、type；其余payload保持不变。三次均取到原成功结果。新provider不存在、甚至改成尚未支持的API runtime，也被返回成功。

**已修：** 审批检查前置、mode/actionId/payload差异与失败缓存。
**未修：** 缓存仍在provider/业务目标校验之前，只比较actionId/mode/payload，缺少provider、targetEntity/targetId、runtime等身份。

**对应原要求：** 首轮G1-R04要求2“先校验当前上下文再查缓存，包含provider等身份，同键异参冲突”。

**建议本轮最小修法：** 移除Router执行结果缓存。本期不靠它保证真实幂等，避免为了A1继续打造半套Runtime。若坚持保留，仅限明确Mock；完成完整上下文校验与稳定规范化后才回放，同键异参必须冲突。未知真实结果仍不能直接重放写入。

### G1-R05 / P2：页面初始虚构任务仍可审批

**位置：** `apps/web/src/app/app/operations/automation/page.tsx:46`、`:107`、`:148`。

**已修：** 404不再乐观显示APPROVED，FAILED响应不再追加原成功日志。
**未修反例：** 初次渲染未调用创建API，就已有`appr_wf_run_publish_001`、已完成步骤与固定审计日志；点击批准仍向这个不存在的审批ID发出1次请求。`if (!activeWorkflow?.approvalId)`无法拦截它，因为虚构ID本身非空。

**对应原要求：** 首轮G1-R05要求1/4/5明确“初始无真实run显示未开始，示例只读，刷新无run覆盖”。

**修复：** 初始run=null、审批IDLE、日志为空；需要示例就独立只读展示并禁用审批。只有服务器创建并返回的实际run可审批。刷新丢失旧内存run时如实显示不可恢复，不重造一个历史任务；本期不需要加数据库历史恢复能力。

## 3. 下一次提交的验收方式

1. 保留上轮有效修复和测试；按上述剩余条件补正常测试，不只追求旧10探针全绿。
2. 原10项+本轮9项语义全部满足，同时显式Mock正向回归成立。接口变动可以调整fixture，不能用全面拒绝/删除断言回避目标。
3. 上层Service与初始页面条件必须真正修改并覆盖；提交前核对“已修复”的文件是否实际有相应diff。
4. 更新证据时区分执行自报与统筹独立复验，保留每次历史。不要将本次提交状态或执行方运行统筹脚本的结果写成统筹PASS。
5. 新增源码指纹、命令/退出码/测试数、实际日志与原问题逐项对应。第二批保持NOT_STARTED。

## 4. 可复制给执行AI的收敛修复提示词

```text
继续CrossPilot第一批A0～A2，不进入A3～A6。统筹二次独立复审仍为CHANGES_REQUESTED。

根目录：E:\AiSecondBrain\vault\Work\Projects\CrossPilot
必读：
docs\00_governance\more\AUTOMATION_G1_REVIEW_R2_20260914.md
docs\00_governance\more\AUTOMATION_G1_REVIEW_20260914.md
docs\00_governance\more\AUTOMATION_EXECUTION_PLAN_V1.md
docs\00_governance\more\AUTOMATION_EXECUTION_EVIDENCE.md
artifacts\automation-v1\g1-review-round2\remaining-results.json

统筹确认原10探针未改且10/10通过，actions21/API3/Web2共26项独立重跑通过，15项源码指纹一致。这些进展保留。但原5项书面修复要求仍有9个条件失败，不能只修旧探针输入。

本轮按最小方案收敛：
1. 未核实影刀LIVE合同/getStatus时，execute明确UNSUPPORTED且不联网，别继续猜厂商状态。Router不接受没有生效依据的裸SUCCESS作为LIVE APPLIED。
2. 成功回执使用校验后的原mode，SIMULATOR不能变成LIVE。
3. 类型化区分提交前拒绝和提交后未知；不再用UNSUPPORTED/AUTH_REQUIRED字符串认定NOT_APPLIED。QUERY必须有真实能力，无能力转人工并保留UNKNOWN。OperationAutomationService必须保留RUNNING和executionEvidence，不能继续用旧代码把它们丢掉。
4. 建议移除Router结果缓存。本期真实持久化幂等在A3，不要保留能把新provider/target/runtime伪报成功的半套缓存。若保留Mock缓存，完整校验后才允许回放。
5. 页面初始run=null、审批IDLE、日志为空，只有服务器返回的真实run可批准；示例只能只读。404处理已修，但虚构初始approvalId仍必须删除或隔离。

逐项先写失败测试，再最小修复，再跑正常Mock正向和相关回归。保留原有效测试，修正不符合合同的旧预期。不新增ERP/Runtime、不连接真实店铺、不部署。

按本轮报告第三节交付，更新证据逐项填写G1-R01～R05剩余条件的修复事实与源码指纹。提交状态为G1 READY_FOR_REVIEW（三次），不要自行填写PASS。没有提交/推送/部署权限。完成后交回统筹AI复审。
```

本次统筹仅做复审、构建、隔离探针、定向测试和文档更新，未修改业务实现。下一次优先使用上述收敛方案，减少反复补丁。
