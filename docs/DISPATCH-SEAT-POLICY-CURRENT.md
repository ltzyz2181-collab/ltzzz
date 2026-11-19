# 派单席位政策：重要任务多派（2026-11-17 生效）

## 一、规则（owner 2026-11-17 口述，原文「重要任务叫 deep 多派，中转克劳德和 GPT」）

| 重要度 | 派法 | 席位 |
|---|---|---|
| high | 多席 | **Deep 主办执行** + **Claude 中转独立复核** + **GPT 中转独立复核** |
| medium | 单席 + 自检 | Deep 主办；改动前后自跑测试并回读 |
| low | 直做 | 不派单 |

判定 high 的触发词（写进 `config/dispatch-seat-policy-20261117.json`）：资金、放款/支付、退款、签名、5 签 Safe、部署、凭据、合规、对客户口径。

## 二、硬边界（不变）

1. 资金、放款、退款终判、签名、5 签 Safe —— 仍由 GPT 决策席或 owner 本人裁决，**中转模型只出意见**。
2. **GPT 中转与 Claude 中转都不持裁决权**（卡里 `decision_authority: false`，违反即 CI 判错）。
3. 重要任务派单前必须走 preflight（`lessons_considered` 是强制项，`scripts/lib/lessons.mjs` 已有校验）。

## 三、怎么用（这是唯一入口，别手搓卡）

```bash
# 生成一张合规卡（high 会自动带三席）
node scripts/dispatch-seat-policy.mjs template \
  --task-id SOURCE-INTEL-MVP-20261117-01 \
  --package-id LTZZZ-SOURCE-INTEL-MVP-20261117-01 \
  --importance high --prompt "..."

# 校验现有卡
node scripts/dispatch-seat-policy.mjs check
```

CI 已挂：`.github/workflows/dispatch-seat-policy.yml` —— 动到 `ops/deep-superagent/tasks/**.json` 或政策/脚本时，自动跑单元测试 + 卡校验，不合规直接红。
队列侧的消费入口也已接线：`.github/workflows/deep-superagent-queue.yml` 的 `verify` 在 POST 之前执行
`node scripts/dispatch-seat-policy.mjs check`，政策卡不合规就不会进入消费 job。

## 四、边界如实写（别当成全仓已强制）

- 现存历史卡没有 `importance`/`seats` 字段，`check` 把它们计入 `legacy` 且**不判错**；具体数量以当次 `check` 输出为准。
  历史卡不回填，避免伪造派单记录。
- 2026-11-17 之后新建或重派的卡走 `template` 或每日卡生成器，才会真正被三席/单席约束。
- 政策是 owner 口述，落成配置 + 脚本 + CI 三道；`authority_kind=owner_verbal`，未经 owner 书面改写前不改。

## 五、每日自动派单（2026-11-18 接线）

此前只有「push 卡文件才触发队列」，没有任何定时生成器，所以每日实际触发数为 0。现在补成闭环：

1. **生成器**：`scripts/dispatch-daily-card.mjs --date YYYY-MM-DD [--suffix N]`
   - 写 `ops/deep-superagent/tasks/DEEP-SUPERAGENT-<YYYYMMDD>-DAILY-<N>.json`；`N` 默认 1，
     同日重试可用 2-9，任务 ID / 包 ID / 文件名一起变化，证据仍取自当天公开回执；
   - `importance=medium`，`seats=[{seat:deep, role:primary_executor, decision_authority:false}]`；
   - 只汇总公开回执（`dispatch/oversight`、`mail-intake`、最近队列卡、`daily-merge`、git HEAD）；
   - 证据缺失写 `unknown`，不猜测；同一天同一 suffix 重复运行幂等且不覆盖既有卡。
2. **定时**：`.github/workflows/deep-dispatch-daily.yml`，cron `17 0 * * *`（00:17 UTC），也可 `workflow_dispatch` 指定日期与 suffix。
3. **PAT 推送触发队列**：卡文件用 `LTZZZ_AGENT_TOKEN`（PAT）推送到 main，让 GitHub 产生真实的
   push 事件与 `before..after` diff，再由既有的 `deep-superagent-queue.yml` 消费。
   不能直接用 `GITHUB_TOKEN` 推送（GitHub 会抑制其触发的下游工作流），也不能在
   `workflow_dispatch`/`schedule` 里直接跑队列脚本（队列信任模型要求真实 push range，
   否则 fail-closed 为 `trusted_push_range_required`）。另需先清除 actions/checkout 写入的
   `http.https://github.com/.extraheader`（它会让推送仍以 GITHUB_TOKEN 身份发出、触发被抑制），
   再设置带 PAT 的 remote URL。推送后工作流会轮询确认对应 `head_sha` 的队列 run 已创建；
   执行结果仍以该 run 的回执为准。
4. **入队前门禁**：生成卡后先跑 `check`；队列入口 `normalizeTaskCard()` 也会对 `importance`/`seats` 做 fail-closed 校验，
   并把政策元数据剥离后再发 worker（worker 的 5 字段 schema 不变）。
5. **中转裁决**：Deep 卡输出里的 `ASK | ref | gpt | ...` 由每日合并脚本提取为
   `ops/deep-superagent/ruling-requests/` 的公开请求，状态 `awaiting_gpt`；中转席只出意见，不持裁决权。

如实边界：这一步解决的是「每天有一张 Deep 卡被真实消费」，不等于业务验收、模型权重训练或平台已接受。

