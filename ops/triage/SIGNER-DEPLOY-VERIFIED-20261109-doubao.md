# signer status 部署验证结论 2026-11-09（豆包席）

**覆盖前一份 `SIGNER-DEPLOY-STATUS-20261109-doubao.md` 中的"未验证"状态。本文件为结论版。**

## 1｜部署已真实成功
run `42588459290`（workflow `deploy-wep3`，workflow_dispatch，2026-11-09T08:49:44Z 前后）：

| 步骤 | 结果 |
|---|---|
| Snapshot current durable book | success |
| **Deploy and retain service authentication** | **success** |
| **Verify current durable runtime and preserved financial history** | **success** |
| Observe atomic readiness | success |
| **Verify public health, x402, and anonymous write rejection** | **success** |
| Verify external buyer portal, schema and legacy payment isolation | success |
| Diagnose stored Aave intent | success |
| **Verify Aave balances without signing** | **failure（见下，真实故障）** |
| Fulfill at most one paid customer order | success |
| Save acceptance evidence | success |

## 2｜signer status 线上已验证通过（决定性证据）
同一 run 第 19 步的日志里，脚本用**真实 runner token** 调线上 `/market/aave/status?capability=aave_supply`，实际响应：

```json
{"ok":false,"schema":"ltzzz.treasury-signer-status.v1","revision":"wep3-signer-status-v1",
 "scope":"aave_supply","chain_id":8453,
 "source_commit":"9c0856aa065da19f3eef7e63e22cb4b5dd23d5b9",
 "configured":false,"configured_basis":"existing_legacy_guard_denies_transaction_adapter",
 "control_verified":null,"control_evidence":null,"transaction_adapter_ready":false,
 "status":"blocked_transaction_adapter","signed":false,"transactions":0,
 "on_chain_executed":false,"paid":false,"tx_hash":null,
 "error":"base_rpc_read_failed","reason":"base_rpc_unavailable"}
```

**契约字段全部有值**：schema / revision / scope / chain_id / configured / configured_basis / control_verified / control_evidence / transaction_adapter_ready / status / signed / transactions / on_chain_executed / paid / tx_hash。
`source_commit` = `9c0856aa`，正是本次部署的 main tip。

**⇒ #380 的 capability 分支确认已上线并正确返回。**

## 3｜11-08 的"回读失败"是假失败，已证伪
- `42462551716`：deploy success，verify failure，两者间隔 **9 秒**，回执字段全 null。
- 现在同一端点、同一鉴权路径返回完整字段 ⇒ 当时读到的是**尚未切换的旧版本边缘节点**。
- 故 `signer_status_readback_failed` **不应作为"部署失败"记账**；它是一次过早验证。
- XAI 的 `waiting_input` 前提（"部署失败、阻塞仍在"）**不再成立**，已撤回复探请求（见 `SIGNER-STATUS-REPROBE-REQUEST-20261109-SUPERSEDED.md`）。

## 4｜唯一真实故障：Worker 读不到 Base 链
同一次响应里 `reason=base_rpc_unavailable`，6 个 RPC 全部失败：`exceeded maximum retry limit` / `BAD_DATA` / `server response 525`。

**本席从深圳主机对同一批 RPC 实测（eth_blockNumber）**：

| RPC | 本机实测 |
|---|---|
| https://mainnet.base.org | **OK**（区块 0x3490bbb） |
| https://base.drpc.org | **OK**（0x3490bc0） |
| https://base-rpc.publicnode.com | **OK**（0x3490bc4） |
| https://base.gateway.tenderly.co | **OK**（0x3490c40） |
| https://1rpc.io/base | FAIL（forbidden） |
| https://base.llamarpc.com | FAIL（空响应） |

**4/6 从本机可用，6/6 从 Cloudflare Worker 不可用** ⇒ 不是 RPC 停机，是 **Worker 出口被这些公共 RPC 限流/拒绝**。

影响：`/market/aave/status` 的余额部分 `ok:false`，Aave 资金链路读不到链上状态；这也是 `deploy-wep3` 每日调度自 11-07 起连续失败的根因（每次都卡在这一步）。

处置建议（需 owner 决策，涉及开通账号）：
1. 用带 key 的商业 RPC（Alchemy / QuickNode / Infura）作为 Worker 首选，公共节点降为兜底；
2. 或给 Worker 加一层自建代理出口；
3. 两者都要保留"读不到链 ⇒ 明确 ok:false + reason"，不得降级为假装有余额。

## 5｜边界
本轮：零资金、零签名、零上链、零模型调用。部署为 `deploy-wep3` 既有常规通道（该 workflow 本就每日调度），未新建 workflow、未改 secrets。
