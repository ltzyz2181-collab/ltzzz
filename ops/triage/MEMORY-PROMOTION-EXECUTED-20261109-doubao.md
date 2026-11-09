# 记忆晋升双 provider 真实评审：已执行一次（豆包席，2026-11-09）

**结论先行：不是方案，是已经真跑了的执行结果。通道打通，4 条候选全部被独立评审方按标准否决。**

## 1｜先补上了一个结构性空缺
此前仓库里**没有任何**能产出 `memory_promotion` 评审回执的执行器（`review-delegation.yml` 自述 `zero model calls` / `never pay`；`verify-review-delegation.mjs` 自报 `actual_memory_promotion_from_native_call_verified: false`）。

本轮新增：

| 文件 | 作用 |
|---|---|
| `scripts/run-memory-promotion-review.mjs` | 双 provider 评审执行器（worker + reviewer 必须不同厂商） |
| `scripts/tests/memory-promotion-review.test.mjs` | 离线回归 6/6，零真实调用 |
| `.github/workflows/memory-promotion-review.yml` | CI 执行通道（workflow_dispatch） |

关键护栏（均已实测生效）：
- `subject_sha256` / `artifact_sha256` 由脚本计算后写入 prompt，**并校验 provider 回填值逐字符一致**——防 LLM 抄错常量
- 前置质量门（非实质声明、源哈希变化、冲突未解）**在发起模型调用之前**拦截
- 回执产出后**必须过官方 `reviewApproval`**，不通过绝不写 `review_reference`
- 缺凭据时 fail-closed：`status=not_configured`、`model_calls:0`、退出码 2，**不会误报通过**

## 2｜真实调用记录
| run | 结果 | 说明 |
|---|---|---|
| 42594987734 | failure | worker 走火山方舟北京端点 `ETIMEDOUT`（CI 在境外） |
| 42595110528 | failure | 同上，`TypeError: fetch failed; network_code=ETIMEDOUT` |
| 42595307923 | failure | 改境外 provider 对后调用成功，但退出码语义导致回执未提交 |
| 42595502571 | success | 4 条评审完成（8 次调用），但 persist 因 `git add` pathspec 失败未提交 |
| **42596069016** | **success** | **4 份回执完成提交并推送 main（commit `8f19034a`）** |

端点连通性探测（run 42595307923）：`api.deepseek.com` 401 / `api.x.ai` 401 / `ark.cn-beijing.volces.com` 401 —— 全部可达，401 表示缺 key 而非网络不通。故最终选用 **worker=deepseek、reviewer=grok**（不同实际 provider，均境外可达）。

## 3｜评审结果：4 条全部否决
| 候选 | 裁决 | 评审方核心理由（原文摘） |
|---|---|---|
| CAND-20261109-qianwen-ef2da802 | **拒绝** | 单日"待补"清单快照，属过程元数据；补全状态会随填写变化，无持续性 |
| CAND-20261109-grok-d789fd90 | **拒绝** | 单次 Pulse 存活快照（`ran_at`+六席 http=200）属日常操作元数据；同类每日 Pulse 记录应不通过 |
| CAND-20261109-doubao-a2fc8c20 | **拒绝** | 三条均为当次操作过程状态；且把 `finish_reason=stop` 引申为"未运行、未部署"属把未验证推断写成已证实事实 |
| CAND-20261109-deepseek-41155b0c | **拒绝** | 对已有 `重要事件.md` 章节的摘录复述；"生产修复未完成"是可变过程状态 |

**这直接否定了"3 条可晋升、1 条转审"的预审版结论。** 独立评审方给出的理由与预审版相反：这些是每日日课的机械重述，不是可长期复用的实质事实。

## 4｜最关键的一条：拒绝 ≠ 回执不合规
用官方 `reviewApproval` 对 4 份已落盘回执做独立复验：

```
CAND-20261109-deepseek-41155b0c | validator_status=revision_required | proof_present=true | reason=none | providers=deepseek/grok
CAND-20261109-doubao-a2fc8c20    | validator_status=revision_required | proof_present=true | reason=none | providers=deepseek/grok
CAND-20261109-grok-d789fd90      | validator_status=revision_required | proof_present=true | reason=none | providers=deepseek/grok
CAND-20261109-qianwen-ef2da802   | validator_status=revision_required | proof_present=true | reason=none | providers=deepseek/grok
```

- `proof_present=true` 且 `reason=none` ⇒ 未触发 `review_receipt_hash_mismatch` / `review_execution_provenance_missing` / `one_worker_and_reviewer_required` / `same_actual_provider_cannot_self_review` / `complete_provider_call_evidence_required` / `bound_review_verdict_required` 中的任何一条
- `providers=deepseek/grok` ⇒ 双厂商合规
- `status=revision_required` ⇒ 来自 `verdict.accepted=false`，是评审结论

回执内部哈希自洽亦已独立核验：4/4 `artifacts_sha_ok=true`，每份 `calls=2`。

**⇒ 通道是真的通了。若某条候选被判定接受，同一套流程即可直接落章晋升。**

## 5｜队列与费用
- `applied` 仍为 **6**（无新增，因为没有候选通过评审）
- `candidate` 仍为 **105**（4 条评审未通过，状态保持 `pending_review`，回执为证据）
- 本轮真实模型调用：**8 次**（4 条 × worker/reviewer 各 1）
- token：worker 716~1226 / reviewer 2443~3269（按候选不同）
- `paid=false`、`tx_hash=null`，未涉及任何链上或资金动作

## 6｜对 105 条积压的判断
今日 4 条被拒的理由高度一致（日常 Pulse 存活、待办清单快照、对已载章节的同义复述）。这 105 条里大概率同类占多数——若逐条烧双 provider 调用，性价比低。

**建议（未执行，待 owner 决定）**：先用纯本地的 `substantiveClaim` + 内容相似度做一轮批量预筛，只把真正可能有长期价值的少数送进双 provider 评审，而不是 105 条全量付费。

## 7｜边界声明
- 本轮**没有**修改任何候选的最终状态（无晋升）
- **没有**把任何"预审备忘"当作评审依据；一切以回执为准
- 未伪造、未手工拼装任何回执；全部来自真实 HTTP 调用并附 `finish_reason` 证据
- 未触碰钱包、未发交易

执行：**doubao-seat**，2026-11-09。回执 commit `8f19034a`。
