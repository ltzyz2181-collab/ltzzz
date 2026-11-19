# Deep 执行器与部署凭据证据（2026-11-19）

本文回答 owner 在 2026-11-19 提出的两个问题：

1. **执行器问题**：谁真正负责轮询、领取和执行？不能把“定时同步标签”的 GitHub Action 当成 AI 执行器。
2. **部署权限问题**：每个执行席的 GitHub 写入、合并、Cloudflare 部署凭据是否真实可用？`automatic_deploy=true` 只是配置，不等于凭据已经打通。

本文只记录已经发生的运行编号、提交 SHA、回执路径和线上回读结果；不记录任何凭据、token、邮箱正文或客户输入。

---

## 一、谁真正负责轮询、领取和执行

| 层 | 实际组件 | 做什么 | 不做什么 |
|---|---|---|---|
| 派单层 | `.github/workflows/deep-dispatch-daily.yml`（cron `17 0 * * *`，另支持 `workflow_dispatch`） | 生成当日 `ops/deep-superagent/tasks/*-DAILY-*.json` 卡，并用 PAT（`LTZZZ_AGENT_TOKEN`）提交，避免 `GITHUB_TOKEN` 递归抑制导致队列不触发 | 不调用模型、不执行任务 |
| 队列编排层 | `.github/workflows/deep-superagent-queue.yml` | 校验（`verify` job）后由 `consume` job 运行 `scripts/run-deep-superagent-queue.mjs` | 自身不是 AI 执行器，只负责受信编排与落回执 |
| 领取锁 | `DeepQueueLatchStore`（WorkpoolGitHubStore） | 在 POST 前先写 `heads/deep-superagent/attempts/<key>` 持久占位，回执字段 `attempt_latch: durable_reserved_before_post`、`first_post_http: 202` | 不是内存锁，run 重启后仍保留占位 |
| AI 执行层 | Cloudflare Worker `ltzzz-deep-superagent` + DeepSeek 规划/执行席 + 独立复核席 | 真正发起模型调用；回执记录 `plan_source: coordinator`、`model_calls: 3`、`actual_provider` / `actual_model` | 不落私钥、钱包、资金动作 |
| 自主桥接层 | `scripts/deep-autonomy.mjs`（在 Actions 受信环境执行） | 按卡面 `autonomy.mode=auto` 执行 `repo_read` / `code_change` / `deploy` / `mail`，产出独立公开回执 | 模型输出只接受受限整文件块，不作为 shell 执行 |
| 定时同步层 | 各类 `*.yml` 定时标签/租约校正 Action | 只做标签、租约、摘要同步，`model_calls=0` | **不是 AI 执行器**，不领取任务、不改代码、不部署、不发信 |

领取证据（探针 #1，main 上的公开回执）：

- `knowledge/results/deep-superagent/queue-44501945349-attempt-1.json`
  - `status: queue_results_verified`
  - `attempt_latch: durable_reserved_before_post`
  - `first_post_http: 202`
  - 作业终态 `completed_pending_external_acceptance`
  - `plan_source: coordinator`、`model_calls: 3`
  - `actual_provider` / `actual_model` 分别记录为 `deepseek` / `deepseek-v4-pro` 与 `xai` / `grok-4.6`（按各次调用回执）

注意：Worker 作业字段里的 `accepted=false`、`platform_accepted=false`、`deployed=false` 描述的是 **Worker 内部的作业终态语义**；桥接层的改代码/部署/发信另有独立回执与运行编号，见下一节。两者不能互相替代。

---

## 二、凭据是否真实可用（按动作列证据）

### 2.1 GitHub 写入与合并

| 动作 | 证据 |
|---|---|
| 直接写仓库（Contents API） | 探针卡 `DEEP-AUTONOMY-PROBE-20261119-1/2/3` 均由 Actions 侧写入并提交 |
| 开 PR | PR #467（探针 #2）、PR #468（CI 门禁）、PR #469（探针 #3） |
| 合并 | PR #468 merge `4c4eff61a7a146bfa8a3a9157d9d7a73172b7244`；PR #469 merge `06ca272697c2c25f2f027e0d86bb65720bf560a3` |
| 桥接层自动合并 | `DEEP-AUTONOMY-PROBE-20261119-3-baf3c0ba….json` 中 `code_change.status: merged`、`merge_sha: 06ca2726…` |

### 2.2 真实 CI 门禁（合并前）

- 新增 `.github/workflows/deep-autonomy-verify.yml`：`workflow_dispatch` 到 PR 分支，跑语法检查与 5 套测试。
- `scripts/deep-autonomy.mjs` 在开 PR 后 dispatch 该工作流并轮询 run；**CI 失败、run 未出现或 8 分钟超时都不合并**。
- 探针 #3 证据：
  - CI run `44504093274`，`conclusion: success`，head `7e3c265ffbba335e08eb044cdf0209621e6d0a51`
  - 回执 `ci.status: ci_passed`、`ci.run_id: 44504093274`
  - 之后才出现 merge `06ca2726…`
- PR #468 同时新增 3 项测试（CI 失败不合并 / CI 超时不合并不合并 / dispatch 失败不合并），autonomy 测试 21/21 通过。

### 2.3 Cloudflare Worker 部署凭据

- 工作流：run `44501244192`（`Deep Superagent isolated deployment and explicit bootstrap`），`conclusion: success`，head `9cd3ee5ba8cc452f0a3aa0229874aa8c6f366149`。
- 回执：`knowledge/results/deep-superagent/deploy-44501244192-attempt-1.json`
  - `status: deployment_health_and_auth_verified`
  - `deployments: 1`
  - `health.ok: true`、`service: ltzzz-deep-superagent`
  - `source_commit: 9cd3ee5b…`、`source_readset_sha256: bb5a070ae0a538ded8c46b7cac4661007f9dda50f19d983e3b7b43ef70883797`
  - `auth_checks`: anonymous `401` / wrong `401` / valid `200`
  - `anonymous_job_post_http: 401`
