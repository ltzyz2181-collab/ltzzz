# LTZZZ Web3 Agent Treasury Design v0.2

## 目标
让 LTZZZ 的 AI 能够在未来进行可审计的小额链上支付/转账，同时把公共资金、AI 决策和人工控制分开。

## 已有基础
- LTZZZ Safe：作为公共资金金库。
- `agent-pay-policy.json`：支付治理与人工确认规则。
- `agent-pay-worker.js`：目前是协议框架 + dry-run，尚未真实结算。
- `auto-withdraw-worker.js`：目前仍是测试模式，真实出金代码为 TODO，不能冒充真实自动提款。
- `wallet/` 与 `finance/`：负责地址、余额、交易和账本记录。

## 外部成熟组件研究
### Safe Smart Account + Allowance/Spending Limit
Safe 官方已经提供 AI Agent 的 Smart Account quickstart，包括人工审批、多 Agent、以及给 AI Agent 设置 spending limit 的方案。Allowance Module 可以按 token 设置一次性或周期性额度，例如每天固定 USDC allowance。Safe Modules 也支持 recurring transactions、whitelist、rate limit 等限制。生产环境应优先基于 Safe 的官方/审计版本与官方模块，而不是自行实现一套私钥钱包。 

### Coinbase AgentKit
AgentKit 提供 AI Agent 钱包和链上操作基础设施，可作为未来接入层研究对象，但 LTZZZ 的公共资金治理仍应由 Safe/政策层控制，不把 AgentKit 钱包直接当作公共金库。

### x402 / Agent-to-Agent Payments
x402、MPP 等适合作为“服务付款协议/支付入口”，不是 LTZZZ 公共金库本身。它们可以接在 Payment Gateway 前面，由 Gateway 再经过预算、额度和审批策略。

### AAWP / AgentWallet
这些项目可作为实验性参考，但在 LTZZZ 当前阶段不直接承载真实公共资金。先研究其 agent identity、spending policy、escrow 和 audit trail，再决定是否引入。

## LTZZZ 推荐架构
```text
AI Agent
  ↓
观 / Memory Gate
  ↓
Payment Proposal
  ↓
Policy Engine
  ├─ 预算检查
  ├─ 单笔额度
  ├─ 日/月额度
  ├─ destination allowlist
  ├─ chain / token 校验
  └─ human-confirm threshold
  ↓
Safe Smart Account
  ↓
Allowance / Spending Limit Module
  ↓
On-chain transaction
  ↓
Receipt / TxHash
  ↓
Result Center + Finance Ledger + Memory
```

## 核心安全规则
1. AI 永远不持有 LTZZZ Safe 的完整 owner 私钥。
2. AI 可以提出交易，但真实公共资金转账必须经过 Policy Engine。
3. 默认模式仍为 `human-confirm`。
4. 只有未来经过充分验证的低风险、小额度、白名单目标，才考虑启用 policy-auto。
5. 单笔、每日、每月额度必须同时存在。
6. 不允许 AI 自己修改额度、白名单或审批规则。
7. destination、chain、token 必须逐项核对；ERC20 网络错误不能靠 AI 猜测修复。
8. 每笔真实交易必须保存 request_id、proposal、approval、tx_hash、receipt、实际金额、手续费和最终余额。
9. “API 调用成功”不等于“链上转账成功”；只有 receipt/链上状态确认后才记为 VERIFIED。
10. 用户明确要求：涉及真钱的最终支出/转账决策必须先询问用户。

## 下一阶段
- [ ] XAI/Grok 代码审查：对现有 `agent-pay-worker.js`、`auto-withdraw-worker.js`、`wallet/`、`finance/` 做安全审查。
- [ ] 建立 `Payment Proposal` 数据结构。
- [ ] 建立 Safe Allowance Module 的 testnet 实验，不碰 LTZZZ 生产资金。
- [ ] 增加 chain/token/destination allowlist。
- [ ] 增加 receipt verification。
- [ ] 增加每日/每月预算锁。
- [ ] 先在 Sepolia/Base 等测试环境验证，再讨论主网小额。

## 当前结论
LTZZZ 目前**没有成熟的“让 AI 随便控制 Safe 真金白银”的一键项目**。成熟路线是组合成熟组件：Safe Smart Account + Allowance/Spending Limit + Policy Engine + 审计账本，再把 x402/MPP/AgentKit 作为外围能力。这样可以逐步从“AI 提议”走向“受限自动执行”，而不是一步到位把资金交给模型。
