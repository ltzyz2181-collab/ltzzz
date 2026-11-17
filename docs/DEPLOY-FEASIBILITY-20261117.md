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

## 五、按"后裁决覆盖前裁决"重算后的冲突

**修正记录（2026-11-17 09:16Z）**：本文初版把下面第 3 条列为"裁决自相矛盾"，是按"并存即矛盾"读的；owner 明确裁定口径为**后裁决推翻前裁决**，故按生效优先级重算，撤回 2 条误报，只保留 1 条真冲突。

已撤回（被后裁覆盖，不再算冲突）：
- §二「豆包只读审查、不改代码」vs C1/R1「豆包是执行、部署、提审席」→ C1/R1 在后，现生效=执行席。
- §一.7「不推 main、不合并、不部署」vs R3「提审发布归部署生命周期」→ 对象不同（前者 Phase1 PR #408，后者微信提审/发布），不构成矛盾；#408 仍冻结在 NEEDS_REVISION。
- §三.7「禁止自动发送邮件」vs C3「批准自动发送」→ C3 在后，现生效=允许自动发送。

真正未被覆盖的 1 条：
- **§三.4「不批准启用生产定时任务」 vs C2「批准自动部署」**：C2 只覆盖"现有授权范围内"的自动部署，属一般授权；§三.4 是对 Gmail Intake 这条工作流的**专项禁令**，未被点名撤销。按"专项优先于一般"的常规法理，该工作流仍不得开 schedule —— 需 GPT 点名放开（已作为 D1 发出）。

## 六、本轮已闭的一条（有实测）

`Harness observe learn and verify` 今天 08:00（run `44043025135`）红：`seed lessons all validate and are advisory` 断言失败 —— 4 条 lesson 的 `mandatory=true`，违反"lesson 只作建议"不变量（`L-20261117-004/005/006/007`）。已把四条恢复 `mandatory=false` 并写 `advisory_note`，本地复跑 101/101 通过；main `df9abf714` 的 run 在 08:55:13Z 已 **success**。

## 七、按优先级该做什么

| 优先级 | 事项 | 判据 |
|---|---|---|
| P1 | 闸门对未登记族 fail-closed + 4 组近似名测试 | 传 `wallet_or_safe` 必须 `allowed:false` |
| P1 | GPT 裁 §三.4 专项禁令是否被 C2 覆盖（D1） | 放开=可开 schedule；不放开=保持只读手动 |
| P1 | 凭据机制口径（D2）、自动发信白名单（D3）、复核席（D4）、预算探针（D5） | 四项均见 `ops/mail-receipts/MR-20261117-conflict-recheck.json` |
| P2 | pre-deploy 加有上限轮询 | 连续 10 次 Pages 部署 0 竞态失败 |
| P2 | funded-orders 拆"预期阻塞"与"真实失败"两种状态 | 该工作流不再常红，或红了下游不再当作新回归 |
| P3 | 3 处同分钟并发错峰 | 同刻并发降为 0 |
