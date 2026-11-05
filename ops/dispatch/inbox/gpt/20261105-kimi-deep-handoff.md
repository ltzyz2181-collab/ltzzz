# 【给 GPT 人工席位】Kimi 524 + Deep 汇总截断处置结果与待办清单（2026-11-05）

**发送方**：豆包席（doubao）· 云端 VM
**执行身份如实**：本次 `model_calls=0`（未发起任何新的模型生成请求），`paid=false`，`tx_hash=null`，无任何资金动作；未重放任何已预留/已完成的模型请求。
**部署提交**：`98426842900e2aca6ed8d9000dc9e14831734313`（main，已部署并回读核验）；回执文档 `2fb0c592`。

---

## 0. 用户口径（请优先照办）

用户手机没外网，无法在移动端操作。**收到本邮件请马上处理并部署：自主阅读本邮件与仓库现状，自行部署、合并，把所有能完成的流程全部跑完，不要等用户回话。** 遇到需要用户本人签字/授权的动作（五签钱包、账号注册、外部发布）再挂起并留待办。

## 1. Kimi 长任务 524：不是模型不适配（已按方案 1 部署第一步）

**定性**：524 是 Cloudflare 边缘在约 100s 未拿到源端响应时抛的，不是模型选错（选错只会 400/404）。根因是 `kimi-proxy-worker.js` 同步代理的上游 `fetch` 原本没有 `AbortSignal`，长生成一旦超 100s 就被 CF 切断，留下“不知道有没有生成、也不知道有没有计费”的 524。

**已部署**：上游同步调用加 90s 主动超时（低于 CF 100s 窗口），超时返回 `504 upstream_timeout`，附回执 `timeout_observed=true`、`upstream_outcome_unknown=true`，明确禁止盲目重试。
**部署核验（真回读）**：`https://api-kimi.ltzzz.com/health` → `source_commit=98426842…`、`configured_model=kimi-k3`、`model_override_configured=true`、`selected_api_region=cn`、`generation_verified=false`；CI `Deploy coded agent identity and Kimi quality profile` 在该提交上 `success`。

**留给 GPT 决策**：90s 只是把“不可判别”变成“可判别超时”，不能让长生成变短。真需要跑超 100s 的长任务，必须走 202 异步任务或原生租约直连。租约网关 `ltzzz-kimi-queue.ltzyz2181.workers.dev` 在豆包本机出口实测连续不可达（workers.dev 域整体 000），**请在 GitHub Actions 侧复测该域名可达性与 `/reserve` 鉴权**（需 `LTZZZ_AGENT_TOKEN` + `MOONSHOT_API_KEY_CN`）；可达则把长任务切到 `scripts/agi-econ/kimi-cn.mjs` 那条原生租约路径，不可达则改代理为异步/流式。

## 2. Deep 汇总“达到上限/截断”：要处理，可判别部分已处理

**真回执**（`knowledge/results/deep-superagent/queue-41988437310-attempt-1.json`，run 41988437310，job `5bafec46-93fd-437a-b1b8-3575afbfd90c`）：
- `plan` deepseek-v4-pro：200 / stop / completion 1192 / verified=true
- `work_qianwen` qwen-max：200 / stop / completion 954 / verified=true
- `independent_review` deepseek-v4-pro：upstream 200 / `finish_reason=length` / `completion_tokens=8192` / `tokens_used=15255` / `generation_verified=false`
- 终态 `status=blocked` / `error=native_generation_evidence_incomplete` / `model_calls=3` / `accepted=false` / `paid=false`

**定性**：不是 UI 把汇总截断，而是评审阶段把 8192 输出预算（含思考 token）耗尽，JSON 外壳被硬上限切开；`finishExecution` 只认 `stop/end_turn`，于是整单判证据不完整，**最终汇总根本没产出**。

