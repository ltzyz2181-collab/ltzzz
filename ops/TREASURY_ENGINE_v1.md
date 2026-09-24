# LTZZZ-TREASURY-001 · Agent Treasury Engine v1

## 链路

```
Agent (GPT|豆包|XAI)
  → POST /propose
  → Allowance: SINGLE_TX / DAILY / TOKEN_ALLOWANCE
  → Safe Module 路径（ERC20 transfer calldata）
  → TxHash（dry_run 或 /confirm 回填）
  → results/treasury + Memory
  → Telegram 提案/执行/成功/失败
```

## Safe

- **不删除** 现有 Safe：`0x76379a52a9e82c259E5Db417104C65C26f9C58a3`
- 官方思路：Allowance / Spending Module 给 Agent 委托额度
- Worker **不存 Owner 私钥**；主网真实执行前在 Safe UI 启用 Module 并注入测试额

## 网络

- 默认 `NETWORK=sepolia` + `DRY_RUN=true`
- 主网：改 vars，确认 Module 与 USDT 地址后 `DRY_RUN=false`

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /health | 状态 |
| GET | /agents | 各 Agent 限额 |
| POST | /agents/config | 改单笔/日/总额度/暂停某 Agent |
| POST | /pause /resume | 全局暂停恢复 |
| POST | /propose | 自动提案+额度检查 |
| GET | /list | 队列 |
| POST | /confirm | 回填 TxHash + 确认 |

Bearer: `LTZZZ_AGENT_TOKEN`（若已配置）

Telegram 可选 Secret：`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`

## 部署

```bash
wrangler deploy -c wrangler.treasury-engine.toml
```
