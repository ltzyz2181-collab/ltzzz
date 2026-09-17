# LTZZZ 消息通道统一协议：WhatsApp / X / Facebook

> 状态：**三个 Worker 适配器代码已就绪**（`whatsapp-bot-worker.js` / `x-bot-worker.js` / `facebook-bot-worker.js`），
> 全部 `node --check` 通过；**所有平台凭证均为占位，等待人工凭证，未上线、未调用任何真实 API**。
> 参照范式：`telegram-bot-worker.js`（/webhook + /send + /status 三件套、CORS、Secret 校验）。
> 安全红线：密钥只进 Cloudflare Secret，绝不写入仓库 / 日志 / 前端 / 聊天回复。

---

## 1. 总览

| 通道 | Worker 文件 | 部署名（建议） | 凭证状态 |
|---|---|---|---|
| WhatsApp | `whatsapp-bot-worker.js` | `ltzzz-whatsapp-bot` | ⏳ 等待人工凭证 |
| X (Twitter) | `x-bot-worker.js` | `ltzzz-x-bot` | ⏳ 等待人工凭证 |
| Facebook | `facebook-bot-worker.js` | `ltzzz-facebook-bot` | ⏳ 等待人工凭证 |

三个通道对外形态完全一致：`GET /status` 健康检查、`POST /webhook` 收消息、`POST /send` 内部主动发消息，CORS 全开，异常统一 5xx 兜底。

---

## 2. 端点 / 鉴权 / 消息模型对照表

| 项 | WhatsApp（Meta Graph API） | X（Twitter API v2 Account Activity） | Facebook（Graph API Page） |
|---|---|---|---|
| webhook 验证（GET） | `/webhook`：校验 `hub.mode=subscribe` 且 `hub.verify_token===WHATSAPP_VERIFY_TOKEN`，**原样回显 `hub.challenge`**（text/plain） | `/webhook?crc_token=...`：用 `X_CONSUMER_SECRET` 做 HMAC-SHA256，返回 `{"response_token":"sha256=<base64>"}` | `/webhook`：校验 `hub.mode=subscribe` 且 `hub.verify_token===FB_VERIFY_TOKEN`，**原样回显 `hub.challenge`**（text/plain） |
| 消息回调（POST） | `/webhook`：Meta 推送体，正文取 `entry[].changes[].value.messages[]`，联系人取 `value.contacts[]` | `/webhook`：v2 事件体，DM 取 `dm_events[]`（含 `text` / `sender_id`） | `/webhook`：`object==="page"`，取 `entry[].messaging[].message.text` 与 `sender.id` |
| 请求验签（可选推荐） | `X-Hub-Signature-256: sha256=...`，用 `WHATSAPP_APP_SECRET` 校验 | X 官方要求请求源 IP 白名单（本 Worker 不验签，靠 CRC + HTTPS） | `X-Hub-Signature-256: sha256=...`，用 `FB_APP_SECRET` 校验 |
| 发消息（出站） | `POST https://graph.facebook.com/v21.0/{WHATSAPP_PHONE_NUMBER_ID}/messages`，`Bearer WHATSAPP_ACCESS_TOKEN`，体 `{messaging_product:"whatsapp", to, text:{body}}` | `POST https://api.twitter.com/2/dm_conversations/with/{participant_id}/messages`，`Bearer X_BEARER_TOKEN`，体 `{text}` | `POST https://graph.facebook.com/v21.0/{FB_PAGE_ID\|me}/messages`，体带 `access_token`，`{recipient:{id}, messaging_type:"RESPONSE", message:{text}}` |
| 健康检查 | `GET /status` → JSON（含 token 是否已配置、时间戳） | 同左 | 同左 |
| CORS | `*`，允许 `GET,POST,OPTIONS`，允许头含验签头 | 同左 | 同左 |

### 2.1 统一内部消息模型

三个通道把各自不同的 webhook 体统一抽成：

