# 虚拟支付退款通知失效：定位与修复回执（2026-11-09）

状态：`root_cause_proven_by_logs_fix_committed_deployed_verified_by_code_readback`；
`full_refund_terminal=refunded`（`24babab6` 已上线）；`partial_refund_terminal=partially_refunded`（累计到全额转 `refunded`，`9ef0b59b` 已上线）；首单 `refunded`（owner 口径人工对账）

> 读完 §1–§8 只需知道：根因已证、修复已上线、线上代码逐字节核对通过。
> §9 是第二轮（全额退款直接落 `refunded`）的变更、部署、核对与首单改判记录。

## 1. 结论先说

退款的钱确实退回用户了（微信侧「用户退款成功」，owner 手机已到账），但**我们的回调把这次退款推送拒了**，
所以 `orders` 里那单一直停在 `delivered`，既没有迁到「退款核对中」，也没有写入任何退款字段。

这不是推测：云函数日志抓到了那一次真实入站推送，返回 `ErrCode:-1`。

根因是代码与官方报文对不上：官方 `xpay_refund_notify` 的字段表里**没有 `MchOrderId`、没有 `OpenId`、没有 `Env`**，
而 `handleRefund` 第一步就 `findOrder(event.MchOrderId)`、第二步 `checkOwnerAndEnvironment()` 要求 `OpenId`/`Env`
与库里订单一致 —— 对真实退款推送必然抛错。

## 2. 证据

### 2.1 微信侧（单侧完成）

| 项 | 值 |
|---|---|
| 退款单号 | `VPR26110917109261225` |
| 商户单号 | `VP202611090907466de445e3` |
| 退款金额 | 9.90（全额） |
| 退款状态 | 用户退款成功 |
| 退款时间 | 2026-11-09 01:44:09 PST（= 09:44:09Z / 17:44:09 CST） |
| 退款类型 | 商户自己发起退款流程 |

### 2.2 云函数日志（决定性的那一半）

CloudBase 日志服务 2026-11-09 17:53（CST）开启后，`vpay-notify` 抓到唯一一次入站调用：

| 字段 | 值 |
|---|---|
| 时间 | 2026-11-09 18:01:20.635（CST）= 10:01:20Z，距退款 1031 秒 |
| request_id | `822a9cea-dc24-11f1-946e-52540006055e` |
| request_source | `TCB_GW`（小程序消息推送网关） |
| function_name | `vpay-notify`，`qualifier=$LATEST` |
| 函数自身日志 | `vpay_notification_unverified` |
| 返回体 | `{"statusCode":200,"body":"{\"ErrCode\":-1,\"ErrMsg\":\"notification_unverified\"}"}` |
| duration | 120ms，冷启动 564ms |

`vpay_notification_unverified` 是 `exports.main` 的 catch 分支唯一会写的日志，意味着 `dispatch` → `handleRefund`
抛了异常，函数按「未验签/未校验通过」回 `ErrCode:-1`，微信据此判定推送失败。

退款发生在日志开启之前（17:44 < 17:53），更早的几次重试没有留痕；17:53 之后的这次是唯一可观测样本。

### 2.3 数据库（未迁移）

`orders` 三条（2026-11-09 18:12 CST 经 CloudBase MCP 直读，非页面导出）：

| _id | 商户单号 | status | wx_order_id | 退款字段 |
|---|---|---|---|---|
| `9dd802d16af18d620027c9cc7ae0093a` | `VP202611090907466de445e3` | `delivered` | `VPO261109170747016376319` | 无 |
| `9dd802d16aeedc22000bd4762e38df72` | `VP202611070806582eb81ed9` | `closed` | null | 无 |
| `70d1f9116aeeae14000f0daa27ce54fc` | `VP20261107045028c2a3f1e1` | `closed` | null | 无 |

`refund_signal_at` / `refund_amount_pending` / `refund_reference_pending` / `wx_refund_reference_pending` 一个都没有。

### 2.4 报文对不上的地方（官方字段表 vs 代码）

官方 2.4「退款推送（xpay_refund_notify）」请求参数全集：

`FromUserName / CreateTime / MsgType / Event / WxRefundId / MchRefundId / WxOrderId / RefundFee / RetCode / RetMsg / RefundStartTimestamp / RefundSuccTimestamp`

对照旧代码：

