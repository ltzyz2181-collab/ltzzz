# REP | ANS-2026-10-17 写回结果（blocked）+ 对 XAI《Deep Superagent 近况评估》的核验意见

- 席位：doubao
- 时间：2026-11-10

---

## 一、你 07:42 的裁决：无法执行，按你的规则记 blocked

你要我按原 Task ID 做 `review_task` 写回，`reviewer_actual_provider=gpt`。**我做不了，原因不是权限表，是签名能力不在我这一侧**：

1. Pulse 的 actor 由 Bearer token 决定 —— `workers/pulse-worker/index.js:8` `actorFor()`：`PULSE_TOKEN`→`gpt`，`PULSE_QIANWEN_TOKEN`→`qianwen`，其它→`null`
2. `PULSE_TOKEN` 是派生值，不是独立 secret —— `scripts/pulse-credentials.mjs`：`HMAC-SHA256(CLOUDFLARE_API_TOKEN, 'ltzzz-pulse-control-v1:' + role)`
3. 本机无 `CLOUDFLARE_API_TOKEN`（只在 Actions secrets，本机不可读）

所以本席派不出 gpt token。要绕过去只有两条路，都被你明令禁止：改 `allowedAgents`/`actorFor` 伪造权限，或伪造 review receipt 的 SHA。两条都没做。

顺带核到：`allowedAgents` 本身**是包含 gpt 的**（`engine.js:59` 传 `['gpt', ...names(config)]`），且 `tasks.js:42` 有 `independent_actual_provider_required`（worker ≠ reviewer）。障碍从来不是权限表，而是**持有 gpt 私钥的那一侧**。建议把这点写成固定规则，省掉每轮重复确认。

当前状态保持不动：`ANS-2026-10-17-doubao` 仍 `submitted_pending_review`；warning case `fb123b376bde9cdf327e0150` 仍 open，未 reclassify、未批量关；DeepSeek 原 `rejected_draft_review` 保留；无新模型调用、无付款、无部署。

**需要你（或有 CF token 的 CI，且需你显式授权）执行。**

---

## 二、XAI 那份评估：有参考价值，但我要分开哪些能直接用

我按仓库实物逐条核了一遍，不是照它的结论转述。

### 2.1 核验为真（可以采信）

| XAI 断言 | 我的实测 | 结论 |
|---|---|---|
| `financial_execution: false` | config 实测 `False` | ✓ |
| 原厂 GPT/Claude 保留位禁用 | `native_paid_reserved_enabled = False` | ✓ |
| 部署回执 `model_calls=0` | `deploy-42584322944-attempt-1.json`：`status=deployment_health_and_auth_verified`、`stage=production_readback`、`model_calls=0`、`paid=false` | ✓ |
| 「绿偏运维」,model_calls 常为 0 | 全量扫 `knowledge/results/deep-superagent/*.json`：**15 份含 model_calls 的回执，13 份为 0**（87%），仅 1 份 5、1 份 2 | ✓ 且可量化 |
| 队列活动量大 | 36 份 `queue_results_verified` vs 2 份 `queue_blocked` | ✓ |
| 邮件闭环确实存在 | `mail-deployment-closeout-20261108.json`、`doubao-prereq-check-20261108.json` 均在 | ✓ |

它那句「像勤快的调度与回执系统，不是天天交业务成品」，用 87% 这个数字是站得住的。

### 2.2 已过时，不能再作为现状

- **「外部接单授权有文字，缺完整订单实物链」** → 11-10 已按你的裁决收口：`external_submissions_enabled=false`、`external_order_policy.effective=false`、`status='historical_material_only'`（PR #393 / `6a13fdd4`）。现在不存在"有授权文字但没闭环"的开放状态，那个口已经关了。
- **「原厂 GPT/Claude 未启用 → 能力上限低」** → 归因不对。`native_paid_reserved_enabled=false` 是**既定设计**（保留位禁用），不是缺能力。把它写成能力短板，会诱导去开一个本来就不该开的门。

### 2.3 我没法核的

- **「LTZ-8 自 11-08 后评论未明显推进」** → 本机无 Linear 访问凭据，**未核**。另外要让这条有意义，前提是 Linear 只作为镜像；若拿看板当进度事实源，本身就违反你们定的规则。

### 2.4 我认为最该采纳的一条

**「结果分级：probe 与 business 分开」**。

这条可执行，而且和今天刚修的东西互补：

- 今天 #394（`ff9c572e`）修的是「attempt 2 用旧租约写出格式完整的假日课」，本质也是**让"看起来完成"的东西被记成完成**
- XAI 说的分级，是同一个病的另一面：`model_calls=0` 且无桌面/API request_id 的，只能标 `ops_probe`，不进"业务完成"统计

两者的共性：**判定"完成"时必须要求一个不可伪造的副作用证据**（真实模型调用计数、request_id、或租约归属）。

### 2.5 我不同意照做的

- **「认领超时自动升级 GPT 决策席」** —— 方向可以，但"自动升级"会变成噪声轰炸。建议改成：超时先落 `claim_timeout` 原因码，累计 N 次才升级，且升级走邮件而不是直接改状态。
- **「执行席健康面板」** —— 有价值，但它是**新增实现**，要占工程位；在 A3/B 资金链路未验收、RPC 还在红灯的当下，我不建议优先做。

---

## 三、请你裁决

1. **ANS-2026-10-17 写回**：由你侧执行，还是授权 CI 以 gpt 角色执行（后者相当于固化"机器代 GPT 签名"，属治理变更，需你明确点头）
2. **结果分级是否落地**：是否同意把 `model_calls=0` 且无 request_id 的回执统一标 `ops_probe`，不进业务完成统计 —— 若同意，我按现有回执回溯打标，并给新回执加必填校验
3. **XAI 建议的优先级**：健康面板与认领超时升级，是现在做，还是排到 A3/B 与 RPC 之后
4. **两条 CI 既存红**（07:39/上一封已提，仍未答复）：授权改测试，还是先冻结

## 四、附带说明

- ICP 备案报告已另行发出（`msg_o45tLfzPe405HiJAXGyzhgdProv-bhzDLIEyWxNaDR1c6A`，2026-11-10T08:29:37Z，收件 `ltzyz2181@gmail.com`）
- 本次仍无新模型调用、无付款、无部署
