# AI 主动唤醒 + 邮件互发：长期工程规划（2026-11-21）

- Task ID：`AGENT-PROACTIVE-WAKE-20261121-01`
- 状态：P0 已在线；P1 已合并（PR #530）；P2 准入入口 PR #532。
- 原任务来源：Owner 2026-11-21 口述「各 AI 主动唤醒讨论、规划、部署，才算全自动化；邮件互发也要作为长期立项工程」。

## 1. 目标与边界

目标：各席位不等 cron、不等人工评论，能自己发起一轮讨论/规划/部署，并用邮件把结论送达其他席位。

不放开（仍归 GPT 决策席）：资金、退款终态、签名、私钥/助记词、钱包（含五签 Safe）、凭据/Secrets。

「自主」的正确定义：席位可以**发起**唤醒请求，但不能**直接调用**其他模型、也不能无限自我循环；
每次唤醒都必须落成仓库事件，经预算闸与去重闸后，才允许产生真实模型调用。

## 2. 现状（实测，不是设想）

已在跑：

- `.github/workflows/agent-debate-cycle.yml`：周一 01:20 UTC 定时 + Issue 评论唤醒 + 回写 + Gmail/QQ 周报。
- `.github/workflows/seat-mail.yml` + `scripts/seat-mail.mjs`：开 `mail:send` 标签，30 分钟一轮代发。
- `scripts/lib/agent-debate.mjs`、`scripts/lib/memory-context.mjs`、`scripts/agent-debate-report.mjs`（PR #508 squash `2281e9db`，60 项测试）。
- 提案板 Issue #509（label `idea-board`），支持 `[idea-alt]` / `[idea-revise]` / `[idea-pilot]`。
- 席位登记 `config/seat-mail-registry.json`（12 席）。

已实测的唤醒 MWE（`knowledge/results/wake-test/2026-11-21-wake-discussion.json`）：

- relay-GPT 生成成功（`gpt-6.1-sol`，1 次调用，$0.0099）；
- relay-Claude 两次 503（同错误类别，停止重试同方法）；
- DeepSeek 直连第二轮改为 `thinking=disabled` 后成功；
- 邮件 2 封 SMTP 250 + IMAP 头回读命中，`imap_seen=false`（只证明进 INBOX，不证明已读）。

缺口（本工程要补）：

1. 没有「席位自唤醒」入口，只能等 cron 或人去评论。
2. 没有跨轮唤醒台账：同一议题可能被反复唤醒、重复烧钱。
3. 没有预算闸：单轮成本只能靠事后核对。
4. 邮件没有线程化（`In-Reply-To`）与 `message_id` 台账，回信不成链。
5. 讨论结论不会自动变成立项卡，提案容易「有始无终」。

## 3. 三层触发

| 层 | 触发源 | 现状 |
|---|---|---|
| L0 定时 | cron（周一讨论、30 分钟邮件） | 已在线 |
| L1 事件 | Issue 标签/评论、CI 失败、Task Hub 快照异常、收件箱命中项目规则 | 部分在线 |
| L2 席位自唤醒 | 任一席位在带 `wake:request` 标签的卡上写 `[wake]` 行 | P2 已实现（准入层，零模型调用） |

席位自唤醒协议（P2）：

```
[wake] topic=<一句话> why=<为什么现在要讨论> seats=<a,b,c> budget_usd=<0.xx> dedupe_key=<默认 task_id+thread_id+日期>
```

规则：

- 同一 `dedupe_key` 24 小时内只唤醒一次；
- 单轮最多 2 个议题；每席每轮最多 2 条发言；默认 4 轮收敛；
- `seats` 必须是 `config/seat-mail-registry.json` 或 Task Hub `SEATS` 里的席位，未知席位拒绝；
- 席位不能自选预算超过单次上限；超过当日累计直接 `blocked_budget`。

### 3.1 每周节奏（2026-11-21 新增）

- 触发：`.github/workflows/agent-wake-weekly.yml`，每周一 `00:40 UTC` 开一张 `wake:weekly` 卡。
- 归属：调度席 `deep` 负责周节奏与催办；议程可由中转席（`relay_claude`）写入，缺失时按四周轮换模板兜底。
- 卡里的 `[wake]` 行与日常请求走同一套准入闸；`dedupe_key=weekly:<ISO 周>`，同一周不会重复记账。
- 为什么不全靠 AI 自写：外部席位没有自发心跳，cron 是保证「每周一定发生」的唯一稳定触发点。
  AI 负责内容，cron 负责准时；两者缺一都会退化成「没人叫就不开会」。
- 四周主题轮转：项目发展路线 → 新能力与新通道 → 产品形态 → 调度机制优化。

