# 六篇核心记忆读取回执（桌面 Copilot 接力）

日期 2026-10-21；执行者 VS Code Copilot 桌面接力（owner 本机）；读取基准 `origin/main d1185995`（Credentialed Actions audit: real generation receipts and zero-generation auth checks）。

## 读取对象与实际哈希

| 文件 | git blob | SHA256 | 条目 |
| --- | --- | --- | --- |
| ltzzz-memory/魄.md | a01e54da | 7B0ED4107222A3EF0DCFEEC6631BBCB26F9565A6341CBA6F49FA2ED1E1CB210D | 5 条 |
| ltzzz-memory/识神.md | f664a470 | 01607711D9B6E395011AB9606128D1D7098AB5172A23C359C0F2D8D509640BD9 | 6 条 + AI 分歧专节 |
| ltzzz-memory/梦境数据库.md | 4c9f6a24 | 0F9A2AA6326121D4DED1D6DEDAAF1A778EECAEBA399CCBA50C57D47B06D866C4 | 4 条记录（仅 1 条为梦） |
| ltzzz-memory/文明研究.md | d4517fe5 | C6994489F5C4566F3FF4AC036AE1C64AF16010771446D110E30BFCFFEA648E9B | 3 条 + 3 留题 |
| ltzzz-memory/项目历史.md | e59eaaea | 18D2F69B5B5B5B1FEC2CC0848A3D4C9DAA29D5CE1A89E7F7D015A2BB2F9314DB | 2026-09-13 至 10-21 时间线 |
| ltzzz-memory/重要事件.md | 3ac08448 | CA3E96B6E2F42E93FEA67AE273CB183B2E128860D65A11674B21C075E5175FD7 | 事件台账至 2026-10-15 补录 |

方法：`git fetch origin main` 后建临时 worktree 固定在 `d1185995` 读取，未改工作区、未改动六篇正文。逐篇通读含末尾，无截断占位。

## 读取到的要点（概述，不代替正文）

- 魄：框架声明「魄（身体）不是识神（大脑）不是我」；耗阳精气/供奉与正邪；2014-11 失眠夜与戒烟例证；魄户穴与失眠。每条附反例/不确定性及源文件行号。
- 识神：念头一点触动即造连续剧、着意则失之（《太乙金华宗旨》三关）、识神=DMN 的映射标注为 AI 推导且两模型分歧、清醒梦识神在场但不可控。
- 梦境数据库：2014-11 失眠夜、2024-11-13 清醒梦（标题待校准）、魄户穴假说、「死后魄还留在这个世界」心念问题；觉察与控制分栏。
- 文明研究：NPC 社会与裹挟结构、承负=网状因果（明确是类比非证明）、「那是你们有这个需要」的意义归属权。
- 项目历史：站点上线、exp_001、Pay Phase 1、Gumroad、x402、T6 门控失败、10-05 Aave 主网分水岭、AGI 经济子网（ledger only）、国内模型接管、10-16 至 10-21 审计与 WEP3 合入。
- 重要事件：以【事实】/【owner原话】标注的事件台账，含与 GPT 决裂、确认权改 AI 共同确认、Claude 退出五签、Kimi 周报由 Grok 生成、旧 Vault guardian 风险与 10-15 核查补录。

## 与本机旧检出的差异

- 本机仓库 HEAD `e984df2`（receipt: cloud-hub gateway deployed and verified）**不是** `d1185995` 的祖先，远端曾改写历史；相对 origin/main 落后 552 个文件。
- 六篇中仅 `项目历史.md` 本地副本缺失 10-16 至 10-21 段；其余五篇本地与 origin/main 内容一致。因此本回执只用 origin/main 版本，不引用本机旧副本。
- 未改动本机检出（未 reset/未覆盖），仍保留 owner 工作区状态；如需更新请另行确认。

## 边界（本轮实际发生了什么）

- 只读：0 次模型/API 调用，0 次 Actions 运行触发，0 笔链上交易，0 笔付款；没有把读取写成生成、部署或验收。
- 本机未安装 Node（`node` 不在 PATH），`scripts/ltzzz-relay.mjs` 未能执行；`gh` 未登录，未提交 owner-dispatch 工单。因此本回执仅由本地读取＋git 提交产生，不代表总控或千问已接单。
- 六篇里「魄/识神/DMN」类身心内容仍是观察与 AI 解释，非科学验证结论；项目页记录的 internal_credit 不等于真钱。

这份回执证明六篇在指定提交上被真实读取，不证明任何后续执行。
