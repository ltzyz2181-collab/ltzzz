# Phase 1 修订报告 · Claude 主开发席（2026-11-17）

- Task ID：`GPT-HIRE-PHASE1-REVIEW-20261117-03`
- 席位：桌面 Claude 主开发席
- PR：#408（`fix/hire-phase1-repair-20261117-02`），保留原 PR，未另开重复 PR
- GPT 前置裁决：`NEEDS_REVISION`
- 本报告只代表 Claude 席；豆包安全审查、千问 CI 复核、GPT 最终验收另存，不合并成单一结论。

## 一、分支同步

- 合并前 PR head：`e575b20b3e45b33b3a73d34b8526dc25a7e21189`
- 合并时 `origin/main`：`75743c4d6a323805c1007860c3a50ae86710e197`
- 操作：`git merge origin/main` → **0 冲突**，仅 `docs/HIRE-AI-PHASE1-SPEC-20261116.md` 增量叠加 7 行（main 的 `acceptance=pending_gpt_review` 标记保留）
- 说明：任务书写的 `78cc369e…` 是更早的主线快照；本次实际以合并时最新 main 为准。main 仍在被其他席位推进，合入 SHA 以提交记录为准。

## 二、`appendReceipt()` 接口边界核查（任务 2–4）

结论：**构成接口边界缺口，已修复**。

- `appendReceipt()` 是 `export` 的，任何模块可直接 `import` 调用。
- 修复前实现为 `const target = resolve(ledgerPath)`，没有调用 `resolveLedgerPath()`；也就是说路径约束只存在于 CLI（`main()`），模块调用可写入任意路径。
- 修复：把 `resolveLedgerPath()` 移入 `appendReceipt()` 写边界；`main()` 改为把原始路径交给 `appendReceipt()`，实际落盘路径从返回值 `result.ledger` 读取。
- 约束内容：必须是仓库相对、规范化、落在 `knowledge/results/hire/` 且直接位于该目录下的 `*.jsonl`；绝对路径、`..`、反斜杠、非规范写法、符号链接组件、目录同名文件一律拒绝。
- 保留 `options.root` 作为测试注入点；它只改变“仓库根”指向，不放宽目录规则（有专门测试）。

## 三、锁释放与 stale reclaim 并发边界（任务 5）

已有基线（PR 上轮已实现，本次复核确认）：

- 锁内容含进程 pid + 随机 token；释放前比对 token，**只删自己持有的锁**。
- stale 回收要求“mtime 超时 **且** 持有进程不存活”，并用 `.reclaim` sidecar 串行化回收者。
- 回收前比对 `dev`/`ino` 与 owner token，**观察到锁被替换后绝不删除新锁**。

本次发现的缺口与修复：

- 缺口：`acquireLedgerLock()` 在 `reclaimStaleLock()` 返回 false（另一回收者持有 sidecar）时直接 `continue`，不进入退避分支，形成忙等自旋，且超时判定被绕过。
- 修复：只有回收成功才 `continue`；否则落到统一的 `timeout` 检查 + `sleepSync(10)` 退避。

## 四、零资金不变量（任务 6）

未改变。`verifyReceipt()` / `appendReceipt()` / `readLedger()` 三条路径仍强制：

- `paid === false`
- `financial_execution === false`
- `amount_usd === 0`

新增测试没有放宽任何一条；CLI 每条判词仍携带三字段。

## 五、测试（任务 8）

命令与原始输出摘要：

```
node --test scripts/tests/hire-phase1.test.mjs
# tests 46
# pass 46
# fail 0
# skipped 0
# todo 0
```

- 修改前：41 项；本次新增 5 项：
  1. `appendReceipt refuses an out-of-bound ledger path when called directly`（9 种越界写法逐项拒绝且不落盘）
  2. `appendReceipt confines an explicit root to the same hire directory`
  3. `a lock owned by a live process is never reclaimed by age alone`
  4. `a contended stale-lock reclaim never deletes the lock or the live sidecar`
  5. `concurrent reclaimers of one stale lock still append every distinct order exactly once`
- 专用 CI（`.github/workflows/hire-phase1.yml`）的“mandated tests”清单同步加入上述用例名；删除或改名会直接让 CI 失败。

## 六、状态分层（分开写）

| 状态 | 结果 |
|---|---|
| draft | 已完成 |
| tested（本地） | 已完成，46/46 |
| pushed | 本次提交后成立 |
| merged | **未发生**（PR 保持 OPEN） |
| deployed | **未发生**，本任务不授权部署 |
| platform_accepted | **未发生** |

## 七、未做与边界

- 未进入 Phase 2，未接真实支付，未改资金策略。
- 未修改生产 Worker，未做任何生产部署。
- 未合并 PR，未启用定时任务。
- 本报告不声称“Phase 1 已通过”；最终验收权在 GPT，需另收豆包安全审查与千问 CI 复核。

## 八、2026-11-17 二次修订：Windows 写入回滚

本地 Windows 复跑发现两个跨平台缺陷，已修：

1. **失败回滚在 Windows 实际不生效**：账本原来以 `a`（O_APPEND）打开，Windows 对该描述符执行 `ftruncate` 返回 `EPERM`。写入中途失败时虽然抛出了错误，但文件里保留了半条 JSONL。
   - 修复：改为 `r+`（不存在时 `wx+`）打开，并按 `sizeBefore` 显式定位写入；失败时 `ftruncate(sizeBefore)` 在 Windows/Linux 都能截断回原长度。
   - 影响：并发仍由既有锁串行化；零资金不变量未变。
2. **路径断言把 Windows 反斜杠误判为失败**：`resolveLedgerPath()` 返回平台原生绝对路径，测试与 `phase1-smoke` 却用 `/` 结尾匹配，导致 Windows 上 `selfcheck` 与路径测试假失败。
   - 修复：断言前统一把 `\` 归一为 `/`，约束本身不变。
3. **stale reclaim sidecar 替换窗口**：`tryBreakStaleReclaimSidecar()` 原来在读取后直接 unlink。现改为 unlink 前再次读取并比对 `dev`/`ino`/`token`/stale，缩小“替换后误删新 sidecar”的窗口。

复跑结果（Windows，本机）：

```
node --test scripts/tests/hire-phase1.test.mjs
# tests 46 / pass 46 / fail 0 / skipped 0 / todo 0
```

说明：本节是同一 PR #408 的追加修订，不另开 PR；仍未合并、未部署、未进入 Phase 2。

### 8.1 CI 证据绑定修正

首次重跑发现 artifact 的 `commit` 取的是 `GITHUB_SHA`，在 `pull_request` 事件下那是 GitHub 的合成 merge commit，不是 PR head。已修：

- E2E 步骤显式传入 `github.event.pull_request.head.sha` 与 `base.sha`；
- `e2e-summary.json` 同时记录 `commit`（head）、`base_commit`、`merge_commit`；
- 新增 CI 断言：artifact 的 `commit` 必须等于本次测试的 head，否则工作流失败。

这样“artifact 对应正确 commit”不再依赖人工解释。

