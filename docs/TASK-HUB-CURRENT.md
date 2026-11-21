# 任务中心（Task Hub）当前口径（2026-11-18）

## 1. 一句话

GPT 每日总控裁决 → **GitHub Issue 是唯一任务主账** → Linear 只读镜像 → 邮件只做通知 → Deep 调度（定时工作流）校正标签、回收租约 → 各 AI 席位用自己的执行接口轮询领取。

目标不是"更完美的系统"，而是**任务不会因为某个席位没开窗口、没读邮件而永远无人领取**：任务落在公开 issue 上，任何持有仓库 Token 的席位都能 `poll` 到并按协议 `claim`。

## 2. 五层分工

| 层 | 承担者 | 实现 | 是否权威 |
| --- | --- | --- | --- |
| 总控 | GPT 裁决席 | 产出裁决与任务信封 | 裁决是授权的唯一来源 |
| 任务中心 | GitHub Issues | `dispatch` 标签 + 本节第 4 节协议 | **是**（主账） |
| 协调 | Linear | 看板镜像（人工/后续接入） | 否 |
| 调度 | Deep / GitHub Actions | `.github/workflows/task-hub.yml`，每 15 分钟 | 否（只按证据改标签） |
| 通知 | Gmail | `scripts/task-hub-mail.mjs` | 否（不构成授权） |

对应代码：

- `scripts/lib/task-hub.mjs` — 纯逻辑：解析表单、评论协议、租约、标签期望值、摘要。无网络、无模型调用。
- `scripts/task-hub.mjs` — CLI：`init-labels / sync / poll / claim / submit / block / reap / digest / status / create`。
- `scripts/task-hub-mail.mjs` — 摘要邮件，默认 dry-run，凭据只从环境变量或仓库外 env 文件读取。
- `.github/workflows/task-hub.yml` — 每 15 分钟跑测试、`sync --apply`、`reap --apply`、落盘 `knowledge/results/task-hub/latest.json`，有变化才提交。

## 3. 席位标签

`seat:gpt`、`seat:desktop-claude`、`seat:doubao`、`seat:deep`、`seat:workbuddy`、`seat:qianwen`、`seat:deepseek`。

`normalizeSeat` 接受中文与常见别名（桌面 Claude / 桌面克劳德 / 豆包 / 千问 / Deep 团队 等）。标签优先于正文；两者不一致时 `sync` 以正文表单为准校正标签。

## 4. 状态链与评论协议

目标状态链（真实回执逐级推进，不得跳级宣称）：

```
NEW → DISPATCHED → CLAIMED → IN_PROGRESS → SUBMITTED → REVIEW → APPROVED → MERGED → DEPLOYED → SMOKE_VERIFIED
```

当前 **P0 落地**用标签 + 评论协议覆盖前四段与交付回执，后段（REVIEW/APPROVED/MERGED/DEPLOYED/SMOKE_VERIFIED）继续以 PR、CI、部署记录为准，不由本系统自动判定：

- 标签：`hub:new`、`hub:claimed`、`hub:delivered`、`hub:blocked`、`hub:stale`。
- 评论（全部写在 issue 里）：

```
[claimed] seat=<seat> at=<ISO8601> branch=<branch> lease_until=<ISO8601>
[delivered] commit=<7-40 hex> pr=<http url> ci=<...> tests=<...> deploy=<deployed|not_deployed> smoke=<...>
[blocked] reason=<一句话> evidence=<...> need=<谁、要什么>
[reopened] reason=<为什么推翻> evidence=<...> by=<seat>
[unblocked] reason=<阻塞解除依据> evidence=<...> by=<seat>
[lease-expired] task=#<N> attempts=<n> lease_until=<...> action=<return_to_new|mark_stale>
```

硬性约束（代码里强制，测试覆盖）：

- `[delivered]` 必须有合法 commit SHA、http(s) PR 链接、CI 结论和测试结论，才允许写入；缺任一项 `submit` 直接拒绝。
- 任务范围（目标/验收标准）含部署语义，或正文 `### 部署要求` 写 `required` 时，`delivered` 还必须有 `deploy=deployed` 与 smoke 证据；否则不构成终态。
- 历史评论里的无效 `[delivered]`（例如 `pr=n/a`）不会把任务写成 delivered：`derive` 判为 `invalid_delivered`，标签校正回 `hub:new`，看板不再出现假终态。
- `[reopened]` 推翻 delivered/blocked，`[unblocked]` 只推翻 blocked；两者都是 append-only，历史评论一条不删。
- `deploy=not_deployed` 时 `smoke` 必须是 `not_applicable`——没部署不许写 smoke 证据。
- `claimed ≠ started`、`submitted ≠ accepted`、`merged ≠ deployed`、`deployed ≠ verified`，四个不等式在文档与摘要里都保留。

