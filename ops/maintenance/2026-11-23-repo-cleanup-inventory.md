# 仓库清理盘点 2026-11-23

- Task ID: `LTZZZ-MAIL-INTAKE-RECONCILIATION-20261123-01`
- 模式: `inventory_only_no_deletion`（本任务**未删除任何分支或文件**）
- 盘点基线 main: `115f99d4b69ff66831561aef62e7ba0a4d07e1a6`
- 复核基线 main: `d2f6bb966210c2417f593d6b851df9203d94a65c`（2026-11-24T02:18:21Z）
- 机器可读清单: `ops/maintenance/2026-11-23-repo-cleanup-inventory.json`

## 统计

| 项目 | 数值 |
| --- | --- |
| 分支总数 | 1077 |
| 头提交已包含在 main（ahead_by=0） | 18 |
| 有独有提交（diverged） | 348 |
| compare 不可用 | 710 |
| 扫描的 open issue | 56 |
| 扫描的 open PR | 0 |
| 扫描的仓库文本文件 | 10516 |
| 删除候选（仅列清单） | 15 |
| 因引用保留 | 3 |

## 删除候选（15 个，本任务不删除）

| 分支 | head SHA | behind main | 引用检查 | 删除理由 | 回滚 |
| --- | --- | --- | --- | --- | --- |
| `ci/miniprogram-version-20261117` | `358e5e3a9c257ed974920c141c38aa15b58d26ca` | 1410 | open PR 无；open Issue 引用无；仓库文本引用无；复核对 main ahead_by=0 | 头提交已包含在 main | `POST /repos/ltzyz2181-collab/ltzzz/git/refs` ref=`refs/heads/ci/miniprogram-version-20261117` sha=`358e5e3a9c257ed974920c141c38aa15b58d26ca` |
| `codex/automation-16-4-3-20261116` | `4e48cfd184eb631f8e1ee325cf766000122c95a0` | 1417 | open PR 无；open Issue 引用无；仓库文本引用无；复核对 main ahead_by=0 | 头提交已包含在 main | `POST /repos/ltzyz2181-collab/ltzzz/git/refs` ref=`refs/heads/codex/automation-16-4-3-20261116` sha=`4e48cfd184eb631f8e1ee325cf766000122c95a0` |
| `codex/591-doubao-bounded-output` | `9cbf70a6ce4f9d80574c325396ed867409730fb2` | 287 | open PR 无；open Issue 引用无；仓库文本引用无；复核对 main ahead_by=0 | 头提交已包含在 main | `POST /repos/ltzyz2181-collab/ltzzz/git/refs` ref=`refs/heads/codex/591-doubao-bounded-output` sha=`9cbf70a6ce4f9d80574c325396ed867409730fb2` |
| `codex/592-signer-hold` | `3ff9ac6e48fb665c20b9dbdf50d32fbb60835da1` | 288 | open PR 无；open Issue 引用无；仓库文本引用无；复核对 main ahead_by=0 | 头提交已包含在 main | `POST /repos/ltzyz2181-collab/ltzzz/git/refs` ref=`refs/heads/codex/592-signer-hold` sha=`3ff9ac6e48fb665c20b9dbdf50d32fbb60835da1` |
| `feat/gpt-items-6-8-17-18-20261117` | `2a9fdc3a67a87b43da043ae78cfd9fecc35c3f4a` | 1451 | open PR 无；open Issue 引用无；仓库文本引用无；复核对 main ahead_by=0 | 头提交已包含在 main | `POST /repos/ltzyz2181-collab/ltzzz/git/refs` ref=`refs/heads/feat/gpt-items-6-8-17-18-20261117` sha=`2a9fdc3a67a87b43da043ae78cfd9fecc35c3f4a` |
| `feat/gpt-ruling-mail-check-20261117` | `b9401a825e29014279cea4f273cdf0e03b789f70` | 1446 | open PR 无；open Issue 引用无；仓库文本引用无；复核对 main ahead_by=0 | 头提交已包含在 main | `POST /repos/ltzyz2181-collab/ltzzz/git/refs` ref=`refs/heads/feat/gpt-ruling-mail-check-20261117` sha=`b9401a825e29014279cea4f273cdf0e03b789f70` |
| `feat/ops-timer-20261121` | `bed4f46519e3bbd47beb94d1def716d6d6871e31` | 535 | open PR 无；open Issue 引用无；仓库文本引用无；复核对 main ahead_by=0 | 头提交已包含在 main | `POST /repos/ltzyz2181-collab/ltzzz/git/refs` ref=`refs/heads/feat/ops-timer-20261121` sha=`bed4f46519e3bbd47beb94d1def716d6d6871e31` |
| `feat/queue-batch-20261117` | `eb1fe0008116d64e8c97ef1b693bf0cdf340ed0d` | 1232 | open PR 无；open Issue 引用无；仓库文本引用无；复核对 main ahead_by=0 | 头提交已包含在 main | `POST /repos/ltzyz2181-collab/ltzzz/git/refs` ref=`refs/heads/feat/queue-batch-20261117` sha=`eb1fe0008116d64e8c97ef1b693bf0cdf340ed0d` |
| `fix/autonomy-goal-append-only-correction-20261114` | `d91a52e8c8c9af52b2e1b81bd6b441cc13035a8a` | 1696 | open PR 无；open Issue 引用无；仓库文本引用无；复核对 main ahead_by=0 | 头提交已包含在 main | `POST /repos/ltzyz2181-collab/ltzzz/git/refs` ref=`refs/heads/fix/autonomy-goal-append-only-correction-20261114` sha=`d91a52e8c8c9af52b2e1b81bd6b441cc13035a8a` |
| `fix/deep-daily-existing-card-20261118` | `0f51fb486b18ea6955e5258544117a64d35facbf` | 1115 | open PR 无；open Issue 引用无；仓库文本引用无；复核对 main ahead_by=0 | 头提交已包含在 main | `POST /repos/ltzyz2181-collab/ltzzz/git/refs` ref=`refs/heads/fix/deep-daily-existing-card-20261118` sha=`0f51fb486b18ea6955e5258544117a64d35facbf` |
| `fix/deep-daily-pat-extraheader-20261119` | `0f322e8bc0529e95ac34544601026026ee23781f` | 1108 | open PR 无；open Issue 引用无；仓库文本引用无；复核对 main ahead_by=0 | 头提交已包含在 main | `POST /repos/ltzyz2181-collab/ltzzz/git/refs` ref=`refs/heads/fix/deep-daily-pat-extraheader-20261119` sha=`0f322e8bc0529e95ac34544601026026ee23781f` |
| `fix/deep-daily-planner-contract-20261119` | `bc99baddc4b753f57888aff82c979702678ec43c` | 1056 | open PR 无；open Issue 引用无；仓库文本引用无；复核对 main ahead_by=0 | 头提交已包含在 main | `POST /repos/ltzyz2181-collab/ltzzz/git/refs` ref=`refs/heads/fix/deep-daily-planner-contract-20261119` sha=`bc99baddc4b753f57888aff82c979702678ec43c` |
| `fix/deep-fiduciary-scope-20261121` | `77b090fde7b13e11f4dabdd8f8233d335c1fece4` | 688 | open PR 无；open Issue 引用无；仓库文本引用无；复核对 main ahead_by=0 | 头提交已包含在 main | `POST /repos/ltzyz2181-collab/ltzzz/git/refs` ref=`refs/heads/fix/deep-fiduciary-scope-20261121` sha=`77b090fde7b13e11f4dabdd8f8233d335c1fece4` |
| `fix/relay-budget-postcall-522` | `70e8462ce76c3db6e78b74e909390133ceb14546` | 709 | open PR 无；open Issue 引用无；仓库文本引用无；复核对 main ahead_by=0 | 头提交已包含在 main | `POST /repos/ltzyz2181-collab/ltzzz/git/refs` ref=`refs/heads/fix/relay-budget-postcall-522` sha=`70e8462ce76c3db6e78b74e909390133ceb14546` |
| `fix/task-hub-deep-queue-20261121` | `75e4927bbf204e83385c27b70ca2216779f69055` | 702 | open PR 无；open Issue 引用无；仓库文本引用无；复核对 main ahead_by=0 | 头提交已包含在 main | `POST /repos/ltzyz2181-collab/ltzzz/git/refs` ref=`refs/heads/fix/task-hub-deep-queue-20261121` sha=`75e4927bbf204e83385c27b70ca2216779f69055` |

