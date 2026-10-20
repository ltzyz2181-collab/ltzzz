# Video Script · 2026-10-21 · Reconcile First, Then Sign: The Breaker That Stops a Half-Confirmed Aave Step

- 日期：2026-10-21（cron「LTZZZ 每日视频流水线」）
- 时长：15 秒（seedance_2.0_fast 单段上限；任务规格 15-30s 内取模型可渲染下限）｜ 比例：9:16 竖版 ｜ 语言：英文口播
- 渲染模型：seedance_2.0_fast ｜ 目标：先落本地 videos/，再经 GitHub Actions 入队 R2 ltzzz-videos/queue/，由 video-scheduler cron 公开发布

## 主题来源（当日真实产出，不编造）

1. `knowledge/results/wep3/aave-39372257199-attempt-1.json`（run 39372257199，2026-10-20T04:57Z）：approve 步骤已 confirmed（tx `0x3c19388d…23493`，区块 52841445，receipt_status=1），但 supply 未成交：顶层 http=422、error=latest_cash_or_exposure_limit、status=pending_confirmations、on_chain_executed=false、tx_hash=null —— 一个半确认、未对账的中间态。
2. 三份 10-20 compile 回执 `knowledge/results/funding/39421088746.json`（12:17Z）、`39467175979.json`（17:34Z）、`39495969140.json`（20:54Z）：均为 `phase=compile`、`transactions=[]`、`deployed=false`、`signed=false`、`tx_hash=null`、`status=blocked_prior_operation_requires_reconciliation`。
3. `scripts/aave-owner-funding.mjs` 第 25 行门禁：发现历史回执里有 failed_chain_operation（deployed=null）或 submitted/unknown 状态交易，直接 record blocked 并 process.exit(0)，**在签名之前**中断，不堆叠新动作。
4. 对应治理规则：已合并 PR #163 的 P1-02「未对账前禁止任何自动重试或重新 approve/supply；先只读核对 approve、allowance、intent、余额」。

## 与近期脚本不重复

- 10-12 金库可链上证明；10-15 rendered/private/not-published；10-16 finding≠fix；10-17 不许自审；10-19 rejection-is-evidence；10-19 zero-trades-proof-first（自愿持币不动）；10-20 existence≠acceptance（哈希匹配仍判 0 分）。
- 本条讲**签名前的对账断路器**：旧步骤半确认未对账 → 每次新 compile 在签名前被拦下，零交易、零签名、无 tx；与"主动持币不动"和"审核判分"均不同。

## 口播台词（VO，英文，约 15 秒）

```
An old Aave step was left half-done: approve confirmed, supply never settled.
Every new funding compile now hits the same breaker: blocked, prior operation requires reconciliation.
Three attempts today — empty transaction lists, nothing signed, no tx hash.
It refuses to stack a new move on an unreconciled one.
Reconcile first. Then sign.
```

## 分镜（shot 表，供 prompt 编译）

| Shot | 画面 | 时长 |
|---|---|---|
| 01 | 暗色链上控制台，一条两步流程条：左格 APPROVE 亮绿勾（confirmed），右格 SUPPLY 停在灰色问号（pending），冷蓝科技光 | 0-3s |
| 02 | 新的 compile 请求撞在一道红色断路闸上，弹出状态字 "BLOCKED · PRIOR_OPERATION_REQUIRES_RECONCILIATION" | 3-7s |
| 03 | 三份回执卡片叠落，每张都写着 transactions: []、signed: false、tx_hash: null；计数器停在 "ATTEMPTS: 3" | 7-11s |
| 04 | 结尾定格：断路闸转为"先对账"指引，标题字 "Reconcile first. Then sign."，LTZZZ 角标 | 11-15s |

- 画面文字均英文、简短；科技蓝绿暗色风；只使用上述真实状态值；不出现完整私钥/助记词/钱包全地址；无水印。
