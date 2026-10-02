# LTZZZ DID 名册登记索引（X0 → 名册同步 2026-10-02）

> 状态口径：**本地已建档 / Agent DID 链上未绑定**（planned ≠ deployed）
> 规范：W3C DID；对外互操作目标：ERC-8004 Identity Registry（X4 阶段桥接）
> 治理：每份文档需 guardian 2/3 签名后生效；owner DID 由其余 guardian 背书，不可被 AI 投票移除。
> 修正说明：原表仅 7 席；仓库实际已有 kimi / qianwen / council / owner-v2。identity.html 已写 Base 主网 ReputationRegistry `0x44Ee…`，但各 Agent 的 `registerAgent` 仍为待办——合约在主网 ≠ DID 已上链。

| # | DID | 文件 | 主体 | 权限起步 | 密钥 | 链上 registerAgent |
|---|---|---|---|---|---|---|
| 1 | did:ltzzz:gpt | gpt.json | GPT（观察席·原总控） | L1 + L3 提案 | 占位 | 待 |
| 2 | did:ltzzz:doubao | doubao.json | 豆包（执行） | L1 + 受限 L2 | 占位 | 待 |
| 3 | did:ltzzz:deepseek | deepseek.json | DeepSeek（研究） | L1 | 占位 | 待 |
| 4 | did:ltzzz:grok | grok.json | Grok/XAI（海外·审查·挑战者） | L1 | 占位 | 待 |
| 5 | did:ltzzz:claude | claude.json | Claude（审计） | L1 | 占位 | 待 |
| 6 | did:ltzzz:microsoft | microsoft.json | Copilot（考察员） | L0 | 占位 | 待 |
| 7 | did:ltzzz:kimi | kimi.json | Kimi/Moonshot（总控挑战者） | L2 提议 + L1 读取 | 占位 | 待 |
| 8 | did:ltzzz:qianwen | qianwen.json | 千问（临时总控试用） | L2 提议 + 受限部署 | 占位 | 待 |
| 9 | did:ltzzz:council | council.json | AI 委员会 | 治理聚合 | 占位 | 待 |
| 10 | did:ltzzz:owner | owner.json | 李天柱（人类锚点） | 最高 | 待本人离线生成 | 待 |
| 11 | did:ltzzz:owner-v2 | owner-v2.json | owner 备份/演进 | 最高 | 待 | 待 |

## 生效条件（按顺序）
1. owner 离线生成各 Agent 密钥对，公钥替换 PLACEHOLDER（私钥永不入库、不进任何 AI 对话）。
2. 3 名 guardian 中 2 名对每份文档签名，`proof` 字段落值。
3. X2：在已部署的 Base 主网 ReputationRegistry（见 identity.html）逐个 `registerAgent(address, did)`，或先在 Sepolia 演练——存 receipt 后本表才可写 VERIFIED + tx hash。
4. 无 receipt 一律算未部署；合约存在 ≠ 各 DID 已绑定。

## 注册即绑定的义务
所有非 owner DID 携带 `ltzzz:memoryGate`：执行前读九篇总纲、输出带 result/evidence/next、遵守真实性四公式。未过 Gate 的产出不得进入 Result Center。

## 通道现状（2026-10-02 实测，非口述）
- api-qianwen.ltzzz.com /health → ok + has_key:true
- api-kimi.ltzzz.com /health → ok + has_key:true
- ltzzz-daily-automation-worker /health → 七通道含 kimi-daily、xia-daily
- xia-daily 仍 dry_run：Worker 缺 `XAI_API_KEY`（需 owner→豆包在 CF Secret 注入，不进聊天）

## 隐私与安全声明
本目录任何文件不包含 API Key、私钥、助记词、账号密码。凭证只存在于 Cloudflare Worker Secret 与 owner 离线环境，本目录仅引用其**名称**。
