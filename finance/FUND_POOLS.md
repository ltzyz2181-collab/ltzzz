# LTZZZ 独立资金池与记录架构

> 真实收款账户 / 钱包 **归 LTZZZ 人类主权者**；AI 只读规则与公开账本摘要。
> 支付分层见 [PAYMENT_LAYERS.md](./PAYMENT_LAYERS.md)。

最后更新：2026-09-19

## 原则

| 原则 | 说明 |
|------|------|
| 人持钥 | 私钥、商户密码、PayPal Secret 只在人类/CF Secret |
| 池隔离 | 不同用途分地址或科目 |
| 先记后付 | 有预算与 PAY-ID 再授权 |
| 公共资金 | Safe 3/5；单 AI 或单人热路径不能单独转走公共池 |
| 凭证云端化 | 主人无需本地保留配置文件；授权一次写入 Secret |

## 资金池

| 池 ID | 名称 | 载体 | 控制 |
|-------|------|------|------|
| POOL-OPS | 运营热钱包 | `0xb99C6751f443842F4987bb2017580405572Df905` | 人类 |
| POOL-SAFE | 共管金库 | `0x3cb1b0963A27Fa8D40ee606bc596C79FE3B1866a`（ETH · 3/5） | ≥3 owners |
| POOL-CHARITY | 公益展示 | charity.html 展示地址 | 人类 |
| POOL-API-* | 模型余额 | DeepSeek / 方舟官网 | 人类充值 |
| POOL-FIAT-CN | 支付宝 | 商户（权限/风控挂起） | 人类 |
| POOL-FIAT-PP | PayPal | 骨架 Worker，Secret 待填 | 人类 |
| POOL-PAY-LEDGER | 授权账本 | ltzzz-pay-proxy + KV | 记录；真付看通道 |

## 记录

- https://ltzzz-pay-proxy.ltzyz2181.workers.dev/health
- /balance · /ledger
- 仓库 `finance/` + `lab/`

## 状态

| 组件 | 状态 |
|------|------|
| 架构文档 | 🟢 |
| pay-proxy 账本 | 🟢 只读 |
| Safe 3/5 ETH | 🟢 |
| 支付宝真付 | 🔴 40006 / 风控 |
| PayPal | 🟡 代码骨架，未接 Secret、未真扣 |
