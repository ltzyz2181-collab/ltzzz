# LTZZZ 消息桥 · 云服务器 ↔ 电脑豆包 ↔ GPT

> 目标：电脑通过 LTZZZ 豆包向 GPT（及其他 AI）发送消息，形成多模型协作链路。
> 状态：架构已定，待持久服务器与 API Key。

## 1. 目标链路

```
电脑豆包客户端
   │  HTTP(S)
   ▼
LTZZZ 云桥服务（Cloudflare Worker 或云服务器）
   │  鉴权 + 队列 + 日志
   ├──► GPT API（需 OpenAI API Key，存 Secret）
   ├──► DeepSeek API（已有 Key）
   ├──► Claude API（已有 Key）
   └──► 豆包自身（直连）
   │
   ▼
结果回传 → 电脑豆包显示 / 写入 LTZZZ 知识库
```

## 2. 组件

| 组件 | 说明 | 状态 |
|---|---|---|
| 桥接 Worker | 接收豆包请求、转发各 AI API、返回结果 | 待写（基于现有 `doubao-proxy-worker.js` 扩展） |
| 鉴权 | LTZZZ Agent Token（Bearer），存 Cloudflare Secret | 已有 Token 体系 |
| 队列/日志 | 记录 请求→转发→结果→入库 | 复用 tasks/ 队列 |
| API Key | GPT(OpenAI) 未提供；DeepSeek/Claude 已有 | 缺 GPT Key |

## 3. 部署要求

1. **持久运行**：Cloudflare Worker（免费额度足够）优先，避免依赖临时沙箱。
2. **密钥**：各 AI API Key 只放 Cloudflare Secret / 环境变量，不入前端与仓库。
3. **安全**：入参校验、限流、敏感信息（用户消息）默认脱敏入库。

## 4. 待办

- [ ] 用户提供 OpenAI/GPT API Key（或确认用现有 Key 体系）
- [ ] 编写 `chat-bridge-worker.js`（本方案通过后执行）
- [ ] 电脑豆包侧接入入口（豆包网页/客户端可访问的 URL）
