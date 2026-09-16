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
| `POST /admin/init` | token | **用户确认「开始使用 400 元额度」后**初始化账本 |
| `POST /decision` | token | AI 决策预校验（不扣款） |
| `POST /order/create` | token | 下单（手动档生成收款码 / 企业档直转） |
| `POST /order/query` | token | 主动查询订单终态 |
| `POST /order/notify` | 支付宝签名 | 异步通知（验签即认证） |
| `POST /refund` | token | 退款（收款订单）并冲回余额 |
| `POST /roi` | token | AI 回填投资回报记录 |
| `POST /pause` `POST /resume` | token | 暂停/恢复（全局或指定服务商） |

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
| 12 正式开放 400 元 | ⏳ 用户确认 | 明确口令后才进入真实自动付款 |


## 六、沙盒联调记录（2026-09-16）

- **沙箱应用**：APPID 9021000168626522，绑定商户 PID 2088721112645494（沙箱商户，虚拟余额 100 万）；网关 openapi-sandbox.dl.alipaydev.com。
- **轨道 A（manual/当面付）**：/order/create trade_type=precreate → 返回收款码 qr.alipay.com/bax...，个人档可用。
- **轨道 B（transfer/单笔转账）**：0.01 元转账至沙箱买家（UID 2088722112674945）→ 网关受理（订单号 LT1789527793553631）→ /order/query 终态 **SUCCESS**，订单自动推进 pending→paid，余额 400→399.99→冲回 400。
- **联调中发现并修复的 3 个 bug**：① 请求签名串误剔除 sign_type（通知验签规则错用于请求签名）→ 修正为请求签名保留 sign_type、通知验签剔除；② 转账查询缺 product_code/iz_scene → 补齐；③ 时间戳带 +08:00 后缀 → 改为 yyyy-MM-dd HH:mm:ss。
- **熔断真实触发验证**：签名 bug 期间连续失败 3 次 → 服务商自动暂停（/order/create 403），恢复后继续，验证了自动停止机制真实生效。
- **新增**：/refund 支持 ookkeeping=true 记账冲回（沙盒测试冲回/线下退款场景）。
- **测试后状态**：账本已清空、余额 400.00、PAY_MODE=manual（安全默认）、正式启用仍需用户口令。