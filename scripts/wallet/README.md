# scripts/wallet — P0 只读账本与余额视图

P0 只处理**账本与观测**，不签名、不广播交易、不接触任何真实资金。

## 文件

| 文件 | 职责 |
| --- | --- |
| `core.mjs` | append-only 账本、精确十进制、链式哈希、派生余额、文件锁、幂等写入 |
| `rpc.mjs` | 只读 JSON-RPC 客户端；每个请求都经过 `lib/financial-exit-guard.js` 白名单 |
| `balance-view.mjs` | `--json` / 人类可读余额；链上不可读时明确 `unavailable`，供应商余额 `unverified` |
| `subscriptions.mjs` | 事件溯源式订阅 CRUD；`next_charge` 由注入时钟推导 |
| `adapters/index.mjs` | rail 注册表；P0 只允许只读适配器，写入能力一律 `not_adapted` |
| `selftest.mjs` | 合成账本自检 + 真实账本只读审计；失败非 0 退出 |
| `__tests__/` | `node:test` 覆盖幂等、冻结结算、篡改、未适配 rail、链上不可读 |

## 账本

默认路径：`agent-wallet/wallet/ledger.jsonl`（可用 `WALLET_LEDGER_PATH` 或 `--ledger` 覆盖）。

每行是一条规范 JSON 记录：

```json
{
  "v": 1,
  "type": "credit",
  "account": "agent:demo",
  "asset": "USDC",
  "amount": "5",
  "idempotencyKey": "demo-1",
  "at": "2026-11-16T00:00:00.000Z",
  "seq": 0,
  "prevHash": "0000000000000000000000000000000000000000000000000000000000000000",
  "intentHash": "…",
  "hash": "…"
}
```

- 余额**从不落盘**，只由流水求和。
- 金额必须是十进制字符串，内部用 18 位小数的 BigInt 计算；不接受浮点数。
- `hash = sha256(canonicalJson(record without hash))`；每条记录的 `prevHash` 指向上一条。
- 写入前会校验整条链；链坏则拒绝追加。
- 追加使用 `.lock` 文件串行化，并 `fsync`。
- 同一 `idempotencyKey` 重放且业务字段一致：只返回原记录，不写入；业务字段不一致：`idempotency_conflict`。
- 只读审计可用 `verifyChain({expectedHead})` 固定链头；仅靠链本身无法发现“尾部被整段删除”，需要外部锚点。

事件类型：

- 资金：`credit`、`debit`、`freeze`、`unfreeze`、`settle`
- 订阅：`subscription.created`、`subscription.updated`、`subscription.paused`、`subscription.resumed`、`subscription.canceled`、`subscription.deleted`

## 命令

```bash
node --test scripts/wallet/__tests__
node scripts/wallet/selftest.mjs
node scripts/wallet/selftest.mjs --json
node scripts/wallet/balance-view.mjs --account agent:demo --json
node scripts/wallet/balance-view.mjs --account agent:demo --no-onchain --json
```

`balance-view` 的链上部分只调用白名单内的读方法（`eth_getBalance`、`eth_call`、`eth_chainId` 等）。没有 RPC、RPC 失败或返回值非法时：

```json
{
  "onchain": {"status": "unavailable", "reason": "…"},
  "onchain_status": "unavailable",
  "provider": {"balance": null, "balance_source": "unverified", "status": "unverified"}
}
```

不会把不可读的链上余额写成 0。RPC 成功返回 `0x0` 时才会出现 `"wei": "0"`。

## 安全边界

- 不读取私钥，不构造签名，不发送交易。
- 所有 RPC 出站请求都经过 `lib/financial-exit-guard.js` 的 `assertReadOnlyRpc` / `assertReadOnlyRpcBody`；未修改该文件。
- 适配器注册表拒绝声明 `charge` / `settle` / `refund` 的适配器；`attemptCharge` / `attemptSettlement` 在触碰账本之前直接抛 `not_adapted`。
- 订阅的 `rail` 只有 `internal`（账本内计划）或已注册的只读适配器可用；未注册 rail 在创建/更新时直接 `not_adapted`。
- 供应商余额在 P0 永远是 `balance_source: "unverified"` 且 `balance: null`。

## 已知边界

- 账本只防篡改，不防“整段尾部回滚”；需要外部 head 锚点或定期快照。
- 订阅只生成计划与 `next_charge`，不执行扣款。
- `internal` rail 仅表示账本内计划，不代表任何外部支付渠道。
