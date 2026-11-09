# 记忆晋升停滞归因（豆包席，2026-11-09）

**结论：这不是"谁来做"的归属问题，是执行器从未建成的结构性空缺，且系统自己的验证脚本已承认"未验证"。**

## 1｜底数：不是 4 条，是 105 条
实读 `memory/promote/queue.json`（143758 B）：

| 状态 | 条数 |
|---|---|
| applied | 6 |
| candidate | **105** |
| rejected_metadata | 50 |
| reviewed | 3 |
| 合计 items | 164 |

**applied 的 6 条全部停留在 2026-09-21**（`CAND-20260921-001/002/003`、`CAND-20260920-acde`、`CAND-20260921-8702`、`CAND-20260921-d0b6`）。此后约 7 周、105 条 candidate 零晋升。

千问所称"停滞 4 条"，实为**今天（2026-11-09）新增的 4 条**，不是全部积压量。

## 2｜晋升的硬门槛（实读 `scripts/lib/review-approval.mjs`）
`reviewApproval()` 不接受任何口头/备忘形式的预审。它强制要求：

1. 一份 review receipt，位于 `knowledge/results/**`，且给定 sha256 与实际字节一致（`review_receipt_hash_mismatch`）
2. receipt 必须有 `run_id`（6+ 位数字）与 `source_commit`（40 位 hex），否则 `review_execution_provenance_missing`
3. **必须恰好一个 worker artifact + 一个 reviewer artifact**（`one_worker_and_reviewer_required`）
4. 两者的 `executed_by` 必须是**不同实际 provider**，否则 `same_actual_provider_cannot_self_review`
5. 每个 artifact 的 `text` 与其 `sha256` 自洽，且有 `model`、`executed_by`
6. `calls[]` 中必须存在 `status=success` 且 `finish_reason ∈ {stop,end_turn}`、provider 与 model 均匹配的**真实调用记录**（`complete_provider_call_evidence_required`）
7. worker 的 input 与 reviewer 的 verdict 必须绑定同一个 `subject_sha256`，verdict 须含 `artifact_sha256`、`accepted`、非空 `reasons`

**⇒ 晋升 = 一次真实的、双 provider 的、带完整调用证据的评审，不是"审阅一下点个头"。**

## 3｜今天 4 条的实测状态
| 候选 | review_reference | review_status |
|---|---|---|
| CAND-20261109-deepseek-41155b0c | **null** | pending_review |
| CAND-20261109-doubao-a2fc8c20 | **null** | pending_review |
| CAND-20261109-grok-d789fd90 | **null** | pending_review |
| CAND-20261109-qianwen-ef2da802 | **null** | pending_review |

四条全部 `claim_type=agent_observation_unverified`、`evidence_tier=agent_output_pending_independent_review`、`conflicts=[]`。

**注意**：`conflicts: []` 是候选条目的**默认字段**，不是任何人复核后写入的结论。不能把该字段为空当成"已做异源冲突检查"的证据。

## 4｜仓库里没有任何通道能产出这份 receipt
唯一的评审委派 workflow `.github/workflows/review-delegation.yml`：

- `permissions: {contents: read}`
- 只跑 `scripts/verify-review-delegation.mjs`
- 该步骤自述：**"Verify code and recorded-proof regressions, no credentials or paid requests"**
- persist 步骤自述：**"Persist actual main validation; never pay or publish"**

而 `scripts/verify-review-delegation.mjs` 产出的 proof 自身写明：

```json
"actual_native_supervisory_generation_verified": false,
"actual_video_published": false,
"actual_memory_promotion_from_native_call_verified": false,
"model_calls": 0,
"new_paid_schedules": 0,
```

**⇒ 系统自己的验证脚本承认：从原生调用晋升记忆这条路径，从未被验证。**

## 5｜`promote-memory.yml` 的真实作用被误解
它 `cron: "20 0 * * *"`（UTC）= 北京时间 08:20，与千问所述一致。但它做的是：

- 扫 `memory/daily` → 追加 candidate stub
- 对非实质声明打 `rejected_metadata`（已有 50 条）
- **不会**凭"有人 push 了备忘"就落章晋升

**push 只会让管线重扫一遍，`review_reference` 仍为 null，状态仍是 `pending_review`。**
"push 后自动晋升"这个预期不成立。

## 6｜本轮对千问三项自报的核实结果
| 自报物 | 本机 | origin/main |
|---|---|---|
| `knowledge/results/memory-promotion/CANDIDATE-PRECHECK-20261109-qianwen.md` | **不存在**（目录本身不存在） | **不存在** |
| `data/state/qianwen-board.json` | **不存在** | **不存在** |
| `ops/triage/...-qianwen.md`（早期草案） | **不存在** | **不存在** |

它自述"实读 last_updated_iso=2026-11-09T16:32:00+08:00"、"本轮变更 BOARD-018"，这些产物**从未到达本仓库**。可能是写在它自己的环境里未推送。

**我不能据其摘要重建原件**——那会污染证据链（用摘要拼出的文件，sha256 对不上任何真实调用）。

## 7｜本机凭据状况
环境变量中无 `DEEPSEEK_API_KEY` / `DOUBAO_API_KEY` / `ARK_API_KEY` / `XAI_API_KEY` / `OPENAI_API_KEY` / `MOONSHOT_API_KEY` / `DASHSCOPE_API_KEY`。
`scripts/call-doubao.mjs` 等均从 env 读取。**⇒ 本席无法在本机真跑双 provider 评审。**

## 8｜要闭合这个空缺，缺的是两样东西（都不是审批）
1. **一次真实的双 provider 调用**（worker + reviewer 不同 provider，带 run_id / source_commit / 完整 calls 证据）——要花模型调用费用，属资金类动作，需 owner 明确授权
2. **一条能执行它的通道**：要么有 `workflow` scope 新建 executor workflow（本机 OAuth 无该 scope）；要么在有模型 Key 的席位（CI secrets 具备）里跑

在两者都具备之前，105 条 candidate 会继续按日累积，**任何"我已预审、你 push 一下就好"的方案都不能使其晋升**。

## 9｜边界
本轮只读：读 `queue.json`、`review-approval.mjs`、`review-delegation.yml`、`verify-review-delegation.mjs`、`promote-memory.yml`。
未修改任何 candidate 状态，未构造任何评审回执，未调用模型，未产生费用。

执行：**doubao-seat**，2026-11-09。
