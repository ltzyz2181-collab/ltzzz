# LTZZZ 新金库「受限执行接口」深度核验报告

- 核验时间：2026-10-13（UTC）约 09:28Z / 本地 UTC-7 02:28
- 核验对象：Cloudflare Worker `ltzzz-wep3`（Base 链 eip155:8453）的受限 Aave 执行接口
- 生产端点：`https://ltzzz-wep3.ltzyz2181.workers.dev`
- 目标金库 EOA：`0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d`
- 源码基线：origin/main（本地临时导出 `C:\Users\李天柱\AppData\Local\Temp\ltzzz-main-20261013\`），非旧版本地工作区
- 核验方式：全程只读。未签名、未广播交易、未移动资金、未调用任何写接口；未读取任何密钥文件，未在 git 历史中搜索私钥。

---

## 0. 结论速览

| 核验项 | 结论 | 关键证据 |
|---|---|---|
| 受限执行接口是否已部署 | **是** | 源码 commit（`wep3-aave.js`）→ deploy-wep3 run `38232625942` conclusion=success → 生产端点实测返回 200，证据链闭合 |
| 认证门是否生效 | **是** | 全部 admin 端点在无 `X-Lab-Pin` 时返回 **HTTP 401 `pin_required`** |
| 身份签名是否可验证 | **是** | ethers `verifyMessage` 恢复地址 = `0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d`（大小写不敏感匹配） |
| 金库当前余额 | **全 0** | `usdc_raw=0`、`ausdc_raw=0`、`eth_raw=0`、`allowance_raw=0`、`principal_raw=0` |
| 是否存在 supply/redeem 之外的接口 | **否** | 源码 `buildAavePlan` 仅允许 `supply`/`withdraw`，且拒绝任意参数、任意接收地址 |
| 带认证（真实 pin）行为 | **未验证** | 无 `CLOUDFLARE_API_TOKEN`/pin，按约束跳过；该行为将在真实 workflow 运行中验证 |

---

## 1. 身份签名验证（ethers 6.17.0）

使用临时目录本地安装的 `ethers@6.17.0`（未全局安装），对生产 `GET /market/treasury` 实时返回的 `message + signature` 做 `verifyMessage`（等价于 `recoverAddress`）。

- 被签消息：`LTZZZ controlled treasury v1 | eip155:8453 | 0x5df57a78e0a13df2ae983bdad69cfcbd3dd7a32d`
- 签名：`0x17cc457b7b7911b175af426097e1b381f900f8490152cf09072e94d56f0a4a830140b8d815bcc30e99d373644adf07b89cea57a5de80751488fa86509ce41f201b`
- **恢复地址（recovered_address）：`0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d`**
- 期望地址：`0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d`
- 大小写不敏感匹配：**true**

结论：该签名确由持有金库 EOA 私钥者签发，Worker 声称的 `controlled:true` 在密码学上成立。私钥本身从不离开 Worker Secret（见第 5 节）。

源码佐证（`wep3-agents.js` `treasuryProof`）：Worker 用 `new Wallet(env.TREASURY_EXECUTOR_KEY)` 重算地址，与 `env.X402_RECEIVE_ADDRESS` 比对一致后，用 `w.signMessage(message)` 签名并仅返回 `message/signature`，字段 `private_key_storage:"Cloudflare Worker Secret"`。

---

## 2. 端点逐条探测（无认证，只读）

探测脚本使用 Node 22 内置 `fetch`，未携带任何 `X-Lab-Pin`。POST 请求因在 admin 门即被 401 拒绝，**未触达任何资金操作逻辑**。

| 端点 | 方法 | HTTP 状态 | 响应关键字段 |
|---|---|---|---|
| `/health` | GET | **200** | `ok:true, service:"ltzzz-wep3", version:"1.1.0"` |
| `/market/treasury` | GET | **200** | `ok:true, controlled:true, address:0x5df5…7a32d, network:eip155:8453, private_key_storage:"Cloudflare Worker Secret", on_chain_wages_enabled:false` |
| `/market/aave/status` | GET（公开） | **200** | `ok:true, chain_id:8453, usdc_raw:"0", ausdc_raw:"0", eth_raw:"0", allowance_raw:"0", principal_raw:"0", interest_raw:"0", principal_basis:"no_position", first_supply_confirmed:false, exit_test_confirmed:false, paused:false, active_intent:null, limit_policy:"pilot_until_exit_test", capital_agent:"DeepSeek", capital_reputation:105, allocation_share_bps:0, single_cap_usdc:20, exposure_cap_usdc:100, cash_floor_raw:"5000000", withdraw_receiver:0x5df5…7a32d, owner_return_enabled:false` |
| `/market/aave/intent?id=DOUBAO-AAVE-FIRST-20261012-0000000001` | GET（需 admin） | **401** | `{"ok":false,"error":"pin_required"}` |
| `/market/aave/preview` | POST（需 admin） | **401** | `{"ok":false,"error":"pin_required"}` |
| `/market/aave/auto` | POST（需 admin） | **401** | `{"ok":false,"error":"pin_required"}` |
| `/market/aave/pause` | POST（需 admin） | **401** | `{"ok":false,"error":"pin_required"}` |
| `/market/aave/execute` | POST（需 admin） | **401** | `{"ok":false,"error":"pin_required"}` |
| `/market/runner/readiness` | GET（公开） | **200** | `ok:true, authenticated:false, runner_configured:true, runner_type:"string", supplied_length:0, runner_length:64` |

认证门源码（`wep3-market.js` `admin()`）：仅当请求头 `X-Lab-Pin` 同时等于 `env.LAB_PIN` 或 `env.WEP3_RUNNER_TOKEN` 时放行；`/market/aave/status` 为公开只读，`/market/aave/intent` 与四个 `/market/aave/*` POST 全部先过 `admin()` 门，否则 `reply({ok:false,error:"pin_required"},401)`。`runner_length:64` 表明 Runner Token 已配置（64 字符），但未携带时 `authenticated:false`，门控生效。

---

## 3. 生产回执链（knowledge/results/wep3/aave-*.json）

回执文件名中的数字即触发该次部署/检查的 GitHub run id。自 2026-10-12 部署以来共 13 份 `aave-*.json`，时间线如下（全部 `on_chain_executed:false`、`tx_hash:null`、余额全 0）：

| 回执文件 / run id | 时间 (UTC) | HTTP | 结果摘要 |
|---|---|---|---|
| aave-38232625942 | 2026-10-12T09:52:14Z | 500 | 首次部署即遇 `market_exception`（部署刚生效的瞬时异常） |
| aave-38232918737 | 2026-10-12T09:55:12Z | 200 | `ok:true`，状态快照，全 0 |
| aave-38233218696 | 2026-10-12T09:57:47Z | 200 | `waiting_USDC_deposit`，`signed:false` |
| aave-38271358272 | 2026-10-12T15:35:59Z | 200 | `waiting_USDC_deposit` |
| aave-38328912543 | 2026-10-13T00:47:04Z | 200 | `waiting_USDC_deposit` |
| aave-38329423887 | 2026-10-13T00:53:14Z | 200 | `waiting_USDC_deposit` |
| aave-38329423988 | 2026-10-13T00:53:49Z | 200 | 状态快照，全 0 |
| aave-38340221267 | 2026-10-13T03:08:36Z | 200 | 状态快照，全 0 |
| aave-38342656768 | 2026-10-13T03:42:53Z | 200 | 新增 `limit_policy:"pilot_until_exit_test"`, `capital_agent:"DeepSeek"`, `capital_reputation:100`, `cash_floor_raw:"5000000"` |
| aave-38343511497 | 2026-10-13T03:50:15Z | 200 | 同上，全 0 |
| aave-38343907894 | 2026-10-13T03:55:26Z | 200 | `capital_reputation:105`，全 0 |
| aave-38344222916 | 2026-10-13T04:00:44Z | 200 | 全 0 |
| **aave-38351471044（最新）** | **2026-10-13T05:27:53Z** | **200** | `ok:true`，全 0，`capital_reputation:105` |

结论：自 2026-10-12T09:55Z（RPC 修复后）起，接口持续在线、状态高度一致（始终 `waiting_USDC_deposit`/全 0、`first_supply_confirmed:false`、`paused:false`、无 active_intent）。唯一一次 500 为首次部署瞬时异常，已由紧随其后的修复运行消除。期间无任何 `on_chain_executed:true` 或 `tx_hash`，即从未真正上链移动资金。

---

## 4. GitHub Actions 部署证据（公开 REST API）

仓库 `ltzyz2181-collab/ltzzz`（公开）。workflow **「Deploy LTZZZ WEP3」**（`.github/workflows/deploy-wep3.yml`，workflow id `372569597`），匿名 API 未触发限流（`x-ratelimit-remaining≈50`）。

引入 `wep3-aave.js` 的部署运行：

- **run id `38232625942`**（run_number 54），event=`push`，**conclusion=`success`**，created `2026-10-12T09:51:51Z`（= UTC-7 02:51，与任务所述「02:5x 附近」吻合）。
  - head commit message：**「Deploy bounded Base Aave treasury signer with persisted idempotent execution」**（即任务所述 commit `0e38162`）。
  - 运行地址：https://github.com/ltzyz2181-collab/ltzzz/actions/runs/38232625942

紧随其后的修复运行：

- **run id `38232918737`**（run_number 55），event=`push`，**conclusion=`success`**，created `2026-10-12T09:54:36Z`，message「Fix Cloudflare-native Aave RPC transport and fail-closed provider errors」。此后生产状态稳定 200。

最近一次触及 aave 状态的运行：

- **run id `38351471044`**（run_number 62），event=`push`，**conclusion=`success`**，created `2026-10-13T05:27:26Z`，message「Fix live AGI Pay URL and add verified deployment credit closeout」——对应最新回执 `aave-38351471044.json`。

补充（如实记录）：run_number 63（`38351479051`）与 64（`38351655128`）为 `workflow_dispatch` 手动触发，conclusion=`failure`，时间在 05:27–05:29Z，晚于最后一次成功推送部署（62）。失败发生在手动 dispatch 的其他步骤，**不影响已成功部署的生产端点**——本报告第 2 节对生产端点的实时探测（200/401 均符合预期）即为端点健康的直接证据。

---

## 5. TREASURY_EXECUTOR_KEY 配置/写入机制（仅描述机制，不含任何密钥值）

源码：`scripts/provision-wep3-treasury.mjs`（origin/main）。机制要点：

1. 脚本先 `GET /market/treasury` 探测；若已存在受控金库且 `verifyMessage(message, signature)` 恢复地址与 `address` 一致，则**复用既有金库、不覆盖**（`existing_controlled_treasury_reused`）。
2. 仅当尚未配置时，才从环境读取 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`（由 GitHub workflow secrets 注入，脚本本身不硬编码、不打印）。
3. 调用 `Wallet.createRandom()` 生成新签名钱包，将 `{TREASURY_EXECUTOR_KEY:<私钥>, X402_RECEIVE_ADDRESS:<地址>, X402_LIVE:"1"}` 写入一个 `0600` 权限的临时 JSON，随即执行 `npx wrangler secret bulk <临时文件> -c wrangler.wep3.toml` 批量写入 Cloudflare Worker Secret，**`finally` 中立即删除临时文件**。
4. 写入后轮询 `/market/treasury`，用 `verifyMessage` 复核 Worker 恢复地址 == 生成钱包地址，得到 `provisioned_and_signature_verified`。
5. 全程私钥只在「GitHub runner 内存 → Worker Secret」之间传递：脚本仅输出地址、`controlled`、`tx_hash` 等非敏感字段到 `knowledge/results/wep3/treasury-<runid>.json`，**从不回显私钥**。

本核验未执行该脚本的任何写入步骤，仅阅读源码。

---

## 6. 受限执行面分析：是否存在 supply/redeem 之外的接口

源码 `wep3-aave.js` `buildAavePlan`（第 17–34 行）与 `executeAave`（第 51–108 行）共同构成唯一上链路径：

- **参数白名单**：仅接受 `intent_id`、`action`、`amount_usdc` 三个键；出现任何其他键即抛 `arbitrary_transaction_parameters_forbidden`（第 18、52 行）。
- **动作白名单**：`action` 仅允许 `supply` 或 `withdraw`（第 19 行 `!['supply','withdraw'].includes(input.action)`）。无 borrow、无 repay、无任意转账、无 approvals 到任意第三方（approve 仅指向 Aave Pool）。
- **接收地址硬编码**：`withdraw` 的 `to` 恒为金库自身地址（`withdraw(AAVE.usdc, amount, address)`，第 33 行）；`withdraw_receiver` 公开状态亦恒为 `0x5df5…7a32d`，`owner_return_enabled:false`。
- **额度护栏**：试点期（`exit_test_confirmed=false`）单笔上限 20 USDC、敞口上限 100 USDC、首笔必须恰好 1 USDC、现金地板 5 USDC、日/周/月周期上限、每小时 6 笔、gas 上限等；超界即 `blocked_policy` 拒绝。
- **幂等**：同一 `intent_id` 复用已存步骤与状态，避免重复广播。

路由面（`wep3-market.js`）与 aave 相关的仅：`GET /market/aave/status`（公开只读）、`GET /market/aave/intent`（admin，查 intent）、`POST /market/aave/{auto,pause,preview,execute}`（admin）。其中 `pause` 仅切换 `book.aave.paused` 布尔位，不移动资金；`preview` 不签名不上链；`auto` 只是按状态机驱动 supply/withdraw。**不存在任何 supply/redeem（withdraw）之外的资金出口**。

---

## 7. 核验边界与未决项

- 未做「带正确 pin」的认证探测：本环境无 `LAB_PIN`/`WEP3_RUNNER_TOKEN`/`CLOUDFLARE_API_TOKEN`，按约束跳过。带认证后的真实签名/上链行为（尤其首笔 1 USDC supply → exit withdraw）将在真实 deploy-wep3 workflow 运行中验证。
- 未读取/接触 `ltzzz-secrets.md`，未在 git 历史检索私钥；报告中不含任何密钥、助记词或 token 值。
- 除本报告文件外，未修改仓库任何文件。

---

*核验脚本（临时目录，未入库）：`probe.mjs`（端点探测+签名恢复）、`gh.mjs`（GitHub Actions 只读查询）。*