```js
{
  platform: "whatsapp" | "x" | "facebook",
  chat_id:  <会话键，用于回消息>,
  text:     <去首尾空白后的文本消息>,
  sender:   { id, name?, username?, phone? }
}
```

各通道 `chat_id` 取值差异（映射层已封装，业务层无感）：

1. WhatsApp：`messages[0].from`（对方 WhatsApp 号）。
2. X：`dm_events[0].sender_id`（对方 user_id，DM 会话按参与者建）。
3. Facebook：`messaging[0].sender.id`（页面会话 PSID）。

---

## 3. 人机门禁设计（与 Telegram 共用）

### 3.1 状态机（按 `chat_id` 会话维度）

```
收到消息
  │
  ├─ 文本命中「AI」类关键词 ───────────────► 回 AI 通道指引，状态=resolved
  ├─ 文本命中「人类」类关键词 ─────────────► 回人类路径指引，状态=resolved
  └─ 判定不清：
        首次（无状态）        → 追问「人类/AI？」，状态=asked_gate
        已是 asked_gate      → 再追问一次，状态=asked_retry
        已是 asked_retry     → 兜底按 AI 通道指引回复，状态=resolved
```

关键词判定：AI 侧命中 `ai/gpt/bot/robot/chatgpt/claude/deepseek/copilot/grok/机器/机器人/智能体/自动`；人类侧命中 `human/人类/真人/我是人`；两类同时命中或都不命中按「不清」处理。

### 3.2 统一文案（三个新通道逐字一致；Telegram 通道需同步同一份常量）

1. 首问：

   > 你好，这里是 LTZZZ 消息通道 ✅
   > 请问你是【人类访问】还是【AI 访问】？
   > 回复「人类」走人类路径，回复「AI」获取六个 LTZZZ AI 通道指引。

2. 追问（仅一次）：

   > 暂未识别身份，请再明确一次：回复「人类」走人类路径，或回复「AI」获取六个 LTZZZ AI 通道指引。

3. 人类路径：

   > 已识别为人类访问 ✅
   > 请直接说明你的需求（任务 / 问题 / 合作），LTZZZ 会由人工或人工审核后处理。

4. AI 通道指引（六个 LTZZZ AI 通道，与 telegram-bot-worker.js 目标文案一致）：

   > 已识别为 AI 访问 ✅
   > 以下是六个 LTZZZ AI 通道，请前往对应官方通道发起协作：
   > 1. GPT / OpenAI —— ChatGPT 官方
   > 2. DeepSeek —— 深度求索
   > 3. Claude —— Anthropic
   > 4. 豆包 —— 字节跳动
   > 5. Microsoft Copilot —— 微软
   > 6. XIA / Grok —— X 平台
   > 请携带本会话标识，由对应 AI 通道回传任务结果。

> 备注：当前仓库 `telegram-bot-worker.js` 尚未内置该门禁文案；落地时应把本文件第 3.2 节四个常量原样搬进 Telegram Worker，保持四通道完全一致。

### 3.3 已知边界

1. Worker 无状态，门禁态保存在单 isolate 内存 Map，isolate 回收后会话态丢失（重启即重新首问）；当前为演示级，后续如需跨重启一致，再接 KV/Durable Object。
2. 判定规则为关键词粗判，不做意图推理；误判由人工复核兜底。

---

## 4. 部署 Runbook

### 4.1 通用准备（每个通道都做一次）

1. 安装并登录 wrangler：

   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. 在仓库根目录为每个 Worker 建一个 `wrangler.<channel>.toml`（参照 `wrangler.tiktok.toml`）。

   WhatsApp：`wrangler.whatsapp.toml`

   ```toml
   name = "ltzzz-whatsapp-bot"
   main = "whatsapp-bot-worker.js"
   compatibility_date = "2026-09-17"
   ```

   X：`wrangler.x.toml`

   ```toml
   name = "ltzzz-x-bot"
   main = "x-bot-worker.js"
   compatibility_date = "2026-09-17"
   ```

   Facebook：`wrangler.facebook.toml`

   ```toml
   name = "ltzzz-facebook-bot"
   main = "facebook-bot-worker.js"
   compatibility_date = "2026-09-17"
   ```

