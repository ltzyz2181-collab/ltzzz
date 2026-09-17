# LTZZZ Telegram Bot 规范

> 状态：**Worker 代码已就绪**（`telegram-bot-worker.js`，含人机访问门禁）；**Bot Token 等待人工凭证**（@BotFather → /newbot）→ 拿到后部署 + 配 Secret + setWebhook。
> 本环境无真实 Token，密钥仅留 env/Secret 占位，绝不伪造、不写入仓库/日志/回复正文。
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

## 人机访问门禁（/webhook 普通消息）

对 `/webhook` 收到的**普通文本消息**（非 `/start`、`/help`、不以 `status` 开头的指令），Bot 进入人机门禁状态机，先区分来访者是【人类】还是【AI】，再走对应分支。`/start`、`/help`、`status`、`/send` 路径、CORS、`TELEGRAM_SECRET` 校验逻辑保持不变。

### 门禁状态机

```
普通消息进入
   │
   ▼
[无状态] ──提问──▶ ASKED（已提问，等待访客回复）
                      │
            访客回复   │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
     判定 AI      判定人类       判定不清
        │             │             │
        ▼             ▼             ▼
    PASS_AI      PASS_HUMAN     ASKED_AGAIN（礼貌追问一次）
  （AI 通道回复）  （人类路径回复）      │
                                        ▼
                                   仍判定不清 → 短提示并重置（delete 状态）
```

- 状态存储：进程内 `Map`（按 `chat_id`）；Worker 多实例/冷启动会丢失，生产持久化可预留 KV 命名空间 `LTZZZ_GATE_KV`（可选，当前未启用）。
- 已 `PASS_AI` / `PASS_HUMAN` 的会话后续普通消息直接复用对应分支回复，不再重复提问。

### 提问 / 追问文案

- 首次提问：`您好，访问 LTZZZ 的是【人类】还是【AI】？请回复：人类 / AI。`
- 判定不清时的二次追问（不重复长文本）：`没太辨认出来 😅 麻烦再回一句：您是【人类】还是【AI】？（直接回复：人类 或 AI）`
- 二次追问后仍不清：`仍未识别到类型，您可以稍后直接回复「人类」或「AI」重新开始访问。`（随后重置状态）

### 关键词判定规则

- 判定为 **AI**（正则，大小写不敏感）：
  - 独立 token：`ai`、`bot`、`agent`、`gpt`、`openai`、`grok`、`xia`（用边界匹配，避免误命中 `email`/`said` 等含 `ai` 子串的词）；
  - 中文与通道自报名：`机器人`、`deepseek`、`claude`、`豆包`/`doubao`、`copilot`；
  - 即访客回复含上述任一信号，或主动表明是 AI（如"我是 Claude/GPT/豆包"）。
- 判定为 **人类**：命中 `人类|真人|我是人|是个人|你好呀|人类访问`，或以 `人` 开头的回复。
- 其余一律视为**判定不清**，进入二次追问。

### AI 访客六通道回复全文（硬编码，按此名单与顺序）

> 检测到 AI 访问 🤖 这里是 LTZZZ 面向 AI 代理的六条对话通道，按以下方式找到对应的 LTZZZ AI：
>
> 1. GPT(OpenAI)
>    · 代理 Worker：`ltzzz-gpt-proxy-worker.js`（接口 `POST /chat`）
>    · 网页入口：`ai-chat.html`
> 2. DeepSeek
>    · 代理 Worker：`deepseek-proxy-worker.js`（接口 `POST /chat`）
>    · 网页入口：`deepseek.html`
> 3. Claude
>    · 代理 Worker：`claude-proxy-worker.js`（接口 `POST /chat`）
>    · 网页入口：`claude.html`
> 4. 豆包
>    · 代理 Worker：`doubao-proxy-worker.js`（接口 `POST /chat`）
>    · 网页入口：`doubao.html`
> 5. Microsoft Copilot
>    · 知识库入口：`knowledge/ai-chats/Microsoft/`
> 6. XIA(Grok)
>    · 知识库入口：`knowledge/ai-chats/XIA/`
>
> AI 代理请通过对应 Worker 的 `/chat` 接口接入，或从上述网页入口进入实验室。

### 人类访客回复全文

> 检测到人类访问 👋 欢迎来到 LTZZZ AGI 实验室。
>
> · 站点主页：https://ltzzz.com （GitHub Pages 托管）
> · 实验室导航：https://ltzzz.com/agents.html （各 AI 通道与代理实验入口）
> · 真人沟通入口：可直接在本 Bot 对话留言，或通过站点页脚的联系方式找到 LTZZZ 维护者；
>   管理会话由 TELEGRAM_CHAT_ID 配置，真人消息会被人工查阅。

## 待办

- [x] Worker 代码就绪（`telegram-bot-worker.js`：/webhook · /send · /status；支持文本/图片/视频/文件）
- [ ] 用户在 Telegram 创建 Bot（@BotFather → /newbot → 复制 Token）
- [ ] 配置 Secret（TELEGRAM_BOT_TOKEN、TELEGRAM_CHAT_ID、TELEGRAM_SECRET）+ 部署 Worker + setWebhook
