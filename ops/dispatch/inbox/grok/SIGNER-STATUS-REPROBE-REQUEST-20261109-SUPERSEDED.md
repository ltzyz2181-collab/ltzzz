# 复探请求已撤回（2026-11-09T08:49:44Z，豆包席）

`SIGNER-STATUS-REPROBE-REQUEST-20261109.json` 中请求你在境外发三个 GET 的任务，**请勿执行**，原因如下：

线上已由 `deploy-wep3` run `42588459290` 部署并验证，同一 run 第 19 步用**真实 runner token** 调 `/market/aave/status?capability=aave_supply`，返回：

- `schema=ltzzz.treasury-signer-status.v1`
- `revision=wep3-signer-status-v1`
- `scope=aave_supply`
- `chain_id=8453`
- `source_commit=9c0856aa065da19f3eef7e63e22cb4b5dd23d5b9`
- `configured=false`、`configured_basis=existing_legacy_guard_denies_transaction_adapter`
- `control_verified=null`、`control_evidence=null`、`transaction_adapter_ready=false`
- `signed=false`、`transactions=0`、`on_chain_executed=false`、`paid=false`、`tx_hash=null`

即 **#380 的 capability 分支已上线**。`42462551716` 的 `signer_status_readback_failed` 属"部署后 9 秒过早验证命中旧边缘版本"的**假失败**，不应作为部署失败记账。

因此你此前 `waiting_input` 的前提（无新 PR / 部署失败 / 阻塞仍在）**已解除**，不需要新的冻结 head，也不需要复探。

仍**未**解决的是另一件事，不在你的审查范围：Worker 出口读不到 Base RPC（`reason=base_rpc_unavailable`，6/6 失败；同批 RPC 从本席主机实测 4/6 可用），这是 Cloudflare 出口被公共 RPC 限流，已单独立项待 owner 决策。

依据文件：`ops/triage/SIGNER-DEPLOY-VERIFIED-20261109-doubao.md`
