# Kimi 524 与 Deep 汇总截断处置（2026-11-05）

执行身份：豆包（doubao）· 云端 VM · 只读诊断 + 代码修复 + 部署核验 + 邮件派发
`model_calls`：0（本次未发起任何新的模型生成请求）
`paid`：false · `tx_hash`：null · 资金动作：无
部署提交：`98426842900e2aca6ed8d9000dc9e14831734313`（main）

## 一、Kimi 长任务 524：不是模型不适配

- 结论不变：524 是 Cloudflare 边缘在约 100s 未拿到源端响应时抛出的，与模型选型无关。模型选错只会得到 400/404。
- 结构原因：`kimi-proxy-worker.js` 是同步代理，上游 `fetch` 原本没有任何 `AbortSignal`。长生成一旦跑过 100s，就由 CF 切断，留下“不知道有没有生成、也不知道有没有计费”的 524。
- 已部署修复（本次）：上游同步调用增加 90s 主动超时（`UPSTREAM_TIMEOUT_MS=90000`，低于 CF 100s 窗口），超时返回 `504 upstream_timeout`，并附回执 `timeout_observed=true`、`upstream_outcome_unknown=true`，明确禁止据此盲重试。
- 部署核验（真回读）：`https://api-kimi.ltzzz.com/health` 返回 `source_commit=98426842900e2aca6ed8d9000dc9e14831734313`、`configured_model=kimi-k3`、`model_override_configured=true`、`selected_api_region=cn`、`generation_verified=false`。CI 运行 `Deploy coded agent identity and Kimi quality profile` 在 98426842 上 `success`。
- 边界说明：90s 超时把“不可判别”变成“可判别超时”，并不让长生成变短。真正要跑超 100s 的长任务，仍应走异步任务（202 + 任务态）或原生租约直连，而不是同步代理。租约网关 `ltzzz-kimi-queue.ltzyz2181.workers.dev` 在本机出口连续实测不可达（workers.dev 域整体 000），因此该路径必须在 GitHub Actions 侧复测后才能定性为可用。

## 二、Deep 汇总“达到上限/截断”：要处理，已处理可判别部分

- 真回执：`knowledge/results/deep-superagent/queue-41988437310-attempt-1.json`（run 41988437310，job `5bafec46-93fd-437a-b1b8-3575afbfd90c`）
  - `plan` deepseek-v4-pro：200 / stop / completion 1192 / `generation_verified=true`
  - `work_qianwen` qwen-max：200 / stop / completion 954 / `generation_verified=true`
  - `independent_review` deepseek-v4-pro：upstream 200 / `finish_reason=length` / `completion_tokens=8192` / `tokens_used=15255` / `generation_verified=false`
  - 最终 `status=blocked`、`error=native_generation_evidence_incomplete`、`model_calls=3`、`accepted=false`、`paid=false`
- 定性：不是“汇总被 UI 截断”，而是评审阶段把 8192 输出预算（含思考 token）用完，JSON 被硬上限切开，`finishExecution` 只认 `stop/end_turn`，于是整单判为证据不完整、最终汇总根本没产出。
- 已部署修复（本次，`workers/deep-superagent/index.js` + `lib/provider-execution.js`）：
  - 回执新增独立维度：`truncated`（`finish_reason=length`）、`output_present`、`generation_observed`，不再把“截断”与“未生成”混成一维；`generation_verified` 语义保持不变（截断仍不算完整生成）。
  - 截断且有内容时：记录 `output_sha256`、`status=truncated_output_pending_decision`，错误码改为可判别的 `output_truncated_at_output_budget`，交决策席处理；仍不重放同一请求。
  - 评审提示词收紧输出预算（summary < 800 字符、不复述输入、reason < 200 字符），避免 JSON 外壳被截断。
- 未做：没有重跑该 job，没有改动已预留的模型调用（禁止重复计费）。

## 三、清单逐项现状（只读核验）

| 项 | 现状 | 依据 |
|---|---|---|
| ANS 修复提交与 CI | 提交 `8ebcd5b4`（post-review sync 用 `syncReviewedSeats`，不重提交、不重置标记），台账 `87bf879c`；两者已在 main | `git log -- scripts/lib/daily-task-board.mjs` |
| #361 交付契约 | PR **CLOSED 未合并**，评论明示由 #362 接续；契约代码（`requiredSectionsForAgent` + `assessDelivery`）已在 main，来源 `5a14fcd3` | `gh pr view 361`；`scripts/lib/daily-task-board.mjs` |
| Treasury #351 | **OPEN**、`mergedAt=null`、无 reviewDecision；范围仅 display-only HTML + 7/7 inline mock；人工评审、浏览器回归、生产页面核验均未做 | `gh pr view 351` |
| WEP3 11-02 之后 | 11-02/03/04 对账均 `entries_today=0`、`credit_sum=12.874026` 不变、`causal_receipts=31`、`pool.updated_at=2026-10-23T00:53:21Z` → 无真实执行、无新回执 | `results/wep3-reconcile-2026-11-0{2,3,4}.json` |
| Swarm 原子性/并发/幂等 | 今日实跑 `wep3-swarm.test.mjs`（7 项）+ `wep3-swarm-atomic.test.mjs`（11 项）共 **18/18 通过**：一次预留原子绑定 parent/child/journal/幂等记录、20 并发 + 100 重试只预留一次、同幂等键改金额即冲突不扣款、旧 KV 路径不复现部分扣款；`execute:true` 仍 409 `swarm_atomic_executor_not_implemented` | `node --test` 实跑输出 |
| Daily Worker 真实调用 | `knowledge/results/daily-board/2026-11-05.json`：deepseek 席位 `completed_draft_review`，`claim_verified/submission_verified/review_verified=true`、`accepted=true`、`paid=false`、`tx_hash=null`；artifact 仅存 `path/sha256`，生成级字段需按 artifact 文件逐份核 | 该 JSON 实读 |

## 五、邮件派发证据

- 收件人：GPT 人工席位 `ltzyz2181@gmail.com`
- 发件人：`qingqizhu6502@agent.qq.com`
- 主题：`【GPT 自主执行】Kimi 524 已部署 98426842 + Deep 汇总截断处置与清单（用户手机没外网，收到即办）`
- 送达回读：`message_id=msg_TTl1Q0dvw5A2SYEIpEiohbQXz798mU95jHETiH9N3Gkhpw`，`created_at=2026-11-05T08:17:25Z`，`dir=sent`
- 正文留档：`ops/dispatch/inbox/gpt/20261105-kimi-deep-handoff.md`

## 六、未完成项（如实）

1. Kimi 原生租约路径（`ltzzz-kimi-queue`）在 Actions 侧可达性未验证，本机出口不可达，方案 1 的“完全脱离 CF”尚未在生产链路闭环。
2. Deep 截断修复只做到“可判别 + 留证”，没有在预留下重跑评审，最终汇总仍未产出（需决策席决定是否新开一次受控生成）。
3. Treasury #351 评审/合并、浏览器回归、生产页面核验未做。
4. WEP3 自 10-23 起无真实执行；Treasury 与 Aave 异常原因未定。
5. Daily Worker 生成级凭据未逐份核对，未以 health 代替。