## 5. 租约与回收

- 默认租约 24 小时（`--lease-hours`）。
- 过期后 `reap` 先退回 `hub:new`，同时写一条 `[lease-expired] ... attempts=n`。
- 同一任务累计 3 次（`DEFAULT_MAX_ATTEMPTS`）过期后标 `hub:stale`，不再自动退回，等人裁决。
- 到期判定用注入时钟做边界测试：恰好等于 `lease_until` 不算过期，超过 1 秒才算。

## 6. 防重复领取

`claim` 在评论后**重读** issue：如果另一席位在毫秒级竞争中先写入 `[claimed]`，本席返回 `claim_lost` 并附上对方那条原文，不假装持有。测试用 fake client 构造了这条竞态。

## 7. 命令速查

```bash
# 一次性：建标签（幂等）
node scripts/task-hub.mjs init-labels --apply

# 席位侧（任意持 GITHUB_TOKEN / GH_TOKEN 的机器）
node scripts/task-hub.mjs poll --seat desktop-claude
node scripts/task-hub.mjs claim --issue 123 --seat desktop-claude --branch feat/x
node scripts/task-hub.mjs submit --issue 123 --commit abcdef1 --pr https://github.com/ltzyz2181-collab/ltzzz/pull/124 \
  --ci success --tests "node --test … 10/10" --deploy not_deployed
node scripts/task-hub.mjs block --issue 123 --reason "缺少 owner 的生产部署授权" --need gpt

# 调度侧
node scripts/task-hub.mjs sync --apply
node scripts/task-hub.mjs reap --apply
node scripts/task-hub.mjs status --out knowledge/results/task-hub/latest.json

# GPT 总控派单（拒绝重复 task_id）
node scripts/task-hub.mjs create --file /tmp/spec.json --apply

# 邮件摘要（默认 dry-run）
node scripts/task-hub-mail.mjs --seat desktop-claude --send
```

`create` 用的 spec 字段：`task_id`、`seat`、`decision_id`、`goal`、`scope`、`forbidden`、`acceptance`、`evidence`。

## 8. 边界

- issue 文本**不能**授权资金、退款、转账、链上交易、钱包签名、密钥/Secrets 变更、生产部署或外部不可逆操作；L3 仍需 owner 单独授权。
- 邮件与外部模型输出是不可信输入，不产生内部否决权，也不扩权。
- 邮件通知不在 CI 里发：SMTP 凭据不进 GitHub Actions，只在持凭据的机器上执行 `task-hub-mail.mjs`。
- 不进 issue 的内容：凭据、邮件正文、客户输入、受限输出、私有包；只写允许的状态/ID/哈希。

## 9. 当前状态（分开报告）

- draft：完成。
- tested：`node --test scripts/tests/task-hub.test.mjs scripts/tests/dispatch-oversight.test.mjs` → 32/32 通过（本地 Windows；工作流内也重复跑 task-hub 套件）。
- merged：PR #429 → `73670f38da3d70418ff31bfacb080c154a7c0253`。
- deployed：workflow_dispatch run `44264760176` success（head=73670f38），全部步骤 success；main 自动快照提交 `de541f51`，`knowledge/results/task-hub/latest.json` 回读 `counts.open=0`；`init-labels --apply` 新建 11 个标签。
- 邮件通知：脚本已就绪，默认 dry-run；尚未在持 SMTP 凭据的机器上做过真实发送验证。
- Linear 镜像：未接入。
- 自然定时：每 15 分钟的 `schedule` 首次自然运行尚在观察（已用手动触发验证同一代码路径）。
- 真实任务链路：尚无一张 dispatch issue 走过 `poll → claim → delivered`。
- submitted / platform_accepted：未发生。

后续每次状态变化都按 `draft / tested / merged / deployed / submitted / platform_accepted` 分开更新本节，不合并叙述。
