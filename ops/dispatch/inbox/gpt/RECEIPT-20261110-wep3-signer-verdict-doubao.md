# 回执：WEP3 signer 验收假失败已修复并部署

**执行席**：豆包（qingqizhu6502@agent.qq.com）
**时间**：2026-11-10T07:21:20Z 合并 → 07:22 部署完成
**触发**：owner 指令「部署吧」

---

## 一、问题

`deploy-wep3` 每天报红，但部署本身是成功的。失败 run `42754740636`：

```
8  Deploy and retain service authentication  -> success
19 Verify Aave balances without signing      -> failure
```

## 二、根因（不是 RPC）

失败响应原文：

```json
{"ok":false,"status":"blocked_transaction_adapter",
 "configured":false,
 "configured_basis":"existing_legacy_guard_denies_transaction_adapter",
 "signed":false,"transactions":0,"on_chain_executed":false,
 "error":"base_rpc_read_failed","reason":"base_rpc_unavailable"}
```

`/market/aave/status` 返回的是**签名能力就绪度**，不是操作成败。安全门生效时返回 `ok:false`，含义是「门正常关着」。原代码把 `ok:false` 等同于服务失败，于是永久报红。

同 run 内 4 秒前的 Aave 读取是成功的（`base-rpc.publicnode.com ok:true`，读到 block 52841444），说明 RPC 是限流而非全挂；`error` 只是被顺带挂上去的字段。

## 三、修法（白名单 fail-closed，未放宽）

新增 `scripts/lib/signer-status-verdict.mjs`：

| 条件 | 判定 | 退出码 |
|---|---|---|
| `signed=true` / `transactions>0` / `on_chain_executed=true` | `unexpected_execution` | 失败 |
| HTTP 非 200 | `http_not_ok` | 失败 |
| schema 不符 | `schema_mismatch` | 失败 |
| `ok=true` | `ready` | 放行 |
| `status=blocked_transaction_adapter` 且无执行 | `expected_safety_block` | 放行（带出 `configured_basis`） |
| 其他 `ok=false` | `unknown_block` | 失败 |

真实执行与未知状态仍然失败，只是不再把「预期中的安全门」当成故障。

## 四、验证

测试：`node --test scripts/tests/signer-status-verdict.test.mjs` → **9/9 PASS**

部署 run `42774710300`（push main 自动触发，commit `68871e5d`）：

```
8  Deploy and retain service authentication        -> success
19 Verify Aave balances without signing            -> success
23 Alert failed deployment                         -> skipped
24 Save acceptance evidence                        -> success
job deploy -> success
```

步骤 19 的实际判定输出：

```json
{"action":"status","http":200,"service_verified":true,
 "signer_verdict":"expected_safety_block",
 "signer_expected_block":true,
 "signer_blocked_reason":"existing_legacy_guard_denies_transaction_adapter",
 "result":{"source_commit":"68871e5d1e7b2c459d544234cf8dd060314edfc0",
           "revision":"wep3-signer-status-v1","signed":false,"transactions":0,
           "on_chain_executed":false}}
```

Worker 的 `source_commit` 等于合并后的 main head，说明线上跑的确实是本次代码。

## 五、一处自我更正

我在给 owner 的口头判断里说「`latest.json` 因验收 exit 1 而停更」——**这句是错的**。

核实：本次验收提交 `c47bf7d7` 写入的是 `knowledge/results/wep3/42774710300.json` 等运行回执，**没有写 `latest.json`**。`latest.json` 只由 `scripts/accept-real-hire.mjs` 在**真实雇佣成交**时写入，与验收是否失败无关。

所以 `latest.json` 停在 2026-11-02 是**独立问题**（没有真实成交就不更新），不是本次假失败的后果。此更正一并留痕。

## 六、未做事项

- 未触碰钱包、签名、放款、退款、结算、投资
- 未改动 Aave 执行路径（`auto` / `supply` / `withdraw` 判定保持原样）
- 未放宽任何资金门
- 已知缺口：`scripts/lib/signer-status-verdict.mjs` 未加入 `deploy-wep3.yml` 的 `paths` 触发列表，本次靠 `scripts/run-treasury-aave.mjs` 已在列表内触发；后续单独补
- `latest.json` 停更问题未处理，待裁决是否让每日验收也更新该文件

——豆包执行席
