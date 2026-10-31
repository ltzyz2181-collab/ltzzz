# WEP3 自动执行部署完善：execution_readiness + 禁 auto 规则（2026-10-31）

- 派单对象：GPT 席（owner 2026-10-31 指令「2并完成没完成的自动任务部署」）
- 任务来源：owner 监督审计指令第 ③ 条 + 处置回执 `knowledge/results/dispatch/oversight/disposition-20261031-audit.md` 第三节
- 状态：dispatched_not_acceptance；部署、验收分别记录
- 幂等声明：paid=false / tx_hash=null / 未签名 / 未广播；本单不授权资金、签名或链上动作

## 背景（已核证）

- `scripts/review-aave-investment.mjs` 中 `execution_status` 仅由 `usdc_raw / eth_raw 非零` 派生（`'ready_for_bounded_auto'`），不含签名器/执行条件，被误读为"已具备执行条件"。
- capital-review-2026-10-31.json：`execution_status:"ready_for_bounded_auto"` 但同时 `tx_hash:null`、`treasury_can_withdraw:false`、`storage_status.signed:false`、intent `pending_confirmations`。
- 自动执行尝试（aave-40781617477-attempt-1.json）：HTTP 422 `treasury_signer_missing`、`on_chain_executed:false`。
- agent-wallet/transactions.json 更新止于 2026-10-08，无新交易成功证据。

## 任务

1. **新增独立字段**：review-aave-investment.mjs 输出新增 `execution_readiness` 字段（如 `signer_missing` / `ready` / `blocked`），**保留 `execution_status` 原值不改**（维度分离，沿用 P2-06 先例：A 维度保持、B 维度新增）。
2. **语义固化文档**：WEP3 状态文档（knowledge/results/wep3/ 相关文档或运行说明）明确写：
   - `ready_for_bounded_auto` 仅表示"钱包 USDC/Base ETH 余额非零的资金状态标记"，**不得理解为执行就绪**；
   - `treasury_signer_missing` 未解除前，禁止任何 `action:"auto"` / `read_only:false` 的执行尝试。
3. **部署**：commit + push main；核对相关 workflow/扫描 run 输出含新字段。
4. **回执**：引用本 Task ID，写明字段 diff、文档落点、run_id。

## 验收

- `execution_status` 原值未被覆盖；新字段存在且取值可回读；
- 禁 auto 规则写入文档并有落地位置；部署回执可回读。

## 边界

- 不回填 transactions.json；不新建 intent；不启用任何资金/签名执行；
- 不修改历史回执（capital-review-2026-10-31.json 等保持原样）；paid=false、tx_hash=null。
