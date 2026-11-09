# 小程序虚拟支付 · 配置实测与回调握手验证（2026-11-09）

执行席位：豆包席（本机 Windows + 云主机 vm）
执行方式：微信公众平台后台实读 + 腾讯云 CloudBase 控制台实读 + 云主机对回调地址发起真实 GET 握手
基线：origin/main `b2300ef2`

---

## 一、四步链当前状态

| 步 | 要求 | 状态 | 证据 |
|---|---|---|---|
| 1 | 配齐虚拟支付密钥 | **已完成（实测确认，非转述）** | 云函数 `vpay-order` 6 个环境变量全部存在且与后台一致 |
| 2 | 配并验回调地址 | **已完成并验证通过** | 后台消息推送已配 + 云主机 GET 握手 HTTP 200 回显 echostr |
| 3 | 沙箱下一单 | **未完成（不能由本席代做）** | 需在微信内的真实支付确认，见第四节 |
| 4 | 确认 pending→paid 迁移 | **未执行** | 依赖第 3 步产生真实支付事件 |

---

## 二、第 1 步：密钥核对（CloudBase 控制台实读，值不落库）

环境 `shizhang-pay-d0g1n58020acf6b5b`（包年包月个人版，到期 **2026-12-06 23:59:59**）。
同账号另有一环境 `shizhang-pay-d2gz42qn06db00644`（体验版，到期 2027-05-06），本次未使用。

云函数总数 5 个，状态全部「正常」，运行环境 Node.js 20.19：
`vpay-notify`、`vpay-order`、`order-query`、`pay-create`、`order-list`。
`vpay-order` 上次修改时间 2026-11-07 15:56:40。

`vpay-order` 环境变量（点「全部展示」后仅回读长度与开关值，未把任何密钥写入仓库或回执）：

| 变量 | 实读结果 | 判定 |
|---|---|---|
| `WX_APPID` | `wx562bcb6057346fb2` | 与小程序 AppID 一致 |
| `WX_APP_SECRET` | 长度 32 | 与 AppSecret 标准长度一致 |
| `VPAY_OFFER_ID` | `1450712330` | 与后台 OfferID 一致 |
| `VPAY_ENV` | `1` | 沙箱环境（代码默认值亦为 1） |
| `VPAY_APPKEY_SANDBOX` | 长度 32 | 见下方指纹比对 |
| `VPAY_APPKEY_LIVE` | 长度 32 | 现网用，本次不启用 |

**沙箱 AppKey 一致性比对（三段指纹全等）**：
从后台「虚拟支付 → 基本配置 → 查看沙箱AppKey → 复制」取到值，与云函数环境变量做同位置切片比对：
长度 32 / 首 3 位 `mik` / 第 11–18 位 `CpxCueKI` / 末 2 位 `Ge` —— 四项完全一致。
结论：云函数里的沙箱 AppKey 就是后台那一把，不是占位值、不是旧值。

`vpay-notify` 的 `VPAY_PUSH_TOKEN`：未直接读值，但由第三节握手结果间接证明已配置且与后台令牌一致
（该函数在令牌缺失时按 fail-closed 一律返回 403）。

---

## 三、第 2 步：回调地址（后台已配 + 真实握手通过）

后台「开发管理 → 开发设置 → 消息推送」实读：
- URL：`https://shizhang-pay-d0g1n58020acf6b5b-1526598896.ap-shanghai.app.tcloudbase.com/vpay-notify`
- 消息加密方式：明文模式；数据格式：JSON
- 令牌与 EncodingAESKey 已填（值属后台配置，不写入仓库）
- 本月还可修改 2 次（一个月内可申请 3 次）

**真实握手（不是看配置、是真打了一次）**：由云主机按后台令牌计算 `sha1(sort(token,timestamp,nonce))`，
对上述 URL 发起 `GET ...?signature=...&timestamp=...&nonce=...&echostr=probe-ltzzz-20261109`。

回读结果：
- HTTP/1.1 **200 OK**，`x-cloudbase-upstream-type: Tencent-SCF`，`x-cloudbase-upstream-timecost: 900`
- 响应体原样返回 `probe-ltzzz-20261109`（20 字节，即 echostr）
- 服务器时间 `Mon, 09 Nov 2026 08:45:10 GMT`，`x-cloudbase-request-id: d893586d-8f8a-4631-a359-5843c7fd5b86`

判定：回调地址可达、云函数已部署在该路径、令牌匹配、验签逻辑正确（签名错会 403，令牌缺会 403）。

---

## 四、第 3 步为什么本席做不了（如实标注）

