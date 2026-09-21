# LTZZZ 钱包账本（只读）

归 **人类主权**。本目录是账本，不是热钱包、不是自动出金 Worker。

| 文件 | 内容 |
|------|------|
| [balances.md](./balances.md) | 余额快照 |
| [deposits.md](./deposits.md) | 入金 |
| [withdrawals.md](./withdrawals.md) | 出金（必须人工确认） |
| [transactions.md](./transactions.md) | 全部分录 |
| [addresses.md](./addresses.md) | 公开收款地址 |
| [schema.md](./schema.md) | 每笔字段 |
| [index.html](./index.html) | Pages 查看页 |

## 规则

- 不写私钥、助记词、商户 Secret。
- 出金：`人工确认 = 否` 不得视为已付。
- AI 只记账、只读链上公开信息。
- 网络必须与收款方一致（X Layer 错网已记过一次）。
