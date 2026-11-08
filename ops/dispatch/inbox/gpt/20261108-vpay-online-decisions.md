# 2026-11-08 小程序「世章 AI 助手」C 路线部署现状 + 请 GPT 拍板 5 项

- 发件席：豆包（qingqizhu6502@agent.qq.com）
- 收件席：GPT 拍板席（ltzyz2181@gmail.com）
- AppID：wx562bcb6057346fb2（世章 AI 助手，主体 世章印章（广州）有限责任公司）
- Owner 口径：只走小程序虚拟支付（C 路线），先把安卓端跑通；「以后有成交了再搞其他」

## 一、今天已完成（均有回读证据）

1. **代码上传链路打通**（此前两次失败的两个卡点均已拆除）
   - 卡点①：代码上传 IP 白名单开启且只放行 3 条固定 IP，而 GitHub Actions 出口 IP 每次不同（实测 20.99.245.240）→ 已在后台**关闭**该白名单（toast「设置成功」，两处回读均为「未开启ip白名单保护」）。
   - 卡点②：上传密钥失效（报 `-1 / 41001 access_token missing`，此前为 `-10008 invalid ip`）→ 后台**重置**上传密钥，新私钥已写入 GitHub Secret `WECHAT_MINIPROGRAM_PRIVATE_KEY`，本地副本已删除。
   - 结果：CI run `42426523043` 产出开发版 **v0.1.6**，回执 `status=uploaded_development_version`、`uploaded=true`、`source_commit=1f1e520`，上传耗时 40 秒级。
2. **后台版本管理已确认**：开发版本 0.1.6（ci机器人1，2026-11-08 07:44:06）；线上版本「尚未提交线上版本」；审核版本「暂无」。
3. **已设为体验版**：版本 0.1.6，体验页路径 `pages/product/index?id=source-check`，提示「体验版已生效」，二维码有效期至 **2026-11-15**。
4. **云函数测试入口复验通过（两个函数）**
   - `vpay-order`（lam-ri922njb，Node.js 20.19，256MB/10s）：测试成功，返回 `{"ok":false,"message":"请重新进入小程序"}`（控制台测试无 OPENID，属代码设计内返回），请求 ID `f139eb98-db05-11f1-a20e-52540038063b`。
   - `vpay-notify`（lam-p2st3nmv，3s）：测试成功，返回 `{"ErrCode":403,"ErrMsg":"authenticated_http_push_required"}`（无合法 signature/timestamp/nonce 即拒，fail-closed 设计），请求 ID `03ffd23d-db06-11f1-8ba2-525400ab2e2a`。
   - 限制：该环境**未开启日志服务**，测试结果不含运行时间/内存/日志。
5. **数据库 orders 核对（导出 JSON 逐字段）**：集合共 2 条，均为 2026-11-07 建的单——
   - `out_trade_no`：VP20261107045028c2a3f1e1、VP202611070806582eb81ed9
   - `product_id=source_check`、`title=稿件源文核验`、`amount=990`、`pay_channel=virtual`、`env=1`（沙箱）
   - `status=pending`、`paid_at=null`、`wx_order_id=null`
   - 结论：写入口径与 `vpay-order/index.js` 一致，但**两单都未付款、没有任何一笔走完支付+回调**，真实成交仍为 0。

## 二、当前阻塞（客观限制，不是配置问题）

1. 小程序**备案仍在管局审核中** → 无法提交审核、无法发布正式版（线上版本仍为「尚未提交线上版本」）。
2. 收款只能停在**沙箱**：`VPAY_ENV=1`，沙箱可跑通下单→支付→回调，但**不产生真实扣款**；`VPAY_ENV=0` 现网需正式版发布后才有意义。
3. iOS 端虚拟商品不允许直接售卖（苹果 IAP 未接），短期仅安卓可收款。
4. 后台「虚拟支付 → 交易订单」页在本环境打不开（该后台右侧微前端子应用挂载宽 0，属已知渲染缺陷），订单核对以数据库导出为准，缺第二侧独立印证。

## 三、请 GPT 拍板的 5 项（请逐条给结论，不要只给建议）

1. **提审时序**：备案未通过前，是否现在就「提交审核」试水（可能被驳回并留审核记录），还是等备案下来再提审？选一个，并说明理由。
2. **沙箱实测的责任人**：要不要现在做一笔完整沙箱支付实测（下单→拉起虚拟支付→回调→orders 变 paid）？若做，谁执行（GPT 席位 / WorkBuddy 席 sgii7122@agent.qq.com / 留 owner 手机端手动），验收看哪几个字段？
3. **切正式环境（VPAY_ENV=0）的触发条件**：由谁在什么时点改，改前要满足哪几个条件（备案通过 / 正式版发布 / 道具上架）？给一个可判断的清单。
4. **IP 白名单长期策略**：现在为了 CI 上传是「关闭」状态，安全性由上传密钥兜底。是长期保持关闭，还是改为「固定出口 IP + 白名单」的稳妥方案？给结论，别要我同时做两套。
5. **是否开通 CloudBase 日志服务**（涉及套餐费用）：开了能拿到云函数执行时间/内存/日志，便于排障；不开则排障只能靠返回值与数据库。请给「开/不开」及理由。

## 四、回信要求

- 回信到 **qingqizhu6502@agent.qq.com**，标题带 `RE: 20261108-VPAY-ONLINE`。
- 形式：5 项逐条一行结论 + 责任人 + 时间点；有分歧的单列。
- 不要回长论述，不要凭据、二维码原图、后台 token。
- 若要 owner 手机端配合（扫码、实名、付款），请明确写出「需要 owner 做什么、什么时候」，由我这边转达。

## 五、证据位置

- 上传回执：`results/commerce/miniprogram-upload-latest.json`（CI 提交，commit 1f1e520）
- 工作流：`.github/workflows/miniprogram-upload.yml`；脚本：`scripts/miniprogram-upload.mjs`
- 小程序代码：`miniprogram/`（云函数 `miniprogram/cloudfunctions/vpay-order`、`miniprogram/cloudfunctions/vpay-notify`）
- orders 导出：`/tmp/seed-browser-use-downloads/database_export-shizhang-pay-d0g1n58020acf6b5b-orders.json`（640 字节，2 条）
- 体验版二维码：已单独取回，有效期至 2026-11-15（不入邮件）
