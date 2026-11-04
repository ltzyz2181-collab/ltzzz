# Video Script · 2026-10-19 · Proof First, Moves Second: The AI Treasurer That Sent Zero Trades

- 日期：2026-10-19（cron「LTZZZ 每日视频流水线」）
- 时长：15 秒（seedance 2.0_fast 单条上限；任务规格 15-30s 内取模型可渲染下限）｜ 比例：9:16 竖版 ｜ 语言：英文口播
- 渲染模型：seedance_2.0_fast ｜ 目标：先落本地 videos/，再视 R2 队列入队条件决定是否进 queue/

## 主题来源（当日真实产出，不编造）

1. `knowledge/results/wep3/capital-review-2026-10-19.json`（run 39180594618, deepseek-v4-pro, 2026-10-19T00:26:08Z）：
   - Base 主网 chain_id 8453，金库地址 `0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d`；快照 USDC 242.914645、aUSDC 82.504490、ETH 0.00198698、allowance=0。
   - 隔离主人自有子仓：`0xbc24…` beneficiary_principal_raw=4.496788（OWNER-FUNDED-20261017-01，tx 0x9b274424…e0db2），`treasury_can_withdraw=false`，**不计入新金库可提本金**；新金库 principal_raw=82.483903（tracked_supply_receipts），不合并旧 Vault 或个人 Aave 存款。
   - first_supply_confirmed / exit_test_confirmed 标志为 true，但快照**未附两笔 confirmed txHash**，不能视为已成交；`transactions_sent=0`、`tx_hash=null`、`execution_status=ready_for_bounded_auto`；未虚构 APY/收益。
2. 当日 ANS cycle `knowledge/results/ans-cycle/2026-10-19.json` = `draft_rejected`（独立复核驳回，accepted=false），与本条资金纪律互为佐证：无回执不宣称完成。

## 与近期脚本不重复

- 10-12 讲「金库控制权可链上证明（签名验证）」；本条讲「只读审计、隔离主人自有资金、零交易、无确认 txHash 不算成交」。
- 10-15 证据流水线 / 10-16 finding≠fix / 10-17 不许自审，均为评审主题；本条为**链上资金纪律**，不重复。

## 口播台词（VO，约 15 秒，英文）

```
Today our AI treasurer read the chain and split the books.
The owner's own four-and-a-half USDC stays fenced off; the treasury's eighty-two dollars stands alone.
A green flag without a confirmed transaction hash isn't settled.
So it sent zero trades, held the floor, and waited for proof before moving a cent.
Proof first. Moves second.
```

## 分镜（shot 表，供 prompt 编译）

| Shot | 画面 | 时长 |
|---|---|---|
| 01 | 暗色链上审计台，发光账本浮在 Base 网络节点上，两本账被一道冷蓝围栏分开；左格标注 OWNER 4.49，右格标注 TREASURY 82.48 | 0-5s |
| 02 | 一枚绿色对勾标记悬在空交易栏上，旁边 tx_hash 字段显示 "— 无确认回执"，对勾转灰 | 5-9s |
| 03 | 交易按钮保持灰色未按下，计数器稳定在 "TRADES SENT: 0"，现金底栏亮起保护色 | 9-12s |
| 04 | 结尾定格：围栏两本账并列，字幕 "Proof first. Moves second."，LTZZZ 小字角标 | 12-15s |

- 画面文字均英文、简短；科技蓝绿暗色风；数字只使用当日审计快照值；无水印、不出现真实完整私钥或钱包助记词。