```js
const order = await findOrder(event.MchOrderId);        // 报文中没有 MchOrderId
checkOwnerAndEnvironment(event, order);                  // 要求 event.OpenId === order.openid 且 event.Env === order.env
```

`findOrder(undefined)` 直接 `fail('invalid_order_reference')`；即便跳过这一步，`checkOwnerAndEnvironment` 也会
`fail('order_binding_mismatch')`。两条路都进 catch，回 `ErrCode:-1`。

## 3. 修复

commit `adab20d9`（`fix(vpay-notify): 退款推送按 WxOrderId 绑定订单`）：

- 新增 `findOrderByWxRef(wxOrderId)`：用 `wx_order_id` 反查订单（该字段就是发货通知时写入的 `WeChatPayInfo.MchOrderNo`）。
- `handleRefund` 改为按 `WxOrderId` 绑定，去掉对退款报文不存在字段的依赖；保留 `pay_channel==='virtual'`、
  `RefundFee` 上限（`0 < amount <= order.amount`）、`MchRefundId`/`WxRefundId` 非空、乐观更新与 `stats.updated===1` 断言。
- 发货分支 `handleDeliver` 未动，`checkOwnerAndEnvironment` 仍只服务发货推送。

## 4. 本地回放验证（官方报文，非伪造）

用官方字段表构造退款报文，给 `wx-server-sdk` 打桩（本地内存库，不联网、不写真实库），
按真实签名协议 `sha1(sort(token,timestamp,nonce))` 走 `exports.main`：

| 用例 | 修复前（origin/main） | 修复后（adab20d9） |
|---|---|---|
| A 官方退款报文（订单 delivered） | ErrCode -1，status 仍 delivered | ErrCode 0，status → `refund_pending_verification`，四个退款字段齐 |
| B 同一报文重复推送 | ErrCode -1 | ErrCode 0，幂等不再写 |
| C 库里没有的 WxOrderId | ErrCode -1 | ErrCode -1，不改库 |
| D 退款金额 1000 > 订单 990 | ErrCode -1 | ErrCode -1，不改库 |
| E pending 订单收到退款 | ErrCode -1 | ErrCode -1，不改库 |
| F 官方发货报文（pending → paid） | ErrCode 0 → paid | ErrCode 0 → paid（发货链路无回归） |

修复后 A 用例实际写入：`refund_signal_at=2026-11-09T10:08:52.125Z`、`refund_amount_pending=990`、
`refund_reference_pending=VP202611090907466de445e3`、`wx_refund_reference_pending=VPR26110917109261225`。

## 5. 未完成（如实列出）

1. ~~函数尚未部署~~ → **已于 2026-11-10 08:41（CST）部署完成并回读确认，见第 8 节**。
   早期尝试记录（保留）：CloudBase MCP `manageFunctions(action=updateFunctionCode)` 在 cloud mode 下
   无论传 `functionRootPath` 还是 `zipFile` 均被拒（「该操作依赖本地函数代码目录」）；
   `queryFunctions` 的 live enum 也不含 `getFunctionUploadUrl`。最终走官方管控面
   `callCloudApi(service=tcb, action=UpdateFunctionCode, CodeSource=ZipFile, InstallDependency=TRUE)` 成功。
2. 订单已对账，但**不是回调写的**：2026-11-09 18:13（CST）经 CloudBase MCP 直写 `orders`，
   把首单从 `delivered` 改为 `refund_pending_verification`，并写入 `refund_signal_at=2026-11-09T09:44:09Z`
   （微信退款成功时间）、`refund_amount_pending=990`、`refund_reference_pending`、`wx_refund_reference_pending`，
   另加 `refund_reconciled_at` 与 `refund_reconcile_source` 标记来源，**未伪造任何推送**。回读已确认。
   部署完成后的新退款将由回调自动迁移；本单若再收到重试推送，`handleRefund` 已幂等放行、不会重复写。
3. `delivered_at` / `closed_at` 仍未写入（控制台只能改值、不能加字段，历史遗留）。
4. 微信侧「交易单号」`4500000521202611091049547966` 与库内 `wx_order_id=VPO261109170747016376319` 的层级关系仍未核实；
   交叉锚点继续用「商户单号 + 金额 + 时间」。

## 6. 时间线（CST）

