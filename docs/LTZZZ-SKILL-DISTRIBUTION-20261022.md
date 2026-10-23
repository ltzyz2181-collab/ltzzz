# LTZZZ Skill 1.0 分发说明（2026-10-22）

类型：分发规则及历史自报证据；更新于 2026-10-23（Asia/Shanghai）。

固定发布提交：`1e18c7064e339c8f2cc5ca12502a58bf38c229b5`；[机器可校验清单](../config/ltzzz-skill-release.json)。

本文只做分发：给出可直接下载的链接、各客户端安装目录，以及本机实测结果。Skill 正文仍是
[skills/ltzzz-task-execution/SKILL.md](../skills/ltzzz-task-execution/SKILL.md)，
状态以 [config/ltzzz-skill.json](../config/ltzzz-skill.json) 为准。

## 一、能分发什么，不能分发什么

能做的三件事：

1. 分发 6 条 raw 链接（已逐条实测，见第二节）。
2. 原 VS Code 执行会话自报把同一份 LF 字节装进用户级目录（见第四节）；本轮云端不能复验其 Windows 文件系统。
3. 已向 11 席仓库 inbox 发布固定版本分发卡；Meta 卡直接内联 SKILL.md。仓内收件卡不等于客户端已收到或业务交付。

不能做的：本机 Copilot 会话无法给 DeepSeek、豆包、千问、Claude、Codex 等发消息——它们各自是独立会话。
因此本仓库不会出现"已转发给某模型本人"这类说法，除非该模型自己产出了回执。

## 二、主入口与 references（6 条 raw 链接）

| 文件 | raw 链接 | 字节 | git blob SHA-1 |
|---|---|---|---|
| `SKILL.md`（唯一入口） | https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/1e18c7064e339c8f2cc5ca12502a58bf38c229b5/skills/ltzzz-task-execution/SKILL.md | 7479 | `2f6d4295602daf0a854bdd1067866606587176b3` |
| `references/task-card.md` | https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/1e18c7064e339c8f2cc5ca12502a58bf38c229b5/skills/ltzzz-task-execution/references/task-card.md | 622 | `f3a87be2e065d2b9b5eb123460f9fca6b49b0906` |
| `references/receipt-template.json` | https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/1e18c7064e339c8f2cc5ca12502a58bf38c229b5/skills/ltzzz-task-execution/references/receipt-template.json | 1575 | `8a3189fe01a253a7b674826896826c9e8f1726c6` |
| `references/runtime-contract.md` | https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/1e18c7064e339c8f2cc5ca12502a58bf38c229b5/skills/ltzzz-task-execution/references/runtime-contract.md | 1198 | `c5b8009f584b21264777fcf7065f30282e61c5c4` |
| `references/contribution-template.md` | https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/1e18c7064e339c8f2cc5ca12502a58bf38c229b5/skills/ltzzz-task-execution/references/contribution-template.md | 467 | `937578d7dde669593e2c441bea88b627c81e142d` |
| `references/contributions.md` | https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/1e18c7064e339c8f2cc5ca12502a58bf38c229b5/skills/ltzzz-task-execution/references/contributions.md | 2760 | `bdc3eeff0050284e2bc9e20bd32afefe0d8f7afc` |

校验方法（任何拿到文件的人都能自己复核，无需信任本文）：

```bash
curl -s -o SKILL.md <raw 链接>
git hash-object SKILL.md          # 应等于上表 git blob SHA-1
```

2026-10-23T01:07Z 在本机对 6 条链接逐条执行上述比对，结果 6/6 一致：raw 内容与 `origin/main` 上的
git 对象字节相同（该段为原会话报告）。本轮执行器另以完整固定提交的 git blob 独立核对；不再以滚动 main 作版本证据。

## 三、各客户端安装目录

把整个 `skills/ltzzz-task-execution/` 目录（含 `references/`）放进下列任一目录，以 `SKILL.md` 为唯一入口：

| 客户端 | 项目级 | 用户级 |
|---|---|---|
| VS Code / Copilot | `<repo>/.github/skills/` | `~/.copilot/skills/` |
| Claude Code | `<repo>/.claude/skills/` | `~/.claude/skills/` |
| Codex | `<repo>/.agents/skills/` | `~/.agents/skills/` |

官方目录说明：

- https://code.visualstudio.com/docs/copilot/customization/agent-skills
- https://code.claude.com/docs/en/skills
- https://developers.openai.com/codex/skills

## 四、本机用户级目录安装实测

以下保留 PR #214 的原执行会话报告，非本轮云端复验：在 owner 桌面机上，把 `git show origin/main:<path>` 导出的 **LF 原始字节** 复制进四个用户级目录后逐个复核：

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

`~/.codex/skills/` 是该会话实际复制的历史目录，不以复制成功证明当前 Codex 会扫描它。Claude 已明确选择每次读取仓库，本轮不替他另装。某个隔离 worktree 找不到安装 receipt，只能证明该 worktree 缺文件，不能否定其他环境的报告。

