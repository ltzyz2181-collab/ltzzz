# 回执：两单已合并 main（owner 覆盖「不合并」约束）

**执行席**：豆包（qingqizhu6502@agent.qq.com）
**时间**：2026-11-10T06:53:21Z / 06:53:29Z
**触发**：owner 直接指令「合并吧 以后自动情况允许可以自动合并」

---

## 一、与派单的偏差（需你知悉）

你的派单原件写的是「不合并 main、不触发生产部署」。**owner 在 06:53Z 前直接指令合并，并以「以后自动情况允许自动合并」覆盖该约束**。本席按 owner 指令执行，此差异在此显式留痕，不作静默处理。

如果这条覆盖不符合你的治理意图，请回复，我可以 revert（两个 merge commit 都可逆）。

---

## 二、做了什么

| PR | 内容 | 合并时间 | 结果 |
|---|---|---|---|
| #388 | B 单 manifest 契约拆分 | 06:53:21Z | MERGED |
| #389 | A 单 Pages artifact 唯一化 | 06:53:29Z | MERGED |

合并后 main head：`8a1ec339`

## 三、A 单首次端到端验证（合并带来的真实 CI）

合并 #389 触发 `pages.yml`（push main），run `42771533407` **全绿**，job `deploy` 全步骤 success：

```
7  Guard pages artifact uniqueness before upload  -> success
   {"mode":"pre-upload","ok":true,"action":"upload",
    "reason":"no_pages_artifact","count":0}

8  Upload artifact                                -> success
9  Assert exactly one pages artifact before deploy -> success
   {"mode":"pre-deploy","ok":true,"action":"deploy",
    "reason":"exactly_one_pages_artifact","count":1,
    "artifact_ids":[13742276331]}

10 Deploy to GitHub Pages                         -> success
```

这是 A 单此前缺失的那一环：**守卫在真实 CI 上跑通，且线上部署成功**。此前只做了本地 10/10 + 离线数据回放 + YAML 结构断言。

## 四、B 单线上生效情况

B 单校验器已在 main。`offline` 类 job 在本轮 push 触发的 run 上走同一校验器，输出与 PR 分支一致（`source_files:42` / `release_sha256:0a424b30…` / `verifier_self_excluded:[…]` / `snapshot_drift_count:0`）。

## 五、未做事项

- 未触碰钱包、签名、放款、退款、结算、投资
- 未改写 `post271/artifact-manifest.json`
- 未删除任何 artifact
- 未改动 P1-01 `automatic_deploy`（仍关闭）
- 未开新的部署门

## 六、待你裁决的两点（仍然有效）

1. `files` 快照不阻断 CI 这一口径是否认可
2. 校验器自指排除是否认可（若你认为校验器也须锁死，需要版本化基线机制）

——豆包执行席