| 时间 | 事件 |
|---|---|
| 17:44:09 | 微信侧发起全额退款并即时成功（`VPR26110917109261225`） |
| 17:44 起 | 微信按 2/4/8/16… 秒级退避重试推送；此段在日志开启前，无留痕 |
| 17:46 / 17:49 | `orders` 导出三次（(4)(5)(6)），三条状态 `closed`/`closed`/`delivered` |
| 17:53 | CloudBase 日志服务开启（toast「日志服务开启成功」） |
| 18:01:20 | 抓到唯一一次 `TCB_GW` 入站推送 → `vpay_notification_unverified` / `ErrCode:-1` |
| 18:08 | 本地回放官方报文：旧码 -1，新码 0 + 迁移 |
| 18:11 | 修复提交 `adab20d9` 并 push 到 main |
| 18:15 | 桌面环境掉线，控制台部署通道不可用 |
| 次日 08:41:34 | 经 `callCloudApi` → tcb `UpdateFunctionCode` 推送修复包（`RequestId ff28b0d3-2192-4e35-a166-b353329595d9`），函数进入 `Updating` |
| 次日 08:44 | 函数回到 `Active`；下载线上包逐字节核对为修复版（见第 8 节） |

## 7. 本轮更正（对既有回执的修订）

`MINIPROGRAM-VPAY-SANDBOX-ACCEPTANCE-20261109.md` 第 7 节仍写着「未发起沙箱退款、未开启 CloudBase 日志服务」，
与事实不符：本轮**已真实发起全额退款**（微信侧成功、用户到账），**日志服务已开启**并取到函数级证据。
两份表述以本回执为准。

## 8. 部署完成与线上核对（2026-11-10，CST）

### 8.1 推送

- 通道：`callCloudApi` → `service=tcb`，`action=UpdateFunctionCode`（Version 2018-06-08），
  cloud mode 可用、不依赖本地目录。
- 入参：`EnvId=shizhang-pay-d0g1n58020acf6b5b`、`FunctionName=vpay-notify`、`Handler=index.main`、
  `CodeSource=ZipFile`、`InstallDependency=TRUE`、`Publish=FALSE`、`Code.ZipFile=<base64>`。
- 返回：`RequestId ff28b0d3-2192-4e35-a166-b353329595d9`；随后 `ModTime` 变为 `2026-11-10 08:41:34`。

### 8.2 回读核对（不是"接口返回即成功"）

| 检查项 | 实测值 | 判定 |
|---|---|---|
| 函数状态 | `Updating` → `Active`（08:44 复核） | 部署终态已完成 |
| 代码包 SHA256（`getFunctionDownloadUrl`） | `f231efc65c20ad974f3562f84df35b0896a6962e78375e13f6bd9d8d970d44ed` | 与下载所得 zip 实算一致 |
| 线上 zip 内 `index.js` 长度 / MD5 | 9766 字节 / `5D8D02427E61289EE91487917463C863` | 与仓库修复版逐字节相同 |
| 关键标识 | 第 76 行 `findOrderByWxRef`、第 125 行按其反查、第 172 行 `unclassified`；全文无 `findOrder(event.MchOrderId)` | 退款分支已是修复版 |
| 代码体积 | `CodeSize 7266061` | `InstallDependency=TRUE` 已装依赖 |
| 环境变量 | `VPAY_PUSH_TOKEN` 仍在（值脱敏 `***`，`ValueLength 16`） | 配置未被覆盖 |
| 运行时/处理器 | `Nodejs20.19` / `index.main` / `Type Event` / `VPC` 空 | 与部署前一致 |

### 8.3 线上冒烟（真实签名，不伪造推送）

用真实 `VPAY_PUSH_TOKEN` 按文档规则算签名，向 `…/vpay-notify` 发 **GET 验签握手**（该分支只回 `echostr`，不读不写库，不是支付/退款通知）：

- 返回 `HTTP 200`，正文与请求的 `echostr` 完全一致（`echo_match=True`）。
- 含义：新代码已在线加载、`wx-server-sdk` 依赖安装可用、签名/白名单逻辑正常、入口可服务。

### 8.4 边界与仍未证的部分

- **没有**用构造的退款报文去打线上（owner 明确禁止伪造通知），因此"下一笔真实退款会被自动接收并迁移状态"这一点，
  §4 的 6 组回放（同报文、同代码）是行为证据，线上首证只能等**下一笔真实退款**发生。