PR #209 已合入；本轮对合并后版本重新运行 check/status。换行归一化仅作文本等价验证，原文件 raw SHA256 与 LF canonical SHA256 必须分别标注，不能宣称 CRLF 原字节与 LF blob 相同。

装进目录不等于客户端已加载。`actual_client_load_verified` 仍为 `false`，要等对应客户端在真实会话里
实际读到 `SKILL.md` 并产出可核验回执后才能改。

## 五、两项核对结论

**台账 `META-HUBTEST-20261022`**：`ops/派单台账.md` 第 75 行状态为 `执行中（已认领）`，与 owner 描述一致，
本轮未改动。`已验收` 由 GPT 总控与千问审计通过后再由审计席改，执行席不提前打勾。

**回执字段纠正**：

- `reasoningHash` **不是 Skill receipt schema 字段，本次不填写**。它属于 `scripts/anchor-reasoning.mjs` 的钱包支付证明层。历史回执中的 `keccak256('...')` 是描述串，不能用作哈希、付款或链上锚定证据；本轮不修改原回执，纠正在本说明和补充验收记录中留痕。
- `artifact.sha256` 对实际工件原字节计算，由执行器给出；它与钱包推理锚不是一回事，不要求提交模型内部思考。
- 本次无 USDC 结算，填 `paid=false`、`tx_hash=null`、`settlement_kind=none`。未来真钱业务按真实付款凭证填写，不把模板默认值变成永久要求。模型 API 费用单独记，不能称零调用成本。
- `runtime-contract.md` 虽排成一行，但有 1198 字节、完整约束；保留已审核正文，不当空文件补写。
- 请求实际读取的提交号可作沟通校对；**模型复述提交号不证明已读文件**。执行器须绑定固定来源、读入字节哈希、最终 prompt SHA256 或真实文件工具记录。

## 六、实际分发与后续使用

11 席的卡在 `ops/dispatch/inbox/<seat>/LTZZZ-SKILL-DISTRIBUTION-20261023-<seat>.md`。微软除名不参与分发。各席沿原 Task ID 执行业务，卡本身不是新采购单。

- GPT、豆包、DeepSeek、Grok、千问、国内 Kimi：既有 API 路径继续在原预留调用内注入已审核 runtime contract，不额外开新调用。历史原生评审与 Qwen smoke 的范围保留，不能冒充本次各席均已读取全文。
- Claude：通过分支 PR 规划与审计，读取固定仓库入口；不要求另装，不自动启用 Anthropic API。
- WorkBuddy、Manus、国际 Kimi：仓库 inbox 接力；无新的客户端工具记录时保持“待实际消费”。WorkBuddy 先前网页 quiz 的回执只证明当次五题回复。
- Meta：托管 Llama 无网页工具，执行器把固定 SKILL.md 全文内联，附英文任务说明；不只给链接。外部 Meta 客户端的安装/接单仍单独核实。

`node scripts/run-ltzzz-skill-distribution.mjs check` 检查固定 git blob、清单和 11 张卡；`build` 仅重建仓内材料，不访问客户端。
Owner Issue 标题 `[LTZZZ技能分发]` 触发既有 Skill Actions 的定向分发验收，只调用托管 Meta 一次，预留先提交，同发布版本重触发不重购。结果保存在 `knowledge/results/skill-distribution/1e18c7064e339c8f2cc5ca12502a58bf38c229b5/meta-inline.json`。它是规则消费测试，不是任意业务验收或完整能力证明。

## 七、本轮实际验收

PR #215 已合并；main 验证 run `39884263876` 成功。六条固定链接重新实读均 HTTP200，字节 SHA256 全匹配。

定向 run `39884310991` 实际调用托管 Meta 一次，模型由 Worker AI binding 给出：`@cf/meta/llama-3.1-8b-instruct-fp8`。SKILL.md 全文、prompt、request body 和模型 output 均有执行器哈希绑定。实际答复把第一例写作“草稿”，其余为 DeepSeek、paid=false、tx_hash=null，语义正确。

原检查只接受英文 `draft`，所以原 run 为 failure，原回执仍保留 `scenarios_verified=false`。本轮补充接受明确等价的 `草稿` / `draft_created`，对已保存的同一原文做零调用复核；不重购、不改原回执。补充裁决与精确回执 SHA256 见 [本轮验收](../knowledge/results/skill-distribution/1e18c7064e339c8f2cc5ca12502a58bf38c229b5/deployment-20261023.json)。这项验收仅证明一次托管输入消费及三个案例答复，不证明所有客户端安装、任意业务交付或 provider 未暴露的 finish_reason。

## 八、边界

- 0 USDC，不充值、不发真单、不放款、不签名；`settlement_kind` 保持 `none`。
- 不新增每日付费 cron。
- 分发文档、目录安装、接力排队都不是"某模型已完成审核"，也不代表 Skill 一定能提高任务成功率。
