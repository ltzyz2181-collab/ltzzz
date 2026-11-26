# 放款裁决落地：主网 HOLD，Base Sepolia 仅隔离演练

- 原 Task ID：`PAYOUT-SIGNER-DEPLOY-PLAN-20261121-01`
- 现行 decision_id：`GPT-DECISION-20261122-PAYOUT-HOLD-01`
- 落地日期：2026-11-25
- 关联卡：#618（自动放款 HOLD 解除路径）

## 裁决要点

1. 自动签名器只允许做 Base Sepolia 隔离测试准备/演练；不建设可触达 mainnet 的自动签名服务，不启用 mainnet 自动放款。
2. 最小试点只允许 Base Sepolia，且 `amount_usd=0`、`paid=false`、`financial_execution=false`；不得配置真实主网收款方、预算或放款控制器，不得生成或使用生产签名密钥。
3. 验收必须有同 source SHA 的 deploy/health/readback + smoke 证据、append-only receipt，并写明 network/asset/test 地址和签名交易字段；缺 signer、余额、网络、收款方或策略证据一律 fail closed。
4. 不把生产 preflight 改成“可演练/ready”；生产维持 HOLD/BLOCKED_EVIDENCE，可另设隔离的 `testnet_rehearsal_ready`，但不得覆盖 mainnet 状态。
5. 五签 Safe 与历史 Safe 完全排除，不得改名、改阈值、迁移或绕过。

## 仓库落地

- 新增 `config/payout-network-status-20261124.json`：`mainnet` 与 `base_sepolia` 分开记录，主网固定 `HOLD/BLOCKED_EVIDENCE`，测试网为 `NOT_STARTED`，`testnet_rehearsal_ready=false`。
- 新增只读脚本 `scripts/payout-network-status.mjs`：只读取和校验状态，不读密钥、不签名、不发交易。
- 新增测试 `scripts/tests/payout-network-status.test.mjs`：校验主网 HOLD、测试网未就绪、测试网状态不能改变主网。

## 明确不变

- `autonomous-funded-orders` 仍以 `blocked_missing_signer` 保持 HOLD；不把阻断改成成功。
- WEP3 仍 `signed=false`、`tx_hash=null`、`transactions=0`。
- `small-payment-autonomy.enabled=false` 不变。
- 五签 Safe 不参与、不迁移、不改阈值。

## 验证

```bash
node scripts/payout-network-status.mjs --network mainnet
node scripts/payout-network-status.mjs --network base_sepolia
node --test scripts/tests/payout-network-status.test.mjs
```

## 下一步

- 若要做 Base Sepolia 演练，另开卡并提供：testnet signer（隔离）、faucet 资金、test 收款方、策略快照、同 source SHA 的 smoke 证据。
- 在证据齐全前，不请求主网 HOLD 解除，也不把测试网状态写成生产可用。
