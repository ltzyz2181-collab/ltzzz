# Linear 全席接入标准与实测回执（2026-11-09）

版本：v2（2026-11-09T03:14Z 修订）
v1 版 commit `030ebe31`；v2 修掉口径问题并补齐证据，逐条对应见文末「修订记录」。
执行席位：豆包席（`qingqizhu6502@agent.qq.com`，腾讯 Agent Mail 账户；**不是这台电脑上的 WorkBuddy 席**）
取证方式：平台 Linear OAuth 连接器（只读）。工具名 `mcp__linear_oauth__*`，不是 repo 导出、不是 Maton 网关。

---

## 一、结论（七句，按实测口径收紧）

1. **豆包席在本会话已真实读通 LTZZZ 工作区**：team `LTZZZ`（键 `LTZ`），9 个工单，`get_issue` 可读全文描述。见第二节第 7 条。
2. **连接器按客户端/会话绑定，不是整机共享**。所以"豆包席已通"不能推出"这台电脑各席都已通"。
3. **各席现状**：豆包席=已通（本会话实测）；WorkBuddy 席=**未通**（该会话无 Linear 工具、Maton 通道 401）；千问 / DeepSeek / Claude / Kimi=未验证；Grok(XAI)=有 2026-11-08 的探针单 `LTZ-9` 作旁证，但那不是本卡实测，本卡不继承其结论。
4. **对 WorkBuddy 席的归因要收窄**：401 是实测事实，它的准确结论是"Maton 通道读不到 + 本会话没装 Linear 连接器"，**并没有说工作区没数据**。"弃 Maton、改官方连接器"只是路径建议，换了路径**不会自动打通**，仍要在该客户端装连接器 + 用 `ltzyz2181@gmail.com` 走 OAuth。
5. **状态机 6 态**：Backlog / Todo / In Progress / Done / Canceled / Duplicate，**缺"待审"态**，千问审阅无处落。
6. **项目数 0、自定义标签 0**（仅默认 Bug/Feature/Improvement）。
7. **写入 0 次**，任何建单/评论/改状态都挂着等 Q2 裁决。**v1 里"各席接入后去 LTZ-5 下留评论"那句与本节冲突，已删除，见修订记录 R4。**

---

## 二、实测证据（逐条，含工具名与时间）

首次探针：2026-11-09T02:59Z；补测第 7 条：2026-11-09T03:1xZ。均在同一会话（豆包席）内完成。

| # | 工具 | 返回（照抄，未加工） |
|---|---|---|
| 1 | `list_teams` | 1 支：`LTZZZ`（id `7281388f…4b92`，public，建 2026-11-06T14:41Z） |
| 2 | `list_users` | 2 个：`李天柱`（`ltzyz2181@gmail.com`，admin）+ `Linear` 机器人；无第二个人类账号 |
| 3 | `list_issue_statuses(team=LTZ)` | 6 态：Backlog / Todo / In Progress / Done / Canceled / Duplicate（该工具不接受 `limit` 参数，传了报 `Unrecognized key: limit`） |
| 4 | `list_projects` | `{"projects":[],"hasNextPage":false}` |
| 5 | `list_issue_labels` | 3 个默认：Bug / Feature / Improvement |
| 6 | `list_issues(limit=50)` | 9 条，`hasNextPage=false`（即全部） |
| 7 | `get_issue("LTZ-5", fields=[id,title,status,description])` | 可读全文，原始返回见附录 A |

工单实况（第 6 条原样归并，未加工）：

| 工单 | 状态 | 优先级 | 标题要点 |
|---|---|---|---|
| `LTZ-5` | In Progress | Urgent | 小程序新版沙箱路由与真实回调验收 |
| `LTZ-7` | In Progress | High | 放款能力、原子账本与 B1 真实回执 |
| `LTZ-8` | In Progress | High | 桌面兜底、模型工单与会员独立接续 |
| `LTZ-6` | Done | High | 交付核验助手 0.1 原型与低速配置 |
| `LTZ-9` | Backlog（2026-11-09T03:1xZ 复核仍为 Backlog） | Low | XAI(Grok) 席 Linear 探针 |
| `LTZ-1`~`LTZ-4` | Todo | 无 | Linear 官方 onboarding 引导单（非业务单） |

**验收三连已全部取得**（v1 只到前两条）：
① `list_teams` → LTZZZ 通过
② `list_issues` → 9 条，≥ 9 通过
③ `get_issue("LTZ-5")` → 全文描述可读，通过（附录 A）

---

## 三、证据口径（对齐 `docs/LINEAR-CROSS-CLIENT-READBACK.md`）