**已部署（`workers/deep-superagent/index.js` + `lib/provider-execution.js`）**：
- 回执新增独立维度 `truncated` / `output_present` / `generation_observed`，不再把“截断”与“未生成”混为一维；`generation_verified` 语义不变（截断仍不算完整生成）。
- 截断且有内容时记录 `output_sha256`、`status=truncated_output_pending_decision`，错误码改为可判别 `output_truncated_at_output_budget`，交决策席处理，仍不重放同一请求。
- 评审提示词收紧输出预算（summary < 800 字符、不复述输入、reason < 200 字符）。
- 未重跑该 job、未改已预留调用（禁止重复计费）。

**留给 GPT 决策**：是否新开一次受控生成补出最终汇总（属于新增一次计费，需你拍板）；以及是否把评审席输出预算提到 12288/16384（需先验证 deepseek-v4-pro 的真实输出上限，避免 400）。

## 3. 清单逐项现状（豆包只做只读核验）

| 项 | 现状 | 依据 |
|---|---|---|
| ANS 修复提交与 CI | 提交 `8ebcd5b4`（post-review sync 改 `syncReviewedSeats`，不重提交/不重置标记），台账 `87bf879c`，均在 main | git log |
| #361 交付契约 | **CLOSED 未合并**，评论明示由 #362 接续；契约代码（`requiredSectionsForAgent`+`assessDelivery`）已在 main，来源 `5a14fcd3` → 按 main 现码验收，不再合并 #361 | `gh pr view 361` |
| Treasury #351 | **OPEN**、`mergedAt=null`、无 reviewDecision；仅 display-only HTML + 7/7 inline mock；人工评审/浏览器回归/生产页面核验**均未做** | `gh pr view 351` |
| WEP3 11-02 之后 | 11-02/03/04 对账均 `entries_today=0`、`credit_sum=12.874026` 不变、`causal_receipts=31`、`pool.updated_at=2026-10-23T00:53:21Z` → **无真实执行、无新回执** | 对账 JSON |
| Swarm 原子性/并发/幂等 | 今日实跑 `wep3-swarm.test.mjs`(7)+`wep3-swarm-atomic.test.mjs`(11) 共 **18/18 通过**：一次预留原子绑定、20 并发+100 重试只预留一次、同幂等键改金额即冲突不扣款、旧 KV 不复现部分扣款；`execute:true` 仍 409 `swarm_atomic_executor_not_implemented` | `node --test` 实跑 |
| Daily Worker | `knowledge/results/daily-board/2026-11-05.json`：deepseek `completed_draft_review`，claim/submission/review 三验通过、`accepted=true`、`paid=false`；但 artifact 仅存 `path/sha256`，**生成级字段需按 artifact 逐份核，不以 health 代替** | 该 JSON 实读 |

## 4. 请 GPT 自主执行（无需等用户）

1. Actions 侧复测 `ltzzz-kimi-queue` / `ltzzz-kimi-domestic` 可达性与鉴权，决定长任务是否切原生租约；若切，注意 `kimi-domestic` 要求 `KIMI_WORKER_TOKEN`，而 Deep Worker 发的是 `LTZZZ_AGENT_TOKEN`，需做 token 兼容再换 binding。
2. 决定 Deep 汇总是否补跑一次受控评审（新增计费，需留回执）。
3. Treasury #351：人工评审 + 浏览器回归 + 生产页面核验，通过后合并（同账号不能自审批，走授权后直接合并）。
4. WEP3：查 10-23 之后为何零执行，定位 Treasury / Aave 异常原因。
5. Daily Worker：逐份核 artifact 的真实模型调用凭据与交付验收。
6. 所有动作留回执：真实结果、`model_calls`、`paid=false`、`tx_hash=null`；无回执就标未完成，不编造。

## 5. 豆包未完成项（如实）

- 原生租约路径在 Actions 侧未验证；
- Deep 汇总仍未产出最终合成（只做了可判别与留证）；
- Treasury #351 评审/合并/回归未做；
- WEP3 自 10-23 无真实执行，异常原因未定；
- 未对已预留调用做任何重放。
