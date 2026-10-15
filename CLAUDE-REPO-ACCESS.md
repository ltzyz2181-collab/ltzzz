# Claude · LTZZZ 仓库接入索引（2026-10-04 生成）

> 仓库为 **public**：raw 链接免认证可读。页面或连接器读不到正文时，可用 raw.githubusercontent.com。
> **2026-10-14 更正**：旧版“添加 GitHub 内容后即可写入/开 PR”的保证不准确。读取仓库、安装 App、客户端具备写工具、实际提交成功是四种不同状态。

## 1. 读取与写入分开验证

- **Claude 聊天中的 GitHub 内容连接器**：可以添加本仓库作为上下文；是否能写，以该客户端实际提供的工具为准。只读会话不会因为换一个模型 API Key 自动变成写入会话。
- **实际提交代码/审核文件**：需要 Claude Code 或其他具备 git/仓库写入工具的执行环境，并有本仓库的有效授权。通过分支、commit 和 PR 链接验证；不以“App 已安装”代替实际提交。
- **官方 Claude GitHub App**：<https://github.com/apps/claude/installations/new>，只选择 `ltzyz2181-collab/ltzzz`。官方 App 的权限包还包括 Actions/Workflows 等仓库写权限，安装前要在 GitHub 页面核对；不选择全部仓库。
- GitHub 要求“Confirm access/确认访问”、邮箱验证或二次验证时，由账号本人在官方页面完成。不要在聊天发送密码、验证码、PAT、API Key。模型服务账户/API Key 不授予 GitHub 仓库写权限。
- 本轮真实状态与单次验收任务：[Claude 写入验收](ops/dispatch/CLAUDE-GITHUB-WRITE-ACCEPTANCE-20261014.md)、[权限接单回执](ops/dispatch/receipts/CLAUDE-GITHUB-ACCESS-20261014.md)。本轮已在登录的 GitHub 页面选好单仓库范围，但最终安装被邮箱身份验证阻塞；尚未验证 Claude 客户端推送成功。
- 审核无需下载再转存：有写工具的 Claude 可从本会话的原审核文件直接提交；只读 Claude 可直接在对话输出完整正文，owner 转交有写权限的总控或执行席代存。不能把参考网页链接冒充完整审核文件。

## 2. raw URL 模板
- 任意文件：https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/<路径>
- 例：https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/README.md

