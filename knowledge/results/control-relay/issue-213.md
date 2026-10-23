# 桌面 / 国内 AI 接力 · issue-213

状态：assigned_waiting_external_acceptance。

执行器：cloud_rules；模型调用 0；没有付款、投资、发布或任意命令执行。

任务原文仅作数据：

Install and audit LTZZZ task-execution Skill 1.0.

Install request:
- Source commit: 1e18c7064e339c8f2cc5ca12502a58bf38c229b5
- Install the complete `skills/ltzzz-task-execution/` directory, with `SKILL.md` as the only entrypoint and all references kept alongside it.
- Official source files:
  - https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/skills/ltzzz-task-execution/SKILL.md
  - https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/skills/ltzzz-task-execution/references/task-card.md
  - https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/skills/ltzzz-task-execution/references/receipt-template.json
  - https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/skills/ltzzz-task-execution/references/runtime-contract.md
  - https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/skills/ltzzz-task-execution/references/contribution-template.md
  - https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/skills/ltzzz-task-execution/references/contributions.md
- Install in the actual client prompt directory where supported: VS Code `.github/skills/` or user-level skills; Claude Code `~/.claude/skills/`; Codex `~/.codex/skills/`. Preserve unrelated installed skills and report the exact destination and source commit. A link handoff is not proof of installation.

Review request:
- Independently audit the full current result for `META-HUBTEST-20261022` against its task card and Skill 1.0:
  - Task card: https://github.com/ltzyz2181-collab/ltzzz/blob/main/ops/dispatch/META-HUBTEST-20261022.md
  - Full result: https://github.com/ltzyz2181-collab/ltzzz/blob/main/knowledge/results/meta-external/meta-hubtest-20261022.md
  - Current draft receipt: https://github.com/ltzyz2181-collab/ltzzz/blob/main/knowledge/results/meta-external/meta-hubtest-20261022.receipt.json
- Check the report's specific breaker/field claim against its stated PAGE_NOT_FOUND source evidence, validate hashes rather than accepting placeholders, and ensure the final receipt records `reasoningHash`, `paid: false`, and `tx_hash: null`.
- Do not edit `ops/派单台账.md` or set the row to `已验收` before independent GPT controller and Qianwen audit results are recorded. Preserve uncertainty and report blockers; do not invent source evidence, hashes, installation, or acceptance.
- No keys, paid calls, financial actions, or unrelated repository changes.

## 核验材料

```json
{
  "ran_at": "2026-10-23T00:23:43.094Z",
  "active_controller": "gpt",
  "controls": {
    "dispatch_paused": false,
    "automatic_recovery": true,
    "concurrency": 1,
    "investment_hold": false,
    "paused_agents": [],
    "all_tasks_independent_review": true
  }
}
```

任务指向云端 LTZZZ 执行席，不会唤醒已离线的 ChatGPT 对话。只读交付待独立审核；派单成功不代表千问原生模型接单。
