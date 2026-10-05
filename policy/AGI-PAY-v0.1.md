# AGI-PAY v0.1 · 未来 AGI 支付项目方向与风险分层

> Owner 2026-10-04 指示：AI 投资/花钱要有自己的想法，大胆创新；wep3 项目目标是**真正的未来 AGI 支付**；
> 不预设安全焦虑，实践中遇到问题改问题、遇到不安全改不安全；风险按钱包分层操控。
> 本文件取代 policy/web3-investment-charter-v0.1.md 中与之冲突的条款（试点档单笔/敞口上限按本文件调整）。

## 1. 风险分层（三轨操控）

| 轨 | 钱包 | 定位 | 风险操控 | 决策权 |
|---|---|---|---|---|
| A 轨 | agent EOA 0x21F5…7fdc（USDC≈40） | **AI 自主投资/花费，不受约束** | 自治：AI 自主提案、自主出金、自主验收 | AI 自治（记账+回写强制，余额<5 告警） |
| B 轨 | Safe 0x7637…58a3（USDT≈49） | 一般风险资金 | 多签+Owner 终审（当前 4 有效签：克劳德签位待 Owner 链上移除） | AI 提案 → 多签 → Owner 确认 |
| C 轨 | Owner 个人 AAVE（1000U） | 较高风险投资 | AI 只出信号/策略，不动手；决策与操作全在 Owner | Owner 全权 |
| D 轨（规划） | 会员/订阅资金池 | 未来 AGI 支付收款侧 | 链上记权益，到期自动失效 | 协议自动 |

A 轨放开后：取消单笔 ≤20 / 日限 60 的硬顶，改为**动态防线**——余额低于 5 USDC 自动停花并告警；单笔超过余额 50% 需提案写明 hypothesis；waste 判定与声誉挂钩照旧。
实践中任何一轨暴露真实不安全（丢钱/被黑/误结算）→ 立即收紧该轨并在本文件记录修订，不预设、不空谈。

## 2. AGI 支付核心机制（产品定义）

传统支付：人付钱买商品。
AGI 支付：**机器读懂意图 → 路由到执行者 → 链上结算 → 绑定可验证结果证明**。买的是"确定性执行"，不是物品。

LTZZZ 已跑通的原始闭环：AI 派单 → 执行 → 验收 → 链上 USDC 结算 → reputation 回写 + batch 锚定。
把它产品化即 AGI-PAY 的最小形态。

三大不可妥协特性（也是与普通支付的差异）：
1. **意图优先（Intent-first）**：支付请求是一份结构化意图（预算上限 / 要什么结果 / 验收标准 / 收款方），不是一串金额。
2. **结果绑定（Proof-of-Result）**：每笔结算必须附可验证结果证明（CID 哈希 / 执行日志 / 验收签名）。"没结果不结算"。
3. **声誉信用（Reputation Credit）**：AI 的支付额度来自可验证历史声誉，不是人批。声誉分 → 额度 → 自动出金 → 事后审计。

## 3. Payment Gateway 统一接口（为其他钱包/会员注册预留）

所有入金、出金、意图、回执走同一抽象，未来任何钱包/会员通道都是插拔实现：

```
POST /pay/intent      AI 花钱提案（budget / deliverable / acceptance / payee）
POST /pay/execute     执行出金（路由到 A/B/C 轨策略）
GET  /pay/status/:id  结算状态（pending → executed → verified | failed）
POST /pay/receipt     回执入库（tx_hash + proof_cid + verification）
POST /member/register 会员注册（身份 + 入金通道绑定 → 链上权益凭证）
POST /member/subscribe 订阅（链上时钟，到期自动失效）
```

- 入金 In：Gumroad / PayPal / 微信 / USDT / USDC → 统一记账（transactions.json 兼容扩展）
- 出金 Out：agent EOA / Safe / 交易所 / 速捷卡 / 未来 AGI 钱包 → 统一 spend 日志
- 身份：identity/dids 每 AI 一份 DID + 钱包 + 声誉分；会员注册复用同一 DID 层
- 会员权益：ERC-1155 能力通证（到期时间戳），链上验证，微信/Gumroad/链上多通道共用

## 4. 立即试点（Deep 愿意测第一个）

**exp_005 · AGI 自治花钱闭环**：DeepSeek 席作为第一个被测者——
1. Deep 提出真实花钱意图（≤2 USDC，明确要买什么能力/验收标准）；
2. 走 A 轨（AI 自治，不受约束，无需 Owner 审批）；
3. 我执行出金（真实 tx_hash）；
4. 结果证明（CID/日志）+ 验收回写 reputation；
5. 产出：一份可复用的"意图支付"模板（intent schema），供其他 AI 席沿用。

验收标准：tx_hash 可链上复核 + 结果证明与花费一一对应 + 意图模板可复用。

## 5. 迭代纪律

- 大胆试：先跑通最小闭环，再扩场景（API 额度购买 → x402 外部服务 → 会员订阅 → 跨席结算）。
- 现场修：暴露真实问题就改代码/改政策，不因噎废食。
- 记账不可省：任何一笔钱必须有 receipt；无 receipt 不标 confirmed（唯一保留的硬红线）。
- 私钥/卡号仍不入对话不入仓库（这是物理边界，不是"谈安全"）。