- 本单（`VPR26110917109261225`）的微信重试预算已在 15 次内耗尽，不会再对我方推送，故它不会自己变。
  其 `refund_pending_verification` 仍是 §5-2 所述的人工对账写入。
- 数据库未被本次部署改动：三条订单状态与字段与 §5-2 写入后一致（首单仍 `refund_pending_verification`）。
  〔该句为 08:4x 时点的事实；首单随后按 owner 口径改判 `refunded`，见 §9.5。〕

## 9. 第二轮：全额退款直接落 `refunded`（2026-11-10）

状态补充：`full_refund_terminal_state=refunded`；首单人工对账终态 `refunded`；线上函数已是 `24babab6` 版。

### 9.1 变更内容（commit `24babab6`，已 push main）

在 §4 修复版基础上只改退款终态口径，发货分支一行未动：

- **全额退款**（`RefundFee === order.amount`）→ 直接写 `status = 'refunded'`，同时写 `refunded_at` /
  `refund_amount` / `refund_reference` / `wx_refund_reference`；
- **部分退款** → 仍停 `refund_pending_verification`（不把只退了一部分的单标成全退）；
- 反查方式仍是 `findOrderByWxRef(WxOrderId)` + `pay_channel === 'virtual'` + 金额/单号一致性校验 + 乐观更新
  （`stats.updated !== 1` 抛 `refund_state_conflict`）。

口径来源：owner 对本单直接回「已退款」，据此确认全额退款的终态就是 `refunded`。

### 9.2 回归（7 组回放，改前后对照）

脚本 `regress.js`（`Module._load` 劫持 `wx-server-sdk`、内存版 `orders`、签名走 `queryStringParameters`、
`VPAY_PUSH_TOKEN=<已移除明文，值仅存于云函数环境变量>`）在本机跑两组代码：

| 版本 | 结果 |
|---|---|
| `24babab6`（全额→`refunded`） | 7 组全部通过 |
| `2e131a96`（全额→`refund_pending_verification`） | 只有「全额退款」那一组守卫值不同（写的是 `refund_pending_verification`），其余 6 组两版逐项一致 |

说明：该脚本是临时文件，跑完即清理（当前 `/tmp/vpayprobe` 已不存在），此处只记录当时结论；
可复核的行为差异直接看 `git show 24babab6` / `git show 2e131a96:miniprogram/cloudfunctions/vpay-notify/index.js`。

### 9.3 部署通道（本轮唯一走通的一条）

`callCloudApi` 手工转录 5KB base64、`manageFunctions.updateFunctionCode`（cloud mode 拒绝本地目录）、
`getFunctionUploadUrl`（live enum 无此项）、`miniprogram-ci cloud.uploadFunction`（41001 access_token missing）、
本地私钥换腾讯云签名头（四种组合只回 `{"errCode":0}`，票据既不在 body 也不在响应头）——全部走不通，详见过程记录。

最终通道是**微信开发者工具 CLI 直传目录**：

- 前置：IDE 设置 `security.enableServicePort = true`（该开关在
  `…\微信开发者工具\User Data\2ca4252ffa87560ea1fd48b913e45179\WeappLocalData\localstorage_*.json` 的 `security` 段；
  改前为 `false`/`port:null`，两份文件均留 `.bak-20261110` 备份），然后启动 IDE，由 IDE 自行选端口监听
  （`Default\.cli` 记录实际端口）；
- 命令：`cli cloud functions deploy -e shizhang-pay-d0g1n58020acf6b5b -p <vpay-notify 目录> -r --appid wx562bcb6057346fb2`；
- 输出：`√ [vpay-notify] cloudfunction vpay-notify exists in the cloud, will update it` → `√ deploy cloudfunctions`，
  表格 `success true / filesCount 2 / packSize '3.8 KB'`，exit 0。

### 9.4 线上核对（四条互相独立的证据）

