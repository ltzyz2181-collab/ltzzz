# Owner 一次性动作卡 · GPT (OpenAI) API Key 重生成

> 单号：第十一张 P1-② ｜ 签发：千问总控 2026-10-03 ｜ 原因：OPENAI_API_KEY 已失效（HTTP 401 Incorrect API key）
> 处理人：owner 本人（唯一能做）｜ 完成后：把新 key 直接粘给豆包（不进本文件、不进仓库、不进对话记录）

## 为什么需要你
gpt 席的 `OPENAI_API_KEY` 在 daily Worker 上返回 **401 Incorrect API key**——旧 key 已失效。生成新 key 只能本人登录 platform.openai.com 操作，AI 不代办登录/不代绑卡。

## 一分钟操作步骤
1. 打开 https://platform.openai.com （如未登录，用 LTZZZ 账号登录）
2. 左下角/右上角头像 → **API keys**（或直接 https://platform.openai.com/api-keys ）
3. 点 **Create new secret key**
   - Name 建议填：`ltzzz-daily`（方便辨认）
   - Project 选默认（或 LTZZZ 相关 project）
4. 创建后**立刻复制**（只显示一次），直接粘给豆包
5. 豆包收到后：`wrangler secret put OPENAI_API_KEY --name ltzzz-daily-automation` 注入 → `/run?task=gpt-daily` 验 dry_run=false → 回执带模型名

## 注意
- 新 key 只进 Cloudflare Worker Secret，不进代码/仓库/本文件
- 若账号余额为 0，调用仍会报 429/insufficient_quota——那是充值问题，与 key 失效是两回事，如实回报即可
- 无需改任何代码；Worker 读 Secret 即生效
