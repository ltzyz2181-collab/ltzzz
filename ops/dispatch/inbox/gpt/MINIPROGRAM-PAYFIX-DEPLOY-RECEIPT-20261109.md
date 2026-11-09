# 小程序上线前整改与部署回执（2026-11-09）

- 执行席：豆包席
- 代码提交：`c60e1372`（`fix(miniprogram): align payment copy with payEnabled, hide unpaid test orders, map legacy order titles`）
- CI 上传：run `42586893072`，`status=uploaded_development_version`，`version=0.1.7`，`uploaded=true`，`published=false`，`source_commit=c60e1372444c85845af7848bb922127091658c0b`
- 回执文件：`results/commerce/miniprogram-upload-latest.json`（CI 自动提交回 main）
- 云函数：**本次零改动、未重部署**（改动全部在小程序端 6 个文件）

## 一、实际改了什么（逐项对账）

| 编号 | 问题 | 处置 | 文件 | 证据 |
|---|---|---|---|---|
| P2 D1 | 列表页写「支持微信在线支付」，实际未开放，与详情页「在线预约尚未开放」矛盾 | 列表页文案改为由 `config.payEnabled` 驱动；未开放时显示「在线支付通道尚在开通中，当前只能浏览服务介绍」 | `pages/catalog/index.wxml:12`、`pages/catalog/index.js` | 见提交 `c60e1372` |
| P2 D2 | 体验环境两条真实「待支付」订单任何体验者可见 | 订单页在 `payEnabled=false` 时过滤 `status==='pending'` 的订单；空态文案同步改为未开放口径 | `pages/orders/index.js`、`pages/orders/index.wxml` | 同上 |
| P3-1 | 订单卡显示旧标题「稿件源文核验」 | 展示层按 `product_id`（含 `source_check ↔ source-check` 别名）映射到 `data/products.js` 当前商品名，历史订单不再泄漏旧标题 | `pages/orders/index.js` | 同上 |
| P3-2 | 协议页「下单通过微信支付完成」未兑现 | 协议第三节改为双分支：开放时写「小程序内置的微信支付（虚拟支付）」，未开放时明确写「尚在开通中，暂不接受下单与付款」；页脚更新日期改 2026-11-09 | `pages/agreement/index.wxml:15-19`、`pages/agreement/index.js` | 同上 |
| P3-3 | 控制台 `reportRealtimeAction` 警告混在错误计数里 | **未做代码修复**。该告警来自基础库/框架，不在本项目代码里（全仓 grep 零命中），代码层无法消除 | — | 见第四节「明确没做到的」 |

`config.payEnabled` 仍为 `false`（`miniprogram/config/index.js:11`），本次**没有打开任何支付**。

## 二、Q1–Q4 逐条结论

### Q1 虚拟支付

- 已完成部分：三条道具（`source_check` ¥9.9 / `delivery_check` ¥19.9 / `document_tidy` ¥14.9）已在 MP 后台发布；`vpay-order` 的签名链路（`paySig = HMAC(APPKEY, "requestVirtualPayment&"+signData)`、`signature = HMAC(session_key, signData)`）已写好；`vpay-notify` 回调验签函数已存在。
- 仍未完成：云函数环境变量 `WX_APP_SECRET` / `VPAY_APPKEY_SANDBOX`（现网 `VPAY_APPKEY_LIVE`）是否已配齐**无法核实**——我没有 CloudBase 凭据，读不到云函数环境变量；`VPAY_ENV` 现为默认 `1`（沙箱），从未跑通一笔沙箱支付+回调。
- 结论：虚拟支付与商户号 `1752422818` 的 JSAPI 权限是**两条独立通道**；虚拟支付不受 `NO_AUTH` 卡点影响，是目前更快的上线路径，但必须先把密钥配齐并跑通一笔沙箱全链路。

### Q2 支付开通与提审

- 微信支付（商户号通道）仍卡在同一处：产品大全 4/4 未开通、无 API 安全入口、V3 下单 `NO_AUTH`。这需要服务商侧开通产品权限并下发证书/APIv3 密钥，属于我方无法自助完成的环节（客服已索要超管手机号，待你回填）。
- 提审：本次整改后小程序内**没有任何地方再承诺支付已可用**（四处文案全部由 `payEnabled` 驱动，当前为 false），因此「展示型版本」具备提审条件。但体验版设置、提审、发布三步必须 owner 本人在后台操作。
- 我不能替你点提审——这是账号权限边界，不是能力问题。

