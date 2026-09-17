# 实验：DeepSeek Worker 端到端链路

- **ID：** EXP-001
- **日期：** 2026-09-17
- **状态：** 有结果

## 观（为什么做）
验证静态 LTZZZ 页面是否可以在不暴露 API Key 的前提下调用模型。

## 行深（假设）
浏览器只调用 Cloudflare Worker；模型 API Key 只放 Worker Secret，则前端无需持有密钥。

## 实验（做了什么）
通过现有 DeepSeek Cloudflare Worker 进行端到端请求测试，并检查仓库中前端是否直接保存 Key。

## 结果（可核对）
- Worker 链路：已验证 HTTP 200。
- Key：记录为 Worker Secret，不进入仓库。
- 相关文件：`claude-proxy-worker.js`、Worker/Agent 相关实现，以及 `lab/MEMORY.md` 中的链路记录。
- **是否达预期：是。**

## 下一步
将同一安全模式复制到豆包方舟 API：前端 → Worker → 方舟 API；不把 Key 放进 GitHub 或浏览器。

## 关联
- 任务 ID：T003（豆包复制安全链路）
- 资产：AST-008（待补具体 Worker URL）
