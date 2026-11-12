# Deep 技能迭代授权与月度巡查（2026-11-12）

## 1. 授权内容

owner 授权 Deep 具备「技能迭代提案能力」，同时把裁决权与执行权分开：

- Deep 可以：巡查范围内 skill、读证据、产出 1-3 条迭代提案、在独立分支备补丁草稿、把提案提交 GPT 裁决。
- Deep 不可以：直接改 main 上的 `SKILL.md` 或 references、合并 PR、部署或发布 skill 版本、自我裁决、声称已获批准、触碰资金/签名/钱包/Safe/放款/生产写/凭据。
- 任何会改变 skill 行为、或声称能带来使用提升的迭代，一律需要 GPT 裁决通过；裁决通过后仍要走既有 owner Issue `[LTZZZ技能评审]` 评审流水线，评审通过才合并，部署另按发布流程。

三条状态必须分开留证：**已裁决 / 已合并 / 已部署**，不得互相顶替。

## 2. 范围

仓库内可迭代（仍需裁决 + Issue）：

- `skills/ltzzz-task-execution`
- `.github/skills/ltzzz-task-execution`
- `.claude/skills/ltzzz-task-execution`
- `.agents/skills/ltzzz-task-execution`

不在仓库内（Deep 只读不改，只出方案）：平台级/用户目录下的各类 doubao skills。

## 3. 月度巡查做什么

每月一次，按 `config/deep-skill-iteration.json` 的 `monthly_flow`：

1. 枚举范围内 skill 与版本哈希；本月无提案的 skill 也要列出来并说明为什么不动。
2. 按证据筛候选：queue 回执失败、skill-review 反复出现的同类问题、任务卡被误用（模板占位符被照抄、把授权负面条款当路由规则等）、口径过时。
3. 每条提案必须写：现状、证据 ref、改动点、预期收益、风险、可回退方式、是否改变行为。
4. 派一张 `DEEP-SKILL-ITER-<YYYYMM>-01` 卡请 Deep 复核提案（只做草稿，不做裁决）。
5. 提案 + Deep 复核结果发 GPT 裁决。
6. 落盘 `knowledge/results/skill-iteration/<YYYY-MM>.json`，状态 `awaiting_gpt_decision`。

未获裁决前，不改任何 skill 文件。

## 4. 与既有流程的关系

| 层 | 谁做 | 产物 |
| --- | --- | --- |
| 发现与提案 | Deep（月度巡查） | 提案清单 + 证据 ref |
| 裁决 | GPT 决策席 | approve / revise / reject 回执 |
| 评审与合并 | owner Issue `[LTZZZ技能评审]` 触发的既有流水线 | review 记录 + PR |
| 发布 | 既有发布流程 | release 记录 |

## 5. 红线

- 资金、签名、钱包、Safe、放款、生产写永不进入 skill 执行器。
- 评审、技能迭代、资金三类自动化部署须 GPT 裁决后才执行。
- skill 内容不得写入凭据、真实邮箱正文或未脱敏数据。