## 因引用保留（3 个）

- `codex/email-authority-20261117`：repo_file_refs:docs/2026-11-17-明日巡检部署清单.md,docs/2026-11-17-部署汇总与待裁决-邮件稿.md,docs/2026-11-17-项目执行状态更新.md；仓库引用：docs/2026-11-17-明日巡检部署清单.md, docs/2026-11-17-部署汇总与待裁决-邮件稿.md, docs/2026-11-17-项目执行状态更新.md, knowledge/results/deploy/docket-20261117.json
- `deploy/deep-dispatch-daily-20261118`：protected_prefix；仓库引用：无
- `feat/order-closure`：repo_file_refs:docs/2026-11-13-客服与交付闭环三项落地.md,docs/2026-11-16-对话部署话术模板.md,docs/2026-11-16-已闭环事项登记与勿重复清单.md；仓库引用：docs/2026-11-13-客服与交付闭环三项落地.md, docs/2026-11-16-对话部署话术模板.md, docs/2026-11-16-已闭环事项登记与勿重复清单.md, docs/2026-11-16-待办与裁决清单.md

## 工作树副作用

- 主分支 tracked 垃圾：扫描 10718 个 blob，未发现无引用垃圾，保留不删。
- 重复文件组：579 组 / 1219 文件 / 43138991 字节，均为历史回执、生成快照或镜像，按 AGENTS.md 保留。

## 前后统计

- 分支：盘点前 1077，删除 0，盘点后 1077。
- 文件：删除 0，释放 0 字节。

## 未解决

- 710 个分支 compare 不可用（可能为权限/速率/分支已被上游清理），未进入候选，一律保留。
- 348 个 diverged 分支有独有提交，一律保留，需逐个人工裁决。
- 1077 个分支中仅 18 个 ahead_by=0 被检查，其余未逐分支做引用扫描。
