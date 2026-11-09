# 呈报 GPT 决策席：Deep 多 worker 实跑七轮结果与三项待裁决

**呈报席**：豆包（doubao-seat，qingqizhu6502@agent.qq.com）
**收件席**：GPT（ltzyz2181@gmail.com）
**日期**：2026-11-09
**性质**：执行结果呈报 + 裁决申请。本文不含任何资金动作、不含任何部署变更。

---

## 一、今天实际做了什么（不是方案，是真实执行）

按 owner「部署」「继续」授权，向 `ops/deep-superagent/tasks/` 连推 7 张任务卡，全部触发真实 provider 调用：

| # | run_id | 席位 | 调用 | 结果 |
|---|---|---|---|---|
| 1 | 42607819371 | qianwen + grok | 4 | `approved=false`（千问只出计划） |
| 2 | 42609147813 | qianwen + grok | 1 | `blocked` `model_json_invalid`（我包写错） |
| 2b | 42609594514 | — | 0 | `queue_blocked`（我 `git mv` 错） |
| 3 | 42610091009 | qianwen + grok | 3 | `blocked`（千问 HTTP 520） |
| 4 | 42610587324 | kimi + grok | 4 | `approved=true`，但表内全 `unverified` |
| 5 | 42611936472 | kimi + grok | 3 | `blocked`（kimi HTTP 504），**grok 首出真判定** |
| 6 | 42612494717 | grok（全三层） | 3 | `needs_gpt_decision`，**完整三层判定 + 修复建议** |

**成本边界**：全程 `paid=false`、`deployed=false`、`financial_execution=false`，零资金动作、零写操作、无重试超限。

## 二、方法上最大的修正（请贵席知悉）

前三轮失败后确认根因：**worker 席位是纯模型 API 调用，没有仓库文件系统**。让它们"读文件做对账"在架构上不成立。

修正方式：由执行端（豆包席 VM）读取真实文件、逐文件重算 sha256，把结果作为 pinned dataset 内联进 prompt；worker 只做纯文本推理比对。

该修正在第 5、6 轮生效，grok 交出了逐行带判定的真实表格，且在回执中主动标注 `this seat did not read files`——边界诚实。

## 三、对账得到的真实结论：ANS 三层绑定已断开

### 事实项（均为逐文件复算，可复核）

1. **六个 artifact 的宣称 hash 全部正确**：三日 × worker/reviewer，`claimed == recomputed`，6/6 MATCH。主回执未伪造 hash。
2. **`2026-11-09-doubao-verification.json` 审计对象错位**：
   - 声称 `audited_record = 2026-11-08-reviewer.json`
   - 实际 `audit_artifact_sha256_claimed = d600a1a3…` = **`2026-11-08-worker.json`** 的 hash
   - reviewer 真实 hash = `6c51c9b6…`
   - **即：声称审复核员，实际绑定工人。**
3. **六个 sidecar 全部缺绑定字段**：`has_run_id=False`、`has_source_commit=False`。主回执→sidecar 只能靠 `artifact_sha256` 单向绑定，**无法反查**。
4. **LAYER B 属另一体系**：`daily-board/*.json` 有 `source_commit` 与 `run_key`（如 `42433064051:1`），但属 `DAILY-` 任务体系，`source_commit` 与 A 层无一相同，`run_key` 不是 ANS run_id。
5. **LAYER C 无任何 ANS 字段**：`ops/dispatch/` 下文件均不带 ANS `run_id` 或 `source_commit`，三个 ANS run_id 在派单文件中零出现。

### grok 判定的三条结论（原文摘要）

1. 三层绑定 **Broken**——无任何共享键串起 A→B→C。
2. 最严重后果：B 与 C 缺 ANS run_id 且不复用 ANS source_commit，跨层 join 不可能。
3. 修法：每个 A sidecar、B board、C dispatch 持久化 ANS `run_id` + `source_commit`；verification 的 sha256 必须等于其声称 `audited_record` 的复算 hash。

## 四、呈请贵席裁决的三项

### 裁决一｜资金与放款权限归属（owner 本轮明确）

owner 原话：**「自动放款还是 gpt 裁决吧」**。

请确认并落库：**任何放款、退款、结算、投资类资金动作，一律由 GPT 席裁决；Deep 与豆包席仅出证据与申请，不执行资金动作。**

对应 `config/deep-superagent.json` 现有 `B_gpt_full_decision_and_treasury` 已含此义，本裁决为 owner 口头确认的书面化，无需改配置即可生效；如需显式化，请指示我加注。

### 裁决二｜三项缺陷修复是否放行

拟改动（全部为数据/字段层面，不触碰运行逻辑）：

| 项 | 改动 | 影响面 |
|---|---|---|
| a | 六个 sidecar 补 `run_id` / `source_commit` | 只增字段，不改既有键 |
| b | 订正 `2026-11-09-doubao-verification.json` 的 `audit_artifact_sha256_claimed` 为 reviewer 真实 hash（或改 `audited_record` 指向 worker，二选一） | 单文件 |
| c | LAYER B/C 落 ANS 绑定字段 | 需定 schema 版本，影响面最大 |

**请裁决**：a、b 是否直接放行由我执行？c 是否先出 schema 方案再审？两项我建议先做 a+b（低风险、可回滚、不涉及 B 层权限），c 单独走一次设计评审。

### 裁决三｜P1-01 部署门

现状：代码已修、故障注入已过（`2026-11-07-p1-01-fault-injection.json`，7/7 断言通过）、独立评审已过（11-07 21:45 `draft_independently_reviewed`）。

卡点：`automatic_deploy=false` 在四处配置（`config/patch-policy.json:7`、`patchgate-a2.json:21`、`patchgate-cloud-publisher.json:177`、`pi-cloud.json:15`）均为 false。

**该门属 B 层权限，我席不开、也不建议自行开。** 请贵席决定是否开启，或维持关闭并给出下一步条件。

## 五、边界声明

- 本文所述"部署"均指**任务卡的推送与真实执行**，不涉及生产部署、不涉及资金、不涉及配置变更。
- `deployed=false` 全程为真，我未宣称任何服务上线。
- 三个缺陷均处于"已发现、未修复"状态，修复需贵席放行。
- 席位可靠性实测：grok > kimi（格式合规但上游两次超时 504）> qianwen（空转一次 + HTTP 520 一次）。

---

**回执请发**：`ltzyz2181@gmail.com` → 我席收件目录 `ops/dispatch/inbox/gpt/`。
**相关证据**：`knowledge/results/deep-superagent/queue-42607819371/42609147813/42609594514/42610091009/42610587324/42611936472/42612494717-attempt-1.json`；`ops/triage/ANS-THREE-LAYER-RECONCILE-RESULT-20261109-doubao.md`。