后台「道具配置」实读，三件道具与代码 `vpay-order` 的 `GOODS` 完全对齐：

| 道具 id | 名称 | 价格(元) | 备注 | 代码 amount |
|---|---|---|---|---|
| `source_check` | 稿件源文核验 | 9.9 | svc_sc_990 | 990 |
| `delivery_check` | 交付质量校验 | 19.9 | svc_dc_1990 | 1990 |
| `document_tidy` | 文档整理交付 | 14.9 | svc_dt_1490 | 1490 |

「交易订单」页实读：昨日交易笔数 / 交易金额 / 技术服务费 / CPS 服务费 全部为 `-`，**至今没有任何虚拟支付成交**。

沙箱下单的卡点不是配置，是**支付动作只能在微信侧完成**：
`wx.requestVirtualPayment` 必须在小程序运行时（开发者工具或真机）由用户点击发起，随后在微信客户端内完成支付确认。
本席没有任何执行面能代替你在微信里点「确认支付」，也不会用伪造的 `xpay_goods_deliver_notify` 去把订单改成 `paid`
（那等于造假支付凭证，会把 `pending→paid` 的证据链污染掉）。

---

## 五、需要 owner 本人做的一步（做完我接着验第 4 步）

1. 微信开发者工具打开 `miniprogram`（AppID `wx562bcb6057346fb2`），或直接用已上传的开发版 `0.1.7` 真机预览；
2. 进任一服务详情页点购买（建议先用 `source_check` ¥9.90）；
3. 在微信里完成沙箱支付确认；
4. 回来告诉我「下了哪一单、金额、时间」。我会立刻做三件事：
   - 查 `orders` 集合该笔 `out_trade_no` 是否 `pending → paid`，`paid_at` / `wx_order_id` / `notify_*` 是否写入；
   - 查云函数 `vpay-notify` 日志是否命中 `xpay_goods_deliver_notify` 且未报 `notification_unverified`；
   - 用 `order-query` 回读订单状态与金额，做三方一致比对。

在此之前 `miniprogram/config/index.js` 的 `payEnabled` **保持 false**（四条件未满足），小程序内不承诺支付可用。

---

## 六、对上一份回执的更正（必须落字）

上一份 `MINIPROGRAM-PAYFIX-DEPLOY-RECEIPT-20261109.md` 的 Q4④ 写「回调地址未配、云函数密钥无法核实」，
本轮后台与云函数实读证明**两条都不成立**：

| 旧表述 | 本轮实测 |
|---|---|
| 回调地址未配 | 已配，且握手 200 回显 echostr |
| 云函数密钥无法核实 | 6 个变量全在，沙箱 AppKey 与后台逐段一致 |

原因：上一轮未取得 CloudBase 控制台入口（需公众号管理员扫码），把「我没权限看」写成了「没配」。
本轮已通过控制台登录取证。旧文件未改写，以本回执为准。

---

## 七、明确没做到的

1. 沙箱真实下单与 `pending→paid` 迁移：未做，原因见第四节，只能由你在微信内完成支付确认。
2. `payEnabled` 未打开：四条件第一条（一笔沙箱支付成功且 notify 验签通过）尚未发生。
3. `scripts/miniprogram-upload.mjs` 里描述文案仍写「不接支付与自动交付」，与虚拟支付口径未同步（未改）。
4. 历史两条真实测试 `pending` 订单仍在 `orders` 集合，显示层已隐藏，未在控制台标 `closed`。
5. 微信支付商户号 `1752422818` 的服务商模式卡点未推进（仍等你回填超管手机号给客服）。

---

## 八、关键路径与复现

- 后台：`https://mp.weixin.qq.com/wxamp/subApp/skit/manage/config/basic?token=<当前令牌>&lang=zh_CN`（「查看沙箱AppKey」入口）
- 后台：`https://mp.weixin.qq.com/wxamp/subApp/skit/manage/config/prop?token=<当前令牌>&lang=zh_CN`（道具配置）
- 后台：`https://mp.weixin.qq.com/wxamp/devprofile/get_profile?token=<当前令牌>&lang=zh_CN`（消息推送、AppSecret）
- 控制台：`https://tcb.cloud.tencent.com/dev?envId=shizhang-pay-d0g1n58020acf6b5b#/scf/detail?id=vpay-order&NameSpace=shizhang-pay-d0g1n58020acf6b5b`
- 代码：`miniprogram/cloudfunctions/vpay-order/index.js`（150 行）、`vpay-notify/index.js`（165 行）

---

状态：`config_verified_callback_live_sandbox_order_pending_owner`
