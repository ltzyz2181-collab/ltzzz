# 微信侧凭据与多 AI 协作（小程序 / 服务号 / 支付）

状态：2026-11-06 实测。本文件说明「哪些钥匙可以放进仓库、哪些不能、其他 AI 席位怎么用、自动接单能做到哪一步」。

## 结论先说

1. **能协作，但密钥不是"放进仓库"，而是"放进仓库的 Actions Secrets"**。仓库里已经有这条通道（2026-10-13 就配了），AI 席位靠触发 workflow 使用密钥，读不到明文。
2. **当前这条通道是坏的**，三处要修（见第 3 节），不是没建。
3. **支付商户私钥永远不进仓库、不进 Secrets、不进对话**，只进微信云开发云函数的环境变量。
4. **AI 能自动接单，但"送达用户"这一公里要靠客服会话或订阅消息**，小程序不允许主动给用户发消息。

## 一、凭据分三类

| 类别 | 具体东西 | 放哪 | 谁能读 |
|---|---|---|---|
| 可公开 | 小程序 AppID `wx562bcb6057346fb2`、云开发环境 ID、服务类目 | 仓库文件（`miniprogram/project.config.json`、`config/index.js`） | 所有人 |
| 只进 Secrets | 小程序代码上传私钥、公众号 AppSecret、上传 CI 用的 AppID | GitHub Repo Secrets | 只有 Actions 运行时，AI 拿不到明文 |
| 绝不入库 | 微信支付**商户私钥**、APIv3 密钥、商户证书序列号 | 微信云开发控制台 → 云函数环境变量 | 只有云函数运行时 |

一旦商户私钥进了仓库提交历史，等于把收款能力公开，只能吊销重签，所以这条是硬线。

## 二、现在仓库里已经有什么

`.github/workflows/miniprogram-upload.yml`（手动触发）→ `scripts/miniprogram-upload.mjs`（miniprogram-ci 上传开发版）→ 回执写 `results/commerce/miniprogram-upload-latest.json`。

已配置的 Secrets（`gh secret list` 实测）：

- `WECHAT_MINIPROGRAM_APPID`
- `WECHAT_MINIPROGRAM_PRIVATE_KEY`

脚本兼容的别名：`WX_MINIPROGRAM_APPID` / `MINIPROGRAM_APPID` / `WECHAT_UPLOAD_PRIVATE_KEY` 等，任配一个即可。

## 三、这条通道现在为什么传不上去

最近一次真实回执（`results/commerce/miniprogram-upload-latest.json`，run 41569874504）：

```json
{
  "appid": "wx0b43a6cf2cb2b07d",
  "appid_source": "configured_secret",
  "status": "blocked_upload_ip_whitelist",
  "error_code": 20003,
  "remote_error_code": -10008,
  "failure_reason": "upload_ip_not_authorized",
  "observed_ips": ["13.71.231.23"],
  "uploaded": false
}
```

三处问题，逐个对应动作：

| # | 问题 | 修法 | 谁做 |
|---|---|---|---|
| 1 | Secrets 里的 AppID 还是旧号 `wx0b43a6cf2cb2b07d` | GitHub → Settings → Secrets → 改 `WECHAT_MINIPROGRAM_APPID` 为 `wx562bcb6057346fb2` | 仓库管理员 |
| 2 | 上传被 IP 白名单拦（20003 / -10008） | 微信公众平台 → 开发管理 → 开发设置 → **小程序代码上传 IP 白名单**，加入当次出口 IP | 小程序管理员 |
| 3 | GitHub 托管 runner 出口 IP 每次会变，加白是一次性的 | 长期要么换固定出口（自建 runner / 固定 IP 云主机），要么每次手动加白 | owner 决策 |

第 2 条的 IP 不是固定的：每次运行读回执里的 `observed_ips` 再加白即可。这也是为什么桌面用开发者工具上传更省事——工具走登录态，不校验这个 IP 白名单。

## 四、其他 AI 席位怎么参与

分两件事，别混：

**改代码**：任何席位 clone 仓库 → 改 `miniprogram/` → 提 PR。代码是明文，谁都能改，靠 PR 评审而不是靠发钥匙。

**上传/发布**：只能触发 Actions（`workflow_dispatch`）。席位不需要私钥，也读不到私钥；跑完看回执 JSON 判定成功与否。要人工点"提交审核/发布"，因为那一步后台要扫码。

**服务号是另一套**：公众号没有 miniprogram-ci，走的是 AppID + AppSecret 换 access_token，再调素材/草稿/发布接口。如果要做，需要：

- `WECHAT_MP_APPID` / `WECHAT_MP_APPSECRET` 两个新 Secret；
- 公众号后台 → 设置与开发 → 基本配置 → **IP 白名单**（同样会卡 IP）；
- 素材上传、草稿箱、发布是三个不同接口，发布后还有审核。

## 五、AI 能自动接单处理吗

分四层，按投入从低到高：

| 层 | 能力 | 现在能不能 | 缺什么 |
|---|---|---|---|
| L0 现状 | 用户下单 → 支付 → 前端查单落库 → 用户回来看"已支付" | 代码已写 | 云开发环境 + 商户三件套 |
| L1 轮询接单 | Actions 定时（如每 10 分钟）拉 `orders` 里 `pending` 的订单，调微信支付查单接口，`paid` 的派给 AI 生成交付物 | 可做 | 订单表可读（云开发 HTTP API 或管理端导出）+ 一个查单脚本 |
| L2 通知用户 | 交付完成后推"已交付"给用户 | 可做但有限 | 订阅消息模板（用户下单时点一次授权），只能推一次 |
| L3 全自动闭环 | 付款即时回调 → 自动生成 → 自动送达 → 自动退款 | 做不了 | 公网 HTTPS 域名 + 云托管/回调地址；当前方案故意没做回调 |

关键限制说清楚：

- **没有支付回调，钱到账的"事件"只能靠查单**，所以 L1 有 5–15 分钟延迟，且"用户付完直接关掉小程序"不会自动触发任何东西，只能等下一次轮询。
- **小程序不能主动私聊用户**。合法的两条路：微信客服会话（要用户先点"联系客服"进来）、订阅消息（要用户下单时授权一次）。所以 L3 之前，"最后一公里"必然有人或半自动介入。
- 交付物本身（核对清单、验收核对、格式校对）AI 完全能做，且能做得比人工快，卡点只在"送达"和"争议退款"。

## 六、待办（按顺序）

1. 桌面最新代码（4 页 + 3 个云函数）同步进仓库 `miniprogram/`——现在仓库里还是旧的 2 页展示版，其他 AI 改的是旧代码。
2. 修 Secrets 的 AppID 值。
3. 微信后台加 IP 白名单，跑一次 `miniprogram-upload.yml`，确认回执 `uploaded: true`。
4. 云开发开通 → 环境 ID 填 `miniprogram/config/index.js` 的 `cloudEnv`。
5. `orders` 集合 + 三个云函数上传 + 六个环境变量（`pay-create`/`order-query` 各一套 `WXPAY_MCHID`/`WXPAY_SERIAL_NO`/`WXPAY_PRIVATE_KEY`）。
6. 开通微信客服，否则用户付完没有交付入口。
7. L1 轮询脚本（做完 1–6 再上，否则查单查到的是空表）。