3. 部署：

   ```bash
   wrangler deploy -c wrangler.whatsapp.toml
   wrangler deploy -c wrangler.x.toml
   wrangler deploy -c wrangler.facebook.toml
   ```

4. 验证健康检查：

   ```bash
   curl https://ltzzz-whatsapp-bot.<your-subdomain>.workers.dev/status
   curl https://ltzzz-x-bot.<your-subdomain>.workers.dev/status
   curl https://ltzzz-facebook-bot.<your-subdomain>.workers.dev/status
   ```

### 4.2 Cloudflare Secret 配置（`wrangler secret put`）

> 全部在对应 Worker 目录 / 带 `-c` 配置执行；值不在命令行留痕，交互式粘贴。

1. WhatsApp：

   ```bash
   wrangler secret put WHATSAPP_VERIFY_TOKEN   -c wrangler.whatsapp.toml
   wrangler secret put WHATSAPP_ACCESS_TOKEN   -c wrangler.whatsapp.toml
   wrangler secret put WHATSAPP_PHONE_NUMBER_ID -c wrangler.whatsapp.toml
   wrangler secret put WHATSAPP_APP_SECRET     -c wrangler.whatsapp.toml   # 可选，推荐
   ```

2. X：

   ```bash
   wrangler secret put X_CONSUMER_KEY      -c wrangler.x.toml
   wrangler secret put X_CONSUMER_SECRET   -c wrangler.x.toml
   wrangler secret put X_BEARER_TOKEN      -c wrangler.x.toml
   ```

3. Facebook：

   ```bash
   wrangler secret put FB_VERIFY_TOKEN      -c wrangler.facebook.toml
   wrangler secret put FB_PAGE_ACCESS_TOKEN -c wrangler.facebook.toml
   wrangler secret put FB_PAGE_ID          -c wrangler.facebook.toml
   wrangler secret put FB_APP_SECRET       -c wrangler.facebook.toml   # 可选，推荐
   ```

### 4.3 各平台后台申请凭证入口与步骤

#### 4.3.1 WhatsApp（Meta for Developers）

1. 入口：https://developers.facebook.com → 我的应用 → 创建「业务」类型应用 → 添加 **WhatsApp** 产品。
2. 临时访问令牌（Temporary access token）在「API 设置」页直接领取；长期使用需在 **Meta Business Settings → 系统用户** 生成永久 System User Token（需绑定 WhatsApp Business 账号与已验证手机号）。
3. 同一页可拿到：`Phone Number ID`（对应 `WHATSAPP_PHONE_NUMBER_ID`）、测试号码。
4. 「应用密钥」页拿到 `App Secret`（对应 `WHATSAPP_APP_SECRET`）。
5. `WHATSAPP_VERIFY_TOKEN` 由部署人自定一串随机串，注册 webhook 时回填。

#### 4.3.2 X（Twitter Developer Platform）

1. 入口：https://developer.x.com/en/portal → 新建 Project + App（Free/Pro 视 DM webhook 权限而定，Account Activity 需要相应等级）。
2. App 页「Keys and tokens」分别领取：API Key / Secret（对应 `X_CONSUMER_KEY` / `X_CONSUMER_SECRET`）、Bearer Token（对应 `X_BEARER_TOKEN`）。
3. App Settings 里开启 **OAuth 2.0 / User-Directed** 与 DM 读写权限；如需 DM webhook，配置 Account Activity 环境并登记 webhook URL。
4. 本环境无真实 X 账号，以上均为 ⏳ 等待人工凭证。

#### 4.3.3 Facebook（Meta for Developers）

