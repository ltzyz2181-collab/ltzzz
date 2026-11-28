# 原厂 Deep 每日自主闭环与桥接注入修复（2026-11-28）

本页记录 2026-11-28 实际合并、部署与回读的证据，区分 draft / tested / merged / deployed /
platform accepted。所有引用的回执均为公开仓库文件或 GitHub Actions 运行。

## 1. 每日工作流现在自己写卡、提交并派单

`.github/workflows/deep-superagent-daily.yml` 在证据读取、reserve attempt、reconcile 之后，
已经有连续三步：

1. `node scripts/build-deep-backlog-triage.mjs --date "$DATE"`：用公开积压证据生成逐项分流单；
2. `node scripts/dispatch-daily-card.mjs --date "$CARD_DATE" --suffix 1`：写 DAILY 分诊卡与 OPS 执行卡；
3. `node scripts/publish-daily-cards.mjs --date ... --skip-generate`：先提交分流单，再提交纯净卡提交，
   随后显式 dispatch `deep-superagent-queue.yml`（GITHUB_TOKEN 推送不会触发下游 push 工作流）。

因此 00:30 UTC 的每日运行不再依赖人工跑 6:45 脚本补卡。`--skip-generate` 会复用同 run 已写盘的
`latest.json` / `summary.json` / 当日 dated 文件，并把真实路径与字节数带回提交（PR #667），
不会再出现 `files:{}` 导致的 `brief=no_files`。

## 2. 桥接证据真正进入模型 prompt（PR #676）

根因：`runQueue` 构造卡对象时字段名是 `repo_context`（snake_case），`runQueueCard` 只解构
`repoContext`（camelCase），展开后恒为 `undefined`，`readRepoContext` 读到的证据从未注入。
OPS-2 / OPS-4 的 queue 回执 `repo_read` 为空即此原因。

修复：

- `runQueueCard` 同时接受两种写法，统一为 `repoEvidence`，注入和审计同源；
- 回归测试改为真实 snake_case 调用，并断言 POST prompt 含【仓库读取证据】。

合并：PR #676，merge `6a1e1780ddf5a0aa81d7a19a8fe34849115eae90`。

## 3. 围栏包裹的整份代码不再整卡失败（PR #678）

Issue #640 的队列 run 45891879437 中，模型把完整 `.mjs` 包在 ```javascript ...``` 里放进
`<<<FILE>>>` 块，`syntaxGate` 返回 `markdown_fence_in_code_file`，`code_change` 整单失败。

修复：`extractFileWrites` 对代码扩展名识别“整块只有一个围栏”的运输噪声并去掉首尾围栏；
非代码文件与“围栏只出现在中间”的内容保持原文；`node --check`、测试与合并前 CI 闸门不变。

合并：PR #678，merge `333cd502e2bedcb4616ac2a6d3cb63af92576ee6`。

## 4. 注入预算对齐 worker 上限（PR #679）

`workers/deep-superagent/index.js` 的真实边界：请求体 32,768 字节、`prompt.length ≤ 20000`。
`suffix-5` 队列 run 46096350431 把 53,272 B 的 `latest.json` + 7,008 B 的 `summary.json`
一起注入，POST 后 worker 返回 `invalid_prompt`，DAILY 卡执行完、OPS 卡整张未执行。

修复：

- `REPO_READ_LIMIT_BYTES` 从 64KB 降到 16KB，超预算文件在 `repo_read` 审计里记
  `size_budget_exceeded`（保留真实字节数），不再生成会被 worker 拒绝的请求；
- OPS 卡面如实说明：`summary.json` 是注入的逐项输入，`latest.json` 是完整 275 条记录，
  超预算时不会进入 prompt；指令按 `oldest` 与卡面 `backlog_oldest`，不再引用不存在的 `rows`。

合并：PR #679，merge `f87386795caa44763393cd067ba5745cd9a86d52`。

## 5. 端到端验证（suffix-6，run 46096903290）

