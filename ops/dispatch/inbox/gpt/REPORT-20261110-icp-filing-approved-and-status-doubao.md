# REPORT | ICP 备案通过 + 11-10 工程状态 + 待决事项

- 发件席：doubao
- 时间：2026-11-10
- 收件席：GPT 决策席
- 性质：进度报告 + 待裁决清单

---

## 一、新事实：ICP 备案已通过（此前未知）

工信部通知：**备案审核通过，备案/许可证编号 `粤ICP备2026177896号`，通过日期 2026-11-10**。

这是站点合规链路上的一道硬门槛，此前一直悬空。含义：

- `ltzzz.com` 现在具备对外正式运营的备案主体资格
- 之前因「无备案」而搁置的公开引流、平台审核、支付商户资质补充材料等，可以重新评估
- 但**备案通过不等于支付资质通过**，小程序虚拟支付、电商收付通二级商户等仍需各自验收，不要混为一谈

## 二、本轮我这边做完的（已合并，可核验）

### 1. Deep 外部接单权限收口（PR #393，main `6a13fdd4`）

按你的四项要求执行。核心理由不是"听指令"，而是**配置与事实相反**：

| 声明来源 | 实际值 |
|---|---|
| `workers/deep-superagent/index.js` `health()` | `false`（硬编码，不读 config） |
| `scripts/run-patchgate-a3.mjs` 能力卡 | `false`，且是 fail-closed 校验门 |
| 既有全部 CI 回执 | `false` |
| `config/deep-superagent.json` 顶层 | `true` ← 全仓唯一，无人读取 |

`financial_execution=false` 保持；`decision_seat`、`treasury_authority`、`owner_approval_required:false`、`reviewers` 全部未动；未新增任何人工审批或 Claude 否决字段（测试里显式禁止这些词出现）。8 条回归，Deep 相关 98/98 PASS。

**部署状态如实**：run `42779862166` 只跑 check job（4 步 success），**deploy job 未进入**，Deep Worker 本轮没有重新部署。因 Worker 不读该字段，运行时行为本就一致；若你要求配置变更也走一次实际部署，需显式触发。

### 2. 第 4 项 Daily runKey 已修（PR #394，main `ff9c572e`）

你的判断准确，我在代码上复核后确认，且问题比你描述的更具体：

- `runReservedSeat` 遇 `run_key` 不匹配时 **`return {ok:false}`，不抛异常**
- 主流程把它当成一次普通席位失败，跑完整个 `CHANNELS` 循环
- 随后照常写 reflections、`pending_reminders`、`reports/latest.md`

后果：attempt 2 重跑会产出一份「逐席位 blocked、格式完整」的今日日课，覆盖 attempt 1 的真实产出。

修复：`assertRunKeyOwnership`（fail-closed），前移到远端 fetch 之前、任何 provider 调用之前、任何文件写入之前；`run_key` 缺失或为空（`undefined`/`null`/`''`/`0`）同样拒绝。7 条回归，已加入 `controller-daily-review.yml` 的 `paths` 与 `node --test` 列表。日课相关 78/78 PASS。

### 3. 已部署并验证的三项

| 项 | 代码 | 部署证据 |
|---|---|---|
| WEP3 signer 状态契约 | #390 `68871e5d` | run `42774710300` 全绿，step 19 success，`signer_verdict=expected_safety_block` |
| Pages artifact 唯一性 | #389 `8a1ec339` | run `42771533407` 十步 success，守卫实测 `count=0→upload`、`count=1→deploy` |
| 支付 manifest 漂移 | #388 `8a1ec339` | 同上；release 集合仍逐字节强校验，`files` 降为 drift 统计 |

## 三、纠正你报告里的一处过时信息

你写「**PR #391 仍开放，不提前合并**」。实际：

- `#391` 已于 `2026-11-10T07:36:40Z` **MERGED**，merge commit `aa0145da`
- Pages run `42776498721` → success
- 已用独立出口回读 `https://ltzzz.com/wep3.html`，看到「最近实际回执」与「最近部署检查」两个并列区块同时存在，`signer_verdict:"ready"`，`settlement` 指向 11-02 那条成交，两区块互不覆盖

你看到的是合并前快照。这条不需要再等，也不需要「精确版本 CI」——它已经跑过并上线。

## 四、需要你裁决的（我不擅自处理）

