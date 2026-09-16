# LTZZZ 支付系统（支付宝版）说明

> 本文档记录 LTZZZ「资金与支付宝 API」方案的现实能力边界、系统设计、部署顺序与当前状态。
> 代码：`ltzzz-pay-proxy-worker.mjs` ｜ 配置：`wrangler.pay.toml` ｜ 测试：`tools/pay_safety_test.mjs` ｜ 账本同步：`tools/sync_pay_ledger.py`
>
> **部署状态（2026-09-16）**：Worker 已上线 `https://ltzzz-pay-proxy.ltzyz2181.workers.dev`（`sandbox` 档位、`manual` 模式）；`LTZZZ_AGENT_TOKEN` 已配置；本地 29 项单测 + 线上冒烟测试（决策放行/黑名单拦截/超限暂停/全局暂停与恢复/账本 Markdown 导出）全部通过；余额已按 400 元初始化。**仅缺 3 个密钥 Secret**（见第四节）即可进入支付宝沙盒联调。

## 一、现实能力结论（2026-09 官方核实）

| 能力 | 官方接口 | 准入要求 | 说明 |
| --- | --- | --- | --- |
| **AI 服务器自主付款** | `alipay.fund.trans.uni.transfer` 单笔转账 | **仅注册满 90 天的企业支付宝账户**（个体工商户/个人不支持） | 唯一真正「自动把钱转给供应商」的能力；免费；实时到账**不可撤销**；只支持**余额渠道**（天然无透支/花呗/信用）；2026 起新接入商户必须传 `transfer_scene_name` + `transfer_scene_report_infos` |
| 收款（别人付给 LTZZZ） | 电脑网站支付 / 手机网站支付 / 当面付 | 个人账号需营业执照（无执照单笔≤50/日≤1000） | 方向相反，本方案不需要，未来卖工具/课程时再用 |
| 沙箱测试 | 沙箱环境 | 入驻开放平台即可 | 网关 `https://openapi-sandbox.dl.alipaydev.com/gateway.do`；虚拟资金；自动生成沙箱应用与测试账号；每周日 12:00-周一 12:00 维护 |

**结论**：
- **轨道 A（立即可用，无资质门槛）**：`PAY_MODE=manual` —— AI 下单 → 生成收款码/收银台 → **用户支付宝端确认**。不绕过支付宝安全边界，个人档位只能这样。
- **轨道 B（需企业支付宝 + 签约）**：`PAY_MODE=transfer` —— AI 无密直转，需 `LTZZZ_ALLOWED_VENDORS` 白名单。
- 对「在商户网站购买 API/云服务」这类场景，支付宝 API **无法代替**在供应商站内下单；需先给供应商账户充值（走轨道 A 或人工），再由 AI 消耗预充值额度。

## 二、安全规则（代码级强制）

1. 总授权额度 `LTZZZ_MAX_BUDGET`（默认 400 元），支出累计永不超过；
2. 禁止类目黑名单：赌博/武器/毒品/色情/洗钱/诈骗/政治捐赠/个人转账/转自己/提现/借贷透支/花呗/无关个人消费；
3. 余额 ≤ 0 → 全局停止；支付连续失败 ≥3 → 暂停该服务商；5 分钟内同服务商同金额 → 拒绝；
4. 金额异常（超 `LTZZZ_MAX_AMOUNT` 单笔上限）→ 拒绝并标记人工复核；
5. API 异常不循环重试（防止重复扣款）；幂等键 `out_biz_no` 防重；
6. 密钥只存 Cloudflare Secret，绝不放 GitHub/前端/代码；
7. 异步通知：RSA2 验签 → 校验 app_id/订单/金额 → 幂等 → 返回纯文本 `success`；丢单靠主动查询兜底（转账用 `alipay.fund.trans.common.query`，收款用 `alipay.trade.query`）；
8. 转账受理（code=10000）≠ 成功：记 pending 订单并锁定资金，最终状态以异步通知/主动查询为准；失败自动冲回余额。

## 三、部署与密钥

