# 回执 · 阶段 1 影子模式（PR #180 提案）

> 后续独立审查：原7项测试未覆盖2:1资金分歧、运行号不符、目录越界等问题。已补反例并修订；当前`--dry-run`只做本地预演，不能沿用下文“配置Key后直接调用平台预演”的旧操作。原测试和探测记录不追溯修改。完整结果见[总控审查](../../docs/REVIEW-PANEL-AND-HUMAN-HIRE-AUDIT-20261021.md)。

| 字段 | 内容 |
|---|---|
| 派单 | https://github.com/ltzyz2181-collab/ltzzz/pull/180 |
| 执行席 | xAI（代码 + 本地实测） |
| 时间 | 2026-10-21 |
| 模式 | **shadow** — 不生效、不付款、不发真单 |

## 做了什么

### A. AI 评审团 / 监管席（影子）

| 文件 | 作用 |
|---|---|
| `scripts/panel/limits.mjs` | 代码硬栏：单笔外部 ≤10U、RAH 单笔 ≤3U、试点总额 ≤10U、步长 ≤+20%/7 天 1 次 |
| `scripts/panel/schema.mjs` | 提案/投票结构化校验；拒绝未知自由字段；禁止同供应方自评 |
| `scripts/panel/regulator.mjs` | 证据存在性+哈希、步长/天花板、2 家不同供应方通过 |
| `scripts/panel/circuit-breaker.mjs` | 熔断条件评估；不可自恢复 |
| `scripts/panel/shadow-run.mjs` | CLI：`node scripts/panel/shadow-run.mjs --demo` |
| `scripts/tests/panel-shadow.test.mjs` | 单元测试 |

本地实测：`node --test scripts/tests/panel-shadow.test.mjs` → **7/7 pass**；`--demo` 影子决策 `decision_ok: true`，`applies: false`。

### B. RentAHuman 阶段 1（零成本探测）

| 文件 | 作用 |
|---|---|
| `scripts/rentahuman/stage1-probe.mjs` | 公开 API 搜索 + 可选 `dryRun`（需 Secret，仍不发真单） |
| `knowledge/results/rentahuman/stage1-probe-summary-20261021.json` | 本次探测摘要 |

实测摘要：

- `/api/stats` HTTP 200：humansAvailable ≈ 856k，agentsConnected ≈ 32k，bountiesTotal ≈ 17k
- **广州匹配数 = 0**（公开 `location=Guangzhou` / search 样本无明确广州落地工人）
- 官方服务费记为 **工人报酬之上 18%**（与提案核对一致）
- **未做 dryRun**：仓库无 `RENTAHUMAN_API_KEY`（阶段 0 仍须老板一次：注册 → Secret）

## 实际结果

| 项 | 结果 |
|---|---|
| 资金移动 | **无** |
| 真单 | **无** |
| 限额是否生效 | **否**（影子；只记录会不会通过） |
| 测试 | panel 7/7 通过 |

## 证据

- 分支：`stage1-panel-rentahuman-shadow-20261021`
- 提案原文：`ops/dispatch/AI-REVIEW-PANEL-20261021.md`、`RENTAHUMAN-PILOT-20261021.md`（PR #180）

## 下一步（仍不自动花钱）

1. **仅你一步：** 注册 RentAHuman → 把 `RENTAHUMAN_API_KEY` 放进 GitHub Secrets。
2. 云豆包：合入本分支后，用 Secret 跑 `node scripts/rentahuman/stage1-probe.mjs --dry-run`，保存预览回执。
3. 影子跑评审团 ≥7 天对比误判率，再谈是否切换生效 / 阶段 2（≤3U 数字类真单）。

## 红线自检

- 未写 Key、未付款、未放款  
- 未打开直播单  
- 未把影子结论标成已授权上线  
