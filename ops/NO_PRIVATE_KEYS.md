# 红线：仓库与 AI 上下文禁止私钥

## 禁止出现在 GitHub / 网页 / 聊天 / Worker 代码中的内容

- 私钥、助记词、seed、keystore 明文
- 任意 `0x` + 64 位 hex 若作为 **private key** 使用
- 交易所/Bot API 的完整 Secret（应用 Cloudflare Secret，不进 Git）

## 允许

- 公开地址（Safe、收款地址）
- TxHash、订单号、限额配置
- Safe Allowance Module 的**策略与队列**代码

## LTZZZ Treasury 模型（改正后）

```
Agent 提案
  → 额度检查（SINGLE_TX / DAILY / TOKEN_ALLOWANCE）
  → Safe（现有地址保留）
  → Allowance / Spending Module（链上）
  → ERC20 转账
  → TxHash → 账本 → Memory
```

**没有任何 Agent（GPT / 豆包 / XAI）持有或「托管」私钥。**  
执行权限来自 Safe 上已启用的 Module 与链上额度，不是把私钥交给模型。

## 扫描

定期：`rg -i "private_key|mnemonic|BEGIN PRIVATE"` 于仓库根目录，命中即删并轮换。
