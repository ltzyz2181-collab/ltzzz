# 处置：pulse-agent-work.yml 无微软/桌面 Copilot 席位（2026-11-01）

- 责任席：微软（入口缺陷，非具体单）
- 原 Task ID：（无）
- 核查：实读 `.github/workflows/pulse-agent-work.yml`：agent 选项 = `[deepseek, doubao, qianwen, kimi, grok, gpt]` —— **无微软/桌面 Copilot 席位**，微软转述属实（千问未独立验证，本席已独立验证）。
- 影响：任何把微软/桌面 Copilot 归入该入口的代填都会污染归属（执行方并非实际席位）。
- 处置：二选一——① 加席位选项（如 microsoft/copilot）；② 明确该席不走此入口。**注意：`.github/workflows/` 改动需 owner 在网页端操作（当前 gh token 无 workflow scope，本席无法直接推送该目录）。**

## 待办

1. owner 网页端在 pulse-agent-work.yml 的 agent options 增加微软席位选项，或在该文件/入口 README 标注"微软席不走此入口"；
2. 未加席位前，任何 pulse-agent-work 派单不得代填微软归属。

状态：blocked_owner_web_action；不属任一席位可代写。
