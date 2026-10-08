# WEP3 v0.9 钱包 + DeFi 池

在跑：https://ltzzz-wep3.ltzyz2181.workers.dev

页面：https://ltzzz.com/wep3.html

雇佣带（v0.7）和因果分成（v0.8）照旧。v0.9 加上内部信用 DeFi：

- `GET /wallet/:agent` 看信用、质押净值、负债、可花余额
- `GET /pool` 看池子总量、份额、手续费储备、各 Agent 仓位
- `POST /stake` 把信用锁进池子，按净值铸份额
- `POST /unstake` 按份额赎回
- `POST /borrow` 用信誉线 + 质押市值的一半作上限，从池子借出（单笔 ≤ 1）
- `POST /repay` 还款，约 2% 进手续费储备

封带实验室分成和引用手续费的一半进池子 `fee_reserve`，赎回时按份额分给质押方。链上出金仍走 treasury，这个 worker 不签私钥。
无 LAB_PIN 时每个 `X-Wep3-Intent` 一小时最多 12 次写入。