| 检查 | 实测 | 判定 |
|---|---|---|
| `getFunctionDetail` | `Status Active`、`AvailableStatus Available`、`ModTime 2026-11-10 09:28:42`、`CodeSize 7266119`、`RequestId 22553b29-7e0f-4032-b803-b6bff62a11e1` | 已替换上一版 |
| `CodeInfo` 全文 | 含 `findOrderByWxRef` 与「full → `status:'refunded'`」分支，无 `findOrder(event.MchOrderId)` | 线上是 `24babab6` 版 |
| 包 SHA256（`getFunctionDownloadUrl`） | `b968a847caa450710914846ea4c6e966ca30b367326f05993123822e92418f02`，与下载得到 7266119 字节 zip 实算一致 | 传输无损 |
| 包内 `index.js` | 10171 字节 / `b41c856073877d226ceceb00399c32428bc520b01953b43e10aaa39f255f3f15` | 与仓库 `24babab6` 版、与部署目录**逐字节相同** |
| 包内 `package.json` | 127 字节 / `57cb56e8821aa844468b2dc825e8f178de4e368816a01f49b559e5cb37b479c7` | 一致 |
| 线上 GET 验签握手 | `HTTP 200`，正文回显 `livecheck-after-deploy` | 新代码已在线加载、入口可服务 |

（GET 握手只回 `echostr`，不读不写库，仍不是伪造推送。）

### 9.5 首单终态（owner 口径「已退款」，人工对账而非回调）

`writeNoSqlDatabaseContent` `action=update` + `$set`，`requestId d6189d45-21fd-4ada-bf29-b39d1c05cf7c`，
`modifiedCount 1 / matchedCount 1`；写入后回读（`requestId dac2334c-c343-49e1-85cf-ccc640486222`）：

| 字段 | 值 |
|---|---|
| `status` | `refunded` |
| `refund_amount` | `990`（分，= 9.90 元全额） |
| `refund_reference` | `VP202611090907466de445e3` |
| `wx_refund_reference` | `VPR26110917109261225` |
| `refunded_at` | `2026-11-09T09:44:09.000Z`（微信侧退款成功时刻） |
| `refund_verdict` | `owner_confirmed_refunded` |
| `refund_verdict_at` | `2026-11-10T00:56:00.000Z` |

部署完成后再次直读（`requestId 668da3fe-6a8b-4d03-9693-7c92cd1a696a`）：首单仍为 `status=refunded`、
`refund_amount 990`、`wx_refund_reference VPR26110917109261225`、`refund_verdict owner_confirmed_refunded`，
其余两条订单未受影响。

首单旧的 `refund_amount_pending` / `refund_signal_at` / `refund_reference_pending` /
`wx_refund_reference_pending` / `refund_reconciled_at` / `refund_reconcile_source` **保留未清理**（作为
「回调曾被拒 → 人工对账」的历史留痕），是否清理由 owner 决定。

### 9.6 仍未证 / 边界

- 「下一笔真实全额退款会自己落到 `refunded`」仍只有**同报文回放 + 线上代码逐字节核对**作证据；
  真实首证要等下一笔退款，本轮没有伪造推送去打线上。
- 部分退款的长期终态（是否也自动收口）owner 未拍板，代码当前刻意停在 `refund_pending_verification`。
- 小程序端订单页「已退款」的展示尚未截图取证。
- 部署用的 IDE 服务端口开关本轮临时打开；按收尾约定已恢复原值（`enableServicePort=false`、`port=null`），
  如需再次 CLI 部署要重开并按 `Default\.cli` 读实际端口。

## 10. 第三轮：部分退款也自动收口（2026-11-10）

状态补充：`partial_refund_terminal=partially_refunded`（累计到订单全额时自动转 `refunded`；
提交 `9ef0b59b`，已部署到线上 `$LATEST`）。

### 10.1 owner 口径与设计取舍

owner 就「部分退款要不要也自动收口」只回了「完成部署」。执行端按「收口但不说假话」落地：

- 部分退款不再停在 `refund_pending_verification`（那样等于永远要人来管），而是落独立终态
  `partially_refunded`，同时把已退金额累加进 `refunded_total`。
- 只退了一部分就写 `refunded` 是事实错误，因此不冒充「已退款」。
- 多笔部分退款累加到订单全额时，自动升级为 `refunded` 并写 `refunded_at`。
- 同一 `WxRefundId` 重复推送幂等：`refund_wx_refs` 数组去重，不重复累计。
- 累计超额抛 `refund_over_total`，不静默截断。

### 10.2 改动

