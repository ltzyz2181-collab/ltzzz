# LTZZZ Skill 1.0 分发说明（2026-10-22）

本文只做分发：给出可直接下载的链接、各客户端安装目录，以及本机实测结果。Skill 正文仍是
[skills/ltzzz-task-execution/SKILL.md](../skills/ltzzz-task-execution/SKILL.md)，
状态以 [config/ltzzz-skill.json](../config/ltzzz-skill.json) 为准。

## 一、能分发什么，不能分发什么

能做的三件事：

1. 分发 6 条 raw 链接（已逐条实测，见第二节）。
2. 把同一份 LF 字节装进本机用户级 skills 目录（已完成，见第三节）。
3. 用接力派单把说明交给具备 GitHub 工具的执行席（需 owner 实际触发，queued 不等于已送达）。

不能做的：本机 Copilot 会话无法给 DeepSeek、豆包、千问、Claude、Codex 等发消息——它们各自是独立会话。
因此本仓库不会出现"已转发给某模型本人"这类说法，除非该模型自己产出了回执。

## 二、主入口与 references（6 条 raw 链接）

| 文件 | raw 链接 | 字节 | git blob SHA-1 |
|---|---|---|---|
| `SKILL.md`（唯一入口） | https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/skills/ltzzz-task-execution/SKILL.md | 7479 | `2f6d4295602daf0a854bdd1067866606587176b3` |
| `references/task-card.md` | https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/skills/ltzzz-task-execution/references/task-card.md | 622 | `f3a87be2e065d2b9b5eb123460f9fca6b49b0906` |
| `references/receipt-template.json` | https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/skills/ltzzz-task-execution/references/receipt-template.json | 1575 | `8a3189fe01a253a7b674826896826c9e8f1726c6` |
| `references/runtime-contract.md` | https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/skills/ltzzz-task-execution/references/runtime-contract.md | 1198 | `c5b8009f584b21264777fcf7065f30282e61c5c4` |
| `references/contribution-template.md` | https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/skills/ltzzz-task-execution/references/contribution-template.md | 467 | `937578d7dde669593e2c441bea88b627c81e142d` |
| `references/contributions.md` | https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/skills/ltzzz-task-execution/references/contributions.md | 2760 | `bdc3eeff0050284e2bc9e20bd32afefe0d8f7afc` |

校验方法（任何拿到文件的人都能自己复核，无需信任本文）：

```bash
curl -s -o SKILL.md <raw 链接>
git hash-object SKILL.md          # 应等于上表 git blob SHA-1
```

2026-10-23T01:07Z 在本机对 6 条链接逐条执行上述比对，结果 6/6 一致：raw 内容与 `origin/main` 上的
git 对象字节相同，可以直接分发，不需要二次转换。

## 三、各客户端安装目录

把整个 `skills/ltzzz-task-execution/` 目录（含 `references/`）放进下列任一目录，以 `SKILL.md` 为唯一入口：

| 客户端 | 项目级 | 用户级 |
|---|---|---|
| VS Code / Copilot | `<repo>/.github/skills/` | `~/.copilot/skills/` |
| Claude Code | `<repo>/.claude/skills/` | `~/.claude/skills/` |
| Codex | `<repo>/.agents/skills/` | `~/.codex/skills/` |

官方目录说明：

- https://code.visualstudio.com/docs/copilot/customization/agent-skills
- https://code.claude.com/docs/en/skills
- https://developers.openai.com/codex/skills

## 四、本机用户级目录安装实测

在 owner 桌面机上，把 `git show origin/main:<path>` 导出的 **LF 原始字节** 复制进四个用户级目录后逐个复核：

| 用户级目录 | 文件数 | `SKILL.md` 字节 | `SKILL.md` CRLF | git blob 一致 |
|---|---|---|---|---|
| `~/.copilot/skills/ltzzz-task-execution` | 6 | 7479 | 0 | 6/6 |
| `~/.claude/skills/ltzzz-task-execution` | 6 | 7479 | 0 | 6/6 |
| `~/.codex/skills/ltzzz-task-execution` | 6 | 7479 | 0 | 6/6 |
| `~/.agents/skills/ltzzz-task-execution` | 6 | 7479 | 0 | 6/6 |

为什么必须用 LF 字节：仓库登记的核心哈希按 LF 计算，而 Windows 的 `core.autocrlf=true` 会把
checkout 转成 CRLF，导致 `node scripts/ltzzz-skill.mjs check` 抛 `skill_frontmatter_invalid`。
该缺陷的修复在 PR #209（新增 `.gitattributes` 固定 `skills/** text eol=lf` 等规则，并让
`readText()` 归一化行尾）。**PR #209 合入前，向任何 Windows 机器分发都必须用 LF 源，不能直接拷贝
工作区 checkout 出来的文件。**

装进目录不等于客户端已加载。`actual_client_load_verified` 仍为 `false`，要等对应客户端在真实会话里
实际读到 `SKILL.md` 并产出可核验回执后才能改。

## 五、两项核对结论

**台账 `META-HUBTEST-20261022`**：`ops/派单台账.md` 第 75 行状态为 `执行中（已认领）`，与 owner 描述一致，
本轮未改动。`已验收` 由 GPT 总控与千问审计通过后再由审计席改，执行席不提前打勾。

**回执三字段**：

- `paid=false`、`tx_hash=null` —— 在 [references/receipt-template.json](../skills/ltzzz-task-execution/references/receipt-template.json)
  里是正式字段，按模板填。
- `reasoningHash` —— **不在 Skill 回执模板里**。它属于 agent-wallet 支付证明层：
  `scripts/anchor-reasoning.mjs` 的 `reasoningHash(spend)` 计算
  `"0x"+sha256(JSON.stringify({agent,amount_usdc,recipient,purpose,hypothesis,success_criteria,experiment_id}))`。
  本项目 0 支付、无 USDC 支出，因此 Skill 回执里只能作**显式标注的扩展字段**，值按既有先例
  `knowledge/results/meta-external/meta-hubtest-20261022.receipt.json` 写成
  `keccak256('<task_id> <scope>')` 这类描述串，并在 `limitations` 里注明不是链上锚定、不是真实支付推理哈希。

`ops/dispatch/META-HUBTEST-20261022.md` 的验收第 4 条也只要求 `paid=false`、`tx_hash=null` 两个字段。

## 六、边界

- 0 USDC，不充值、不发真单、不放款、不签名；`settlement_kind` 保持 `none`。
- 不新增每日付费 cron。
- 分发文档、目录安装、接力排队都不是"某模型已完成审核"，也不代表 Skill 一定能提高任务成功率。
