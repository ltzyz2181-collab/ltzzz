# LTZZZ-TREASURY-001 · Agent Treasury Engine v1

## 原则（2026-09-24 修订）

- **无私钥进 Worker / 仓库 / 豆包 / GPT / XAI 上下文**  
- Agent 只做：提案、额度检查、队列、账本、通知  
- 链上执行：现有 Safe + **官方 Allowance Module** 思路  
- 不删除现有 Safe：`0x76379a52a9e82c259E5Db417104C65C26f9C58a3`  

## 链路

```
Agent (GPT|豆包|XAI)
  → POST /propose
  → SINGLE_TX / DAILY / TOKEN_ALLOWANCE
  → Safe Module 路径（ERC20 calldata）
  → TxHash（dry_run 或 /confirm）
  → results/treasury + Memory
  → Telegram
```

## API

| 方法 | 路径 |
|------|------|
| GET | /health /agents /list |
| POST | /propose /agents/config /pause /resume /confirm |

默认 `NETWORK=sepolia`，`DRY_RUN=true`。  
详见 Worker：`treasury-engine-worker.js`。  
红线：`ops/NO_PRIVATE_KEYS.md`。
