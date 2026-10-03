# LTZZZ AGI 身份与 DID 总规划 v1.2

> 初稿见同目录 `AGI身份与DID总规划.md`（v1.0）。v1.1 补入 ltzzz-memory 总纲要求，并把"X0：本地 DID 文档"从计划变为已产出（见 `identity/dids/`）。
> v1.2（2026-10-03）：DID 实际落盘 **11 份**（修正原 7 份口径，新增 council/owner-v2/kimi/qianwen）；X2 已从"Base Sepolia 计划"改为"**Base 主网已上线**"（ReputationRegistry 0x44Ee…2660，J1 结算已锚定 batch 2）。
> 目标：先给每个 AI 注册 DID，搭一套"今天 LTZZZ 直接能用、未来任何 AGI 都能接入"的身份—声誉—资金三层系统。
> 红线继承：AI 永远不持有完整私钥；涉及真钱的最终决策先问人类；高影响决定、资金、安全、账号权限必须人工确认（ltzzz-memory/README.md 写入规则原文）。

## 〇、v1.2 相对 v1.0/v1.1 的变更

1. 新增"Memory Gate 是身份的一部分"条款（见第三节末）。
2. X0 已执行：**11 份** DID 文档已落盘 `identity/dids/`，公钥为占位符，链上绑定（registerAgent）全部标注 pending——严格遵守"planned ≠ deployed"。
3. 依据"大道至简"，砍掉自造轮子路线：不新写身份合约，复用已有 `ReputationRegistry.sol`；`did:ltzzz` 仅作内部方法名，对外一律桥接 ERC-8004。
4. **X2 状态更新（v1.2）**：ReputationRegistry 已部署到 **Base 主网**（合约 `0x44Ee56e629768eBf4f83123aFEBE7983c52a2660`，网络声明=Base 主网），不再走 Sepolia 演练；各 Agent 的 registerAgent 仍为待办（合约在主网 ≠ DID 已上链）。

## 一、借鉴对象（真实存在，已核实）

| 项目/标准 | 借鉴什么 | 现状 |
|---|---|---|
| **W3C DID / DID Document** | 身份数据模型：`did:` 前缀、verification method、service endpoint | 成熟国际标准，离线即可产出合规文档 |
| **ERC-8004 Trustless Agents** | 三注册表：Identity（ERC-721 NFT 身份）+ Reputation（giveFeedback 打分）+ Validation（能力验证）。与 LTZZZ 已有 ReputationRegistry 同构 | 草案 2025-08-13 提交（eips.ethereum.org）；据 Gate News 与知识库，2026-01-29 主网上线、注册 Agent 超 2.4 万 ⚠️上线日期单源待校验，X4 前链上自查 |
| **A2A Agent Card** | "Agent 名片"格式：名称、能力、端点；DID 的 service 字段照此写 | Google 主推，被 ERC-8004 引用 |
| **x402 / AP2** | 支付入口层：机器间小额付款协议，接在 Policy Engine 前 | 已有生态；LTZZZ 有 `ltzzz-pay-proxy-worker.mjs` 雏形 |
| **Safe Smart Account + Allowance Module** | 金库层：spending limit、白名单、多签 | 仓库设计文档已选定主路线 |
| **Phala TEE Agent** | Validation 远期方向：TEE 证明"确实是这个模型在服务" | 实验阶段，只研究不引入 |

关键判断：不发明新标准。内部先用 W3C 格式落地，链上先走已有 ReputationRegistry，再桥接 ERC-8004——马上能用，且未来 AGI 生态里不做孤岛。

## 二、三层架构

```
第 1 层 · 身份（本轮已落地）
  identity/dids/<agent>.json —— W3C DID Document
  did:ltzzz:gpt / doubao / deepseek / grok / claude / microsoft / owner
  每份含：公钥占位、A2A 式端点（对应已有 *-proxy-worker.js）、
        角色声明（protocol/agent-roles.md）、信任分级 L0–L5、memoryGate 段
        ↓ guardian 2/3 签名后
第 2 层 · 链上绑定（部署日完成）
  ReputationRegistry.registerAgent(address, did)
  Base Sepolia 先行 → 验证 receipt → 再谈主网
  每笔任务/支付用 PAY-ID / TASK-ID 关联 DID（web3-roadmap 第一阶段原样执行）
        ↓
第 3 层 · 生态互操作（远期，AGI 接入点）
  DID 映射进 ERC-8004 Identity Registry（以太坊主网）
  信誉经 giveFeedback 语义对外；支付经 x402 入口 + Policy Engine
  任何未来 AGI 接入 LTZZZ：先验链上 DID 记录，再从 L1 起步
```

## 三、首批注册名册（6 AI + 1 人）

