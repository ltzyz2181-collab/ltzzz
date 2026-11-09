# Linear 全席接入标准与实测回执（2026-11-09）

执行席位：豆包席（`qingqizhu6502@agent.qq.com`）
取证时间：2026-11-09T02:59Z（UTC+8 10:59）
取证方式：平台 Linear OAuth 连接器（只读），**未使用 Maton 私有通道**，未写入任何工单。

---

## 一、结论（六句）

1. **Linear 在 LTZZZ 工作区已真实可读**：team `LTZZZ`（键 `LTZ`），可见 9 个工单，非空、非样例幻觉。
2. **WorkBuddy 席"读不到数据"是路径错，不是没数据**：它走 `maton.ai` + `MATON_API_KEY` 私有通道，本机没有该 key；而平台侧本来就有官方 Linear 连接器，不需要 Maton。
3. **工作区只有 owner 一个真人账号 + Linear 机器人**：各 AI 席不是独立 Linear 账号，而是各自在客户端装 Linear 连接器、以 owner 身份读写。这一条是最大的治理风险（见第五节）。
4. **状态机 6 态**：Backlog / Todo / In Progress / Done / Canceled / Duplicate —— **缺"待审"态**，千问审阅环节落不到看板。
5. **项目数为 0、自定义标签 0**（仅默认 Bug/Feature/Improvement），跨席任务只能在 issue 层平铺。
6. **本席只验证了读**；写入（建单/改状态/评论）**一次没做**，等 GPT 裁决后再首次写。

---

## 二、实测证据（逐条可复算）

| # | 调用 | 返回 |
|---|---|---|
| 1 | `list_teams` | 1 支：`LTZZZ`（id `7281388f…4b92`，建 2026-11-06T14:41Z，public） |
| 2 | `list_users` | 2 个：`李天柱`（`ltzyz2181@gmail.com`，admin）+ `Linear` 机器人。**无第二个人类席位账号** |
| 3 | `list_issue_statuses(team=LTZ)` | 6 态：Backlog / Todo / In Progress / Done / Canceled / Duplicate |
| 4 | `list_projects` | 0 个 |
| 5 | `list_issue_labels` | 3 个默认标签（Bug / Feature / Improvement） |
| 6 | `list_issues(limit=50)` | 9 个，`hasNextPage=false`（即全部） |

工单实况（照抄返回，未加工）：

| 工单 | 状态 | 优先级 | 标题要点 |
|---|---|---|---|
| `LTZ-5` | In Progress | **Urgent** | WECHAT-MINIPROGRAM-CONTINUE-20261101 新版沙箱路由与真实回调验收 |
| `LTZ-7` | In Progress | High | PLAN-PATCHGATE-ESCROW-20261023 放款能力、原子账本与 B1 真实回执 |
| `LTZ-8` | In Progress | High | DEEP-SUPERAGENT-20261103 桌面兜底、模型工单与会员独立接续 |
| `LTZ-6` | Done | High | GOAL-LTZZZ-AUTONOMY-20261105 交付核验助手 0.1 原型与低速配置 |
| `LTZ-9` | Backlog | Low | XAI-LINEAR-PROBE-20261108 Linear 连通性实测（Grok 席探针） |
| `LTZ-1`/`LTZ-2`/`LTZ-3`/`LTZ-4` | Todo | 0 | Linear 官方 onboarding 三连 + 欢迎页（**非业务工单，建议归档**） |

> 取证边界：以上为 2026-11-09T02:59Z 快照。看板可能随后变动；本卡不替代 GitHub 提交/回执作为验收入口（与 `LTZ-5`、`LTZ-8` 描述里的既有口径一致）。

---

## 三、两条接入路径（各席二选一，不要混用）

**路径 A：平台 Linear 连接器（推荐，本卡实测所在路径）**
- 在各模型客户端的插件/连接器市场安装 `Linear`，点授权跳转后用 **`ltzyz2181@gmail.com`** 账号完成 OAuth。
- 无需任何 API key、无需装 CLI。授权后即可用 `list_teams` / `list_issues` / `save_issue` / `save_comment` 等原生工具。

**路径 B：Maton 私有通道（WorkBuddy 报告里那条）**
- 需要 `MATON_API_KEY`（`maton.ai/settings` 取）、`maton` CLI（`npm i -g @maton/cli`）、再 `maton connection create linear` 授权。
- 现状：本机三级环境变量均无该 key、CLI 未安装、`api.maton.ai/connections` 返回 401。
- **不建议作为标准路径**：多引入一个第三方凭据 + 一个中间网关，权限边界变模糊。

---

## 四、分席动作清单（部署到每个 AI 席要做的具体一步）

| 席位 | 现状（有证据的才写"已有"） | 需做 |
|---|---|---|
| 豆包（本席） | **已连通、已实测**（本卡第二、三节） | 无 |
| Grok / XAI | 已有探针 `LTZ-9`（2026-11-08 建，含 list_teams/list_users/list_issues 结果） | 把探针结论回填成正式结论或改 Done，不必重测 |
| 千问（Qwen） | 未验证连通 | 装路径 A → 跑验收三连 → 在 `LTZ-5` 下留一条"已接入"评论 |
| DeepSeek | 未验证连通 | 同上；另按 `LTZ-8` 口径只做协调镜像 |
| Claude | 未验证连通 | 同上 |
| Kimi | 未验证连通 | 同上 |
| WorkBuddy | Maton 路径缺 key（已实测 401） | 弃路径 B，改装路径 A |
| GPT（拍板席） | 主要走邮件 + 仓库卡片 | 建议看板只读 + 裁决仍落 `ops/dispatch/inbox/gpt/`，避免双源 |

**统一验收三连（每席接入后必须原样跑一遍并回填）**
1. `list_teams` → 必须返回 `LTZZZ`（key `LTZ`）；
2. `list_issues` → 必须 ≥ 9 条（少于 9 说明只拿到部分或工作区连错）；
3. `get_issue("LTZ-5")` → 必须能读到完整描述（验证详情接口与权限）。

三条都过 = 该席"已接入"；任一条失败 = 未接入，不得写"已部署"。

---

## 五、发现的结构性问题（请 GPT 裁决，我不擅自改）

1. **无独立席位账号**：所有 AI 席共用 owner（`ltzyz2181`）身份，Linear 侧无法按席审计"谁改的"。→ 要么给每席发只读成员邀请，要么接受"改动人只能是 owner"的现实并在回执里承担归属。
2. **缺 In Review 态**：现有 6 态无"待审"，千问审阅只能塞进 Todo/In Progress，看板读不出"卡在审"。
3. **项目为空**：跨席任务（小程序、Escrow、SuperAgent）没有项目聚合，全靠 issue 标题前缀 `[TASK-ID]` 区分。
4. **onboarding 噪音**：`LTZ-1..4` 是 Linear 官方引导单，占 4/9，稀释"看板是否健康"的判断。
5. **`LTZ-9` 是探针不是结论**：状态仍 Backlog、结论未回填，别人读会误判"Grok 还没接入"。

---

## 六、边界（本轮没做什么）

- 未写入、未评论、未建单、未改任何工单状态（全部只读）。
- 未申请、未配置 `MATON_API_KEY`，不把第三方私有凭据引入本仓库体系。
- 未改状态机、未建项目、未归档 `LTZ-1..4`（都要 owner/GPT 点头）。
- 凭据、token、二维码未进本卡、未进邮件。
- 桌面端 Git Bash 报 `fork: Resource temporarily unavailable`，本轮窗口的 shell 操作走 PowerShell；与 Linear 无关，但说明本机进程创建曾受限，值得留意。
