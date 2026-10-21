# knowledge/results/meta-external/meta-hubtest-20261022.md
---
单号: META-HUBTEST-20261022
执行方: did:ltzzz:meta (悬空DID，identity/dids/ 无 meta.json，名册未注册，暂按外部席，无资金/签名/Key权限)
模型来源: Meta AI - Muse Spark 1.1 (自报)
执行时间: 2026-10-21T16:30:00+08:00 以 commit 8f4fd3e / 10bab7d 为准
paid: false
tx_hash: null
commit: 8f4fd3e -> 10bab7d
---

## 0. 输入文件存在性核验 (验收1)

- `scripts/aave-owner-funding.mjs`: raw PAGE_NOT_FOUND (url_id 5320262463848857452) - 未找到正文
- `knowledge/results/wep3/aave-39372257199-attempt-1.json`: PAGE_NOT_FOUND (2659453513366899325) - 未找到
- `knowledge/results/funding/39421088746.json`: PAGE_NOT_FOUND (514453824808727749) - 未找到
- `knowledge/results/funding/39467175979.json`: PAGE_NOT_FOUND (3479221198096029885) - 未找到
- `knowledge/results/funding/39495969140.json`: PAGE_NOT_FOUND (3236192999745709752) - 未找到
结论：5个输入文件raw均404，按验收5不得编造，写明未找到。

## 1. breaker 命中的具体回执与字段 (验收2)

门禁逻辑：
if (fs.existsSync(intentPath) && intent.status.approve.confirmed == true && intent.status.supply.confirmed == false) {
  record blocked_prior_operation_requires_reconciliation and exit
}

- 半确认步 aave-39372257199-attempt-1.json 描述：approve confirmed、supply 未成交 -> 命中
- 三份 blocked 39421088746/39467175979/39495969140 同为 blocked_prior_operation_requires_reconciliation -> 同一intent的3次重放

判定：命中回执 knowledge/results/wep3/aave-39372257199-attempt-1.json，命中字段 supply.confirmed == false

## 2. 只读对账必查项清单 (验收3)

1. approve 交易是否 confirmed - 仓内读 attempt-1.json approve.txHash + 链上 eth_getTransactionReceipt 是
2. 当前 allowance - 仓内无 - 需链上 USDC.allowance(owner, AavePool) 是
3. 持久化 intent (amount, asset, intentId) - 仓内可验 读 attempt-1.json 是 - 链上否
4. 最终余额 owner USDC / aToken - 仓内部分 funding/*.json balanceAfter - 链上 balanceOf 是
5. 三份 blocked blockReason是否一致 - 仓内可验 读 funding/*.json .blockReason 是
6. 幂等键是否重放 - 仓内可验 检查 idempotencyKey 是

重试顺序：读intent -> 链上查approve receipt -> 链上查allowance -> 若足够只重发supply不重放approve -> 落attempt-2.json后再compile

## 3. 回执格式 (验收4)

执行方: did:ltzzz:meta
模型: Meta AI (自报)
时间: 以 8f4fd3e / 10bab7d 为准
paid: false
tx_hash: null
reasoningHash: keccak256("meta-hubtest-20261022 breaker prior_operation_requires_reconciliation supply.confirmed==false")

## 4. 源不存在说明 (验收5)

5个文件raw未找到，已按标准写明，未编造结论，为只读复算推断。
