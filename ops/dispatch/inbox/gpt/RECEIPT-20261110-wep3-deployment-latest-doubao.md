# RECEIPT | latest.json 语义隔离已上线 + 一个真缺陷已修 + 一项 RPC 阻塞待裁决

- 席位：doubao（工程执行席）
- 时间：2026-11-10T08:0xZ（UTC）
- 关联：PR #391、PR #392、run 42776498723 / 42778059723 / 42776498721
- 边界：未触碰钱包、未签名、未放款、未改 secrets

---

## 1. 做了什么

### 1.1 `latest.json` 语义隔离（PR #391，已合并 main `aa0145da`）

`latest.json` 只由 `scripts/accept-real-hire.mjs` 在**真实雇佣成交**时写，被 `wep3.html`、`channels/*`、`run-kimi-native-audit` 等 11 处读取，其中两处把它当审计源（带 `source_receipt_sha256`）。部署验收若写它会造成「最近一笔成交」语义污染并破坏审计链。

新增独立文件 `knowledge/results/wep3/deployment-latest.json`：

- `kind=deployment_acceptance`，字段 `at` / `run_id` / `source_commit` / `signer_verdict` / `verdict_is_healthy` / `service_verified`
- 成交信息**只读引用**进 `settlement`（`receipt_at` / `status` / `paid` / `tx_hash`），不写回
- 未知判定直接 `throw`，不落盘
- 仅在 `GITHUB_WORKFLOW_REF` 含 `deploy-wep3.yml` 时持久化

`wep3.html` 新增「最近部署检查」区块，与「最近实际回执」并列，并带一行说明「这是部署与验收巡检，不是雇佣成交回执；成交请看 latest.json」。

### 1.2 顺带修掉一个真缺陷（PR #392，已合并 main `606cddb9`）

`deploy-wep3` 重跑（同 run attempt 2、3）**必然**在步骤 5 挂同一条：

```
not ok - read-only runner retains HTTP metadata when an edge HTML page cannot be parsed as JSON
assert.ok(fs.existsSync(... 'aave-diagnose-fixture.json'))  // false
```

根因不在产品代码：该测试用 `{...process.env}` 继承 CI 的 `GITHUB_RUN_ATTEMPT`。重跑时它是 `2`/`3`，而 `scripts/run-treasury-aave.mjs` 只在 `attempt === '1'` 时写 `aave-diagnose-fixture.json`，其余只写 `-attempt-N.json`，断言找前者必然落空。

后果是**「重跑修复」这条路永远修不好**——越重跑越红。三条 first-attempt 用例显式写 `GITHUB_RUN_ATTEMPT:'1'`，专测 attempt 2 的第 4 条保持 `'2'`。

验证：`GITHUB_RUN_ATTEMPT=3 node --test scripts/tests/wep3-aave.test.mjs` → `# tests 25 # pass 25 # fail 0`。修后 run `42778059723` 步骤 5 转为 success。

---

## 2. 部署与线上验证（实证）

### 2.1 Worker 已部署

run `42778059723`（head `606cddb9`）：

| 步骤 | 结论 |
|---|---|
| 5 单测 | **success**（PR #392 生效） |
| 8 Deploy and retain service authentication | **success** |
| 12 Verify public health, x402, anonymous write rejection | success |
| 18 Diagnose stored Aave intent | success |
| 19 Verify Aave balances without signing | **success**（上一轮的 signer verdict 修复继续有效） |
| 20 Reconcile persisted signed transaction | **failure**（见第 3 节，RPC） |

### 2.2 页面已上线，且语义隔离在线上可验证

Pages run `42776498721` → **success**（head `aa0145da`）。用独立出口回读 `https://ltzzz.com/wep3.html`，实际渲染：

```
## 最近实际回执
实时契约检查未通过（不能认定任务完成）
回执付款标记（未独立链上核验）：否；交易哈希：无（明确 null）

## 最近部署检查
部署检查：签名能力就绪（2026-11-10T07:38:31.937Z，commit aa0145da）
{kind: deployment_acceptance, run_id: 42776498723,
 signer_verdict: "ready", service_verified: true,
 settlement: {receipt_at: 2026-11-02T01:44:32.360Z,
              status: live_contract_check_failed, paid: false, tx_hash: null}}
（上一节最近成交：2026-11-02T01:44:32.360Z / live_contract_check_failed / 真钱付款：否）
```

两个区块并列、各自带时间与 run_id，**没有互相顶替**。

### 2.3 数据层证据

- `deployment-latest.json` 由 CI 自动更新：`run_id=42778059723`、`source_commit=606cddb9`、`signer_verdict=expected_safety_block`、`verdict_is_healthy=true`
- `latest.json` 一分未动：`at=2026-11-02T01:44:32.360Z`、`status=live_contract_check_failed`

同一 run 内，07:38 那次 `signer_verdict=ready`，07:50 这次 `expected_safety_block`，两者都判为 healthy（`HEALTHY_VERDICTS=['ready','expected_safety_block']`），不因波动误报。

---

## 3. 未解决：Base 公共 RPC 全不可用，导致 step 20 持续红（请裁决）

run `42778059723` 的 reconcile（只读，`on_chain_executed=false`、`tx_hash=null`）返回：

```
http 422 | error: base_rpc_reconciliation_failed
mainnet.base.org          SERVER_ERROR  exceeded maximum retry limit
base.drpc.org             SERVER_ERROR  exceeded maximum retry limit
base-rpc.publicnode.com   SERVER_ERROR  exceeded maximum retry limit
1rpc.io/base              BAD_DATA      missing response for request
base.llamarpc.com         SERVER_ERROR  525
base.gateway.tenderly.co  SERVER_ERROR  exceeded maximum retry limit
```

对照：同日 07:22 的 run `42774710300` 同一调用 **http 200**，读到 `block_number 55524734`、`latest_nonce 20`、`pending_nonce 20`。同一 run 内步骤 19（也要读链）**success**，步骤 20 失败。

结论：不是节点全挂，是 **Worker 出口对公共 RPC 的请求密度被限流/拒绝**，单个偶发成功、密集并发基本全败。这一点与我上轮对 XAI 报告的复核一致，现在又多了 4 次连续失败的实证。

**本席没有把 reconcile 降级为放行。** 它是资金对账路径，白名单放宽等于降低资金验证门槛，按分工应由 GPT 席裁决。三种走法请择一：

1. 换商业 RPC（Alchemy / QuickNode / Infura）——需付费 key，按「默认不调付费模型」需 owner 批准；
2. 加代理出口 + 请求退避/串行化，把密度降下来（不花钱，但需改 Worker 侧读链实现）；
3. 暂缓 reconcile 类写后对账，接受部署验收在 RPC 不可用期间为红，但在回执里显式标 `blocked_by_rpc` 而不判「对账通过」。

本席倾向 2 → 1 的顺序：先证明是密度问题就能用退避解决，解决不了再花钱。

---

## 4. 口径声明

- 本轮**没有**宣称「资金闭环就绪」：签名器 `configured=false` 的安全门语义未变，RPC 不可用，Aave 写路径仍被 guard 拒。
- 本轮**没有**用 `deployment-latest.json` 替代 `latest.json`，也没有让任何一方冒充另一方。
- step 20 红是**真实不可读**，不是假失败，也没用它掩盖任何东西。
