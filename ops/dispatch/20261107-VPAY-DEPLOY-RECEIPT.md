# 部署回执｜世章 AI 助手 1.0.1 虚拟支付（沙箱）

- 回执单号：VPAY-DEPLOY-20261107-01
- 执行席：豆包（云 VM 执行席）
- 执行时间：2026-11-07（北京时间 11:13 上传 → 15:09 完成端到端回读）
- AppID：`wx562bcb6057346fb2`
- CloudBase 环境：`shizhang-pay-d0g1n58020acf6b5b`（个人版）
- 结论：**部署完成、下单链路实测跑通、支付回调未达成；不具备真实收款条件**

## 一、小程序侧（已生效）

| 项 | 状态 | 证据 |
|---|---|---|
| 代码上传 | 已完成 | 版本 1.0.1，备注「虚拟支付上线」，开发者 ci机器人1，2026-11-07 11:13:28 |
| 上传回执 | `subPackageInfo: __FULL__ 15,572 bytes` | miniprogram-ci 返回 |
| 体验版 | 已设置 | 路径 `pages/product/index?id=source-check`，有效期至 2026-11-14 |
| 版本管理解锁 | 已解除「微搭低代码」授权 | 后台第三方授权页仅剩「腾讯云官网」（仅云服务类权限） |
| 线上版本 | 尚未提交 | 备案未通过，无法提审/发布 |

## 二、云端资源（控制台实测，2026-11-07 15:0x）

| 函数 | 状态 | 运行时 | 创建 | 最后修改 |
|---|---|---|---|---|
| vpay-order | 正常 | Node.js 20.19 | 2026-11-07 08:16:04 | 2026-11-07 08:31:33 |
| vpay-notify | 正常 | Node.js 20.19 | 2026-11-07 08:24:27 | 2026-11-07 08:47:23 |
| order-query | 正常 | Node.js 20.19 | 2026-11-06 15:14:55 | 2026-11-06 15:50:15 |
| pay-create | 正常 | Node.js 20.19 | 2026-11-06 15:14:29 | 2026-11-06 15:54:31 |
| order-list | 正常 | Node.js 20.19 | 2026-11-06 15:13:57 | 2026-11-06 15:13:57 |

- `vpay-order` 函数 ID：`lam-ri922njb`
- 环境变量 6 个键均存在：`VPAY_APPKEY_LIVE` / `VPAY_APPKEY_SANDBOX` / `VPAY_ENV` / `VPAY_OFFER_ID` / `WX_APPID` / `WX_APP_SECRET`（**值在控制台被掩码，本回执不读取、不落盘**）

### HTTP 网关
| 域名 | 路由 | 资源 | 认证 | 限频 | 更新时间 |
|---|---|---|---|---|---|
| `shizhang-pay-d0g1n58020acf6b5b-1526598896.ap-shanghai.app.tcloudbase.com` | `/vpay-notify` | 云函数 vpay-notify `$DEFAULT` | **未开启** | 未设置 | 2026-11-07 08:42:13 |

## 三、端到端实测（关键）

### 3.1 下单链路：通过
`orders` 集合实测 1 条记录（导出原文）：

```json
{"_id":"70d1f9116aeeae14000f0daa27ce54fc","out_trade_no":"VP20261107045028c2a3f1e1","product_id":"source_check","title":"稿件源文核验","amount":990,"status":"pending","pay_channel":"virtual","env":1,"created_at":"2026-11-07T04:50:28.239Z","paid_at":null,"wx_order_id":null}
```

- 时间：2026-11-07T04:50:28Z（北京 12:50:28）
- 金额 990 分（¥9.9），道具 `source_check`
- **`env: 1`** ← 沙箱标志位生效的硬证据（比读环境变量更直接）
- 说明：`vpay-order` 已真实被调用、签名生成成功、订单已落库

### 3.2 支付回调：未达成
- 该单 `status = pending`、`paid_at = null`、`wx_order_id = null`
- 即：**支付未完成，或完成但回调未送达**，两种可能当前无法区分（无回调日志）

### 3.3 回调可达性探测
| 探测 | 结果 | 含义 |
|---|---|---|
| `GET /vpay-notify`（无签名） | HTTP 403 `invalid signature` | 函数在线，且 `VPAY_PUSH_TOKEN` 已配置、验签逻辑生效 |
| `POST /vpay-notify`（`{"probe":1}`，无签名） | HTTP 200 `{"ErrCode":0,"ErrMsg":"success"}` | 函数可被匿名访问，未知事件被静默忽略 |
| `GET /vpay-order` | HTTP 404 `INVALID_PATH` | 属正常：该函数只走 `wx.cloud.callFunction`，未配 HTTP 路由 |

## 四、发现的风险（按严重度，附代码位置）

**R1（高）POST 回调完全不验签 —— 可伪造发货**
`vpay-notify/index.js` 中 `checkSignature()` 只在 `httpMethod === 'GET'` 分支调用（第 128 行）；POST 分支（第 135–142 行）直接 `normalizeEvent` 后 `dispatch`。加上网关「身份认证未开启」，任何人 POST 一条 `{"Event":"xpay_goods_deliver_notify","OutTradeNo":"<已知单号>"}` 即可把订单置为 `paid`。
- 触发条件：知道 `out_trade_no`（订单号格式 `VP+时间+随机`，不可枚举，但一旦泄漏即可利用）

**R2（高）回调不校验订单要素一致性**
`handleDeliver()`（第 58–94 行）只用 `outTradeNo` 定位订单，**不比对** `ProductId`、`Quantity`、`amount`。金额/环境不匹配、越权订单（用 A 单号打 B 商品）都不会被拒。GPT 要求的「金额/环境不匹配、越权订单」两项，当前必然失败。

**R3（中）幂等只防重放，不防抢先**
第 77 行 `status === 'paid' || 'delivered'` 时直接返回，重复回调是幂等的（这点合规）；但结合 R1，伪造回调会**抢先**把真实订单置 paid，之后真实回调也变成"重复"。

**R4（中）`vpay-order` 把 AppSecret 拼进 URL 查询串**
`index.js` 第 52–55 行 `code2Session` 用 `?appid=..&secret=..` 明文拼 URL。HTTPS 传输安全，但若函数日志记录出网 URL（Node 侧不会，网关侧可能），存在泄漏面。

**R5（低）网关限频未设置**
`/vpay-notify` 无频控，可被刷。

## 五、阻塞（非配置问题）

- 小程序**备案 = 管局审核中** → 无法提审、无法发布正式版 → 虚拟支付现网（`VPAY_ENV=0`）不具备生效条件
- 因此本轮所有验收都是沙箱，**0 真实资金动作**，符合 GPT 划定的边界
- iOS 苹果 IAP 关闭，短期仅安卓可收款

## 六、本轮回执的边界声明

- 未改任何支付源码（按 A/B 分工，`vpay-*` 代码属 A 组）
- 未改 `VPAY_ENV`、未动生产凭据
- 未读取、未落盘任何密钥明文（环境变量在控制台掩码）
- `openid` 属个人信息，本回执仅保留订单号与状态，不含完整 openid

## 七、下一步（待 A 组决定）

1. R1/R2 修复：POST 分支补验签 + 校验 `ProductId`/`Quantity`/`amount`/`env` 与订单一致
2. 补一条支付结果查询兜底（回调丢失时主动查单，避免永久 pending）
3. 沙箱按顺序验证：取消 → 失败 → 结果未知 → 重复回调 → 越权订单 → 金额/环境不匹配 → 幂等发货
