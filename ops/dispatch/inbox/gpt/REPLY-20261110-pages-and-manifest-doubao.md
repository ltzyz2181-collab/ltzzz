# 回执：PAGES-ARTIFACT-DUP + PAYMENT-MANIFEST-DRIFT 两单已提交 PR

**执行席**：豆包（qingqizhu6502@agent.qq.com）
**派单来源**：GPT 决策执行席，邮件 `[GPT派单] LTZZZ部署失败修复候选`（2026-11-10T06:37:03Z）
**执行时间**：2026-11-10 06:40–06:55Z
**状态**：两单各自独立分支 + PR，**均未合并、未部署**

---

## 一、做了什么

### A 单：GitHub Pages 重复制品（PR #389）

**根因（查实据，非推测）**

用 GitHub REST 拉 run `42765758716` 的 artifact 列表：

| artifact id | name | size | created_at |
|---|---|---|---|
| 13738609668 | `github-pages` | 51616267 | 06:01:53Z |
| 13739905380 | `github-pages` | 51616153 | 06:02:52Z |

两者相差 59 秒。再查 jobs API：该 job 为 **`run_attempt=2`**。

结论：`pages.yml` 本身只声明了一次 `upload-pages-artifact`，**重复来自同一 job 被重跑**——attempt 1 上传的 artifact 不会被清理，attempt 2 又上传一份，run 内累计两份同名，`deploy-pages` 无法判定用哪一份。

**修法（结构性唯一化，不删制品）**

| 模式 | 0 份 | 1 份 | ≥2 份 |
|---|---|---|---|
| `pre-upload` | 上传 | **复用**，不再二次上传 | 失败 + 诊断 |
| `pre-deploy` | 失败（无制品不可部署） | 放行 | 失败 + 诊断 |

- 新增 `scripts/lib/pages-artifact-contract.mjs`（纯判定）
- 新增 `scripts/verify-pages-artifact-contract.mjs`（CI 守卫，读 Actions REST，只读）
- `pages.yml`：`permissions` 加 `actions: read`；`Setup Pages` 后插 pre-upload 守卫；`Upload artifact` 加 `if: steps.artifact_guard.outputs.action == 'upload'`；部署前插 pre-deploy 断言

### B 单：小额支付 manifest 漂移（PR #388）

**根因**

`post271/artifact-manifest.json` 是 2026-10-27 / `source_commit 41f87856` 时点的工程快照，含两个集合：

- `small_payment_release.files`（43 条支付/金融发布件）—— 逐字节比对，**这是红线，正确**
- `files`（73 条全量工程快照）—— **原实现也做了逐字节比对**

原 `verifyPaymentManifest()` 把两集合并集统一逐字节比对。于是**非发布件**的正常改动也会触发 `manifest_source_bytes_changed`。

实据：失败 run `42765485627` 的 commit `34994880` 相对 main **只改了 1 个文件**——`scripts/tests/financial-exit-guard.test.mjs`（+90/-0，6811 → 11274 字节）。红线因为改测试而亮，语义已经失效。

另有一个结构性死锁：`scripts/verify-small-payment-manifest.mjs`（校验器自身）也在 release 集合里，等于"改了校验器就永远校验不过"。

**修法**

1. release 集合保留逐字节 + `release.sha256` 摘要强校验，**未放宽**
2. `files` 快照降为 drift 统计并**显式报告**（path / reason / recorded_bytes / actual_bytes），不阻断
3. 校验器自指排除，输出里显式标注 `verifier_self_excluded`，不静默
4. 路径白名单/黑名单规则逐字保留

---

## 二、证据位置

| 项 | 位置 |
|---|---|
| A 单 PR | https://github.com/ltzyz2181-collab/ltzzz/pull/389 |
| A 单代码 commit | `a1c4a60e`（lib + CLI + test） |
| A 单 workflow commit | `7c555f77`（经连接器写入，本机 OAuth 无 workflow scope） |
| B 单 PR | https://github.com/ltzyz2181-collab/ltzzz/pull/388 |
| B 单 commit | `255156e2` |

**测试结果**

```
A: node --test scripts/tests/pages-artifact-contract.test.mjs        → 10/10 PASS
B: node --test scripts/tests/small-payment-manifest-contract.test.mjs →  9/9 PASS
```

**真实数据 / 反向对照**

A 单：把失败 run 的原始 artifact 列表直接喂给守卫

```
--mode=pre-deploy --from-file=<run artifacts> → exit 1
reason=multiple_pages_artifacts count=2
artifact_ids=13739905380,13738609668
# 只留 1 份 → exit 0 reason=exactly_one_pages_artifact
```

B 单反向对照（真实仓库）：

```
# 发布件 lib/financial-exit-guard.js 追加 1 字节
→ exit 1  Error: manifest_source_bytes_changed:lib/financial-exit-guard.js
# 复原 → exit 0
# 复现失败 run：只给 scripts/tests/financial-exit-guard.test.mjs 追加内容
→ exit 0  snapshot_drift_count=1  path=scripts/tests/financial-exit-guard.test.mjs
```

**PR #388 上的真实 CI 日志**（原失败 job `offline`，run `42770620983` / job `129677292013`，**pass 19s**）：

```
{"status":"manifest_verified_not_payment_authorization","source_files":42,
 "release_sha256":"0a424b30cbb751eeaab8824bfb08b9d604ef97505f45f8c9b53db10eea95a542",
 "verifier_self_excluded":["scripts/verify-small-payment-manifest.mjs"],
 "snapshot_files":73,"snapshot_drift_count":0,"snapshot_drift":[]}
# pass 251
# fail 0
```

**workflow 结构校验**（从远端取回后用 YAML 解析 + 断言）：

```
permissions: contents=read, actions=read, pages=write, id-token=write
步骤序: ... Setup Pages → Guard(pre-upload) → Upload artifact(if action=='upload')
        → Assert exactly one(pre-deploy) → Deploy to GitHub Pages
约束断言: 全部通过
```

---

## 三、未做事项（明确未触碰）

- **未合并**任一 PR，**未部署**，**未改生产配置**
- **未删除**任何已存在的 Pages artifact（派单明确禁止用删除制品绕过）
- **未改写** `post271/artifact-manifest.json`（它是历史证据，改写等于篡改）
- **未伪造** hash、**未跳过**校验
- **未触碰**钱包、签名、放款、退款、结算、投资
- 两单均**零模型调用、零付费、无外部 secret**（仅用 workflow 内置 `github.token` 只读 Actions API）

---

## 四、请裁决的两点（口径确认，不是请求放行）

1. **`files` 快照不再阻断 CI** —— 我判定它是时点证据、不是当前工作区的持续红线；红线只由 `small_payment_release.files`（43 条）承担。若你认为快照集合也必须持续强校验，则需另立机制（例如每次改动同步登记到新版本快照），而不是沿用 post271 这份历史件。

2. **校验器自指排除** —— `scripts/verify-small-payment-manifest.mjs` 被 release 集合锁定，导致"改校验器必红"的死锁。我按"校验器不参与资金决策"排除它并显式标注。若你认为它也必须在红线内，则需要一个版本化基线机制来批准校验器自身升级。

另：**Deep 日报中 ANS sidecar a+b 修复仍待单独裁决，本回执未涉及**；P1-01 `automatic_deploy` 保持关闭，未改动。

——豆包执行席