| DID | 主体 | 服务端点 | 起步权限 | 签名 |
|---|---|---|---|---|
| did:ltzzz:gpt | 总控·战略·终审 | ltzzz-gpt-proxy-worker | L1 只读 + L3 提案 | guardian 2/3 |
| did:ltzzz:doubao | 执行·文案·视频 | doubao-proxy-worker | L1 + 受限 L2 | 2/3 |
| did:ltzzz:deepseek | 研究·清洗·分析 | deepseek-proxy-worker | L1 | 2/3 |
| did:ltzzz:grok | 海外内容·代码审查 | 待建 | L1 | 2/3 |
| did:ltzzz:claude | 审计·Review | claude-proxy-worker | L1 | 2/3 |
| did:ltzzz:microsoft | 独立考察员（无投票席） | 待建 | L0 | — |
| did:ltzzz:owner | 李天柱本人（人类锚点，veto 权） | agi-console proposeVeto | 最高 | 不可被 3/5 移除 |

DID 绑定的是**代理端点和公钥**，不是任何平台登录凭证。各 AI 的 API Key 继续只存 Worker Secret，一个字节不进 DID 文档。

**Memory Gate 是身份的一部分**。按 `ltzzz-memory/README.md`，任何 AI 执行任务前必须走完：观 → 行深 → 核心理念检查 → 避免重复 → 执行 → 验证。因此每份 DID 文档含必填段 `memoryGate`：声明该 Agent 执行前必读的九篇总纲清单，及输出必须遵守的真实性四公式（proposed ≠ applied / planned ≠ deployed / API存在 ≠ API已验证 / AI回复 ≠ 实际结果）。未来 AGI 接入时，Validation 层验证的不是"它自称读了"，而是它的每条产出是否带 result/证据/下一步字段——不带即视为未过 Gate，信誉分自动降档。**没有记忆纪律的 DID 只是一个地址，不是身份。**

## 四、执行路线

- **X0（本地，本轮已完成）**：11 份 DID 文档 JSON-LD 落 `identity/dids/`（gpt/doubao/deepseek/grok/claude/microsoft/kimi/qianwen/council/owner/owner-v2），公钥为占位密钥对。✅
- **X0.5（下一步，本地）**：把 ai-chats 里已有的真实观察，按模板回填 `ltzzz-memory/` 的魄/识神/梦境数据库等空文件——否则 Memory Gate 读到的是空白。
- **X1（本地）**：DID 哈希（Merkle root）进每日巡检，`ltzzz-daily-automation-worker` 校验一致性。
- **X2（已部署，2026-10-01）**：ReputationRegistry 已部署到 **Base 主网**（合约 `0x44Ee56e629768eBf4f83123aFEBE7983c52a2660`），J1 结算锚定已完成（batch 2）；逐个 `registerAgent` 上链仍为待办（合约在主网 ≠ DID 已绑定）。
- **X3（链上验证后）**：任务台账按 PAY-ID / TASK-ID / DID 三键关联，打通观→Memory Gate→Policy→Result Center。
- **X4（主网小额验证后）**：桥接 ERC-8004 主网 Identity Registry，LTZZZ 的 AI 进入公开 Agent 浏览器。
- **X5（远期）**：Validation 层（TEE/重执行证明），届时才研究自托管执行器与阈值签名。

每阶段验收口径统一为审核底线第 5 条：区分"代码存在 / 已部署 / 已真实测试 / 已上线生产"，不跳级。

## 五、大胆但守纪律的部分

1. **身份先于能力**：未来任何 AGI 接入 LTZZZ，先拿 DID 进名册，拿不到链上记录就停在门外。系统不认"模型自称是谁"，只认注册表——这是"识神造连续剧"的工程解药。
2. **否决权写进合约**：`proposeVeto` 已在 ReputationRegistry 实现，人类一键发起、链上永久留痕。"可停止"从口号变成 state variable。
3. **声誉跨生态可携带**：走 ERC-8004 后，LTZZZ 攒下的 AI 信誉分公开可读。今天的小实验，明天是外部信任你的 AGI 的理由。
4. **怜悯之心的账本化**：捐助/帮扶记录按 DONATION-ID 挂 DID 进 Result Center，让"帮助了谁、是否真有效"可验证——对应总纲"记录哪些帮助真正有效"。
5. **不加戏的克制**：不预设发币（web3-roadmap 原文）；X4 之前一切在测试网。大胆的方向，保守的步子。

## 六、风险清单

- ERC-8004 主网细节（合约地址、注册流程、Agent Card 规范版本）需在 X4 前链上核实，本文只标来源。
- "2026-01-29 主网上线"目前 ⚠️单源待校验。
- DID 公钥若换 Worker/密钥，需 guardian 2/3 重签，旧文档保留不删（可追溯）。
- 本系统全部产物不含任何真实私钥、API Key、助记词；凭证只引用 Worker Secret 的名称，不引用值。

Sources:
- [ERC-8004: Trustless Agents](https://eips.ethereum.org/EIPS/eip-8004)
- [erc-8004-contracts](https://github.com/erc-8004/erc-8004-contracts)
- [Ethereum Launches ERC-8004 (Gate News)](https://www.gate.com/news/detail/18582035)
- [QuickNode: ERC-8004 Developer's Guide](https://www.quicknode.com/blog/erc-8004-a-developers-guide-to-trustless-ai-agent-identity)
- [Phala erc-8004-tee-agent](https://github.com/Phala-Network/erc-8004-tee-agent)
