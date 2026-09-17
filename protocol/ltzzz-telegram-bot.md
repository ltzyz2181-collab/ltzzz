# LTZZZ Telegram Bot 规范

> 状态：**Worker 代码已就绪**（`telegram-bot-worker.js`）；Bot Token 待用户创建（@BotFather → /newbot）→ 拿到后部署 + 配 Secret + setWebhook。
> 第一阶段权限：收消息 / 回复 / 发文件 / 发图片 / 发视频 / 发任务结果 / 发捐赠通知。

## 权限边界（禁止）

❌ 删除频道 / 群组
❌ 转移所有权
❌ 修改关键安全设置（如两步验证、管理员权限）
❌ 读取/发送其他账号消息（仅限 LTZZZ Bot 自身会话）

## 接口（ltzzz-telegram-bot Worker）

| 能力 | 说明 |
|---|---|
| /webhook | Telegram 回调（setWebhook 后接收消息） |
| /send | POST 发送文本/文件/图片/视频（chat_id + 内容） |
| /status | 健康检查 |

## 配置（Cloudflare Secret）

- TELEGRAM_BOT_TOKEN（BotFather 提供）
- TELEGRAM_CHAT_ID（LTZZZ 管理会话）

## 消息类型

- 任务结果回传
- 捐赠通知
- AI 执行结果通知
- 文件/图片/视频发送（视频发布后通知）

## 待办

- [x] Worker 代码就绪（`telegram-bot-worker.js`：/webhook · /send · /status；支持文本/图片/视频/文件）
- [ ] 用户在 Telegram 创建 Bot（@BotFather → /newbot → 复制 Token）
- [ ] 配置 Secret（TELEGRAM_BOT_TOKEN、TELEGRAM_CHAT_ID、TELEGRAM_SECRET）+ 部署 Worker + setWebhook