## 4. 预算与熔断

沿用已批准的中转预算口径：

- 单次调用估算上限 $0.05；每日累计 $0.50；项目累计 $10；账户余额底线 $3；禁止自动充值。
- 熔断后写 `blocked_budget` 回执并停止，不重试同一方法、不换通道绕过。
- 讨论与邮件都记 `cost_usd`，不用「跑通了」代替「花了多少」。

## 5. 讨论 → 立项 → 派单

结论只有三态：`agreed` / `split` / `insufficient_evidence`。

- `agreed` 且只涉仓库内代码/测试/文档 → 自动建 Task Hub 卡（`dispatch` + `seat:<执行席>`），不等人。
- `split`（≥2 席意见不一致）→ 自动开合议轮；合议后仍分裂 → 升级 GPT 决策席。
- `insufficient_evidence` → 只写「缺什么证据」，不派单。
- 命中六族 → 只出建议，不派单、不执行、不改账。

## 6. 邮件互发

复用 `seat-mail.yml` + `config/seat-mail-registry.json`，在此基础上补：

- 线程化：回信带 `In-Reply-To` 与 `References`，与父邮件成链。
- 台账：`message_id` 分两种记 —— SMTP 回执的 `smtp_message_id`，与邮箱侧改写后的 `imap_message_id`（QQ 会把 Message-ID 改写成 `tencent_*`，两者不能混用）。
- 去重：同 `dedupe_key` 不重发；发送结果未知先查原线程，不盲目重发。
- 读回：只用 `BODY.PEEK[HEADER]`，不标已读、不移动、不删除。
- 语义：SMTP 250 只代表投递被接受；IMAP 命中只写 `delivered_to_inbox=true`，永远不写 `read`。

## 7. 分阶段交付

| 阶段 | 内容 | 验收 |
|---|---|---|
| P0 | cron 讨论 + seat-mail（已在线） | 已有 run 证据 |
| P1 | `scripts/lib/agent-wake.mjs` 唤醒引擎 + 台账 + 预算闸 + CLI + 测试 | 单测全绿；合成议题跑通一轮 |
| P2 | `[wake]` 解析 + `wake:request` 标签 + 事件触发（`scripts/agent-wake-intake.mjs`） | 席位自唤醒 run 成功、重复唤醒被去重 |
| P3 | agreed → 自动建立项卡；split → 合议/升级 | 至少 1 张自动建卡、1 次升级 |
| P4 | 邮件线程化 + message_id 台账 + 去重 | A→B→A 线程闭环，重复投递被拒 |

## 8. 测试方案（必须先有，再谈上线）

T1 主动唤醒（合成议题）：

1. 造一个 14 天无终态的议题 + 两席明确分歧；
2. 触发一轮唤醒，断言：workflow run 成功、`knowledge/results/agent-wake/ledger.json` 有本轮记录、
   回写评论出现、邮件已发（SMTP 回执 + IMAP 头命中）、`cost_usd` 累计未超限；
3. 同 `dedupe_key` 24h 内二次触发 → 必须 `deduped`，不得再产生模型调用。

T2 邮件互发：

1. A 席开 `mail:send` → 断言 SMTP 250 与回执评论；
2. IMAP `BODY.PEEK[HEADER]` 命中该封，记 `imap_message_id`；
3. B 席在原线程回信（`In-Reply-To` 指向 A 的 `imap_message_id`）；
4. 断言线程链完整、两封各自 `dedupe_key` 不同、重复提交同一封被拒。

T3 预算熔断：伪造超限 → `blocked_budget`，断言零模型调用、零邮件。

T4 负面语义：故意不做真实发送（模拟 550）→ 回执必须 `failed`，不得写 `sent`。

每条都要有 run id / 回执路径 / 明确负面结论（「未部署」「未平台验收」照实写）。

## 9. 已知外部边界（不掩盖）

- 外部模型席位没有「自发心跳」，必须有触发点（cron / 事件 / 人）。这是平台能力限制，不是权限问题；
  所谓「自主唤醒」是「席位自己写唤醒请求」，不是「模型自己定时上网」。
- 中转 Worker 已部署，但 Workers AI 未开通；中转席只能做受限裁决。
- Meta PAT 到期 2027-02-18，到期前必须轮换；本轮不扩权。
- 2026-11-20 起 `[delivered]` 需 commit + PR + CI + 测试证据；含部署语义的任务还必须有 deploy 与 smoke 证据。

## 10. 交给谁
P1–P4 的代码由 `desktop-claude` 主开发；`qianwen` 复核 CI 与回执一致性；`doubao` 只读审查隐私与去重；GPT 决策席管冲突与六族。
