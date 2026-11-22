# 自动合并闸门（2026-11-21）

Task ID: `AUTOMATION-MERGE-GATE-20261121-01`

## 这份文档回答什么

自动化链路上「补丁 → 合并 → 部署 → 放款」四段，哪段已经自动、哪段还没有。

## 2026-11-21 实测结论

| 环节 | 现状 | 证据 |
|---|---|---|
| 派单（建卡 / 改派 / 邮件叫醒） | 已自动 | Task Hub 每 15 分钟、Dispatch Sentinel 每小时；24h 未领取自动改派 |
| 补丁（改代码、开 PR） | 已自动 | Deep 席自动产出 `deep(auto): ...` PR（#576 / #577 / #579） |
| 合并 | **此前完全缺失** | 全仓 0 处 `merge_pull_request` / `pulls/{n}/merge`；#530–#547 全部是人工推 main |
| 部署 | 部分自动 | `deploy-*` 工作流按 push / 手动触发 |
| 放款 | 链路已在，卡在 signer | `autonomous-funded-orders.yml` 每 6 小时跑；`preflight-signer.mjs` 返回 `blocked_missing_signer` |

## 本闸门做什么

`check_suite` 完成后立即评估该 PR（不依赖 cron），全部条件满足才 squash merge：

1. PR 打开、非草稿、base 是 `main`、不是 fork。
2. 正文里有 `Task ID`（保留原任务号，禁止无主 PR 入库）。
3. 标签不含 `hold` / `do-not-merge` / `blocked` / `hub:blocked` / `wip` / `gpt:decide` / `funds`。
4. 改动文件全部落在 `scripts/` `docs/` `knowledge/` `ops/` `config/`。
5. 头 SHA 上所有 check 已完成，且无一失败；至少一个成功。
6. `mergeable` 为真、无冲突。
7. 单次最多合并 3 个。

判定结果写进 PR 评论（带 `<!-- auto-merge-gate:... -->` 标记）并存 artifact，可逐条回溯。

## 明确不做（fail-closed）

- 资金：`fulfill-market-orders.mjs`、`run-treasury-aave.mjs`、`anchor-market-snapshot.mjs`、`preflight-signer.mjs`、`signer-readiness`、`wallet*` `payout*` `refund*` `treasury*` `payment*`。
- 合约：`contracts/`、`*.sol`。
- WEP3：`workers/wep3/`、`wrangler.wep3.toml`。
- 部署闸：`.github/workflows/deploy-*`、`autonomous-funded-orders.yml`、`funded-invest*`、`aave-*`、`escrow-*`。
- 闸门自身：`.github/workflows/auto-merge-gate.yml` 只能人工合并，防止自动扩大权限。

## 已知限制

1. 用 `GITHUB_TOKEN` 合并时，GitHub 不会为该 push 触发 `push` 类工作流（防递归）。
   若要让合并后立刻跑部署，需要在仓库 Secret 里放一个有 `contents: write` 的个人 PAT 作为 `AUTO_MERGE_TOKEN`；
   不配也能合并，只是后续部署要等下一次触发。
2. 分支未启用保护，本闸门是「代码层的门」，不是 GitHub 强制门。

## 自动放款还差什么

缺的不是代码，是 **signer 能力证明**：

- `scripts/preflight-signer.mjs` 必须返回 `state=ready`，才会执行 Aave 周期与快照锚定。
- 当前环境里 WEP3 signer 私钥不存在，`signed=false`、`tx_hash=null`，所以每次都是 `blocked_missing_signer`。
- 私钥 / 签名属资金族，保持 GPT 决策席人工授权，不进自动合并、不进自动执行。