### Q3 五个具体问题

1. **payEnabled 何时打开**：四个条件全部满足才开——①虚拟支付 AppSecret 与 AppKey 已在云函数环境变量就位；②至少一笔沙箱支付成功且 `vpay-notify` 验签通过、订单从 `pending → paid`；③`order-query` 回读状态一致；④体验版实测通过。当前四个条件都不满足，保持 `false`。
2. **三处文案统一口径**：已统一为单一开关驱动（列表页/详情页/订单页/协议页），未开放时的统一表述是「在线支付通道尚在开通中，仅可浏览服务介绍，不接受下单与付款」。
3. **24h 人工还是自动交付**：保持**人工交付**。协议、商品页、订单页三处原本都写「24 小时内人工交付」，代码里不存在自动交付链路；本次只统一口径，没有引入自动交付。
4. **两条真实测试订单怎么处理**：显示层已隐藏（未开放时过滤 `pending`）。数据层它们**仍是 `pending`**，我没有动数据库。建议开现网前在控制台把这两条标记 `closed`——这需要控制台权限，我不代做。
5. **旧标题怎么改**：走展示层映射，不改 `vpay-order` 的 `GOODS.title`。原因：道具名已在微信后台发布，`signData` 里的 `productId`/`goodsPrice` 必须与后台一致，动标题有破坏道具一致性的风险。展示层映射零风险且立即生效。

### Q4 五个具体问题

1. **云函数是否一起重部署**：不需要。本次 6 个文件全在 `miniprogram/pages`，`cloudfunctions/` 无 diff（`c60e1372` 只含页面文件）。
2. **顺序（回调 → 下单 → 查询）**：这是**验收顺序**，不是部署顺序，我照此执行：先确认 `vpay-notify` 回调地址可达且验签通过，再下沙箱单，再用 `order-query` 回读。理由：回调不通时先下单只会制造孤儿 `pending` 单（现在库里那两条就是这种）。
3. **要不要独立测试环境**：暂不需要。`VPAY_ENV=1` 已是沙箱，天然隔离现网；等要走现网前，再评估是否单独建环境。
4. **回调地址与验签谁配**：回调地址在 MP 后台「虚拟支付 → 基础配置」配置，验签密钥（`VPAY_APPKEY_*`、`WX_APP_SECRET`）在云函数环境变量里配。两者都需控制台权限，**我没有配，也无法核实当前是否已配**。
5. **workflow 动不动**：动了。本次触发 `miniprogram-upload.yml` 一次（run `42586893072`），成功，回执已由 CI 自动提交回 `main`。

## 三、验证方式与结果

- 语法：`node --check` 四个改动 JS 全部通过（本地与云端各一次）。
- 文案一致性：全仓 grep `支持微信在线支付` / `下单通过微信支付完成`，剩余命中均在 `payEnabled` 分支内，不存在无条件承诺。
- 上传：CI run `42586893072` 全绿，回执 `uploaded=true / published=false / version=0.1.7 / source_commit=c60e1372`。
- 未验证：真机/模拟器实际渲染效果。我没有在微信开发者工具里跑过本次构建——这一点如实标注。

## 四、明确没做到的

1. **支付没有开通**。`payEnabled` 仍是 `false`；商户产品权限、证书、APIv3 密钥都不在我手里；虚拟支付的密钥是否就位我无法核实。
2. **P3-3 未修**。`reportRealtimeAction` 告警来自基础库/框架，不在我方代码内，代码层无解；只能在控制台按 warning 级别看待，不计入错误数。
3. **云函数未重部署**（本次无需），但因此也无法证明虚拟支付链路可用。
4. **数据库未改动**。两条测试 `pending` 单仍在库里。
5. **体验版/提审/发布未做**，需 owner 本人后台操作。
6. **未做真机渲染验收**。

## 五、下一步唯一的关键路径

配齐虚拟支付密钥 → 配置并验证回调地址 → 沙箱下一单 → 验证 `vpay-notify` 验签与 `pending → paid` 迁移 → 才谈把 `payEnabled` 改 true。这条链上任何一环缺证据，`payEnabled` 都不能开。