## 3. 关键文件速查
- README.md → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/README.md
- agent-wallet/spending-policy.json → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/agent-wallet/spending-policy.json
- agent-wallet/transactions.json → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/agent-wallet/transactions.json
- docs/MEMORY-DAILY-FLOW.md → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/docs/MEMORY-DAILY-FLOW.md
- docs/WEP3.md → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/docs/WEP3.md
- docs/kimi-slot-patch.md → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/docs/kimi-slot-patch.md
- docs/products-page-modifications.md → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/docs/products-page-modifications.md
- identity/dids/README.md → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/identity/dids/README.md
- identity/dids/claude.json → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/identity/dids/claude.json
- identity/dids/council.json → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/identity/dids/council.json
- identity/dids/deepseek.json → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/identity/dids/deepseek.json
- identity/dids/doubao.json → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/identity/dids/doubao.json
- identity/dids/gpt.json → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/identity/dids/gpt.json
- identity/dids/grok.json → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/identity/dids/grok.json
- identity/dids/kimi.json → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/identity/dids/kimi.json
- identity/dids/microsoft.json → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/identity/dids/microsoft.json
- identity/dids/owner-v2.json → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/identity/dids/owner-v2.json
- identity/dids/owner.json → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/identity/dids/owner.json
- identity/dids/qianwen.json → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/identity/dids/qianwen.json
- invest-channel/TESTING.md → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/invest-channel/TESTING.md
- invest-channel/contracts/LTZZZVault.sol → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/invest-channel/contracts/LTZZZVault.sol
- invest-channel/scripts/AaveAdapter.mjs → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/invest-channel/scripts/AaveAdapter.mjs
- knowledge/results/2026-10-01-doubao-outreach.md → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/knowledge/results/2026-10-01-doubao-outreach.md
- knowledge/results/2026-10-01-xai-kimi-verify.md → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/knowledge/results/2026-10-01-xai-kimi-verify.md
- knowledge/results/2026-10-02-0806-x-lead-scan.md → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/knowledge/results/2026-10-02-0806-x-lead-scan.md
- knowledge/results/2026-10-02-grok-001-verify.md → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/knowledge/results/2026-10-02-grok-001-verify.md
- knowledge/results/2026-10-02-grok-first-spend-attempt.md → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/knowledge/results/2026-10-02-grok-first-spend-attempt.md
- knowledge/results/2026-10-02-grok-first-spend-proposal.md → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/knowledge/results/2026-10-02-grok-first-spend-proposal.md
- knowledge/results/2026-10-02-grok-sku-pack.md → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/knowledge/results/2026-10-02-grok-sku-pack.md
- knowledge/results/2026-10-02-grok-spend-outreach.md → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/knowledge/results/2026-10-02-grok-spend-outreach.md
- knowledge/results/2026-10-02-gumroad-ops-brief.md → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/knowledge/results/2026-10-02-gumroad-ops-brief.md
- knowledge/results/2026-10-02-priority-realign.md → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/knowledge/results/2026-10-02-priority-realign.md
- knowledge/results/2026-10-02-promo-order-xai.md → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/knowledge/results/2026-10-02-promo-order-xai.md
- knowledge/results/2026-10-02-prop-003-verify.md → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/knowledge/results/2026-10-02-prop-003-verify.md
- knowledge/results/2026-10-02-prop-grok-002.md → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/knowledge/results/2026-10-02-prop-grok-002.md
- knowledge/results/2026-10-02-qianwen-review-xai-handoff.md → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/knowledge/results/2026-10-02-qianwen-review-xai-handoff.md
- knowledge/results/2026-10-02-x-lead-scan-day2.md → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/knowledge/results/2026-10-02-x-lead-scan-day2.md
- knowledge/results/2026-10-02-x-lead-scan.md → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/knowledge/results/2026-10-02-x-lead-scan.md
- knowledge/results/2026-10-02-x-promo-receipt.md → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/knowledge/results/2026-10-02-x-promo-receipt.md
- knowledge/results/2026-10-02-xai-live-verify.md → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/knowledge/results/2026-10-02-xai-live-verify.md
- knowledge/results/2026-10-03-cron-audit.md → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/knowledge/results/2026-10-03-cron-audit.md
- knowledge/results/2026-10-03-doubao-x-oauth2-live.md → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/knowledge/results/2026-10-03-doubao-x-oauth2-live.md
- knowledge/results/2026-10-03-x-billing-proposal.md → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/knowledge/results/2026-10-03-x-billing-proposal.md
- knowledge/results/2026-10-03-x-promo-preflight.md → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/knowledge/results/2026-10-03-x-promo-preflight.md
- knowledge/results/2026-10-03-x-promo-receipt.json → https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/knowledge/results/2026-10-03-x-promo-receipt.json

## 4. 目录（共 737 个文件，完整清单可用 git ls-files 或连接器列出）
- (root) (157 个文件)
- knowledge (88 个文件)
- memory (65 个文件)
- results (44 个文件)
- scripts (30 个文件)
- lab (29 个文件)
- .github (25 个文件)
- "protocol (25 个文件)
- gumroad-assets (24 个文件)
- data (22 个文件)
- finance (19 个文件)
- protocol (17 个文件)
- tools (16 个文件)
- "ltzzz-memory (16 个文件)
- docs (14 个文件)
- "ops (14 个文件)
- agent-wallet (13 个文件)
- identity (12 个文件)
- ltzzz-memory (10 个文件)
- ops (10 个文件)
- assets (9 个文件)
- workers (9 个文件)
- wallet (9 个文件)
- tasks (7 个文件)
- contracts (6 个文件)
- policy (5 个文件)
- "docs (5 个文件)
- cloud-agent-worker (5 个文件)
- backend-node (4 个文件)
- backend-python (4 个文件)
- articles (3 个文件)
- hooks (3 个文件)
- invest-channel (3 个文件)
- "finance (2 个文件)
- ai (2 个文件)
- proxy (2 个文件)
- "memory (2 个文件)
- "knowledge (2 个文件)
- products (2 个文件)
- app (1 个文件)
- daily-data (1 个文件)
- decisions (1 个文件)
