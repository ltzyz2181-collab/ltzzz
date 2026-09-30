# LTZZZ DID 名册登记索引（X0）

> 生成：2026-09-30｜状态口径：全部为 **本地已建档 / 链上未绑定**（planned ≠ deployed）
> 规范：W3C DID；对外互操作目标：ERC-8004 Identity Registry（X4 阶段桥接）
> 治理：每份文档需 guardian 2/3 签名后生效；owner DID 由其余 guardian 背书，不可被 AI 投票移除。

| # | DID | 文件 | 主体 | 权限起步 | 密钥 | 链上 registerAgent |
|---|---|---|---|---|---|---|
| 1 | did:ltzzz:gpt | gpt.json | GPT（总控） | L1 + L3 提案 | 占位 | 待 X2 |
| 2 | did:ltzzz:doubao | doubao.json | 豆包（执行） | L1 + 受限 L2 | 占位 | 待 X2 |
| 3 | did:ltzzz:deepseek | deepseek.json | DeepSeek（研究） | L1 | 占位 | 待 X2 |
| 4 | did:ltzzz:grok | grok.json | Grok/XAI（海外·审查） | L1 | 占位 | 待 X2 |
| 5 | did:ltzzz:claude | claude.json | Claude（审计） | L1 | 占位 | 待 X2 |
| 6 | did:ltzzz:microsoft | microsoft.json | Copilot（考察员） | L0 | 占位 | 待 X2 |
| 7 | did:ltzzz:owner | owner.json | 李天柱（人类锚点） | 最高 | 待本人离线生成 | 待 X2 |

## 生效条件（按顺序）
1. owner 离线生成各 Agent 密钥对，公钥替换 PLACEHOLDER（私钥永不入库、不进任何 AI 对话）。
2. 3 名 guardian 中 2 名对每份文档签名，`proof` 字段落值。
3. X2：部署 `contracts/ReputationRegistry.sol` 至 Base Sepolia，逐个 `registerAgent(address, did)`，存 receipt。
4. 链上 receipt 确认后，本表"链上"列改为 VERIFIED + tx hash（不带 hash 一律算未部署）。

## 注册即绑定的义务
所有非 owner DID 携带 `ltzzz:memoryGate`：执行前读九篇总纲、输出带 result/evidence/next、遵守真实性四公式。未过 Gate 的产出不得进入 Result Center，声誉默认 B 级 100 分起步（ReputationRegistry 构造函数规定），由 `updateGrade` 升降。

## 隐私与安全声明
本目录任何文件不包含 API Key、私钥、助记词、账号密码。凭证只存在于 Cloudflare Worker Secret 与 owner 离线环境，本目录仅引用其**名称**。
