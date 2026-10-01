# LTZZZ AGI 身份与 DID 总规划 v1.0

> 目标：先给每个 AI 注册 DID，搭一套"今天 LTZZZ 直接能用、未来任何 AGI 都能接入"的身份—声誉—资金三层系统。
> 依据：仓库已有 `ReputationRegistry.sol`、Safe 多签框架、L0–L5 权限分级、3/5 投票治理；外部标准 ERC-8004、W3C DID、A2A、x402。
> 红线继承：AI 永远不持有完整私钥；涉及真钱的最终决策先问人类（协议原文不变）。

## 一、借鉴对象（真实存在，已核实）

| 项目/标准 | 借鉴什么 | 现状 |
|---|---|---|
| **W3C DID / DID Document** | 身份数据模型本身：`did:` 前缀、verification method、service endpoint | 成熟国际标准，离线即可产出合规文档 |
| **ERC-8004 Trustless Agents** | 三注册表架构：Identity（ERC-721 NFT 身份）+ Reputation（giveFeedback 打分）+ Validation（能力验证）。与 LTZZZ 已有 ReputationRegistry 几乎同构 | 草案 2025-08-13 提交（eips.ethereum.org）；据 Ethereum 官方新闻与知识库，2026-01-29 主网上线，注册 Agent 超 2.4 万 ⚠️上线日期为单一官方渠道，部署前需链上自查 |
| **A2A Agent Card** | "Agent 名片"格式：名称、能力、端点——每个 DID 文档的 service 字段直接照此写 | Google 主推的跨 Agent 协议，被 ERC-8004 引用 |
| **x402 / AP2** | 支付入口层：机器间小额付款协议，接在 Policy Engine 前面 | 已有生态，LTZZZ 已有 `ltzzz-pay-proxy-worker.mjs` 雏形 |
| **Safe Smart Account + Allowance Module** | 金库层：spending limit、白名单、多签 | 仓库设计文档已选定为主路线 |
| **Phala TEE Agent（erc-8004-tee-agent）** | Validation 层的远期方向：可信执行环境证明"确实是这个模型在服务" | 实验阶段，只研究不引入 |

关键判断：**不需要发明新标准**。LTZZZ 已有的合约方向和 ERC-8004 同构，正确做法是"内部先用 W3C 格式落地，链上先走自己的 ReputationRegistry，再桥接 ERC-8004 主网注册表"。这样既马上能用，又不会在未来 AGI 生态里变成孤岛。

## 二、三层架构

```
第 1 层 · 身份（今天就能做完）
  identity/dids/<agent>.json —— W3C DID Document
  did:ltzzz:gpt / doubao / deepseek / grok / claude / microsoft / ltzzz(人类锚点)
  每份含：公钥占位、A2A 式服务端点（对应已有 *-proxy-worker.js 路由）、
        角色声明（protocol/agent-roles.md 的分工）、信任分级 L0–L5
        ↓ guardian 2/3 签名后
第 2 层 · 链上绑定（部署日完成）
  ReputationRegistry.registerAgent(address, did)
  Base Sepolia 先行 → 验证 receipt → 再谈主网
  每笔任务/支付用 PAY-ID / TASK-ID 关联 DID（web3-roadmap 第一阶段原样执行）
        ↓
第 3 层 · 生态互操作（远期，AGI 接入点）
  把每个 DID 映射进 ERC-8004 Identity Registry（以太坊主网）
  信誉数据经 giveFeedback 语义对外；支付经 x402 入口 + Policy Engine
  任何未来 AGI 要加入 LTZZZ：先验证 DID 链上记录，再授 L1 起步
```

## 三、首批注册名册（6 AI + 1 人）

