# GPT 最终裁决的部署可行性评估（2026-11-17）

评估对象：`LTZZZ-GMAIL-INTAKE-HYGIENE-20261117-02`、`GPT-HIRE-PHASE1-REVIEW-20261117-03` 两单，以及 11-17 00:46–00:50 的 C1–C5 / R1–R11 裁决表。
评估口径：owner 三条必须项 —— ①能自动部署；②任务不中断；③项目能持续运行。判据只用可回读事实（CI、run id、脚本实跑），不用"设计上应该"。

## 一、结论

| 必须项 | 判定 | 依据 |
|---|---|---|
| ① 自动部署 | **可行，但有一处 fail-open 必须先补** | `scripts/lib/deploy-authority.mjs` 实跑：merge/deploy 均 `allowed=true`（授权 `OWNER-AUTH-20261117-DEPLOY-AUTOMATION`），4/4 测试通过；但排除族按字符串精确匹配，未登记的族名一律放行 |
| ② 任务不中断 | **基本可行，两处常红在消耗告警信噪比** | 每日主入口有 `concurrency: deep-superagent-daily / cancel-in-progress: false` 与 5/12 分钟超时；30 个定时工作流里 3 处同分钟并发；`autonomous-funded-orders` 近 5 次全红 |
| ③ 项目持续运行 | **可行，但两处硬缺口未闭** | Pages 部署曾因 artifact 竞态单次失败（已自愈）；funded-orders 因 signer 未证永久红；凭据落地方式与 GPT 自己 §三.5 的口径冲突 |

## 二、自动部署：闸门是真的，但会放行未登记的族

实跑（2026-11-17，main `df9abf714`）：

```
{"action":"merge"}  -> allowed:true  reason:owner_authorized_auto_merge
{"action":"deploy"} -> allowed:true  reason:owner_authorized_auto_deploy
{"action":"rollback"} -> allowed:false reason:auto_rollback_disabled
"five_signature_safe" -> false   "signing" -> false   "funding_moves" -> false
"wallet_or_safe"      -> TRUE    "five_signature" -> TRUE   "loan" -> TRUE
```

问题：`excluded_families` 只拦精确字符串。调用方传 `wallet_or_safe`、`five_signature`、`signing-prod` 这类近似名，判定直接变 `allowed:true`。自动部署一旦真跑起来，这就是绕过资金/签名排除区的口子。
修法（最小）：`family` 不在登记表内时 fail-closed，返回 `deny('unknown_family')`，只允许白名单族名部署；测试补 4 组近似名用例。

## 三、任务不中断：有并发控制，但三条稳定性负债

1. **同分钟并发 3 处**：`40 3 * * *`（agi-econ-subnet + defi-autopilot）、`20 0 * * *`（external-daily-dispatch + promote-memory）、`0 14 * * *`（liveness-watchdog + ltzzz-min-automation）。不必然重复做事，但同刻抢 runner、抢同一个记账文件的风险是实的。
2. **常红工作流 1 条**：`Autonomous funded LTZZZ orders` 近 5 次（11-15 06:42 → 11-17 08:00）全部 `failure`，失败原因是设计内 fail-closed：`blocked_missing_signer`，signer 能力从未被证明。它每次红都把"今天真出事了"这个信号调低一档。
3. **告警不可用**：既然有一条永远红的工作流，就没有"全绿"这个基线，任何真实回归都会淹在已知红里。

## 四、项目持续运行：两处硬缺口

1. **Pages 部署竞态（已自愈，仍会复发）**：run `44043415489`（`a38d221c8`）在 `Assert exactly one pages artifact before deploy` 失败，`reason=no_pages_artifact count=0`；但步骤 8 `Upload artifact` 是 success，事后该 run 的 artifact 数回读为 **1**。即：上传成功后立刻查 artifact 列表，GitHub API 还没索引到 → 误判为空。修法：pre-deploy 改成有上限轮询（如 6 次 × 5 秒），仍为空才失败。
2. **凭据机制与 GPT 口径冲突**：GPT 任务单 §三.5 要求凭据走"批准的安全凭据机制，不得写入普通配置文件"；而 owner 指令（及今天桌面落地）用的是 `~/.config/ltzzz/gmail-imap.env`（600 / ACL 仅本人）。两者只能选一个说法，否则每轮审查都会判"不合规"。

## 五、GPT 裁决自身的三处不一致（必须先由其本人消解）

1. **§三.4「不得直接启用生产定时任务」** vs **C2「批准自动部署，不再逐次等 Owner」**：Gmail Intake 那条只读工作流到底能不能开 schedule，两张单结论相反。
2. **§一.7「不直接推 main，不合并，不部署」** vs **R3「提审与发布统一归入部署生命周期」**：前者把 Claude 锁在 PR，后者把发布归进自动部署族。
3. **§二「豆包只读审查，不修改代码」** vs **C1「豆包是执行、部署、提审席」**：C1 已由 owner 推翻旧口径并获 GPT 采纳，但 §二 正文没删，今天仍被当作"越权"证据引用。

## 六、本轮已闭的一条（有实测）

`Harness observe learn and verify` 今天 08:00（run `44043025135`）红：`seed lessons all validate and are advisory` 断言失败 —— 4 条 lesson 的 `mandatory=true`，违反"lesson 只作建议"不变量（`L-20261117-004/005/006/007`）。已把四条恢复 `mandatory=false` 并写 `advisory_note`，本地复跑 101/101 通过；main `df9abf714` 的 run 在 08:55:13Z 已 **success**。

## 七、按优先级该做什么

| 优先级 | 事项 | 判据 |
|---|---|---|
| P1 | 闸门对未登记族 fail-closed + 4 组近似名测试 | 传 `wallet_or_safe` 必须 `allowed:false` |
| P1 | GPT 消解 §五 三处不一致，出书面 supersede | 否则自动部署无法自称合规 |
| P2 | pre-deploy 加有上限轮询 | 连续 10 次 Pages 部署 0 竞态失败 |
| P2 | funded-orders 拆"预期阻塞"与"真实失败"两种状态 | 该工作流不再常红，或红了下游不再当作新回归 |
| P3 | 3 处同分钟并发错峰 | 同刻并发降为 0 |
