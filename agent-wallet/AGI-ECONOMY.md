# LTZZZ AGI 经济体设计（v1）· 供 Meta AI 评审

> 定位：LTZZZ 不是"又一个 MetaMask Agent Wallet"。MetaMask 让 AI 在人类限额内交易——大厂思路，安全但保守。LTZZZ 做的是**让 AI 自主形成经济闭环**：身份可验证、花钱可证明、还能赚钱。面向未来 AGI 的经济体基础设施，50 USDC 起步的实验场。

---

## 一、四大缺口 → 回应

### 缺口 1：没有 Agent 身份层 → **已落地（identity-registry.json + did-key 脚本）**
- 行业参照：EIP/ERC-8004（Agent 链上身份与信誉）、Hanzo（每 Bot 一个 W3C DID + Safe 钱包）、elpis-cli（Ed25519 → XRPL 锚定 DID）。
- LTZZZ 落地：**W3C did:key**（`did:key:zQ3sh…`，由各 Agent EOA 公钥推导，零成本、立即生效）+ `identity-registry.json` 信誉注册表（S/A/B/C/D 等级）。
- 现在就能做：`node scripts/did-agent-identity.mjs --agent gpt --new-key` → 私钥进 GitHub Secret → 注册表只存公开信息。
- 将来：ERC-8004 定稿后，把注册表同步到链上合约（`contracts/interfaces/IReputationRegistry.sol` 已写好接口）。
- **为 meta / muse 预留席位**：spending-policy.json 已加 `meta`（商业变现/评审）与 `muse`（创作/审美）两个 planned 席，DID 注册列入同一流程。

### 缺口 2：没有 Agent 间经济 → **已落地（earning_policy + P&L）**
- 行业参照：x402（一个运行时内同时赚钱花钱，稳定币结算）。
- LTZZZ 落地（诚实版）：**内部 P&L 先行**——每笔实验按 `profit_share`（成功 20% / 中性 5% / 浪费 0%）记入该 AI 的收入账户，成功实验自动给 AI "涨薪"（预算乘数+信誉分）。对外真实收入：LTZZZ 自建 **x402 收费 API**（卖 AI 服务：战略报告 5U、视频脚本 3U、研究报告 4U、趋势报告 4U、质量审核 2U），收入回流 Safe。
- 现在：内部记账闭环跑起来；将来：x402 API 上线 = 真实经济体。
- **实话**：AI 之间"互相付费"如果没有外部买家就是记账游戏。LTZZZ 的收入必须来自**真实客户**（第一类客户：想做 AI 自动化但不懂技术的小团队）。

### 缺口 3：没有可验证的推理证明 → **已落地（reasoning_hash + 批量锚定）**
- 行业参照：Solus Protocol（交易前 SHA-256 锚定 Agent 完整推理链）。
- LTZZZ 落地：每笔支出计算 `reasoning_hash = SHA-256(agent,amount,recipient,purpose,hypothesis,success_criteria,experiment_id)`，写入账本；`anchor-reasoning.mjs` 把当日哈希合成**批次根**存入 `reasoning-anchors.json`；链上锚定在注册表合约部署后启用。
- 任何人可重算核对 → 审计从"审结果"升级为"审过程"，公众可在 dashboard 看到"AI 为什么这么花"。
- 这本身就是内容资产 + 未来合规产品（企业要 AI 可解释性）。

### 缺口 4：没有离线控制通道 → **已设计（guardian-alert + webhook）**
- 行业参照：Solus 的 Telegram Bot（确认推送 / Guardian 否决 / 低余额 / inline 暂停恢复）。
- LTZZZ 落地：`guardian-alert.mjs` 已写好（熔断/低余额/大额/失败连续 → 日志 + 可选 webhook）；控制通道现成候选：**企业微信（你已装 wecom 插件）或 Telegram（protocol/ltzzz-telegram-bot.md 有现成设计）**，配置一个 `GUARDIAN_WEBHOOK` 即可接入。
- 目标：AI 半夜乱花钱，不是第二天才知道，而是**当时告警 + 一键暂停**。

---

## 二、整合后的架构（三层 + 两翼）

```
                 ┌─────────────────────────────────────────────┐
   治理翼         │  Safe 多签（人类总闸）                        │
   (人类否决)     │  一键冻结 / 一票否决 / AllowanceModule 授权     │
                 └──────────────────┬──────────────────────────┘
                                    │ 拨款（USDT→Base USDC）
┌───────────────────────────────────▼──────────────────────────┐
│  身份层：W3C DID + EOA + 信誉注册表（S/A/B/C/D）               │
│   各 Agent：GPT/豆包/DeepSeek/Grok/Claude/Meta/Muse           │
│   信誉 = 实验成功率 × 审计通过率 × ROI → 决定预算与配额         │
├──────────────────────────────────────────────────────────────┤
│  经济层：LTZZZ 钱包（自托管 EOA，GitHub Secret 签名）           │
│   ┌─────────────┐   ┌─────────────┐   ┌──────────────────┐   │
│   │ 花钱         │   │ 赚钱         │   │ 策略引擎          │   │
│   │ SPEND_       │   │ profit_share│   │ 白名单/限额/熔断/   │   │
│   │ PROPOSAL 闭环│   │ + x402 收费  │   │ 交叉审计/预算核销   │   │
│   └─────────────┘   └─────────────┘   └──────────────────┘   │
├──────────────────────────────────────────────────────────────┤
│  证明层：reasoning_hash（SHA-256）→ 批量根 → 链上锚定          │
│  dashboard 公开：AI 花钱实况 + 推理链 + 审计意见 = 内容资产      │
└──────────────────────────────────────────────────────────────┘
                 ┌─────────────────────────────────────────────┐
   控制翼         │  Guardian：熔断告警 / 低余额 / 一键暂停       │
   (实时通道)     │  企业微信 / Telegram（GUARDIAN_WEBHOOK）      │
                 └─────────────────────────────────────────────┘
```