```bash
npx wrangler deploy -c wrangler.pay.toml
npx wrangler secret put LTZZZ_AGENT_TOKEN    # AI 代理令牌（豆包/总控调用本系统）
npx wrangler secret put ALIPAY_APP_ID
npx wrangler secret put ALIPAY_PRIVATE_KEY   # RSA2 应用私钥（PEM，PKCS1/PKCS8 均可）
npx wrangler secret put ALIPAY_PUBLIC_KEY    # 支付宝公钥（SPKI PEM）
```

变量：`ALIPAY_ENV=sandbox|prod`、`PAY_MODE=manual|transfer`、`LTZZZ_MAX_BUDGET=400`、`LTZZZ_MAX_AMOUNT=50`、`LTZZZ_PAY_CHANNELS=balance`（仅余额，防花呗）。

## 四、API 一览

| 端点 | 认证 | 作用 |
| --- | --- | --- |
| `GET /health` | 无 | 状态/余额/密钥配置情况 |
| `GET /balance` `GET /ledger` `GET /decisions` `GET /stop` | 无 | 只读账本 |
| `GET /ledger?format=md` | 无 | Markdown 账本（同步脚本拉取） |
| `POST /admin/init` | token | **AI 共同确认「开始使用 400 元额度」后**初始化账本 |
| `POST /decision` | token | AI 决策预校验（不扣款） |
| `POST /order/create` | token | 下单（手动档生成收款码 / 企业档直转） |
| `POST /order/query` | token | 主动查询订单终态 |
| `POST /order/notify` | 支付宝签名 | 异步通知（验签即认证） |
| `POST /refund` | token | 退款（收款订单）并冲回余额 |
| `POST /roi` | token | AI 回填投资回报记录 |
| `POST /pause` `POST /resume` | token | 暂停/恢复（全局或指定服务商） |

## 四·五、支付状态机（任务六）

订单状态：`pending`（已下单）→ `paid`（已支付）→ `settled`（已结算）；终态另有 `failed / cancelled / timeout`。

每笔订单保存：**订单号、服务商、金额、时间、状态、用途、任务ID**。
支付模块**只保存上述订单信息**；**不保存支付宝密码、支付密码、银行卡密码**（这些密码只存在于用户支付宝 App 端）。
未经人工/AI 共同授权，不得自行增加预算或无限自动扣款。

## 五、部署顺序状态

| 步骤 | 状态 | 说明 |
| --- | --- | --- |
| 1 支付宝开放平台能力确认 | ✅ 完成 | 见上文能力表（官方文档核实） |
| 2 企业账户资质确认 | ⚠️ 待用户 | 轨道 B 需要注册满 90 天的企业支付宝；无则先走轨道 A |
| 3 API 权限确认 | ⚠️ 待用户 | 沙箱可测；正式转账需签约「转账到支付宝账户」 |
| 4 安全密钥配置 | ✅ 已完成（沙箱） | 沙箱 APPID 9021000168626522 + RSA2 私钥/支付宝公钥已写入 Cloudflare Secret；正式密钥待企业应用创建后替换 |
| 5 400 元余额确认 | ✅ 已初始化 | 余额 400.00（含 0.01 沙盒测试+0.01 冲回留痕），正式启用仍待用户口令 |
| 6 自动付款逻辑 | ✅ 已实现 | `ltzzz-pay-proxy-worker.mjs` |
| 7 账本 | ✅ 已实现 | KV 账本 + Markdown 导出 |
| 8 AI 决策日志 | ✅ 已实现 | `/decision` + `/roi` |
| 9 自动停止机制 | ✅ 已实现 | 余额/熔断/重复/异常四类守卫 |
| 10 沙盒测试 | ✅ 已完成（2026-09-16） | 双轨道实测：轨道 A 当面付预下单返回收款码；轨道 B uni.transfer 转账 0.01 受理并终态 SUCCESS；期间修复 3 个联调 bug（见下） |
| 11 小额真实测试 | ⏳ 资质+密钥 | 轨道 B 需企业资质 |
| 12 正式开放 400 元 | ⏳ AI 共同确认 | 明确口令后才进入真实自动付款 |


## 六、沙盒联调记录（2026-09-16）