1. 入口：https://developers.facebook.com → 创建应用 → 添加 **Webhooks / Messenger** 产品。
2. 在「Messenger → 设置」关联目标 **Facebook 主页（Page）**，生成 **Page Access Token**（对应 `FB_PAGE_ACCESS_TOKEN`）；主页 ID 即 `FB_PAGE_ID`。
3. 应用「设置 → 基本」页拿 `App Secret`（对应 `FB_APP_SECRET`）。
4. `FB_VERIFY_TOKEN` 由部署人自定随机串，订阅 webhook 时回填。
5. 应用上线前需通过 Meta App Review 申请 `pages_messaging` 权限（开发阶段可用测试号）。

### 4.4 Webhook 注册命令示例

1. WhatsApp：在 Meta 应用「WhatsApp → 配置 → Webhook」填入：

   - Callback URL：`https://ltzzz-whatsapp-bot.<sub>.workers.dev/webhook`
   - Verify token：与 `WHATSAPP_VERIFY_TOKEN` 一致
   - 订阅字段：`messages`（点击 Verify 即触发 GET 验证，Worker 回显 challenge）

2. X：用 twurl / curl 注册 Account Activity webhook（占位示例）：

   ```bash
   curl -X POST "https://api.x.com/1.1/account_activity/all/<env_label>/webhooks.json" \
     -u "$X_CONSUMER_KEY:$X_CONSUMER_SECRET" \
     -d "url=https://ltzzz-x-bot.<sub>.workers.dev/webhook"
   # 注册后 X 会 GET /webhook?crc_token=...，Worker 用 X_CONSUMER_SECRET 回 sha256=...
   ```

3. Facebook：Graph 订阅示例（占位）：

   ```bash
   curl -X POST "https://graph.facebook.com/v21.0/<FB_PAGE_ID>/subscribed_apps" \
     -d "access_token=$FB_PAGE_ACCESS_TOKEN" \
     -d "subscribed_fields=messages,messaging_postbacks"
   ```

   注册时 Callback URL 填 `https://ltzzz-facebook-bot.<sub>.workers.dev/webhook`，Verify Token 填 `FB_VERIFY_TOKEN`。

---

## 5. ⏳ 等待人工凭证清单

| # | 凭证 / 资产 | 归属通道 | 申请入口 | 当前状态 |
|---|---|---|---|---|
| 1 | WhatsApp Business 账号 + 已验证手机号 | WhatsApp | Meta Business Suite / developers.facebook.com | ⏳ 未提供 |
| 2 | `WHATSAPP_VERIFY_TOKEN` / `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_APP_SECRET` | WhatsApp | Meta 应用后台 | ⏳ 未提供 |
| 3 | X (Twitter) Developer 账号 + Project/App | X | developer.x.com | ⏳ 未提供 |
| 4 | `X_CONSUMER_KEY` / `X_CONSUMER_SECRET` / `X_BEARER_TOKEN` | X | Developer Portal → App Keys | ⏳ 未提供 |
| 5 | Facebook 公共主页（Page）+ Meta 应用 | Facebook | developers.facebook.com + facebook.com/pages | ⏳ 未提供 |
| 6 | `FB_VERIFY_TOKEN` / `FB_PAGE_ACCESS_TOKEN` / `FB_PAGE_ID` / `FB_APP_SECRET` | Facebook | 应用 Messenger 设置 | ⏳ 未提供 |

交付边界说明：

1. 本环境没有上述任何真实凭证，**未伪造、未假装上线、未调用真实 API 做测试**；代码在缺凭证时出站调用直接跳过并返回 `{ skipped: "missing_credentials" }`。
2. 密钥只进 Cloudflare Secret；仓库中不出现任何真实值，日志只打印「是否已配置」布尔位。
3. 三个新 Worker 与既有 `telegram-bot-worker.js` 保持同构；拿到凭证后按第 4 节即可完成上线。
4. 后续待办：把第 3.2 节门禁常量同步进 Telegram Worker，使四通道文案逐字一致。