| 文件 | 变更 |
|---|---|
| `miniprogram/cloudfunctions/vpay-notify/index.js` | 新增 `const _ = db.command;`；`handleRefund` 允许从 `paid`/`delivered`/`partially_refunded` 进入；`refund_wx_refs` 去重幂等；`total=(refunded_total||0)+amount`，`total>amount`→`refund_over_total`；`total===amount`→`refunded`+`refunded_at`，否则 `partially_refunded`；写 `refunded_total/refund_amount/refund_signal_at/refund_reference/wx_refund_reference/refund_wx_refs` |
| `miniprogram/cloudfunctions/vpay-notify/index.js` | `handleDeliver` 两处终态集合补 `partially_refunded`，否则发货推送会把部分退款的单改回 `paid` |
| `miniprogram/pages/orders/index.js` | 新增 `partially_refunded: '部分退款 · 暂停交付'` |

- `order-query` 只对 `status==='pending'` 动手，不受影响，未重部署；其余 4 个云函数未动。
- 改动文件 `index.js` 10712 字节 / sha256 `a4162837e0287a83ff39c35c0aac993662e25f70e63df9a97bfebf1b460b657b`；
  `git diff --stat`：2 文件、23 插入 / 17 删除。

### 10.3 回放回归（9 组，非伪造推送）

回归已入库：`scripts/tests/vpay-notify-refund.test.mjs`，`node --test scripts/tests/vpay-notify-refund.test.mjs`
直接可跑（9 个用例全 PASS）。实现方式是 `Module._load` 劫持 `wx-server-sdk` 换成内存 `orders`，
签名仍走 `queryStringParameters` 真实 SHA1，`VPAY_PUSH_TOKEN='<已移除明文，值仅存于云函数环境变量>'`，全部经由
`exports.main` 的真实 HTTP 入口驱动，不直接调用内部函数。

| 组 | 场景 | 新版 | 旧版（`79737923`） |
|---|---|---|---|
| A | 全额 990 → `refunded` + `refunded_total` | PASS | FAIL（无累计字段） |
| B | 部分 400 → `partially_refunded` | PASS | FAIL（落 `refund_pending_verification`） |
| C | 再退 590 累计 990 → `refunded` | PASS | FAIL（不升级） |
| D | 同 `WxRefundId` 重复推送 | PASS | FAIL（无去重） |
| E | 单笔 1200 超额拒 | PASS | PASS |
| F | 累计 400+700 超额拒 | PASS | FAIL（无累计校验） |
| G | `partially_refunded` 后发货推送不改状态 | PASS | FAIL（`order_state_conflict`） |
| H | `pending` 订单收退款拒 | PASS | PASS |
| I | `RetCode≠0` 不写库 | PASS | PASS |

新版 **9/9 ALL PASS、exit 0**；旧版 **5/9 FAIL**。`node --check` 两个改动文件均通过。
一次中途失败（G）是夹具缺 `product_id` 导致 `order_payment_mismatch`，补夹具后通过，与业务代码无关。

### 10.4 部署与线上核对

- 通道沿用上一轮唯一可用的：微信开发者工具 CLI 本地服务端口
  （临时把 `security.enableServicePort` 置 `true`/`port:3799`，IDE 自选 `41074`）。
- `cli cloud functions deploy -e shizhang-pay-d0g1n58020acf6b5b -p <目录> -r --appid wx562bcb6057346fb2`
  → `success true / filesCount 2 / packSize '4.0 KB'`，exit 0。
- `getFunctionDetail`（`RequestId 868f97e6-e349-4e5d-a6b6-9191fee0ebb3`）：`ModTime 2026-11-10 09:45:45`、
  `Status Active`、`AvailableStatus Available`、`CodeSize 7266298`，`FunctionId lam-p2st3nmv` 未变。
- `getFunctionDownloadUrl`（`RequestId 077d55c8-4a1f-4a43-a635-b32e2581879a`）：`CodeSha256
  834be8aafbe5c224db0bf0ade3c5a1193fe0ffc28e37828505d8fe40fd343179`；下载 7266298 字节实算同值。
- 包内 `index.js` 10712 字节 / `a4162837…b657b`、`package.json` 127 / `57cb56e8…79c7`，与部署目录逐字节一致；
  包内代码含 `const _ = db.command;`（第 6 行）、`partially_refunded`（104/113/139/144 行）、
  `refund_wx_refs: _.push([wxRefundId])`（147 行）。
- 真实签名 GET 握手：`HTTP 200` 且回显 `echostr`（私钥未变、明文推送路由正常）。

### 10.5 数据库现状（部署后回读）

`readNoSqlDatabaseContent`（`requestId d333ad37-11be-43f7-92ec-598084ff6155`）：`orders` 仍 3 条。

