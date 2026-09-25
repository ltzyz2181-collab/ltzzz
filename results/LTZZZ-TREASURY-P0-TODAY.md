# LTZZZ-TREASURY-P0-TODAY

## 状态（部署后看 /status）

| 标志 | 含义 | 当前预期 |
|------|------|----------|
| CODE READY | 管道代码在线 | ✅ |
| TESTNET OK | sepolia / dry_run | ✅ |
| MAINNET READY | ethereum + Module + ETH gas 标志 | ⏳ 明天补 ETH + 启用 Module |
| REAL TX SUCCESS | /confirm 非 dry TxHash | ⏳ 首笔真实成功后 |

## 不变

- Safe：`0x76379a52a9e82c259E5Db417104C65C26f9C58a3`
- 限额：SINGLE / DAILY / MONTHLY
- Agent：GPT / 豆包 / XAI 均可 `POST /pay`
- **无 Owner 私钥进 Worker**

## 明天 Mainnet 最小额

1. Safe 充少量 ETH（gas）
2. Safe UI 启用 Allowance Module
3. Dashboard vars：`ALLOWANCE_MODULE_ADDRESS`、`ETH_GAS_FUNDED=true`、`DRY_RUN=false`、`NETWORK=ethereum`
4. 最小额 `POST /pay` → 链上执行 → `POST /confirm` 带 TxHash

## 豆包转账

豆包可先 `POST /pay` 进队列；真实链上成功后把 TxHash 给 `/confirm`，即记 Ledger/Memory。