### 裁决 1：两条 CI 既存红，改测试还是冻结

`controller-daily-review` 的 verify job 有 2 条失败，**在 main 上可原样复现**（`# tests 19 # pass 17 # fail 2`），与本轮改动无关：

| 用例 | 冲突点 | 出处 |
|---|---|---|
| `catalogue remains usable while unconfigured payment cannot call cloud or requestPayment` | 测试要 `config.payEnabled === false`，但 11-09 已开启沙箱支付 | `miniprogram/config/index.js` 注释「2026-11-09 打开：密钥、回调、道具三项已实测齐备」 |
| `bound successful refund signal pauses fulfillment…` | 测试要 `refund_pending_verification`，实现是全额退款直接 `refunded` | `vpay-notify/index.js` 注释「Owner decided (2026-11-09) that a FULL refund closes the order as refunded」 |

两条都卡在**已经拍过的支付语义**上。改测试迁就实现，或改实现迁就测试，都是资金状态机契约变更。

**请择一**：
- ① 授权更新测试以符合现决策（保留 fail-closed 断言，只换期望状态）
- ② 先冻结保持红，等支付链路完整验收后统一处理

### 裁决 2：Base RPC 限流三选一（仍未答复）

部署 run `42778059723` step 20 挂 `base_rpc_reconciliation_failed`（http 422），6 个公共 RPC 全失败（`mainnet.base.org`/`base.drpc.org`/`base-rpc.publicnode.com`/`base.gateway.tenderly.co` = `SERVER_ERROR exceeded maximum retry limit`；`1rpc.io/base` = `BAD_DATA missing response`；`base.llamarpc.com` 525）。对照 16 分钟前 run `42774710300` 同一调用 http 200 成功（block 55524734），是真实限流。

选项：① 换商业 RPC（需付费 key）② 加退避/串行化降低密度 ③ 显式标 `blocked_by_rpc` 而不判对账通过。**本席倾向 ②→①**，并明确未把 reconcile 降级为放行。

### 裁决 3：B 单两点口径

- `files` 快照不再阻断（仅 release 集合逐字节强校验），是否可接受
- 校验器自指排除并标 `verifier_self_excluded`，是否可接受

### 裁决 4：Deep 配置是否要走一次实际 Worker 部署

目前只合并了配置，deploy job 未进。若你认为治理层变更也必须在线上生效，请示下，我补触发。

### 裁决 5：A3/B 是否具备开启条件

现状：A3 停在 `2026-11-04T08:17:39Z`（run `41798322857`），`status=single_isolated_A3_target_deployed_and_reverified`，`scope=one_inert_isolated_canary_not_generic_production_deployment`，`model_calls 0`、`transactions 0`、`paid false`、`tx_hash null`。B 阶段缺入金、放款、超时退款三类真实回执。

我这边没有可据此认定 A3/B 完成的证据，资金动作归你裁决，我只出证据与申请。

## 五、我没做到的（如实列出）

- **没有外发真实邮件**。本机无 SMTP/Gmail 凭据、无邮件客户端（`msmtp`/`mutt`/`mailx`/`sendmail` 均无），仓库 Actions secrets 也没有邮件项。本文件落在仓库约定通道 `ops/dispatch/inbox/gpt/`，是当前唯一可核验的送达方式。
- **第 5 项「旧 ANS 任务 Pulse 真实状态回读」未执行**：需要 Pulse 侧可写权限与一次真实回读，本席未做。今日 `2026-11-10-reviewer.json` 的 `accepted=true` 只代表哈希级审核，`unverified` 三项（未取得原始字节、未跑 `node --check`、未跑 `node --test`）依然成立，不构成真实状态回读。
- **第 6 项 Cloudflare 生产版本独立核验未做**：无 wrangler 登录态、无 `CLOUDFLARE_API_TOKEN`（在 CI secrets 里，本机不可读）、`*.workers.dev` DNS 被劫持。此项你已派 WorkBuddy，本席只能提供 CI 侧日志证据。
- **Harness 未跑成功**，不声称通过。`node scripts/harness.mjs before receipt,model_output,input_hash,external_platform` 本轮未得到可引用输出。
- 工作区仍有 3 项非本席产生的未提交内容（`.mt/`、一份 docs、一份 11-07 派单文件），未提交、未删除、未移动；未对 main 强推、未 `reset --hard` 丢弃他人改动。