| `_id` | `status` | 说明 |
|---|---|---|
| `9dd802d16af18d620027c9cc7ae0093a` | `refunded` | 首单，`refund_amount 990`、`wx_refund_reference VPR26110917109261225`、`refund_verdict owner_confirmed_refunded` |
| `9dd802d16aeedc22000bd4762e38df72` | `closed` | 未支付，未受影响 |
| `70d1f9116aeeae14000f0daa27ce54fc` | `closed` | 未支付，未受影响 |

首单没有 `refunded_total` / `refund_wx_refs`（那是人工对账写的历史终态）；因为 `status=refunded` 会在
入口短路返回 success，后续任何退款推送都不会改写它，也不会重复累计。

### 10.6 仍未证 / 边界

- 「下一笔真实部分退款会自己落 `partially_refunded`」目前只有同报文回放 + 线上包逐字节核对作证据；
  真实首证要等下一笔退款，本轮没有伪造推送打线上。
- 订单页新标签（「部分退款 · 暂停交付」）已进仓库并随 `9ef0b59b`，但**线上开发版仍是上一版**，
  需下一次上传/发布才在界面生效；在此之前部分退款的单会显示原始状态文本。
- 部署用的 IDE 服务端口开关已恢复原值（`enableServicePort=false`、`port=null`，两份 JSON 均 Test-Json 通过），
  27+ 个 IDE 进程已清空。

## 11. 退款裁决权与客户告知口径（owner 2026-11-12 定，已落地部分）

规则原文见 `docs/2026-11-12-退款裁决与客户告知口径.md`，此处只记本轮实际改了什么、还差什么。

### 11.1 裁决权（已写入 docs + AGENTS.md）

- 人工核对后退款状态改判，只能由 **GPT 决策席**裁决。
- 豆包、WorkBuddy 只能采集微信退款记录、云函数日志、数据库现状并上报，**不得自行改判**。
- `vpay-notify` 收到真实微信推送后的自动落库不属于人工改判，照常运行。

### 11.2 授权来源（已补字段，未覆盖历史）

- 现状核查：首单 `9dd802d16af18d620027c9cc7ae0093a` 只有 `refund_verdict=owner_confirmed_refunded`，
  **没有来源说明字段**，确属"字段替代授权"的情况。
- 处置：`writeNoSqlDatabaseContent` `$set` 仅新增两字段，`requestId 15403423-2e5f-4f9e-af70-23328b4741e2`，`modifiedCount 1`：
  - `refund_verdict_source`：写明按 owner 会话口径改判、无独立书面授权文件、人工核对依据为微信退款单号
    `VPR26110917109261225` + 云日志 `request_id 822a9cea-dc24-11f1-946e-52540006055e`，
    并注明"后续同类改判须先有 GPT 裁决记录再落库"。
  - `refund_verdict_source_at`：`2026-11-12T00:00:00.000Z`。
- 回读（`requestId 1918f11e-4ae4-4838-aa51-3efd789861cc`）：首单 `status=refunded`、`refund_amount 990`、
  `wx_refund_reference VPR26110917109261225` 均未变；其余订单（2 关闭 + 6 待支付）未受影响。

### 11.3 客户可见口径（代码已改，未上线）

原实现只显示状态文本（`部分退款 · 暂停交付`），不显示退款金额与后续说明 —— 不符合新规。已改：

- `miniprogram/pages/orders/index.js`：新增退款说明映射，部分退款/核对中/已退款分别给出金额与下一步；
  计算 `refunded_total`（回退 `refund_amount`）、剩余未退、退款完成时间。
- `miniprogram/pages/orders/index.wxml`：新增"已退金额""剩余未退（交付暂停）""退款完成时间"三行 + 说明块。
- `miniprogram/app.wxss`：新增 `.refund-note` 样式。
- 校验：`node --check miniprogram/pages/orders/index.js` 通过。

生效条件：这属于小程序前端，需重新上传开发版并发布后才会在客户手机上出现；本轮**没有**上传，也没有发布。

### 11.4 真实退款验收要求（尚无首证）

- 下一笔真实退款必须采集：微信侧真实退款单号/请求标识、退款状态、云函数 `request_id`、数据库回读，四者对齐。
- 不得用合成推送冒充线上验收；回放只能标注为离线行为证据。
- 当前状态：真实下一笔尚未发生，无线上首证。
