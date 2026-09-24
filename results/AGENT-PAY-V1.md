# Agent Pay / Treasury v1（XAI）

## 变更

`SIMULATED_SUCCESS` 已移除。

```
AI → Payment Policy → Transaction Queue → Safe → ERC20 USDT → TxHash → Confirm → Ledger → Memory
```

## 限额与白名单

- SINGLE_TX_LIMIT / DAILY_LIMIT / MONTHLY_LIMIT
- TOKEN_ALLOWLIST / CHAIN_ALLOWLIST / DESTINATION_ALLOWLIST

## 网络

- 默认 sepolia + DRY_RUN=true（每天 cron 08:30 北京时间开通窗口记录）
- 主网：Safe 备好 **ETH gas** + 启用 Allowance Module 后 `DRY_RUN=false`

## 健康检查

`https://ltzzz-agent-pay.ltzyz2181.workers.dev/health`

应见 `simulated_success: false`。
