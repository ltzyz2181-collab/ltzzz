# 微信虚拟支付四步链落地验收回执（2026-11-09 沙箱首单）

状态：`vpay_four_step_chain_complete_sandbox_first_payment_paid`
时间基准：2026-11-09（UTC 记录，本地显示为 PST）
环境：CloudBase `shizhang-pay-d0g1n58020acf6b5b`（个人版，到期 2026-12-06 23:59:59）
AppID `wx562bcb6057346fb2` / OfferID `1450712330` / `VPAY_ENV=1`（沙箱）

---

## 1. 四步链终态

| 步 | 要求 | 终态 | 证据 |
|---|---|---|---|
| ① | 配齐虚拟支付密钥 | 已配，四方指纹一致 | 云函数 `vpay-order` 环境变量 6 项齐全；沙箱 AppKey len32 / prefix `mik` / seg(10..18) `CpxCueKI` / suffix `Ge`，与后台「查看沙箱AppKey」复制值同位置切片全等（详见 `MINIPROGRAM-VPAY-CONFIG-VERIFY-20261109.md`） |
| ② | 配并验回调地址 | 已配，真实握手 200 | 后台「消息推送」URL `.../vpay-notify`、Token `<REDACTED>`、明文模式 JSON；云主机按令牌算 `sha1(sort(token,timestamp,nonce))` 发 GET，得 HTTP 200 + echostr 原样回显，`x-cloudbase-request-id: d893586d-8f8a-4631-a359-5843c7fd5b86` |
| ③ | 沙箱下一单 | **已完成**，人已付款 | 订单 `VP202611090907466de445e3`：`source_check` 9.90 元，微信后台沙箱环境显示「支付成功」 |
| ④ | 确认（验签 + pending→paid） | **已完成** | 同一订单在 `orders` 集合由 `pending` 迁为 `paid`，`notify_at` 由 `vpay-notify` 写入 |

---

## 2. 第③步：沙箱下单实测

- 小程序版本：**0.1.8**（CI run `42590430546`，`source_commit=30f1f979389d4536b2c0ad2d5f535c474856e91e`，`uploaded=true`、`published=false`、`appid_source=configured_secret`）。
- 前置修复：`miniprogram/config/index.js` 的 `payEnabled` 由 `false` 改为 `true`（提交 `30f1f979`）。原状态购买按钮为 `disabled="{{paying || !payEnabled}}"` 且 `onBuy()` 会 toast「在线预约暂未开放」，不改则二维码打开后无法进入支付。
- 体验版：0.1.8 被「选为体验版本 → 切换体验版」，后台回「体验版已生效」，二维码路径 `pages/product/index?id=source-check`，标注「该二维码11月16日前有效」。
- 下单记录（`orders` 集合，`_id` `9dd802d16af18d620027c9cc7ae0093a`）：

| 字段 | 值 |
|---|---|
| `out_trade_no` | `VP202611090907466de445e3` |
| `product_id` / `title` | `source_check` / 稿件源文核验 |
| `amount` | `990`（分，即 9.90 元） |
| `pay_channel` / `env` | `virtual` / `1` |
| `openid` | `o8IYYx…hY8`（本人 openid，已掩码） |
| `created_at` | `2026-11-09T09:07:46.736Z` |
| `status` | `paid` |
| `paid_at` | `2026-11-09T09:08:03.679Z` |
| `wx_order_id` | `VPO261109170747016376319` |
| `notify_at` | `2026-11-09T09:08:03.679Z` |
| `notify_product_id` / `notify_quantity` | `source_check` / `1` |

微信后台侧独立取证（虚拟支付 → 交易订单 → 环境切「沙箱环境」→ 查询）：

| 项 | 值 |
|---|---|
| 商户单号 | `VP202611090907466de445e3`（与上面 `out_trade_no` 完全一致） |
| 用户ID | `o8IYYx…hY8`（同一 openid） |
| 订单金额 / 实付金额 | `9.90` / `9.90` |
| 技术服务费 / 平台回收 / CPS | `0.00` / `0.00` / `0.00` |
| 支付状态 | **支付成功** |
| 支付时间 | `2026-11-09 01:07:59`（PST，即 `09:07:59Z`） |
| 结算时间 | `待结算`（沙箱无实际结算，正常） |
| 操作 | `退款`（沙箱可发起退款测试，本次未动） |

