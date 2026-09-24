# TG-DEBUG-001 · 纸飞机故障排查

**优先级：** P0  
**执行：** XAI  
**时间：** 2026-09-23

## 流程

观 → 查 Worker → webhook → health → Secret 名 → update → sendMessage → 断点 → 修复 → 测试 → 记录

## 已验证（现网）

| 检查项 | 结果 |
|--------|------|
| Worker 部署 | 🟢 `https://ltzzz-telegram-bot.ltzyz2181.workers.dev/status` → ok |
| Publisher | 🟢 `ltzzz-telegram-publisher` status enabled |
| `/health`（旧） | 🔴 曾 not_found → 已补 |
| `GET /setup-webhook` | 🔴 **Telegram API 401 Unauthorized** |
| 代码回复逻辑 | 🟡 有 `/start` 与菜单；Token 无效时无法发出 |

## 实际断点（根因）

```
setWebhook → Telegram 返回 401 Unauthorized
```

含义：Worker 里的 **`TELEGRAM_BOT_TOKEN` 缺失、截断、或不是有效 Bot Token**。  
在此之前：消息到不了 Bot / Bot 无法 `sendMessage` → 用户感觉「发了不回」。

Secret 名称必须是：

```text
TELEGRAM_BOT_TOKEN
```

可选：

```text
TELEGRAM_SECRET          # webhook 校验
TELEGRAM_CHAT_ID         # publisher / 主动推送
```

## 人类操作（1 分钟）

1. Cloudflare → Workers → **ltzzz-telegram-bot** → Settings → Secrets  
2. 设置 `TELEGRAM_BOT_TOKEN` = BotFather 完整 token（形如 `123456:AA...`）  
3. 浏览器打开：  
   `https://ltzzz-telegram-bot.ltzyz2181.workers.dev/setup-webhook`  
4. 应看到 `"ok": true` 且 `current_webhook_info.url` 指向 `/webhook`  
5. Telegram 里对 Bot 发 `/start` → 应收到欢迎语  

## 代码修复（本 commit）

- 增加 `/health`（has_token / token_prefix，不泄露完整 token）
- `/setup-webhook` 失败时诚实返回原因
- 增加 `/webhook-info`（getMe + getWebhookInfo）
- 回复改为 **纯文本**（去掉易失败的 Markdown parse_mode）
- `sendMessage` 失败时把 Telegram 错误写入响应体便于排查

## X 内容 / Typefully

不阻塞纸飞机。Claude 小说经 XAI 理念审核后再入 Typefully 队列（XAI-003）。

## Web3 Treasury（XAI-002）

继续：AI 提案 → 多 AI 确认 → Policy → Queue → Safe → 人工/多签执行 → TxHash → 账本 → Memory。  
**禁止** AI 持钥自动转账。
