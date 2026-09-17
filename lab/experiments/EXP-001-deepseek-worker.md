# 实验：DeepSeek Cloudflare Worker 打通

- **ID：** EXP-001
- **日期：** 2026-09-14 前后
- **状态：** 有结果

## 观

需要网站在不暴露 API Key 的前提下调用 DeepSeek。

## 行深（假设）

Cloudflare Worker 持有 Secret，浏览器只请求 Worker，可安全对话。

## 实验

- 部署 Worker，设置 `DEEPSEEK_API_KEY`
- 页面 `deepseek.html` / `agents.html` 指向 Worker
- Grok 向 Worker POST 测试消息（自称 ltzzz.com XAI）

## 结果

- HTTP 200
- 模型返回确认收到并说明可协助研究/代码建议等
- Worker：`https://ltzzz-deepseek-proxy.ltzyz2181.workers.dev`

## 下一步

- 豆包同款 Worker（方舟 ARK_API_KEY）
- 余额耗尽前在方舟/DeepSeek 控制台关注用量
