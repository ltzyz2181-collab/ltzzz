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
| 验收闸 | `gateOutcome()` 按闸 ID 映射到固定脚本；闸分 `harness_self_check` 与 `order_acceptance` 两类 | 自检闸只证明 harness 行为，**不能验收订单**；订单只能走 `deliverable-audit`，按 `acceptance_criteria` 检查真实交付物内容；exit 非 0 或闸输出与 harness 重算的哈希不自洽 = `refused` |
| 回执账 | `knowledge/results/hire/ledger-v1.jsonl`，`appendReceipt()` | 只追加 + 令牌化文件锁（安全回收、不删他人锁）；整行写完并 `fsync`，未写完回滚；每条含 `order_sha256`、`receipt_sha256`、`gate`、`paid:false`、`financial_execution:false`、`amount_usd:0`；同一幂等键/订单号不重复记账；**写入边界在 `appendReceipt()` 内部执行**（`resolveLedgerPath()`），模块直接调用与 CLI 一样只能落在 `knowledge/results/hire/`，绝对路径、`..`、反斜杠、非规范路径和符号链接一律拒绝 |
| 拒绝权 | `classifyIntent()` + `assertAppendOnly()` | 命中资金/签名/钱包/Safe/放款/凭据/生产写，直接落 `needs_owner_decision`，**不跑闸、不执行**；`accepted` 是终态 |

## 三、为什么闸要这么严

- 模型不能自己声明「我跑过了」：验收必须是**机器跑出来的 exit code**，不是席位自述。
- 闸只允许显式允许列表中的 ID，订单无法传入命令：`node -e`、任意 `node <script>` 和 shell 元字符都无从注入。
- Phase1 记 `amount_usd: 0`：先把账本结构跑通，真付薪属于 Phase2，需要 owner 单独授权。

### 3.1 v1 安全修复（2026-11-16）

v0 允许任意 `node` 命令字符串作为验收闸，且回执账缺少幂等与整行完整性校验。v1 收紧为：

1. `acceptance_gate` 只接受 `ACCEPTANCE_GATE_ALLOWLIST` 中的 ID（v1 当时只有 `phase1-smoke`；v1.1 见 3.2 已拆成自检闸与订单验收闸），映射到固定脚本；订单字段不能拼接参数。
2. `evidence_paths` 只允许 `docs/` 与 `knowledge/results/hire/` 下的仓库相对路径；拒绝绝对路径、`..` 穿越、反斜杠、符号链接和目录；文件必须真实存在，回执记录每个文件的 SHA-256 与字节数。
3. `appendReceipt()` 在加锁后读取账本并实际执行 `assertAppendOnly()`；`accepted` 为终态。
4. 雇佣单必须有 `idempotency_key`；同一幂等键重复执行是 no-op（不重复记账），同一 `order_id` 不允许换键二次入账。
5. `readLedger()` 逐行重算 `receipt_sha256`、`order_sha256`，并强制 `paid=false`、`financial_execution=false`、`amount_usd=0`；重复键、重复订单号、`accepted` 后置记录一律拒读。
6. v0 的 `knowledge/results/hire/ledger.jsonl` 保持原样作为历史证据；v1 账本写入新文件 `ledger-v1.jsonl`，两者不混读。

### 3.2 v1.1 验收语义与回执完整性修复（2026-11-17，GPT 裁决 NEEDS_REVISION）

v1 的验收闸只检查源码里存在三个字符串，无法证明交付物存在；锁回收、账本写入和英文资金拒绝也各有缺口。v1.1 逐项修复：

