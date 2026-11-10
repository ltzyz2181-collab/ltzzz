# RECEIPT | 七项推进清单的部署状态 + 第 4 项已修复

- 席位：doubao
- 时间：2026-11-10
- 关联：PR #394，main `ff9c572e`
- 结论：7 项中 3 项已修并已部署、1 项本轮修完并合并、3 项未推进（原因见下）

---

## 0. 一处必须纠正的过时信息

你报告里写「**PR #391 仍开放，不提前合并**」。实际：

- `#391` 已于 `2026-11-10T07:36:40Z` **MERGED**，merge commit `aa0145da`
- Pages 部署 run `42776498721` → success
- 已用独立出口回读 `https://ltzzz.com/wep3.html`，看到「最近实际回执」与「最近部署检查」两个并列区块同时存在，`signer_verdict:"ready"`，`settlement` 指向 11-02 那条成交

你看到的应是合并前快照。这条不需要再等。

## 1. 七项状态（逐项实测）

| # | 项目 | 代码 | 部署 | 关键证据 |
|---|---|---|---|---|
| 1 | Deep 外部权限配置冲突 | ✅ #393 / `6a13fdd4` | ⚠️ 配置已入 main；deploy job 未进入（run `42779862166` 只跑 check，4 步 success） | `external_submissions_enabled=false`、`financial_execution=false`、`external_order_policy.effective=false`；Worker `health()` 本就不读该字段，运行时零差异 |
| 2 | WEP3 signer 状态契约 | ✅ #390 / `68871e5d` | ✅ 已部署 | run `42774710300` 全绿，step 19 success，`signer_verdict=expected_safety_block` |
| 3 | Pages artifact + 支付校验器 | ✅ #388/#389 / `8a1ec339` | ✅ 已部署 | run `42771533407` 十步全 success；守卫实测 `count=0→upload`、`count=1→deploy` |
| 4 | Daily runKey 与 revalidation | ✅ **本轮 #394 / `ff9c572e`** | 无需部署（代码直跑） | 见下节 |
| 5 | 旧 ANS reviewer 真实状态回读 | ⚠️ 部分 | — | `2026-11-10-reviewer.json` 有 `accepted=true`，但 `unverified` 三项（未取得原始字节、未跑 `node --check`、未跑 `node --test`）说明这是只回传哈希的审核；旧任务 Pulse 状态仍未回读 |
| 6 | Cloudflare 生产版本独立核验 | ❌ 未做 | — | 本机无 wrangler 登录态、无 `CLOUDFLARE_API_TOKEN`、`*.workers.dev` DNS 被劫持；本机无法独立核验。此项你已派 WorkBuddy，本席可提供 CI 侧证据但对不上 production version 独立读数 |
| 7 | A3/B 实际验收 | ❌ 未推进 | — | A3 停在 `2026-11-04T08:17:39Z`（run `41798322857`，`source_commit fbd57d9e`），`status=single_isolated_A3_target_deployed_and_reverified`，`scope=one_inert_isolated_canary_not_generic_production_deployment`，`model_calls 0`、`transactions 0`。之后无推进。无真实资金回执，不构成 A3/B 完成 |

## 2. 第 4 项：修复内容与本席的独立复核

你与 ANS reviewer 的判断，我在代码上复核后**成立**，且问题比 reviewer 描述的更具体：

- `scripts/lib/daily-task-board.mjs` `runReservedSeat`：`run_key` 不匹配时 **`return {ok:false}`，不抛异常**
- `scripts/run-daily-tasks.mjs`：把该返回值当作一次普通席位失败，`reflections.push`、`pending.reminders[...]` 后**继续跑完 CHANNELS 循环**
- 随后照常写出 reflection 文件、`pending_reminders`、`reports/latest.md`

后果：attempt 2 重跑时旧租约被逐席位拒绝，但最终仍产出一份「逐席位 blocked、格式完整」的今日日课记录，并覆盖 attempt 1 的真实产出——**看起来像正常完成**。

修复（`assertRunKeyOwnership`，fail-closed），位置前移到：

1. 远端租约字节核验（fetch）之前 → 重跑不再发起一次网络请求
2. 任何 provider 调用之前 → 不重复购买
3. 任何 results/reflections/reminders 写入之前 → 不产生误导性文件

`run_key` 缺失或为空（`undefined`/`null`/`''`/`0`）同样拒绝，不按空值放行。`runReservedSeat` 的既有语义未改动（其他调用方仍按席位处理）。

回归 7 条 + 已加入 `controller-daily-review.yml` 的 `paths` 与 `node --test` 列表（否则不会在 CI 执行）。本地日课相关 5 个文件 78/78 PASS；CI 内该回归亦通过。

## 3. CI 中两条既存红（需你裁决，本席未擅自动）

`controller-daily-review` 的 verify job 里 2 条用例失败，**在 main 上可原样复现**，与本轮改动无关：

| 用例 | 冲突的既定决策 | 出处 |
|---|---|---|
| `catalogue remains usable while unconfigured payment cannot call cloud or requestPayment` | 11-09 开启小程序沙箱支付 | `miniprogram/config/index.js` 注释「2026-11-09 打开：密钥、回调、道具三项已实测齐备」 |
| `bound successful refund signal pauses fulfillment…`（期望 `refund_pending_verification`，实际 `refunded`） | 11-09 owner 决定全额退款直接关单 `refunded` | `vpay-notify/index.js` `handleRefund` 注释「Owner decided (2026-11-09) that a FULL refund closes the order as refunded」 |

这两条都涉及**已决策的支付/资金语义**。改测试迁就实现，或改实现迁就测试，都是需要你确认的动作，所以我没借「让 CI 变绿」去悄悄改资金状态机契约。

**请裁决二选一（或都否）**：
- ① 授权我更新这两条测试，使其符合现有决策（测试仍保留 fail-closed 断言，只换期望状态）
- ② 先冻结，保持红，等支付链路完整验收后再动

## 4. 未做的事（明确列出）

- 未做第 5 项的「旧 ANS 任务 Pulse 真实状态回读」——需要 Pulse 侧可写权限与一次真实回读，未执行
- 未做第 6 项 Cloudflare 生产版本独立核验——本机缺凭据与网络通路
- 未推进第 7 项 A3/B 实际验收——需真实入金/放款/超时退款三类回执，资金动作归你裁决
- 未改 `workers/deep-superagent/index.js` 的硬编码 false
- 未删除 `external_order_policy` 任何历史内容
- 未把 `scripts/lib/signer-status-verdict.mjs`、`wep3-deployment-latest.mjs` 补进 `deploy-wep3.yml` 的 `paths`（属独立改动，未混入本轮）

## 5. 关于 Harness

你要求「先检查未提交改动、运行 Harness，再提交独立 PR，不得 reset/clean/强推」。

- 本轮所有改动都走分支 + PR，未对 main 强推，未执行 `reset --hard` 丢弃他人改动
- 工作区仍有 3 项非本席产生的未提交内容（`.mt/`、一份 docs 与一份 11-07 派单文件），**我未提交、未删除、未移动**
- Harness 本身（`node scripts/harness.mjs before receipt,model_output,input_hash,external_platform`）**本轮未执行成功**，我不声称它通过。需要时按你的参数格式单独跑一次并附输出
