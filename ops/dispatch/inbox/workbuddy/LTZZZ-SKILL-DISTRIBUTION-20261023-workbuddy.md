# LTZZZ-SKILL-DISTRIBUTION-20261023-workbuddy

类型：规则分发卡；不是新的业务订单，不改变原任务 ID。

- 目标：执行原派单时使用 LTZZZ Skill v1.0.0。
- 固定来源提交：1e18c7064e339c8f2cc5ca12502a58bf38c229b5
- 主入口：https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/1e18c7064e339c8f2cc5ca12502a58bf38c229b5/skills/ltzzz-task-execution/SKILL.md
- 其余五文件及字节哈希：config/ltzzz-skill-release.json；references 保留子目录。
- 输出：原任务回执；可提分支 PR 补充建议，不另购模型、不新增付费定时。
- 验收：执行器记录实际读取/注入的文件字节、artifact.sha256、source_commit 与工具记录；模型复述提交号不算读取证据。
- 回执：reasoningHash 不是 Skill schema 字段，不填写伪哈希。此次分发无 USDC 结算，paid=false、tx_hash=null、settlement_kind=none；未来业务照实际付款凭证填写，不能把默认值固化。
- 状态：repository_card_published_not_client_acceptance；目录安装、客户端加载、模型输入注入、业务验收分别记录。
- 禁止：不读凭证、不替其他席接单、不把本卡当新采购或付款指令。
