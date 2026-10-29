# PatchGate A2 分支保护接力 — 真实回执（人读版）

**结论：未修改分支保护，A2 保持关闭。** 本次为「准确依赖回执」，不是「已部署/已启用」。

| 项 | 值 |
| --- | --- |
| 原任务 ID | `PLAN-PATCHGATE-ESCROW-20261023` |
| 接力卡 | `ops/dispatch/relay/PATCHGATE-A2-PROTECTION-CLIENT.md` |
| 卡来源 commit | `52ad8a9e7b2e21bb998a4ac0f8363327626d2f77`（PR #240 head） |
| 卡 blob SHA1 | `df7f272d6231099732769384f1601c37a2175330` |
| 卡内容 SHA256（LF 归一化） | `56ec1fe2d93169d855fea967f9dcc6fe83151c924d99841023cf8f9030208a14` |
| 实际 client | VS Code Copilot（Copilot SDK 桌面客户端） |
| 实际 provider / model | `unknown_not_native_gpt_or_claude` / `unspecified_client_metadata` |
| 原生模型调用次数 | 0 |
| 观测时 `origin/main` | `73728f25d8c9c446e030b3512ff7f62d73b36de2` |
| 本机 HEAD（未改动） | `ce985e86` |
| 回执时间 | `2026-10-26T01:25:30Z` |

## 七步逐条状态

| 步骤 | 状态 | 事实 |
| --- | --- | --- |
| 1 环境与身份 | `partial` | `gh` 未登录（退出码 4），无 `hosts.yml` / 无 `GH_TOKEN`；匿名 REST 只读可用。`GET /branches/main/protection` → **HTTP 401**（云端已认证低权为 403），故**无原保护 JSON 快照**（记为 `null`，不伪造）。未读取任何认证文件、Token、cookie 或 Key。 |
| 2 workflow 事实 | `blocked` | PR #240 head **有** `patchgate-a2-base-checks.yml` / `collector` / `verify`；`origin/main@73728f25` **三个全部缺失**。main 无 checker ⇒ 按卡片「main 无 checker 时不配硬性 required check」，未配置 `patchgate-a2-base-checks`。 |
| 3 A2 开关 | `verified_still_disabled` | `status.json`：`A2.enabled=false`、`A2.signing_enabled=false`；`patchgate-trust.json`：`enabled=false`；`patchgate-executors.json` 签名 key 为空。A2 自动合并关闭，A3/B/资金未触碰。真实 target checker **未运行**（不存在可跑对象），`workflow_id/run_id/job_id/app_id/check_name/event/base/head/pr_marker` 一律 `null`，**未手填任何"看起来正确"的 ID**。 |
| 4 writer 迁移 | `not_ready` | `origin/main` 上 **48 个 workflow 直推 main**、**89 个带 `contents: write`**（workflows 总数 117）。未做迁移测试；按卡片「不能用绕过保护解决」，登记为依赖阻塞。 |
| 5 合并式保护更新 | `not_attempted` | 无原保护 JSON、无 Administration 能力 ⇒ 无法做"保留更严格设置 + 仅追加"的合并式 PUT。未降级、未使用 `admin=true` 冒充能力。 |
| 6 官方 API 回读 | `not_obtained` | 无写权限，故无 PUT、无 readback。CLI 403/401 后未反复重试、未搜索凭证。 |
| 7 B2 陈旧 base 探针 | `not_run` | 保护未应用 ⇒ B2 前提不存在；未借手工合并 #246 之类方式"测试"。 |

## 三条硬阻塞

1. **上游审计前提未满足**：Claude 对精确 head `52ad8a9e` 的复审为 **0 条**；`#247` 的 **REVISE** 针对 `674c73c1` 且**未合并**；Qwen 原生 run `40252735553` 判定 **reject** 且被保留（未裁定采纳）；第二真实提供商 stage review 未收到。`closeout.json` 自述 `bundle_verification = unverified_missing_metadata_or_bundle_mismatch`、`native_authorship_verified = false`、`tested_runtime_head = 4d95f22b3e740c9ad085f736be6e7cbdaf35b0b7`（≠ PR head）。
2. **无真实写/管理通道**：`gh` 未登录，protection GET 401；本机不存在可用的 Administration 权限执行器。共享 GitHub 登录也不等于原生作者模型身份。
3. **回执流水线未迁移**：48 个直推 main 的 writer 未迁移，启用保护会直接中断既有回执流水线；卡片禁止用 bypass 绕过。

## 未验证项（10 项，逐条记录在 `receipt.json`）

`gh api user` 身份、protection GET/PUT 与 readback、真实 target checker 调用、workflow/run/job/check/App/EVENT/BASE/HEAD/PR marker、writer 迁移、B2 探针、Claude 对 head `52ad8a9e` 复审、回执 PR 创建与提交。

## 复验命令

```powershell
git show origin/main:knowledge/results/patchgate/status.json
git show pr240head:knowledge/results/patchgate/pr247-evidence/closeout.json
git ls-tree -r --name-only origin/main -- .github/workflows | Select-String 'patchgate-a2'
git grep -l -E 'git push.*(HEAD:main|origin main|\-\-force)' origin/main -- '.github/workflows' | Measure-Object -Line
```

匿名只读核对：`https://api.github.com/repos/ltzyz2181-collab/ltzzz/pulls/240`、`/pulls/247`、`/issues/240/comments`、`/branches/main/protection`（预期 401）。

## 费用与状态

`paid=false`、`tx_hash=null`、`settlement_kind="none"`、`financial_execution=false`、`real_funds_enabled=false`、`status="not_executed_by_design"`、`execution_result="not_modified_blocked"`。

## 持久化

本回执目前仅存于本机**未跟踪**目录 `knowledge/results/patchgate/protection-client/`（`readback_verified=true`）。**未建 PR、未推送、未代 owner 发布批准评论**，`#247` 的 REVISE 原样保留。本机既有未提交/未跟踪改动全部保持原样，未执行 `reset` / `clean` / 强推。若需入库，须由具备推送能力的席位在其独立 worktree 中开分支提 PR。
