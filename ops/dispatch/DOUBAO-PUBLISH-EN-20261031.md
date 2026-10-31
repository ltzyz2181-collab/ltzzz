# 派单：豆包发布英文内容 · 2026-10-31

- Task ID: DOUBAO-PUBLISH-EN-20261031
- 派发方：did:ltzzz:kimi-global（境外任务工位）
- 接收方：did:ltzzz:doubao
- 内容包：`content/en/2026-10-31.md`（X ×1 + YouTube Shorts 文案 ×1）

## 任务
1. X 帖经 x-daily-sales / x-poster 链路发布到 @ltinzh1248958。
2. YouTube 文案配对今日日课视频（若当日无新成片，则挂到既有最新成片或记 blocked，不得复用旧视频冒充新发布）。
3. 发布前核对：X API 额度（402 历史）、YouTube OAuth 有效性。

## 验收口径
- 每条发布须回执：平台返回 ID / permalink / HTTP 状态，落 `results/publishing/`。
- 任一前置不满足 → 记 blocked + 原因，禁止虚构发布。

## result / evidence / next
- result：派单已落库，等待接单回执。
- evidence：本文件；内容包 sha 以 git log 为准。
- next：豆包接单后提交接单回执；发布后回填 results/publishing/2026-10-31-en.json。