同一页切「现网环境」查询结果为「暂无数据」，说明这单只存在于沙箱通道，未混入现网。

---

## 3. 第④步：回调确认

时间线（同一 UTC 基准）：

1. `09:07:46.736Z` 小程序 `vpay-order` 写入 `pending` 订单；
2. `09:07:59Z` 用户在微信内确认支付；
3. `09:08:03.679Z` 订单变为 `paid`，`paid_at`/`notify_at` 同刻写入 —— 间隔 4.68 秒。

判定依据（对 `vpay-notify` 代码逐条核对，`miniprogram/cloudfunctions/vpay-notify/index.js`）：

- 入口即验签：`checkSignature` 用 `sha1([VPAY_PUSH_TOKEN, timestamp, nonce].sort().join(''))` 与 `query.signature` 做 `timingSafeEqual`，签名为 40 位 hex、timestamp 1–16 位数字、nonce ≤256；令牌缺失恒 403。**签名不过不会进业务分支**，因此订单被改写即证明验签通过。
- 绑定校验：`handleDeliver` 要求 `event.OpenId === order.openid`、`event.Env === order.env(=1)`、`GoodsInfo.ProductId === order.product_id`、`Quantity === 1`、`OrigPrice === ActualPrice === order.amount(990)`、`WeChatPayInfo.MchOrderNo` 非空。落库字段 `notify_product_id=source_check`、`notify_quantity=1`、`wx_order_id` 非空，说明这六项全部命中，否则抛出 `order_binding_mismatch` / `order_payment_mismatch`、订单保持 `pending`。
- 状态机：仅 `pending` 可迁 `paid`，且用「`_id` + 旧 status + openid + env + product_id + amount + pay_channel` 组合条件做乐观更新（`result.stats.updated === 1`），重复通知走幂等分支。**没有任何人工改库动作**，`paid_at`/`notify_at`/`wx_order_id` 三个字段只有该函数会写。

因此第④步不是「看起来变了」，而是：回调被验签接受 → 绑定校验通过 → 条件更新命中 1 条 → `pending→paid` 完成。

---

## 4. 证据获取方式（可复现）

1. CloudBase → 文档型数据库 → 集合 `orders` → 导出 JSON（3 条，导出时间 `2026-11-09 01:10:46` PST），第三条即本单；文件已下载至本机 `Downloads/database_export-shizhang-pay-d0g1n58020acf6b5b-orders.json`。
2. 微信后台 → 虚拟支付 → 交易订单 → 环境选「沙箱环境」→ 查询，见上表行；同一页「2026-11-09 资金概况」的昨日四项（笔数/金额/技术服务费/CPS）均为 `-`，因昨日（11-08）无成交。
3. 代码侧核对：`git show origin/main:miniprogram/cloudfunctions/vpay-notify/index.js`（L83–L108 `handleDeliver`）。

---

## 5. 明确没做到 / 没核的

1. **云函数逐次调用日志没取到**：CloudBase 概览页明示「日志服务未启用，无法进行运行状态分析」。所以本次回调判定依赖 DB 字段迁移，而非函数日志原件。若后续要留日志级证据，需先在控制台开启日志服务。
   - 更正（2026-11-09）：日志服务已于 17:53 开启，并已取到退款推送的函数级证据（`request_id 822a9cea-dc24-11f1-946e-52540006055e`，返回 `ErrCode:-1`）。详见 `MINIPROGRAM-VPAY-REFUND-GAP-20261109.md`。
2. **两套单号未做映射核实**：微信后台表格「交易单号」为 `4500000521202611091049547966`，与 DB 中 `wx_order_id=VPO261109170747016376319` 不是同一标识。二者应为不同层标识，本轮**未核实其对应关系**，交叉锚点改用「商户单号 + 金额 + 时间」。
3. **两笔历史 pending 未处理**：`VP20261107045028c2a3f1e1`（`2026-11-07T04:50:28.239Z`）、`VP202611070806582eb81ed9`（`2026-11-07T08:06:58.327Z`），同为 `source_check` 990 分、`pending`、`wx_order_id=null`。`payEnabled=true` 后页面层不再过滤 `pending`，这两笔会出现在订单页。是否标 `closed` 属数据写操作，等 owner 决定。（2026-11-09 已按 owner 指令处理，见第 7 节）
4. **交付状态未发生**：本产品为人工交付服务，回调只把单置 `paid`，`delivered` 需人工完成后另行标记。
5. **前端「已支付」显示未截图取证**：只做了后端（DB）与微信侧（交易订单）双证，未录小程序端刷新后的页面。
6. **线上发布仍被两条前置挡住**：账号未通过微信认证完成主体真实性验证、小程序备案未完成（2–22 工作日）。本次只跑到体验版沙箱，未涉及提审/发布。

---

## 6. 关键路径

- 订单集合：CloudBase `shizhang-pay-d0g1n58020acf6b5b` → 文档型数据库 → `orders`
- 回调函数：`vpay-notify`（执行方法 `index.main`，HTTP 推送入口，`VPAY_PUSH_TOKEN` 已配）
- 下单函数：`vpay-order`（`GOODS` 三件：`source_check` 990 / `delivery_check` 1990 / `document_tidy` 1490）
- 支付开关：`miniprogram/config/index.js` → `payEnabled`（现为 `true`，验收逻辑：不过就改回 `false`）
- 复查入口：小程序后台「版本管理 → 开发版本 / 体验版」、虚拟支付「交易订单（沙箱环境）」、CloudBase「文档型数据库 orders」

---

## 7. 数据状态迁移（2026-11-09 补做，已导出回读）

| 订单 | 迁移 | 理由 |
|---|---|---|
| `VP20261107045028c2a3f1e1` | `pending` → `closed` | 11-07 未付款测试单，`paid_at`/`wx_order_id` 均为 null，长期滞留会在订单页显示「待支付」 |
| `VP202611070806582eb81ed9` | `pending` → `closed` | 同上 |
| `VP202611090907466de445e3` | `paid` → `delivered` | 按 owner 指令做一次完整交付演练；`paid_at`/`wx_order_id`/`notify_at`/`notify_product_id`/`notify_quantity` 全部原样保留 |

- 操作方式：CloudBase 控制台 → 文档型数据库 → `orders` → 逐条展开 → `status` 字段铅笔 → 改值 → 确定（逐字段编辑，未动其它字段）。
- 回读方式（独立于操作界面）：再次「导出数据」得 `database_export-shizhang-pay-d0g1n58020acf6b5b-orders(1).json`（1098 字节、3 行），三条 `status` 依次为 `closed` / `closed` / `delivered`；首单其余字段逐项核对无变化。导出记录显示本次导出在 2026-11-09 01:36–01:38（PST）区间。
- 兼容性核对（`vpay-notify/index.js`）：`handleDeliver` 对 `closed` 直接返回 `success()`，对 `paid|delivered` 要求 `wx_order_id` 一致；`handleRefund` 允许 `paid|delivered` 进入 `refund_pending_verification`。本次迁移不阻断后续退款通知处理。
- 未能做到：控制台逐字段编辑只能改已有字段，文档级「整篇编辑」入口点击无响应，因此**未新增 `delivered_at` / `closed_at` 字段**；交付/关闭的具体时刻没有落库，以本节操作时间（2026-11-09 01:36–01:40 PST 区间）为准。
- 本轮未做：未改小程序版本。
  - 更正（2026-11-09）：已发起沙箱全额退款（`VPR26110917109261225`，9.90，「用户退款成功」），已开启 CloudBase 日志服务；原「未发起沙箱退款、未开启日志服务」表述作废。
---

## 8. 邮件告知记录（2026-11-11）

owner 反馈"付款沙箱过了但没人知道"，经核对：本回执此前只提交到仓库，未单独发邮件给 GPT 席。现已补发：

| 项 | 值 |
|---|---|
| 邮件主题 | 【补告知·已验收】小程序虚拟支付沙箱首单已付款成功，退款链路已上线并逐字节核对 |
| message_id | `msg_zlOoBPeyGqbBPvScy9uikqVYqVZjzjuxdlVnpfRhx01b2w` |
| 发送时间 | `2026-11-11T08:40:12Z` |
| 发件 → 收件 | `qingqizhu6502@agent.qq.com` → `ltzyz2181@gmail.com` |
| 附件 | 无（正文纯文本，未含任何凭据值） |

正文覆盖：四步链终态与付款单硬证据、退款三态行为与线上包核对、本单 `refunded` 的人工对账来源、五项未做到、三项待 GPT 席确认。
