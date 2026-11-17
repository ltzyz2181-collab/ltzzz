# Source Intelligence MVP 排期（2026-11-17 起）

依据：`OWNER-AUTH-20261116-SOURCE-INTEL`（范围：MVP 范围定义、仓库内实现、只读采集、本地测试；排除：新增付费账号、对外发布、生产部署、凭据采购）。本文件是**排期**，不是成果声明。

基础资产：`products/workbuddy/ltzzz-source-check/`（v1.0.2，8 条流程 + 7 列模板 + 判例口径）。

## 一、MVP 定义（一句话）

把 v1.0.2 的「来源核对」规则从**提示词**变成**可复算的仓库内工具**：给定一份文稿与一组来源，产出一张可对账的事实表（编号、原说法、四档判断 + 限定标签、资料属性、来源位置、摘录、修订建议）和一份未核实项清单，全程不联网、不调付费模型。

判定标准：同一输入两次运行的输出逐字节相同；每条判断都能反查到「读的是哪个文件的哪一段」。

## 二、里程碑与日期

| 里程碑 | 日期 | 交付物 | 完成判据（可验证） |
|---|---|---|---|
| M0 范围冻结 | 2026-11-17 **已完成** | 本文件 + 任务卡 `ops/deep-superagent/tasks/SOURCE-INTEL-MVP-20261117-01.json` | 任务卡已建：task_id 唯一、`platform=internal`、`data_classification=public_distributable` |
| M1 规则引擎 | 2026-11-19 | `scripts/source-check.mjs` + `scripts/tests/source-check.test.mjs` | ≥8 例测试全绿：四档判断、限定标签、口径统一（十进制/二进制、含税/不含税、累计/当期、单体/合并）、冲突并列、长文分批 |
| M2 采集与落盘 | 2026-11-21 | `scripts/source-check-collect.mjs`（只读本地文件/给定 URL 文本）+ `knowledge/results/source-check/<日期>-<hash>.json` | 输入 hash、来源清单、读取时间、`model_calls=0` 全部落盘；两次运行 sha256 相同 |
| M3 报告与验收 | 2026-11-24 | 按 `templates/report.md` 生成 Markdown 报告的渲染器 + 1 份真实样例 | 样例报告逐列与 JSON 一致（脚本回读比对），未核实项带原因分类 |
| M4 接巡检 | 2026-11-27 | 巡检 query 增加一条：有输入稿件时自动产出报告 | 一次真实触发留下 `daily-*.json` 中的 `source_check` 段（本次未做） |

## 三、边界（明确不做）

1. 不联网抓外部来源（M2 只读用户给定文件；联网属额外授权）。
2. 不调付费模型：判断由规则 + 人工可复核的映射产出，`model_calls=0`。
3. 不对外发布、不新增账号、不部署服务、不碰凭据。
4. 不改 v1.0.2 技能包原文（它是 WorkBuddy 已发布版本，改动需单独立项）。

## 四、当前状态（2026-11-17 实测）

| 项 | 状态 |
|---|---|
| 授权 | 已存在 `OWNER-AUTH-20261116-SOURCE-INTEL`，`authorized_start_mvp_scope` |
| 基础资产 | `products/workbuddy/ltzzz-source-check/` 存在（SKILL.md / templates / references 三件齐） |
| M0 | 本文件已写；任务卡 `SOURCE-INTEL-MVP-20261117-01` 已建 |
| M1–M4 | **未开始**（`0 产出`，代码目录无 `scripts/source-check.mjs`） |

之前记的「至今 0 产出」准确：11-13 立项到现在只停留在授权与技能包，没有仓库内实现。

## 五、风险

1. 「规则可复算」与「判断质量」是两件事：规则能保证一致，不保证判得对；M3 必须留人工复核入口，不得把脚本输出当终审。
2. 长文分批（>20 条）容易在批边界漏项，M1 测试必须覆盖跨批编号连续性。
3. 口径统一依赖输入显式声明（含税/不含税等）；未声明时只能标「口径未声明」并按无法核实处理，不得默认。