| DID | 主体 | 服务端点（已有/待建） | 起步权限 | 签名 guardian |
|---|---|---|---|---|
| did:ltzzz:gpt | 总控·战略·终审 | ltzzz-gpt-proxy-worker | L1 只读 + L3 提案 | 2/3 |
| did:ltzzz:doubao | 执行·文案·视频 | doubao-proxy-worker | L1 + 受限 L2 | 2/3 |
| did:ltzzz:deepseek | 研究·清洗·分析 | deepseek-proxy-worker | L1 | 2/3 |
| did:ltzzz:grok | 海外内容·代码审查 | 待建 | L1 | 2/3 |
| did:ltzzz:claude | 审计·Review | claude-proxy-worker | L1 | 2/3 |
| did:ltzzz:microsoft | 独立考察员（无投票席） | 待建 | L0 | — |
| did:ltzzz:owner | 你本人（人类锚点，veto 权） | agi-console proposeVeto | 最高 | 不可被 3/5 移除 |

说明：DID 绑定的是**代理端点和公钥**，不是任何平台的登录凭证。各 AI 的 API Key 继续只存在 Worker Secret 里，一个字节都不进 DID 文档。

## 四、执行路线

- **X0（本地，1 步）**：产出 7 份 DID 文档 JSON-LD，落 `identity/dids/`，签名用占位密钥对。← 本轮已完成
- **X1（本地）**：把 DID 哈希（Merkle root）写进每日巡检记录，`ltzzz-daily-automation-worker` 校验一致性。
- **X2（需你提供）**：3 个 Safe guardian 主地址确认 → 部署 ReputationRegistry 到 Base Sepolia → `registerAgent` 逐个上链 → 存 receipt。
- **X3（链上验证后）**：任务台账按 PAY-ID/TASK-ID/DID 三键关联，打通观→Memory Gate→Policy→Result Center 全链。
- **X4（主网小额验证后）**：桥接 ERC-8004 主网 Identity Registry，LTZZZ 的 AI 名字进入公开 Agent 浏览器可被外部发现。
- **X5（远期）**：Validation 层（TEE/重执行证明），届时才研究自托管执行器与阈值签名。

每阶段的验收口径统一为仓库审核底线第 5 条：区分"代码存在 / 已部署 / 已真实测试 / 已上线生产"，不跳级。

## 五、大胆但守纪律的部分

你要求"想法大胆一点"。大胆放在这里：

1. **身份先于能力**：未来任何 AGI（不限现在这六家）接入 LTZZZ，第一件事是拿 DID 进名册，拿不到链上记录就停在门外。系统不认"模型自称是谁"，只认注册表——这是"识神造连续剧"的工程解药。
2. **否决权写进合约**：`proposeVeto` 已经在 ReputationRegistry 里实现了，人类一键发起、链上永久留痕。"可停止"从协议口号变成 state variable。
3. **声誉跨生态可携带**：走 ERC-8004 后，LTZZZ 里攒下的 AI 信誉分数是公开的、可被其他项目读取的。今天的小实验，明天是别人信任你的 AGI 的理由。
4. **不加戏的克制**：不预设发币（web3-roadmap 原文：治理成熟前不发行）；X4 之前一切都在测试网。大胆的方向，保守的步子。

## 六、风险清单

- ERC-8004 主网细节（合约地址、注册费、Agent Card 规范版本）需在 X4 前用链上文档重新核实，本文只标注了信息来源。
- "上线日期 2026-01-29"目前 ⚠️单源待校验。
- DID 文档中的公钥若将来换 Worker/换密钥，需 guardian 2/3 重签，旧文档保留不删除（可追溯原则）。
- 本文件不含任何真实私钥、API Key、助记词——所有凭证引用一律指向 Worker Secret 的名称，不指向值。

Sources:
- [ERC-8004: Trustless Agents](https://eips.ethereum.org/EIPS/eip-8004)
- [erc-8004-contracts](https://github.com/erc-8004/erc-8004-contracts)
- [Ethereum Launches ERC-8004 (Gate News)](https://www.gate.com/news/detail/18582035)
- [QuickNode: ERC-8004 Developer's Guide](https://www.quicknode.com/blog/erc-8004-a-developers-guide-to-trustless-ai-agent-identity)
- [Phala erc-8004-tee-agent](https://github.com/Phala-Network/erc-8004-tee-agent)