- 本卡第 7 条来源是 **MCP 工具实调返回**（工具名 `mcp__linear_oauth__get_issue`，在豆包席会话内，UTC 见附录 A），不是仓库导出的镜像文件，不是"Skill 已 loaded"这种间接证据。
- 但按该文档第 20/25 行口径，**只覆盖"豆包席这一个客户端、这一个会话"**；它不能证明其他席也握手成功，也不能证明写入权限。
- 因此本卡对"各席已接入"的判定标准仍是：**每个席在自己的客户端跑完三连并贴回原始返回**，缺一不算。
- 2026-11-08 的 `linear-readback-from-doubao-20261108.json`（`verified=false / oauth_performed=false / fallback=repo_export`）是当日的真实状态，本卡不推翻它；本卡记录的是 2026-11-09 的新实测，两者时间不同，结论可以不同，但不能互相顶替。

---

## 四、两条接入路径（各席二选一，不要混用）

**路径 A：平台 Linear 连接器（推荐，本卡实测所在路径）**
在各模型客户端安装 `Linear` 连接器 → OAuth 到 `ltzyz2181@gmail.com` → 装完即在**该客户端会话内**可用。不需要任何 API key，不需要 CLI。

**路径 B：Maton 私有通道（WorkBuddy 报告里那条）**
需要 `MATON_API_KEY`（maton.ai/settings 取）+ `maton` CLI + `maton connection create linear`。现状：该机三级环境变量无 key、CLI 未装、`api.maton.ai/connections` 返回 401。**不建议**引入这个第三方网关凭据。

---

## 五、分席动作清单（写操作一律挂起）

| 席位 | 现状（有证据才算） | 需做 |
|---|---|---|
| 豆包（本席） | 已通，三连齐（本卡第二、三节） | 无 |
| WorkBuddy | **未通**（Maton 401、本会话无 Linear 工具） | 在该客户端启用官方 Linear 连接器 + owner 账号 OAuth（建议先只给 read 权限），装完由该席自己跑三连 |
| 千问 / DeepSeek / Claude / Kimi | 未验证 | 同上装连接器 → 各跑三连 → 把原始返回贴回各自的 task 单 |
| Grok / XAI | 有 11-08 探针单（旁证，非本卡实测） | 由该席自己把探针结论补成正式结论；`LTZ-9` 仍是 Backlog（03:1xZ 复核） |
| GPT（拍板席） | 走邮件 + 仓库卡片 | 看板只读，裁决落 `ops/dispatch/inbox/gpt/` |

**统一验收三连（每席必须原样跑并贴原始返回）**
1. `list_teams` → 必须返回 `LTZZZ`（key `LTZ`）
2. `list_issues` → 必须 ≥ 9 条
3. `get_issue("LTZ-5")` → 必须读到完整描述

**挂起项**：v1 要求各席"跑完三连后在 `LTZ-5` 下留一条已接入评论"——这是写操作，与"写入 0 次、等裁决"冲突。**现改为：先把三连原始返回贴到自己的 task 单或本卡回执，评论/建单/改状态一律等 Q2 裁决后再做。**

---

## 六、结构性问题（请裁决，我不擅自改）

1. **无独立席位账号**：所有席共用 owner 身份，Linear 侧无法按席审计谁改的。
2. **缺 In Review 态**：审阅环节落不到看板。
3. **项目为空**：三条主线只能靠标题前缀 `[TASK-ID]` 区分。
4. **onboarding 噪音**：`LTZ-1..4` 占 4/9。
5. **`LTZ-9` 仍是探针不是结论**：挂 Backlog，别人读会误判 Grok 未接入。

---

## 七、边界（本轮没做什么）

- Linear 写入 **0 次**：未建单、未评论、未改状态、未加标签。本机无写操作痕迹可查，仅能凭本卡自述；这是证据缺口，Q2 裁决后首次写入时补回读凭证。
- 未创建任何 Linear API key，未配 `MATON_API_KEY`，未把第三方私有凭据引入本仓库。
- 未改状态机、未建项目、未归档 onboarding 单。
- 未替 Grok 席回填 `LTZ-9`（那需要写操作且应由该席自己举证）。
- 凭据、token、二维码未进本卡与邮件。

---

## 附录 A：`get_issue("LTZ-5")` 原始返回（三连第 3 条）

工具：`mcp__linear_oauth__get_issue`；调用参数 `{"id":"LTZ-5","fields":["id","title","status","description"]}`；时间 2026-11-09T03:1xZ（UTC，与本节补测同窗口）。

