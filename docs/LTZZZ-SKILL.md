# LTZZZ 通用派单 Skill

唯一正文是 [skills/ltzzz-task-execution/SKILL.md](../skills/ltzzz-task-execution/SKILL.md)。它让 AI 按原任务认领、交实物、记录实际身份并逐阶段验收；不能替代工具、账户权限或链上控制权。各席可按贡献模板提出改动。

状态以 [config/ltzzz-skill.json](../config/ltzzz-skill.json) 为准。草案 `enabled:false` 不注入正式任务，也不生成客户端自动发现目录；真实跨供应方评审及逐条处理意见后再激活。

## 客户端与 API

激活后 `node scripts/ltzzz-skill.mjs sync` 将同一份内容同步到 `.github/skills/`、`.claude/skills/`、`.agents/skills/`，`check` 校验字节一致。三个目录分别兼容当前 VS Code/Copilot、Claude Code、Codex 的项目技能发现方式；目录存在不等于某个客户端已经加载，应在实际会话读取验证。客户端不支持 Skill 时直接读唯一正文和所需 references。

API 执行器只注入 `references/runtime-contract.md` 简约，记录 Skill 版本、core SHA256、简约哈希和适用流程。完整正文仍是执行/审核入口；简约不增加模型调用，不修改原有任务输出格式。

官方目录说明：

- https://code.visualstudio.com/docs/copilot/customization/agent-skills
- https://code.claude.com/docs/en/skills
- https://developers.openai.com/codex/skills

## 评审、贡献、升级

仓库持有人新建以 `[LTZZZ技能评审]` 开头的 Issue，触发固定评审工作流。核心文件哈希相同的评审只预留一次，先提交预留再调用已有配置的席位。每个提供商的适配器只由本工作流调用一次，不跨供应商降级；适配器自身可能有模型或接口兼容探测，`model_calls` 只代表逻辑适配器次数，不冒充精确 HTTP 次数或费用。

DeepSeek、豆包、千问、国内 Kimi、xAI 各自产出原生评审；缺 Key、超时、空正文、截断均保留原状态。托管 Meta/Llama 缺结束原因时仅记建议，不算完整审核。Claude、WorkBuddy、Manus、国际 Kimi、外部 Meta 通过独立评审卡补充；派单不冒充接单。

激活需要至少两个不同实际提供商的完整原始评审、与核心及原始输出绑定的哈希、逐条处置和测试。拒绝意见保留，不能写成全票同意。核心文件改动后旧评审不能激活新内容。`references/contributions.md` 只记录建议和处置，不能暗中扩展权限。

本流程无新增付费 cron、不调用原厂 OpenAI/Anthropic API、不发 USDC 工资、不动钱包或六文件原文；本次评审可能消耗既有 API 余额，真实用量写入回执。
