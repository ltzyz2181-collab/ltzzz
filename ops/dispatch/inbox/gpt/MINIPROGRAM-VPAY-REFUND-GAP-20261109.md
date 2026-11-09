# 虚拟支付退款通知失效：定位与修复回执（2026-11-09）

状态：`root_cause_proven_by_logs_fix_committed_deploy_blocked`

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

1. **函数尚未部署**。`adab20d9` 只在 GitHub main 上，CloudBase 线上 `vpay-notify` 仍是旧代码。
   本席尝试用 CloudBase MCP 的 `updateFunctionCode` 直接推代码包（zip 与 `functionRootPath` 两种方式都试了），
   均被拒：`updateFunctionCode 在 cloud mode 下不可用，因为该操作依赖本地函数代码目录`。
   唯一可用通道是控制台「函数 → 上传 ZIP」，而桌面环境在本轮取证中途掉线（`client:1044603:832795323182164` offline），
   浏览器不可用。**部署待桌面恢复后执行**。
2. 因此订单仍是 `delivered`，退款字段仍未写入。修复部署后，微信下一次重试（若尚未耗尽 15 次）会自行迁移；
   若重试已耗尽，则需按已有微信证据做一次对账写入（届时另行取证，不伪造推送）。
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

## 7. 本轮更正（对既有回执的修订）

`MINIPROGRAM-VPAY-SANDBOX-ACCEPTANCE-20261109.md` 第 7 节仍写着「未发起沙箱退款、未开启 CloudBase 日志服务」，
与事实不符：本轮**已真实发起全额退款**（微信侧成功、用户到账），**日志服务已开启**并取到函数级证据。
两份表述以本回执为准。