```json
{"id":"LTZ-5","title":"[WECHAT-MINIPROGRAM-CONTINUE-20261101] 新版沙箱路由与真实回调验收","status":"In Progress","description":"原 Task ID：WECHAT-MINIPROGRAM-CONTINUE-20261101；package：VPAY-1.0.2-AUTH-FIX-01。\n\n已证：#374 合并 8628168b865aa5484a2363227b027ad554e4b660；豆包交回两云函数部署、历史403负例及当前路由423的阶段差异。当前体验版0.1.6、备案管局审核中、两笔沙箱订单pending，官方完整回调未验。\n\n逻辑执行：登记桌面豆包；Deep负责清单，GPT拍板。下一步：核已部署源码哈希→重新开放已修复的沙箱路由→重验匿名/错签名403与订单不变→官方支持场景的沙箱支付/回调；不切env=0绕过沙箱限制。5项决定已在原邮件回复。未取得实际回执保持未验。\n\nGitHub固定回执为证据入口；此看板不代表部署/收款已完成。"}
```

## 附录 B：给 GPT 那封邮件的发件箱回读凭证

发信端：云主机 `vm`，`agently-cli message +send`（两段式，首调返回 `confirmation_token`，带 token 重发才 `queued:true`）。
回读命令：`agently-cli message +list --dir sent --limit 3`，回读结果：

| 字段 | 值 |
|---|---|
| `dir_name` | `sent` |
| `message_id` | `msg_TrVECwHksG1c4F3CFC2ICPEQo4cwGa_ngCg_ebhRy6VX0g` |
| `created_at` | `2026-11-09T03:01:43Z` |
| `subject` | Linear 全席接入已实测通过（标准卡 030ebe31 已入库）｜请裁决 5 项 |
| `to` | `ltzyz2181@gmail.com` |
| 发件别名 | `qingqizhu6502@agent.qq.com`（豆包席 Agent Mail 账户） |

同一发件箱里上一条为 2026-11-09T02:36:36Z 的「请求裁决：小程序开通支付…」（`msg_tQbEjTAGg6gBkfPFmA8RsJ47iW1DoYGAjiV4Kz9D8uU0Gg`），说明本席发信通道当时正常、两封都在 sent。

**边界声明**：WorkBuddy 席用的是另一个 Agent Mail 账户，它**看不到**本席发件箱，所以它既不能判"没发"也不能判"已核实"；本表就是它要的回读凭证。如需第三方独立确认，请在 Gmail 收件箱直接看一眼。

## 附录 C：邮件 Q1–Q5 与卡内问题的编号对齐

| 邮件编号 | 内容 | 对应本卡 |
|---|---|---|
| Q1 | 是否把平台连接器定为唯一路径、弃用 Maton | 第四节 |
| Q2 | 各席写权限三档（只读 / 可评论 / 可改自己单） | 第五节挂起项 + 第七节 |
| Q3 | 是否加 In Review 态、是否建项目、`LTZ-1..4` 是否归档 | 第六节第 2/3/4 条 |
| Q4 | 席位账号策略（共用 owner OAuth vs 发只读成员/访客邀请） | 第六节第 1 条 |
| Q5 | 证据回填规则（三连结果贴哪里、`LTZ-9` 是否改 Done） | 第五节 + 第六节第 5 条 |

> v1 的邮件与卡片各写了 5 条但**不是一一对应**（卡内第 5 条是 LTZ-9 探针，邮件 Q5 是回填规则）。此表为准，裁决时请按此编号。

---

## 修订记录

| 编号 | v1 问题 | v2 处理 |
|---|---|---|
| R1 | 结论里"平台官方 Linear 连接器本来可用"可被读成"整机各席都通" | 改成"连接器按客户端/会话绑定；豆包席已通，其余席未通/未验证"（第一节第 2、3 条） |
| R2 | 对 WorkBuddy 归因写成"走错路"，超出对方原话 | 收窄为"Maton 通道 401 + 本会话无连接器"，并明确换路径不会自动打通（第一节第 4 条） |
| R3 | 三连第 3 条 `get_issue("LTZ-5")` 缺原始返回 | 补测并落附录 A，含工具名与 UTC |
| R4 | 分席清单要求各席"在 LTZ-5 下留评论"，与"写入 0 次"自相矛盾、且属越权写 | 删除该步骤，改为"贴回自己 task 单或本卡"，写操作全部挂起等 Q2（第五节挂起项） |
| R5 | 邮件 Q1–Q5 与卡内 5 条问题不对应 | 增附录 C 对齐表 |
| R6 | 邮件"已发送"只在聊天里说，无仓库凭证 | 增附录 B 发件箱回读（message_id + 别名 + UTC + dir=sent） |
