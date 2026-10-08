# WEP3 v0.9.1 账本 + 日终对账

在跑：https://ltzzz-wep3.ltzyz2181.workers.dev

页面：https://ltzzz.com/wep3.html

## P0

- `GET /ledger?since=&limit=` 统一账本：hire_settle / cite / stake / unstake / borrow / repay
- 每笔带 `hash` 与 `balances_after` / `pool_after`
- `scripts/wep3-daily-reconcile.mjs` + `.github/workflows/wep3-daily-reconcile.yml` 日终写入 `results/wep3-reconcile-YYYY-MM-DD.json`
- 页面展示池子、钱包净值、最近账本

链上出金仍走 treasury。WEP3 信用与链上 USDC 分表，对账脚本会注明。
