# LTZZZ 每日报告 · 2026-09-28

## 各 AI 状态

| AI | 状态 | 产出预览 |
|---|---|---|
| gpt | api_error | 调用失败，见 failures |
| doubao | api_error | 调用失败，见 failures |
| grok | api_error | 调用失败，见 failures |
| claude | api_error | 调用失败，见 failures |
| deepseek | success | ## 2026-09-28 异同记录

**切入文本：《道德经》第一章**

> 道可道，非常道；名可名，非常名。

**同：**

装备论的「观」与老子「常无 |
| microsoft | skipped | 按用户指示暂不部署（Copilot API 面向企业 M365） |

## 失败/未配置

- gpt: api_error — HTTP 429: {
    "error": {
        "message": "You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.",
        "type": "insufficient
- doubao: api_error — openai-style 404/405，anthropic-style HTTP 401: {"error":{"code":"AuthenticationError","message":"the API key or AK/SK in the request is missing or invalid. request id: 021790560776906b79d8748f7bc7d5b56cf6863add8bd06dd99a8","param":"","type":"Unaut
- grok: api_error — HTTP 404: {"code":"not-found","error":"The model grok-2-latest does not exist or your team 8c4ed0f5-139c-4529-8a47-bc2daeea2425 does not have access to it. If you believe this is a mistake, please contact suppo
- claude: api_error — HTTP 400: {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."},"request_i

## 需要用户操作

- [ ] 确认微软席执行方案：A. 委托 GPT/Claude 执行（results 标注 executed_by）；B. 申请 Microsoft 365 Copilot API