- 卡提交 `3368c906fa5a0c503eee84689350a8759ea5836b`（DAILY-6 + OPS-6，单次提交只新增每日卡）；
- 队列 run [46096903290](https://github.com/ltzyz2181-collab/ltzzz/actions/runs/46096903290)
  `queue_results_verified`；
- OPS-6 的 `repo_read`：
  - `backlog/latest.json` → `size_budget_exceeded`，`bytes: 53272`；
  - `backlog/summary.json` → `read`，`bytes: 7008`，
    `sha256: 2ed5c9ecd7a6cfe7a7a3dcfb621ffa031c6b0a4acbead7a9baa3043e9a41612f`；
- 自治执行：`status: executed`，`needs_gpt_decision: false`；
  - `code_change` 开 PR #680，deep-autonomy-verify CI run 46097033372 success，
    合并 `39b4b20de2cbb3de7cea94b0932666dd9b7cf385`；
  - 产物 `knowledge/results/deep-superagent/backlog/triage-2026-11-28.json`：
    `counts.triaged_cases=275`、`reserved_family_escalations=0`，`top_actions` 使用真实任务 ID；
  - `deploy` dispatch `deep-superagent.yml`，run
    [46097065418](https://github.com/ltzyz2181-collab/ltzzz/actions/runs/46097065418) success。

状态分层：卡与分流单 = merged；自动补丁 = merged；部署 = deployed（run success）；
平台验收与真实客户交付不在本页声称。

## 6. 公开积压逐项分流

`knowledge/results/deep-superagent/backlog/` 下的 `latest.json`（53,272 B，275 条逐项行）、
`summary.json`（7,008 B，计数 + oldest 20）、`2026-11-28.json`（101,787 B）已提交到 main
（提交 `bf591487`）。每日 OPS 卡按 oldest 20 推进；完整 275 条保留在同一份公开文件中，
不依赖模型一次读完。

已知限制：suffix-6 的 triage 只写出 2 条 `top_actions`（均为真实 ID），少于卡面要求的 20 条；
这是模型输出完整性问题，已由 OPS 回执保留，后续卡会继续要求补足，不影响链路可用性。

## 7. QQ 共享箱只读凭据

- 仓库 secrets `QQ_IMAP_USER` / `QQ_IMAP_PASSWORD` 已存在并被每日工作流引用；本轮未改 Secret 值，
  也未在任何文档、日志或回执中写入凭据内容；
- run 46094118691 的邮件采集回执：`qq status=ok count=60 open_count=60 full_box_total=3136`，
  同 run Gmail 1753 / 6107；
- `scripts/run-mail-intake.mjs` 只读连接（`readonly=True`、`BODY.PEEK`），不标已读、不删除、不移动；
- `docs/2026-11-27-deep-imap-readonly.md` 记录 Agent Mail 不支持 IMAP，共享箱使用 `imap.qq.com:993`。

## 8. Issue #640 首次执行与证据预算修复（PR #681）

Issue 桥卡 `DEEP-SUPERAGENT-20261128-ISSUE-640-R1`（卡提交 `091b18cb`）首次派发时，
队列 run 46097201873 返回 `queue_blocked` / `invalid_prompt`。回读数据：

- 卡面 prompt 9,852 字符（10,420 B）；
- 固定 16KB 证据预算实际注入 13,726 字符（16,204 B）；
- 合计 23,578 字符，超过 worker 的 `prompt.length > 20000` 上限。

修复（PR #681，merge `436939262fbc80715363461baf0228848c90ed12`）：

- `repoContextBudget(prompt)` 按卡面剩余字符/字节空间计算证据预算；
- `readRepoContext` 放不下的文件记 `size_budget_exceeded`，不再生成必然被拒的请求；
- `applyRepoContext` 增加最终截断保护并写 `truncated` 标记；
- 用同一张卡复测：最终 prompt 14,298 字符 / 17,251 B 请求体。

修复后 `retry=2`（卡提交 `722aaec8`，队列 run 46097709369）：
`queue_results_verified`，OPS 式自治 `status: executed`、`needs_gpt_decision: false`；
`code_change` 开 PR #682 并合并 `f21cf1df`，新增 `config/routing-matrix.json`（按任务类型映射
relay_claude / relay_gpt / deep）。这份产物覆盖路由矩阵，但没有改 `scripts/` 代码。

## 9. 卡面优先级、原 Task ID 与修改范围（PR #683）

#640 的卡面此前固定 `importance=medium`、禁止修改全部 `.github/workflows/` 与 `config/`、
把五个保留家族写成六个，且 Issue 正文里的原 Task ID 没有结构化字段。修复
（PR #683，merge `1bdc5e5ad745a788d984e720dca01c2798873aa4`）：

- `[P1]` / 标签 `P1` → `high`（三席：deep、claude-relay、gpt-relay）；`P2` → `medium`，`P3` → `low`；
- `extractIssueTaskIds` 提取原 Task ID，写入卡面 `原 Task ID：...` 与 `card.source_task_ids`；
- 规则 2 收窄到真实受保护路径（owner 授权来源、凭据、资金目录、写入闸拒绝路径），
  普通 workflow、config、scripts、docs、tests 可改；
- 规则 3 改为“五个保留家族”，仍不点名具体词，避免桥触发自身禁区扫描。

真实 Issue #640 建卡验证：`importance=high`、三席、`source_task_ids` 含
`LTZZZ-RELAY-SKILL-ROUTING-20261124-01`、卡面 9,921 字符、卡 11,592 B；叠加证据注入后
最终 prompt 14,502 字符 / 16,866 B，仍在 worker 上限内。

`retry=3` 已重新派发（issue 桥 run 46098424102），随后连续暴露三个问题并修复：

### 9.1 R3：桥接元数据进入 worker 请求体（PR #684）

队列 run 46098445715 返回 `unknown_job_field`。根因是 PR #683 把原 Task ID 写进卡面顶层
`source_task_ids`，该字段随卡体进入 worker 请求；`normalizeJob` 只接受 5 个键。
修复：`stripDispatchMetadata` 与 `importance`/`seats` 一起剥离 `source_task_ids`，
`taskDispatchMetadata` 校验后只保留在队列回执。合并：PR #684，
merge `5bb68105bbb5e66cdf919ed014ee677e4585df78`。

### 9.2 R4：输出扫描把工程词表当资金指令（PR #686）

队列 run 46098944435 返回 `blocked_fiduciary` / token `payment`。模型输出在
`scripts/dispatch-issue-card.mjs` 的整文件块里声明 `RESERVED_FAMILIES` 词表，旧扫描按原文
匹配资金词，把工程代码误判为执行指令。修复：输出只扫可执行部分（显式文件块与结构化
`actions`）；普通工程文件块只拦真实动作（交易/签名 API、密钥赋值、链上地址）；敏感路径
仍严格扫描；自由文本与无可执行字段的 JSON 回退原文扫描。合并：PR #686，
merge `f37c8f0a4cb7d816a8ecb3c449d613e7dc5778cb`。

### 9.3 R5：未读原文的整文件重写与恢复（PR #687 / #688 / #689）

R5 的 issue 桥 run 46099525663 success；队列 run 46099541900 `queue_results_verified`，
自治 `status: executed`、`needs_gpt_decision: false`。但 `repo_read` 对
`scripts/dispatch-issue-card.mjs` 返回 `size_budget_exceeded`（15,074 B 未注入），模型没看到
原文仍输出整文件块，自治层重写后合并 PR #687（`95e0f996`，+26/-305），把 Issue 桥覆盖成
991 B 的桩；main 上的 Issue 桥测试随即失败。

恢复：PR #688 按 #687 父提交 `77c68a01` 恢复原文（blob `c47b2a58`，15,074 B，+305/-26），
merge `d8fb0626956234ccffa5c7e359e8090057652a48`，全部 13 项检查通过。

防护：PR #689 新增 `unreadExistingWrites`——`repo_read` 状态必须为 `read` 且注入未截断，
才允许写已存在的文件，否则 `code_change` 返回 `rejected` /
`unread_existing_file:<paths>`，不进入 git/PR/合并；队列把 `repo_read` 与
`repo_read_truncated` 传给自治层。回归 77 pass / 0 fail。merge
`7de3a850e2a6419670950c818a14032a56a998e7`。

说明：该次 API 提交把这四个 `.mjs`/测试文件从 CRLF 规范化为 LF（内容与测试不变，
PR 显示为整文件差异）；后续修改以 main 当前字节为准。

状态分层：R3/R4 补丁与防护 = merged；R5 自动补丁 = merged 但产物错误，已由恢复 PR 回滚并替换；
未发生部署、平台验收或真实客户交付。

## 10. 仍保留的边界

资金及资金处分、退款终态、签名、私钥/助记词/根密钥、钱包（含五签）仍只由 GPT 决策席/人工裁决；
凭据值不打印、不提交、不进邮件、不进日志。本页不声称权重训练、平台验收或所有客户端已加载经验。
