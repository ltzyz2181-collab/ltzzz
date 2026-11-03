# Dispatch Sentinel 间歇失败诊断 · 2026-11-03（P1 · 只诊断不修复）

> 派单卡 QW-DEPLOY-20261103 P1：取最近 5 次失败 run 日志，摘录共同报错行，写入本文件。
> 方法：GitHub Actions API 拉 workflow runs（匿名）→ 凭据认证下载 5 个失败 run 日志 zip → 逐 run 提取失败步骤与报错行 → 本地复现测试核对。
> 结论均为观察，根因假设统一标注「待验证」；未修改任何代码/workflow。

## 一、失败 run 清单（最近 5 次，dispatch-sentinel，failure 共 32 个）

| # | run id | 时间 (UTC) | 事件 | head_sha | 失败步骤 | 报错行（日志 verbatim） |
|---|---|---|---|---|---|---|
| 1 | 41353331054 | 11-01 21:41 | schedule | cb372415 | 测试 | `not ok 64 - native supervision requires actual daily artifact and different-provider review; design cards cannot substitute` / `failureType: 'testCodeFailure'` / `AssertionError: false !== true` / `location: scripts/tests/seat-delivery.test.mjs:31:1` |
| 2 | 41332485647 | 11-01 17:38 | schedule | 30e8d0f0 | 测试 | 同上（同一子测试 64，`# fail 1`） |
| 3 | 39876142191 | 10-23 00:07 | push | 29460493 | 落盘 | `node tools/push-receipt-commit.mjs` → `receipt_rebase_conflict_preserved_without_overwrite` → `##[error]Process completed with exit code 1.` |
| 4 | 39559344079 | 10-21 07:03 | schedule | 69b05f3f | 报警 | `##[error]派单哨兵发现需处理项：[alert-items] AI雇AI回执(T1)=BLOCKED` → `##[error]Process completed with exit code 1.` |
| 5 | 39526354898 | 10-21 01:16 | schedule | 4d181cf4 | 报警 | 同上（T1=BLOCKED → `::error` → exit 1） |

（另确认：total_failed=32；第 6 个失败 run 39516353792 为 10-20 23:38 push 事件，未纳入最近 5。）

## 二、共同模式（三类，非单一根因）

### A. 「报警即失败」旧逻辑（10-21 两次，run #4 #5）
- 当时 workflow 报警步骤为：`if echo "$OUT" | grep -qE 'alert-items\] .*(MISSING|BLOCKED|UNCONFIGURED|UNKNOWN)'; then echo "::error::派单哨兵发现需处理项：…"; exit 1`。
- 即：**只要业务存在阻塞/缺失项（如 AI雇AI回执 T1=BLOCKED），run 就被判失败**——业务红灯被当成 CI 红灯。
- 当前 main 的 `dispatch-sentinel.yml` 已改为 `::warning::扫描及落盘已完成，业务待处理项：…` + `exit 0`（11-01 前已修复）。**假设（待验证）**：该改动合入后此类失败不再复现；10-18 之后失败率下降与该修复一致。

### B. 落盘并发 push 冲突 fail-closed（10-23 一次，run #3）
- 落盘步骤 `git commit` 后执行 `node tools/push-receipt-commit.mjs`，输出 `receipt_rebase_conflict_preserved_without_overwrite` 后 `exit 1`。
- 该返回值来自 push-receipt 的有界并发重试 helper：检测到与外部提交的 rebase 冲突时**保留双方内容、不覆盖**并 fail-closed 报错（代码含测试「concurrent receipt writer is rebased and retried without overwriting another agent commit」，该 run 的测试全过）。
- 即：**哨兵扫描本身成功，失败发生在与另一 agent 并发 push 到 main 的写冲突**。**假设（待验证）**：冲突窗口内重试次数耗尽即标红；下一次小时 run 正常落盘（间歇性来源之一）。

### C. 测试回归（11-01 两次，run #1 #2，同一子测试）
- `scripts/tests/seat-delivery.test.mjs:31` 子测试 64「native supervision requires actual daily artifact and different-provider review; design cards cannot substitute」断言 `strictEqual(…, true)` 得 false。
- 失败时 head（30e8d0f0 / cb372415）**均不包含** 11-01 的修复提交：`1642461c fix: restore sentinel test fixture for required supervision heading` 与 `89169bb6 fix(qwen): preserve supervision input across adapters and expose legacy sync validation failures`（merge-base --is-ancestor 均 False，即失败 run 跑在修复前的 main 上）。
- **当前 main 本地复现：`node --test scripts/tests/seat-delivery.test.mjs` → 15/15 pass、fail 0**——该类型失败已由上述修复合入解决。**假设（待验证）**：修复提交本身正确（本地已过）；11-01 两次失败是「监督输入跨 adapter 传递 + fixture 标题检测」回归在修复前的短暂窗口。

## 三、为什么是「间歇失败但有成功记录」

- schedule 每小时触发，大部分小时无上述三类条件（无阻塞项、无并发写撞车、无回归代码）→ 成功。
- 失败仅出现在：旧版报警逻辑遇 BLOCKED（10-21 已修复）、与外部 agent 并发 push 冲突（10-23 单次）、修复前代码窗口的测试回归（11-01 单日两次，当日已修复）。
- 32 次失败分布在 10-18 → 11-01，频率与各修复合入时间吻合，近期（11-01 修复后）未再观察到同类失败。

## 四、根因假设汇总（全部待验证）

1. 报警步骤旧逻辑把业务红灯当 CI 红灯 → **已修复**（现行 exit 0）；验证方式：后续 run 若有 BLOCKED 项仍 success。
2. 落盘 push-receipt 对并发冲突 fail-closed → **属防护行为**，非扫描故障；验证方式：观察推送失败 run 中是否存在「外部同刻提交」证据（rebase 冲突源）。
3. 11-01 测试回归 → **已修复**（1642461c/89169bb6 已合入，本地 15/15）；验证方式：持续观察未来 schedule run 无 `not ok 64`。

## 五、只诊断不修复声明

- 未修改 workflow、测试或脚本；日志仅下载至 `%TEMP%\sentinel-logs\` 供取证。
- 后续如需根治项建议（超出本派单范围）：报警步骤当前已修复；落盘并发重试是否需提高上限或改串行窗口、测试 fixture 是否需要常驻回归护栏——留待 owner 决定，本报告不提出改动。
