# AI 雇佣 AI · Phase1 v1 规格（2026-11-16，owner 授权立项；含安全修复）

> **验收状态：`acceptance=pending_gpt_review`（2026-11-17 标记）**
>
> 本文档对应的 Phase1 安全修复补丁已于 2026-11-17 并入 main（PR #400，commit `2658ef22d`），
> 但早前 GPT 安全评审对 PR #398 的结论是 `return_for_revision`、不批准合并。
> 按裁决 §五.1，**并入 main ≠ 验收通过**：本规格在 GPT 独立复审给出 approve 之前，
> 不得在任何回执、日报或对外文档中写成「Phase1 已通过 / 已验收」。

## 一、Phase1 是什么

仓库内可跑通的「AI 雇 AI」最小闭环，四件东西：**雇佣单规格、机器可跑的验收闸、只追加的回执账、拒绝权**。不发钱、不接外部账号、不碰凭据、不做生产部署。

## 二、四件东西怎么落地

| 件 | 落地物 | 判据 |
|---|---|---|
| 雇佣单规格 | `ops/hire/orders/*.json` + `validateOrder()` | 八个必填字段（含 `idempotency_key`）；未知字段直接拒；`salary` 在 Phase1 只能是 `none`；`acceptance_gate` 只能取显式允许列表中的闸 ID |
| 验收闸 | `gateOutcome()` 按闸 ID 映射到固定脚本 | exit 0 = `accepted`；非 0 = `refused`（带原因，不吞错）；订单不能注入命令、参数或 `node -e` |
| 回执账 | `knowledge/results/hire/ledger-v1.jsonl`，`appendReceipt()` | 只追加 + 文件锁；每条含 `order_sha256`、`receipt_sha256`、`paid:false`、`financial_execution:false`、`amount_usd:0`；同一幂等键/订单号不重复记账 |
| 拒绝权 | `classifyIntent()` + `assertAppendOnly()` | 命中资金/签名/钱包/Safe/放款/凭据/生产写，直接落 `needs_owner_decision`，**不跑闸、不执行**；`accepted` 是终态 |

## 三、为什么闸要这么严

- 模型不能自己声明「我跑过了」：验收必须是**机器跑出来的 exit code**，不是席位自述。
- 闸只允许显式允许列表中的 ID，订单无法传入命令：`node -e`、任意 `node <script>` 和 shell 元字符都无从注入。
- Phase1 记 `amount_usd: 0`：先把账本结构跑通，真付薪属于 Phase2，需要 owner 单独授权。

### 3.1 v1 安全修复（2026-11-16）

v0 允许任意 `node` 命令字符串作为验收闸，且回执账缺少幂等与整行完整性校验。v1 收紧为：

1. `acceptance_gate` 只接受 `ACCEPTANCE_GATE_ALLOWLIST` 中的 ID（当前仅 `phase1-smoke`），映射到固定脚本 `scripts/hire/gates/phase1-smoke.mjs`；订单字段不能拼接参数。
2. `evidence_paths` 只允许 `docs/` 与 `knowledge/results/hire/` 下的仓库相对路径；拒绝绝对路径、`..` 穿越、反斜杠、符号链接和目录；文件必须真实存在，回执记录每个文件的 SHA-256 与字节数。
3. `appendReceipt()` 在加锁后读取账本并实际执行 `assertAppendOnly()`；`accepted` 为终态。
4. 雇佣单必须有 `idempotency_key`；同一幂等键重复执行是 no-op（不重复记账），同一 `order_id` 不允许换键二次入账。
5. `readLedger()` 逐行重算 `receipt_sha256`、`order_sha256`，并强制 `paid=false`、`financial_execution=false`、`amount_usd=0`；重复键、重复订单号、`accepted` 后置记录一律拒读。
6. v0 的 `knowledge/results/hire/ledger.jsonl` 保持原样作为历史证据；v1 账本写入新文件 `ledger-v1.jsonl`，两者不混读。

## 四、命令

```
node scripts/hire-phase1.mjs validate ops/hire/orders/<order>.json
node scripts/hire-phase1.mjs run ops/hire/orders/<order>.json knowledge/results/hire/ledger-v1.jsonl
```

`run` 未显式给账本路径时写入 `knowledge/results/hire/ledger-v1.jsonl`。

## 五、本轮实测（2026-11-16）

- v0：`node --test scripts/tests/hire-phase1.test.mjs` → 7 通过 / 0 失败；样例单 01 `accepted`，对抗样例 02 `needs_owner_decision`。
- v1 安全修复：同一测试文件 16 通过 / 0 失败，覆盖允许列表闸、路径穿越、缺失证据、符号链接、哈希篡改、重复幂等键/订单号、`accepted` 降级和 `paid=true` 拒绝。
- v1 样例重跑：01 `accepted`（重复执行 `appended=false`），02 `needs_owner_decision`（`forbidden_intent:wallet,safe,钱包,签名,资金`，闸未执行）。

## 六、席位方案的来源

六席回复已收（claude 3 条、gpt 1、doubao 1、qianwen 1、grok 2、kimi 2）。收敛到本规格的四点：hire spec 文件化、验收做成可跑脚本、jsonl 账本、REFUSE/拒绝权。逐席明细保留在本地结果台账，未随本安全修复 PR 提交。

## 七、未解决（待裁决）

1. 真付薪（Phase2）何时开、单笔上限、谁来付。
2. 席位自证身份问题：本轮四席把自己写成 gpt/unknown/unassigned，证明**席位自述不可信**，seat 名只能由执行器写死。
3. 是否把 Phase1 接入日流水线（每单自动落账）。