- 结论：不是“配置写着能部署”，而是**同一提交的 Worker 已部署、健康检查通过、认证边界实测为 401/401/200**。

### 2.4 GitHub Pages 标准部署

| 部署 | 运行 | head | 结果 |
|---|---|---|---|
| 探针 #2 | `44502632092` | `448a8e5b3fcb80bd666f2b78194798ff6c079712` | success |
| 探针 #3 | `44504145519` | `06ca272697c2c25f2f027e0d86bb65720bf560a3` | success |

线上回读：

- `https://ltzzz.com/docs/deep-autonomy-probe-20261119-ci.md` → HTTP `200`
- 正文与合并文件一致（由 Deep 队列写入、经 CI 后合并）

### 2.5 邮件发送通道

- `scripts/send-mail.py` 经 SMTP 发送，回执写 `knowledge/results/deep-superagent/autonomy/mail-*.json`。
- 探针 #1：`smtp_code=250`，`message_id <179508262922.2430.8033221019223533196@qq.com>`
- 探针 #3：`smtp_code=250`，`message_id <179508340128.2664.13736539230842430590@qq.com>`
- 边界：SMTP `250` 只证明服务器接受投递，**不等于已读或已进收件箱**；如需更严格证据须另做邮箱回读。

---

## 三、一次完整链路（探针 #3）

| 步骤 | 实际证据 |
|---|---|
| 派单 | 卡 `ops/deep-superagent/tasks/DEEP-AUTONOMY-PROBE-20261119-3.json` 在 main |
| 领取 | 队列 run `44503885577`；`attempt_latch: durable_reserved_before_post` |
| AI 执行 | Worker 调 DeepSeek 规划/执行/复核；`plan_source=coordinator`、`model_calls=3` |
| 仓库读写 | 卡面声明 `repo_read`，内容进入运行回执 |
| 改代码 | 模型输出 `<<<FILE:docs/deep-autonomy-probe-20261119-ci.md>>>` 块，桥接层落盘 |
| 本地测试 | 桥接层 `defaultRunTests` 执行（无失败） |
| PR | PR #469 |
| CI | run `44504093274` success |
| 合并 | `06ca272697c2c25f2f027e0d86bb65720bf560a3` |
| 标准部署 | Pages run `44504145519` success |
| 线上回读 | HTTP `200`，内容一致 |
| 邮件回执 | `smtp_code=250` + `message_id` |

---

## 四、状态分层（不合并口径）

| 状态 | 结论 |
|---|---|
| draft | 完成：卡面、桥接层、CI 门禁、测试与回执格式 |
| tested | 完成：autonomy 21/21；队列/派单/策略测试在 CI 中通过 |
| merged | 完成：PR #465、#467、#468、#469 已合并 main |
| deployed | 完成：Cloudflare Worker run `44501244192`；Pages run `44502632092`、`44504145519` |
| submitted | 完成：探针 #1/#2/#3 已实际提交并产生公开回执与邮件 |
| platform_accepted | 桥接层动作已被平台接受（merge/deploy/SMTP 均有平台侧编号）；Worker 作业字段 `accepted/platform_accepted/deployed` 仍按 Worker 语义保持 `false`，不得改写为“业务验收通过” |

---

## 五、边界与仍然不做的事

- 资金、付款、转账、放款、退款终态裁决：仍归 GPT 决策席。
- 签名、私钥、助记词、钱包操作：仍 fail-closed。
- 凭据、Secrets、owner 授权配置、工作流定义的改写：仍需 GPT 决策或 owner 直接指令。
- 命中 `FIDUCIARY_RE` 的提示词或模型输出：`blocked_fiduciary`，不执行。
- 模型输出不能作为 shell 命令执行；只接受受限整文件块，最多 6 个文件、400KB。

---

## 六、Harness 记录

- 命令：`node scripts/harness.mjs before receipt,model_output,input_hash,external_platform`
- 状态：`retrieved_not_compliance_verified`
- 使用到的 lesson：
  - `L-20261117-006`：部署前后落 `ops/deploy-receipts/` 回执并 `record + verify`；回执绑定 `code_commit` 与代码哈希；非全绿写 `blockers` 与 `next_action`
  - `L-20261030-004`：记录实际执行者与模型，席位名只作分派
  - `L-20261030-007`：每个输入哈希记录路径、sha256 与提交
- 检索本身不是执行证明；上面的运行编号、SHA 与回执路径才是。

---

## 七、证据索引

- `knowledge/results/deep-superagent/queue-44501945349-attempt-1.json`
- `knowledge/results/deep-superagent/autonomy/DEEP-AUTONOMY-PROBE-20261119-1-3dbe9792….json`
- `knowledge/results/deep-superagent/autonomy/DEEP-AUTONOMY-PROBE-20261119-2-91564d3a….json`
- `knowledge/results/deep-superagent/autonomy/DEEP-AUTONOMY-PROBE-20261119-3-baf3c0ba….json`
- `knowledge/results/deep-superagent/autonomy/mail-DEEP-AUTONOMY-PROBE-20261119-1-44501945349.json`
- `knowledge/results/deep-superagent/autonomy/mail-DEEP-AUTONOMY-PROBE-20261119-3-44503885577.json`
- `knowledge/results/deep-superagent/deploy-44501244192-attempt-1.json`
- `ops/deploy-receipts/DR-20261119-deep-autonomy-e2e-accepted.json`（本次部署回执）
- `ops/deploy-receipts/DR-20261119-deep-autonomy.json`（PR #465 的既有回执，不覆盖）
