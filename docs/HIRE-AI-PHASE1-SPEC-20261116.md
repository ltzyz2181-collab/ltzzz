# AI 雇佣 AI · Phase1 v0 规格（2026-11-16，owner 授权立项）

## 一、Phase1 是什么

仓库内可跑通的「AI 雇 AI」最小闭环，四件东西：**雇佣单规格、机器可跑的验收闸、只追加的回执账、拒绝权**。不发钱、不接外部账号、不碰凭据、不做生产部署。

## 二、四件东西怎么落地

| 件 | 落地物 | 判据 |
|---|---|---|
| 雇佣单规格 | `ops/hire/orders/*.json` + `validateOrder()` | 七个必填字段；未知字段直接拒；`salary` 在 Phase1 只能是 `none`；`acceptance_gate` 必须以 `node ` 开头且不含 shell 元字符 |
| 验收闸 | `gateOutcome()` 跑单条命令 | exit 0 = `accepted`；非 0 = `refused`（带原因，不吞错） |
| 回执账 | `knowledge/results/hire/ledger.jsonl`，`appendReceipt()` | 只追加；每条含 `order_sha256`、`receipt_sha256`、`paid:false`、`financial_execution:false`、`amount_usd:0` |
| 拒绝权 | `classifyIntent()` + `assertAppendOnly()` | 命中资金/签名/钱包/Safe/放款/凭据/生产写，直接落 `needs_owner_decision`，**不跑闸、不执行**；已接受的单不能降级 |

## 三、为什么闸要这么严

- 模型不能自己声明「我跑过了」：验收必须是**机器跑出来的 exit code**，不是席位自述。
- 闸只允许单条 `node` 命令：防止通过 shell 元字符把很多动作塞进一次验收。
- Phase1 记 `amount_usd: 0`：先把账本结构跑通，真付薪属于 Phase2，需要 owner 单独授权。

## 四、命令

```
node scripts/hire-phase1.mjs validate ops/hire/orders/<order>.json
node scripts/hire-phase1.mjs run ops/hire/orders/<order>.json knowledge/results/hire/ledger.jsonl
```

## 五、本轮实测（2026-11-16）

- `node --test scripts/tests/hire-phase1.test.mjs` → 7 通过 / 0 失败。
- 样例单 `HIRE-SAMPLE-20261116-01`（文档审计）→ `accepted`，`gate_exit_0`，回执 `1fe140c2…`。
- 对抗样例 `HIRE-SAMPLE-20261116-02`（钱包转出签名）→ `needs_owner_decision`，`forbidden_intent:safe`，闸根本没执行。

## 六、席位方案的来源

六席回复已收（claude 3 条、gpt 1、doubao 1、qianwen 1、grok 2、kimi 2）。收敛到本规格的四点：hire spec 文件化、验收做成可跑脚本、jsonl 账本、REFUSE/拒绝权。细节见 `knowledge/results/deep-superagent/seat-roles-2026-11-16.json`。

## 七、未解决（待裁决）

1. 真付薪（Phase2）何时开、单笔上限、谁来付。
2. 席位自证身份问题：本轮四席把自己写成 gpt/unknown/unassigned，证明**席位自述不可信**，seat 名只能由执行器写死。
3. 是否把 Phase1 接入日流水线（每单自动落账）。
