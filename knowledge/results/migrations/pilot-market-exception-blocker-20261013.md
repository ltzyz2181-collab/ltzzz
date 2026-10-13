# 1 USDC Pilot 阻塞证据：market_exception 持续（2026-10-13）

## 结论（如实报告，未伪报成功）

1 USDC supply 尚未执行、链上无任何试点交易；金库资金原封未动且安全。跨 **2 次 dispatch、6 次连续尝试**，worker 受限接口 `/market/aave/auto` 全部返回 `HTTP 500 {ok:false,error:"market_exception"}`，且每次在约 **40ms–1s 内**失败（远快于任何 RPC 往返），指向 worker 端**逻辑即时异常**而非网络超时。

## 时间线

| 时间 (UTC) | 事件 |
|---|---|
| 2026-10-13 10:05 | run 38380985712（旧 supply/withdraw workflow）：supply 抛 market_exception 500，intent `DOUBAO-AAVE-FIRST-38380985712` 被置为 active_intent（第 1 次 dispatch） |
| 2026-10-13 12:09 | d92ef71 推送后 GitHub 自动建的 push run 因 YAML 解析错误瞬间失败（已修复，见下） |
| 2026-10-13 12:18 | run 38396322543（auto workflow，第 2 次 dispatch）：migration 步 success（no-op）；**supply auto 步 5 次循环全部 `http:500 market_exception`**；exit/status/commit 步 skipped |

## 日志证据（run 38396322543，job 115292351141）

```
12:18:42.829 {"at":"...","execution_id":"38396322543","on_chain_executed":false,"tx_hash":null,"http":500,"result":{"ok":false,"error":"market_exception"}}
12:18:44.357 supply attempt 1 first_supply_confirmed=false
…（attempt 2–5 同样 500，间隔约 6s）…
##[error]Process completed with exit code 1.
```

6 次失败时间戳与失败模式完全一致；`on_chain_executed=false`、`tx_hash=null`——**链上从未广播任何交易**。

## 排除项（证据）

1. **认证不是问题**：若 X-Lab-Pin 无效应返回 `401 pin_required`；实测返回 500 而非 401 → runner 派生的 WEP3_RUNNER_TOKEN 与生产校验一致。
2. **RPC 大部分正常**（本地 ethers 6.17.0 直测，block≈52,552,499）：
   - mainnet.base.org：chainId OK、approve estimateGas=56240、supply estimateGas 抛"transfer amount exceeds allowance"（**无授权时的预期 revert，非故障**）、feeData OK、balance=2e15。
   - base.drpc.org：同上全部正常。
   - **base-rpc.publicnode.com（worker provider() 首选 RPC）：间歇性失效**——首轮脚本对该 RPC 的 chainId/balanceOf/estimateGas/feeData 全部无响应或静默失败，仅 blockNumber 偶发成功（372ms）。属次要风险。
3. **worker 状态读取正常**：GET /market/aave/status 实时返回 `usdc_raw=39013125、ausdc_raw=0、eth_raw=2000000000000000、allowance_raw=0、first_supply_confirmed=false、exit_test_confirmed=false、paused=false、active_intent="DOUBAO-AAVE-FIRST-38380985712"`。→ status 也走 provider()，证明 RPC 可达；execute 却瞬时失败。

## 根因分析（高置信）

worker 侧 `fetch()` 把 handle() 抛出的任何错误统一包装为 market_exception（wep3-market.js:34）。瞬时失败（<1s）只可能是 **RPC 之前的代码路径抛错**：

- `autoAave`（wep3-aave.js:111）：`if(book.aave?.active_intent){const i=book.aave.intents[book.aave.active_intent];return executeAave(...{intent_id:i.id,...})}` —— 若 **active_intent 存在但 intents[active_intent] 缺失/被清空**，`i.id` 立即 TypeError → 500。与 40ms 失败、status 正常、链上无交易全部吻合。
- 其余候选（provider 全挂、estimateGas 等）均需 ≥300ms 且与 status 正常矛盾。

即：**KV/DO 中存在指向缺失 intent 对象的 stale `active_intent`，autoAave 无防御性判断即崩溃**。intent 对象缺失可能源于 10:05Z 那次 market_exception 中断时 DO 存储落盘状态不一致。

## 修复选项（需总控/owner 拍板，均不涉及密钥）

- **A（推荐，最小改动）**：在 `wep3-aave.js` 的 `autoAave` 中加防御：`const i=book.aave.intents?.[book.aave.active_intent]; if(!i){book.aave.active_intent=null; await m.save(book);}` 后继续走新建 intent 路径；同时把 `provider()` 的 RPC 顺序改为 `mainnet.base.org → base.drpc.org → base-rpc.publicnode.com`（规避首选 RPC 间歇失效）。提交后经 deploy-wep3 workflow（id 372569597，dispatch 需要 PAT + workflow 权限）重新部署。
- **B**：新增临时 admin 端点 `POST /market/aave/clear-intent`（pin 校验）清 active_intent 并部署；后续可保留作运维口。
- **C（兜底，较重）**：重置该 Durable Object（market worker 的 `ltzzz-market-v1` DO storage），会清掉全部 book 状态，不推荐。

**操作方约束**：worker 端"清 active_intent"实际是 Durable Object storage（`state.storage.get('book')`），**无法经 Cloudflare REST 直接改**，必须走上述代码/端点路径；MainAgent 此前"用 CLOUDFLARE_API_TOKEN 清 KV"的表述在技术上需修正为上述路径。

## 现状（资金安全）

- 新金库 0x5df57a…32d（Base 8453，block 52,552,571 独立直读）：**USDC=39.013125、aUSDC=0、ETH=0.002**——迁移资金原封未动，worker gas 未消耗（无广播）。
- 旧 Vault 与 guardian 已归零（迁移回执 treasury-migration-local.json，4 tx 全 confirmed）。
- 后续：修复（选项 A/B）后重新 dispatch 本 workflow（auto 步骤按天幂等，新 intent 会走 `AAVE-AUTO-first_supply-<day>` 并完成首投 1U → 次日周期退出 1U）。