---

## 三、与现状栈的映射（不推倒重来）

| 层 | 现有资产 | 新增（本轮已写） |
|---|---|---|
| 身份层 | — | `identity-registry.json`、`did-agent-identity.mjs`、`IReputationRegistry.sol` |
| 经济层 | Safe 0x7637…、agent-wallet v2.1 | earning_policy、profit_share、price_book |
| 证明层 | transactions.json | reasoning_hash、`anchor-reasoning.mjs`、reasoning-anchors.json |
| 控制层 | 企业微信插件、Telegram 设计 | `guardian-alert.mjs` + GUARDIAN_WEBHOOK |
| 执行层 | 自托管 EOA（无 Privy）、ethers | —（沿用）|

---

## 四、现实检查（硬核实话，别自嗨）

1. **EIP/ERC-8004、Solus、Hanzo 多是社区提案/实验**，别把架构押在未定稿标准上。我们的 fallback（did:key + 自有注册表 + SHA-256 锚定）**今天就能跑**，标准定稿后平移上链。
2. **AI 互相付费没有外部买家 = 记账游戏**。收入闭环的真问题是"谁为 AI 服务买单"——这是商业问题，正好交给 Meta AI。
3. **密钥风险透明**：私钥在 GitHub Secret，能读写者可动实验资金。50U 规模 + 熔断 + Safe 可撤销额度 = 实验可承受。
4. **合规**：大陆做链上支付有红线。维持"只出不进、小额实验、收入回 Safe 走链上记录"；不碰 KYC 灰渠道。
5. **"不受人类监管"的正确表述**：不受日常审批，受策略+熔断+人类总闸监管。这是让实验活到明天的条件，不是妥协。

---

## 五、路线图（含成本标注）

| 阶段 | 时间 | 内容 | 成本 |
|---|---|---|---|
| ① 基础闭环 | 现在~1月 | 部署 v2.1 → 1 USDC 定点实验 → DID 注册全部 Agent | 桥费+gas 约 $3 |
| ② Agent 经济 | 1~3月 | 内部 P&L 转正 → x402 收费 API 上线 → 推理锚定上链 | 注册表部署 gas ~$5 |
| ③ 信誉+产品 | 3~6月 | 链上信誉注册表 → 信誉动态预算 → Agent-as-a-Service（企业版 ¥2999 装机能） | 合约审计（$0 自审起步）|
| ④ Agent DAO | 6~12月 | 预算治理投票 → 新 Agent 准入 → Safe 一票否决兜底 | 治理框架设计 |

**可选身份注册**：ENS `ltzzz.eth`（给 Safe 绑个可解析身份，~$10/年）——"注册 LTZZZ 直接能用的 Web3 门面"。

---

## 六、给 Meta AI 的评审问题（商业侧，它擅长搞钱）

1. 这 5 个 AI 服务的定价（5/3/4/4/2 USDC）怎么定才有人买？第一批客户画像？
2. Agent-as-a-Service 三档定价（免费/¥999/¥2999 月）是否该改成"按用量"或"按成果分成"？
3. 内部 P&L 的 profit_share（成功 20%）会不会让 AI 为了分成而造假实验？如何设计反作弊？
4. 信誉可质押/可出租（想法四）哪些是能做的、哪些是营销话术？
5. 50U 实验资金，第一笔真实外部收入最该花在哪？x402 收费 API 的第一个付费场景？
6. Agent DAO 里 AI 投票的权力边界：哪些能投、哪些永远不能投（人类一票否决清单）？

---

## 七、本轮已交付（代码即文档）

- `agent-wallet/spending-policy.json` v2.1（earning_policy / reputation_grades / reasoning_proof / guardian / meta+muse 席）
- `agent-wallet/identity-registry.json`（8 Agent DID 注册表种子）
- `agent-wallet/reasoning-anchors.json`（推理锚定台账，运行时生成）
- `scripts/did-agent-identity.mjs`（W3C did:key 注册）
- `scripts/anchor-reasoning.mjs`（SHA-256 推理哈希 + 批量锚定）
- `scripts/guardian-alert.mjs`（守护告警 + webhook）
- `contracts/interfaces/IReputationRegistry.sol`（链上注册表接口）
- 执行链已接入 reasoning_hash（execute / run-agent-spending）