- **沙箱应用**：APPID 9021000168626522，绑定商户 PID 2088721112645494（沙箱商户，虚拟余额 100 万）；网关 openapi-sandbox.dl.alipaydev.com。
- **轨道 A（manual/当面付）**：/order/create trade_type=precreate → 返回收款码 qr.alipay.com/bax...，个人档可用。
- **轨道 B（transfer/单笔转账）**：0.01 元转账至沙箱买家（UID 2088722112674945）→ 网关受理（订单号 LT1789527793553631）→ /order/query 终态 **SUCCESS**，订单自动推进 pending→paid，余额 400→399.99→冲回 400。
- **联调中发现并修复的 3 个 bug**：① 请求签名串误剔除 sign_type（通知验签规则错用于请求签名）→ 修正为请求签名保留 sign_type、通知验签剔除；② 转账查询缺 product_code/iz_scene → 补齐；③ 时间戳带 +08:00 后缀 → 改为 yyyy-MM-dd HH:mm:ss。
- **熔断真实触发验证**：签名 bug 期间连续失败 3 次 → 服务商自动暂停（/order/create 403），恢复后继续，验证了自动停止机制真实生效。
- **新增**：/refund 支持 ookkeeping=true 记账冲回（沙盒测试冲回/线下退款场景）。
- **测试后状态**：账本已清空、余额 400.00、PAY_MODE=manual（安全默认）、正式启用仍需用户口令。
## 七、正式环境进展（2026-09-16）

- **正式应用已创建**：LTZZZ数字实验室（网页应用），APPID 2021007101625045，绑定商家账号 世章印章（广州）有限责任公司（PID 2088531262155266）。
- **接口加签已配置（证书模式）**：单笔转账到支付宝产品正式环境必选证书；应用公钥证书/支付宝公钥证书/根证书已下载，app_cert_sn 与 alipay_root_cert_sn 已计算。Worker 已支持证书模式（配置 ALIPAY_APP_CERT_SN / ALIPAY_ROOT_CERT_SN 后自动携带 cert_sn 参数并参与签名）。
- **当面付已开通**（轨道 A 收款产品）；**商家转账（原转账到支付宝账户）未开通**：签约时被支付宝风控拦截（提示致电 95188），需用户本人操作或稍后重试。
- **转账场景（2026 新规）**：uni.transfer 请求已内置 transfer_scene_name + transfer_scene_report_infos（默认业务结算，可按供应商配置）。
- **切换正式环境的前置条件**：① 商家转账签约通过（用户操作）；② 应用提审上线（开发中→已上线）；③ 替换 Secret 为正式密钥 + ALIPAY_ENV=prod。在此之前保持沙箱环境不变。
- **正式密钥材料**：存放于 C:\Users\李天柱\Doubao\chats\2026-09-16\new-chat-3\_alipay_prod\（应用私钥/CSR/证书），敏感文件，正式切换完成后删除。
- **正式密钥切换完成（2026-09-16 下午）**：ALIPAY_APP_ID 已换为正式 2021007101625045；私钥/公钥/证书 SN 已更新为正式值；ALIPAY_ENV=prod、PAY_MODE=transfer 已部署。
- **证书 SN 官方算法（踩坑记录）**：app_cert_sn 与 alipay_root_cert_sn 均为 MD5(签发机构issuer名称 + 序列号十进制字符串)，不是 openssl serial、不是证书内容/DER MD5。官方 Node SDK lipay-sdk/dist/commonjs/antcertutil.js 的 getSN() 为唯一权威实现；root 仅取 RSA 签名（signatureOID 以 1.2.840.113549.1.1 开头）的证书，多张用 _ 连接。当前值：APP=e56570ea0fc4d4814fbecb6148c62483，ROOT=687b59193f3f462dd5336e5abf83c5d8_02941eef3187dddf3d3b83462e1dfcf6。
- **证书校验已通过**：40002（无效根证书序列号）→ 换官方算法后消失；当前卡点为 40003 应用未上线 → 已在开放平台提审，状态审核中（平台承诺 1 天内完成）。
- **正式链路进度**：沙箱 30/30 单测 ✅ → 正式密钥/证书配置 ✅ → 证书 SN 校验 ✅ → 应用提审（审核中）→ 审核通过后重测 0.1 元转账（收款方 13424479743 已在白名单）。