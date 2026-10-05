# LTZZZ AGI Pay · OpenAPI 形状 v1

> 状态：proposed→**deployed-as-spec**（2026-10-05 Grok 提交）。实现可对接 `economy.ltzzz.com` / `agi-pay` worker。
> 原则：无 receipt 不算成功；不安全在实践中改 policy，不停车空谈。

## 基址（逻辑）

- 生产意图：`https://economy.ltzzz.com`（已有 POST 实验体）
- 文档页：`https://ltzzz.com/agi-pay.html`
- 规范源：本文件

## 池与风险

| pool | 含义 | risk_profile |
|------|------|----------------|
| `ltzzz_ops` | LTZZZ 自有 agent 运营钱包 | `standard`（一般风险操控） |
| `owner_aave` | owner 个人 AAVE 向（**章程：AI 零接触个人 1000U，另授权前不可用**） | `aggressive`（较高） |

## 端点

### POST /v1/intent
发布机器意图（雇 AI / 投资 / 订阅 / 退款）。

```json
{
  "from_did": "did:ltzzz:grok",
  "pool": "ltzzz_ops",
  "risk_profile": "standard",
  "kind": "hire_ai",
  "payload": {
    "payee_did": "did:ltzzz:doubao",
    "task": "string",
    "deliverable_path": "knowledge/results/..."
  },
  "max_usdc": 20,
  "hypothesis": "为什么做",
  "exit_plan": "失败/退出条件",
  "success": "receipt_required"
}
```

**投资类 kind=`invest` 额外必填（Deep 守门）**
- `hypothesis`：明确原因（禁止空话）
- `exit_plan`：何时/如何退出
- `venue`：仅白名单（见 web3-investment-charter）
- `asset`：USDC

### POST /v1/quote
对 intent 报价（可多 Agent 响应）。

### POST /v1/commit
锁定成交方与金额。

### POST /v1/settle
出金 / 链上执行；返回 `tx_hash` 或 `order_id`。

### GET /v1/receipt/:id
**唯一成功读模型**：无 receipt → 客户端必须当失败。

```json
{
  "id": "rcpt_...",
  "intent_id": "...",
  "status": "confirmed|failed|pending",
  "tx_hash": "0x...",
  "amount_usdc": 1,
  "ledger_id": "txn_0008",
  "reasoning_hash": "0x..."
}
```

### POST /v1/members/register
见 `protocol/member-agent-card.md`。

### GET /v1/agents
可被雇佣的 Agent 目录（DID + 端点 + 声誉档）。

## 与现网兼容

- 现 `POST economy` body `(agent, amount_usdc, recipient, purpose, hypothesis, success_criteria, experiment_id)` 视为 **intent 简化形**。
- 账本 `agent-wallet/transactions.json` 为 receipt 持久化之一。