1. **验收闸语义分离**。`phase1-smoke` 降级为 `harness_self_check`，用行为断言（拒绝命令注入、拒绝缺失判据、中英文资金拒绝、账本路径越界拒绝、无闸不得 accepted）自检 harness；**订单不能再用它验收**，用了报 `gate_is_harness_self_check`。订单只能走 `deliverable-audit`。
2. **订单验收对应明确判据**。订单新增必填 `acceptance_criteria`；判据只能引用本单 `evidence_paths` 里的文件，且必须至少含一条内容型判据（`markdown_headings` / `contains_all` / `json_keys` / `sha256` / `no_placeholder`），只写 `file_min_bytes` 不成立。
3. **检查真实交付物**。`deliverable-audit` 重新读取每个交付物字节、重算 SHA-256 后逐条判定；空交付物、仅空白、占位符（TODO/TBD/占位/待补充）一律不通过。闸输出必须带 `order_sha256`、逐条判据结果与证据哈希，harness 用自己的哈希再核一遍，**模型无法只靠自述通过**。
4. **锁回收无竞争窗口**。锁文件带随机 owner token；回收前用同一 fd 读取 dev/inode/token，再用旁路 reclaim 锁串行化，**持锁后重新比对身份**，身份变了立即放弃，绝不按旧观察删除新锁；释放只删 token 属于自己的锁。
5. **账本整行写入**。`writeSync` 循环直到写满并核对字节数；`fsync` 失败向上抛；任何失败都用 `ftruncate` 回滚到写入前长度，不留半行 JSONL。
6. **中英文资金/生产操作拒绝**。`FORBIDDEN_INTENT_RULES` 增加短语规则与动词-宾语组合，覆盖 `transfer money`、`withdraw funds`、`send payment`、`sign transaction`、`deploy to production`、`modify production configuration` 及中文对应表达；命中即 `needs_owner_decision`，闸不执行。
7. **ledgerPath 边界**。CLI 只接受 `knowledge/results/hire/<name>.jsonl`；拒绝绝对路径、`..`、反斜杠、非规范化路径、符号链接与目录替换，并核对真实路径仍在允许目录内。

## 四、命令

```
node scripts/hire-phase1.mjs selfcheck
node scripts/hire-phase1.mjs validate ops/hire/orders/<order>.json
node scripts/hire-phase1.mjs run ops/hire/orders/<order>.json knowledge/results/hire/ledger-v1.jsonl
```

`selfcheck` 跑 harness 自检闸（`phase1-smoke`），不产生任何回执。`run` 未显式给账本路径时写入 `knowledge/results/hire/ledger-v1.jsonl`；显式路径也必须落在 `knowledge/results/hire/` 内。

## 五、本轮实测（2026-11-16）

- v0：`node --test scripts/tests/hire-phase1.test.mjs` → 7 通过 / 0 失败；样例单 01 `accepted`，对抗样例 02 `needs_owner_decision`。
- v1 安全修复：同一测试文件 16 通过 / 0 失败，覆盖允许列表闸、路径穿越、缺失证据、符号链接、哈希篡改、重复幂等键/订单号、`accepted` 降级和 `paid=true` 拒绝。
- v1 样例重跑：01 `accepted`（重复执行 `appended=false`），02 `needs_owner_decision`（`forbidden_intent:wallet,safe,钱包,签名,资金`，闸未执行）。
- v1.1（GPT 总控 `NEEDS_REVISION` 后返工）：`node --test scripts/tests/hire-phase1.test.mjs` → 41 通过 / 0 失败 / 0 跳过。新增订单验收闸 `deliverable-audit`，`phase1-smoke` 降级为纯自检、不可接受任何订单。
- v1.1 反例实测：空交付物、纯空白、含 `TODO` 的未完成稿、内容不匹配的错交付物均被拒；伪造闸结果（错 `order_sha256`、少一条 criteria、`paid=true`、证据哈希变化）一律 `gate_output_invalid`；6 个进程并发各落 1 行、5 个进程同单只落 1 行；部分写入与 `fsync` 失败均回滚到写入前长度；回收竞争下不删除已被替换的锁；账本路径逃逸、符号链接、目录替换全部拒绝。
- 专用 CI `.github/workflows/hire-phase1.yml` 实际执行上述测试文件，并在 TAP 层断言 `fail=0`、`skipped=0`、`pass≥40` 且 23 个强制用例名仍存在（删测试即红），随后跑 CLI 端到端（selfcheck、validate、accepted 两次幂等、禁资金单升级、账本路径逃逸拒绝），逐行校验 `amount_usd=0 / paid=false / financial_execution=false`，并上传 TAP、E2E 摘要和账本作为证据。

## 六、席位方案的来源

六席回复已收（claude 3 条、gpt 1、doubao 1、qianwen 1、grok 2、kimi 2）。收敛到本规格的四点：hire spec 文件化、验收做成可跑脚本、jsonl 账本、REFUSE/拒绝权。逐席明细保留在本地结果台账，未随本安全修复 PR 提交。

## 七、未解决（待裁决）

1. 真付薪（Phase2）何时开、单笔上限、谁来付。
2. 席位自证身份问题：本轮四席把自己写成 gpt/unknown/unassigned，证明**席位自述不可信**，seat 名只能由执行器写死。
3. 是否把 Phase1 接入日流水线（每单自动落账）。
