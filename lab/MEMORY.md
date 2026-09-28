# LTZZZ Memory · 记忆中心主文件

> 本文件是 `lab/` 层的记忆入口，权威知识库在 `ltzzz-memory/README.md`（总纲/分层/写入规则）。Memory Gate 要求所有接入 LTZZZ 的 AI 在执行任务前先读本文件与 `lab/tasks.md`。运行期逐日记忆另见 `data/memory/<agent>.json`（JSON 持久化，由 daily-agent-tasks 维护）。

## 核心总纲（观 · 行深 · 大道至简 · 改变世界 · 怜悯之心）

- **观**：所有任务的第一步。先观察事实、状态、上下文和结果，不急于行动，不凭猜测补全事实。
- **行深**：在真实任务、真实失败、真实结果中持续验证、修正和深入。
- **大道至简**：系统设计优先保持简单、可验证、可持续；能用已有能力解决，就不重复造复杂系统。
- **知其固然如此，知其本不该如此**：既理解现实为什么如此，也观察哪些问题本可以被改变，然后通过实际行动验证改变。
- **怜悯之心**：理解技术替代给普通人带来的现实影响；帮助因 AI/自动化失去谋生技能的人获得新的学习、工作、收入与参与机会，并记录哪些帮助真正有效。

## 每次任务的强制 Memory Gate

所有接入 LTZZZ 的 AI（含总控 GPT）在执行任务前必须先完成：

1. **观**：读取当前任务、相关长期记忆、最近结果和失败记录，确认事实边界。
2. **行深**：说明这次任务如何建立在已有结果上，以及要验证什么。
3. **核心理念检查**：确认任务没有偏离「观、行深、大道至简、改变世界、怜悯之心」。
4. **避免重复**：先查 Task Center（`lab/tasks.md`、`data/tasks/`）、Result Center（`results/`、`data/results/`）、Git 历史和凭证状态；已有任务不得重复部署，已有凭证不得要求重新注册。
5. **执行**：完成上述检查后才开始修改、调用 API 或部署。
6. **验证**：执行后记录真实结果、证据、失败原因和下一步。

## 五大中心

| 中心 | 位置 | 内容 |
|---|---|---|
| Memory Center | `ltzzz-memory/` + `memory/` + `data/memory/` | 长期记忆、重要决定、装备论、项目历史、重要事件、梦境与文明研究、逐日 AI 记忆 |
| Task Center | `tasks/` + `lab/tasks.md` + `data/tasks/` | 任务队列、每日任务、验收标准、失败原因、下一步 |
| Asset Center | `assets/` + `lab/assets-index.md` + `data/assets/` | 文章、代码、视频、研究、发布记录、资产余额 |
| AI Center | `ai/` + `protocol/ltzzz-ai-channels.md` | 每个 AI 的能力、凭证状态、真实测试、失败记录 |
| Result Center | `results/` + `data/results/` | 任务 → 执行 → 实际结果 → 验证 → 数据 → 下一步 |

## 记忆分层

- L0：安全规则、永久约束、核心总纲
- L1：重要决定与长期事实
- L2：装备论/魄/识神/梦境/文明等知识
- L3：每日记录（`data/memory/`、`memory/daily/`、`knowledge/daily/`）
- L4：临时任务上下文

## 真实性红线

- proposed ≠ applied；planned ≠ deployed；API存在 ≠ API已验证；AI回复 ≠ 实际结果。
- 所有结果进入 Result Center 并通过 VERIFY 后才能标记 verified。
- 高影响决定、资金、安全、账号权限必须人工确认（人持钥）。
- API Key 只存 GitHub Secrets / Cloudflare Secret，不写入代码、不发给任何 AI。
