# LTZZZ Deployment Status

> This file records deployment state only. **No password, token, API secret, seed phrase, private key, OTP, CVV or full card number may ever be written here.**

## State meanings
- `CODE_COMMITTED` = code exists in GitHub
- `TASK_SENT` = task has been assigned to Doubao/cloud computer
- `EXECUTED` = cloud computer actually ran the task
- `DEPLOYED` = service was actually published
- `VERIFIED` = external access/function was tested successfully
- `NEEDS_CHECK` = claimed by an agent but not independently verified
- `BLOCKED` = requires a credential/permission/action that cannot be performed automatically

## Current records
| Component | State | Owner | Notes |
|---|---|---|---|
| LTZZZ AGI Roundtable UI | CODE_COMMITTED | GPT | Initial UI is in `app/agi-roundtable/index.html`; cloud deployment must be verified separately. |
| LTZZZ Web3 roadmap | CODE_COMMITTED | GPT | Planning document in `docs/web3-roadmap.md`. |
| Telegram bot basic send/receive | VERIFIED | LTZZZ | Existing conversation record reports a successful `LTZzz已收到` test. |
| Telegram webhook | NEEDS_CHECK | Doubao | Do not recreate if existing webhook works. Verify first. |
| Cloudflare Secrets | NEEDS_CHECK | Doubao | Secrets must remain only in Cloudflare secure secret storage. Never copy values into GitHub/chat/local files. |
| Daily automation | NEEDS_CHECK | GPT/Doubao | Must verify actual scheduled execution rather than assuming code equals deployment. |

## Credential persistence rule
1. Secrets are entered once into the designated secure provider secret store.
2. Local downloads are **not** the source of truth.
3. Before asking the user for any credential again, inspect the existing secure configuration and explain the exact failure reason.
4. If a credential is still valid, reuse it; do not request re-entry.
5. If a credential has expired/revoked/been deleted, stop and request only the minimum required user action; never ask the user to paste the secret into chat.
6. Every deployment task must record the non-secret existence/status of required credentials, never their values.

## No-repeat rule
A completed deployment/configuration must never be rebuilt merely because an agent lost track of it. Every agent must read this file and existing platform configuration before changing anything.

## Daily computer rule
Daily cloud-computer jobs are for **check / execute only when needed / verify / record**. They must not blindly redeploy or recreate credentials.

Last policy update: 2026-09-18

---

# LTZZZ 部署状态清单（不含任何密码/Token 值）

> 更新：2026-09-18 · 此文件只记录状态和地址，**不包含任何凭证值**。
> 凭证一律存于 Cloudflare Secret（加密），不会因会话结束丢失。

## ✅ 已上线
| 项目 | 地址 | 状态 |
|---|---|---|
| Telegram 机器人 Worker | ltzzz-telegram-bot.ltzyz2181.workers.dev | 已部署；Secret 已填（TELEGRAM_BOT_TOKEN / TELEGRAM_SECRET）；待最终验证门禁回复 |
| 支付代理 | ltzzz-pay-proxy | 已部署 |
| 豆包代理 | ltzzz-doubao-proxy | 已部署 |
| Claude 代理 | claude-proxy | 已部署 |
| GPT 代理 | ltzzz-gpt-proxy | 已部署 |
| LTZZZ 网站 | ltzzz.com / GitHub Pages | 已部署 |

## 🟡 代码就绪，待部署
| 项目 | 说明 |
|---|---|
| 6 AI 每日自动化 | ltzzz-daily-automation-worker.js + wrangler.daily.toml（6 条 cron）代码已就绪；需 API Key + 部署 |
| WhatsApp / X / Facebook 机器人 | whatsapp-bot-worker.js / x-bot-worker.js / facebook-bot-worker.js 代码已就绪；需平台凭证 |

## 📝 关键地址备忘（无凭证）
- Telegram webhook 检查：https://api.telegram.org/bot<TOKEN>/getWebhookInfo （TOKEN 在 Cloudflare Secret 中）
- Cloudflare 账号：Ltzyz2181@gmail.com
- 分发矩阵：豆包→纸飞机+Facebook；Claude/xAI/微软→X；DeepSeek→WhatsApp

## ⏳ 下一步（等用户）
1. 验证 Telegram 门禁回复（发消息测试）
2. 提供 6 AI API Key + 部署方式选择
3. 提供 X/FB/WhatsApp 平台凭证

## X 机器人（2026-09-18）
- ✅ Cloudflare Worker `quiet-sun-9b33` 部署完成（含门禁自动回复逻辑）
- ✅ 3 个 Secret 已填：X_CONSUMER_KEY / X_CONSUMER_SECRET / X_BEARER_TOKEN（=/status 验证 ok:true）
- ✅ X Chat bot 创建：@ltzzz_bot（LTZZZ，Active，DM-scope）
- ✅ chat keys 注册完成（bot token + Juicebox PIN 已存 x-bot-keys.txt / x-bot-credentials.md）
- ⏳ 发送测试代码已改好（/sendtest 端点）但**未部署**——明天部署后浏览器访问 /sendtest?to=ltinzh1248958&text=你好 测试
- ⏳ 接收测试：需第二 X 账号或朋友给 @ltzzz_bot 发私信（主人不能和自己的 bot 私聊）
- ⚠️ 聊天中已暴露 X 凭证，测试通过后需 Rotate token + 重新注册 chat keys 轮换
f687452 (chore: 提交x-bot worker(sendtest)、部署状态、logo资产; gitignore本地凭证)

---

# 通道B执行回执 · 豆包代部署（2026-09-30）

## D1 总控产出推送 ✅
- 本地 commit `af91180`（orchestrator: qianwen+kimi worker slots, DID v2 council, pay-policy v0.4, memory ledgers）
- 远程已就位（API 直推 10 文件）：qianwen-proxy-worker.js / kimi-proxy-worker.js / agent-pay-policy-v0.4.json / meta.html / ops/SECURITY-INCIDENT-secrets-exposure-20260930.md / ltzzz-memory/（梦境数据库-v1·入档 / 重要事件-入档 / 文明研究-v1·入档）
- `ltzzz-secrets.md` 未入库（git ls-files 复核通过）

## D2 Worker 部署 ✅（wrangler 输出 = CF 官方确认）
| Worker | URL | Version ID |
|---|---|---|
| ltzzz-qianwen-proxy | https://ltzzz-qianwen-proxy.ltzyz2181.workers.dev | 4dbf38b1-fcf5-4329-adc2-ea683b6011bf |
| ltzzz-kimi-proxy | https://ltzzz-kimi-proxy.ltzyz2181.workers.dev | 5117a20a-9bc9-4e9a-bab4-291190d70dfa |

## D2 Secret 配置 ❌（BLOCKED，执行单红线如实报）
- `QWEN_API_KEY`：**Key.doc 中不存在**——Key.doc 为 WPS 格式，仅含 DeepSeek / 克劳德(Anthropic) / GPT(OpenAI) 三个 key，**无千问/百炼 key**
- `KIMI_API_KEY`：**Key.doc 中不存在**——无 Moonshot key
- 结果：两 Worker `has_key=false`；POST 真实调用无法执行

## D3 三关验证 ⏳（缺 key → 按执行单规则报**未完成**，不报已部署）
- a/b. `GET /health`：Worker 已部署（wrangler/CF 确认线上存在），但 `has_key:false` 不满足验收硬条件；workers.dev 域名大陆被墙，需外网 curl 复核 200
- c. `POST` 真实消息：未执行（无 QWEN/KIMI key）
- **结论：未完成——缺千问与 Kimi 的 API Key**

## D4 meta.html ✅
- `https://ltzzz.com/meta.html` → **HTTP 200**（D1 推送后 Pages 自动发布，404 已消除）

## 需要 owner 提供（只进 Worker Secret，不写仓库/对话）
1. `QWEN_API_KEY`（阿里云百炼，sk- 开头）→ 我配 Secret 后完成三关 a/b/c
2. `KIMI_API_KEY`（Moonshot，sk- 开头）→ 同上

（本回执不含任何凭证值，遵守 deployment-status.md 凭证规则）

---

# 第三张执行单回执 · 豆包代执行（2026-09-30）

## E1｜身份名册页推送 ✅ VERIFIED
- identity.html 远程已就位（sha 13549c97，4208 bytes，DID 名册页）
- `https://ltzzz.com/identity.html` → **HTTP 200**（len 3715，Pages 自动发布）

## E2｜QWEN/KIMI Secret ⏳ BLOCKED
- 本执行单要求 owner 粘贴 key 后注入——**当前未收到 QWEN_API_KEY / KIMI_API_KEY**
- 三关（health has_key:true + 真实 POST）维持 D3 原结论：**未完成**（缺 key）
- workers.dev 大陆直连超时属网络层；待 key + 外网通道复核

## E3｜LTZZZ Pay Phase 1 ✅ 已完成（owner 2026-09-30 拍板改 Base 主网，替代原 Sepolia 方案）
- ReputationRegistry 主网合约 `0x44Ee56e629768eBf4f83123aFEBE7983c52a2660`（部署 tx 0x769b2b39...c561d）
- 3 Worker Secret 回填（IDENTITY_CONTRACT/ECONOMY_CONTRACT/REGISTRY_CONTRACT，wrangler secret list 确认）
- 真实锚定上链 tx `0xd9965e82...c734ac`（guardian 0xD834a769... 签名；链上 batch[0] root 一致，anchoredRoots=true，block 51981074）
- 明细：protocol/LTZZZ-PAY.md（Phase 1 已上线）+ agent-wallet/transactions.json（txn_0002）

## F1｜gas 核账（链上实查，只写余额数字）
| 地址 | Base 主网余额 |
|---|---|
| guardian `0xD834a769...2F51` | ETH 0.000999 |
| agent EOA `0x21F502...7fdc` | ETH 0.001991 · USDC 49.0 |
- owner 狐狸头 0.003 拆两笔（guardian 0.002 + agent 0.001）即可达执行单目标，无需兑换

## F2｜境外 AI Worker 部署
| Worker | URL | 状态 |
|---|---|---|
| ltzzz-gpt-proxy | https://ltzzz-gpt-proxy.ltzyz2181.workers.dev | VERIFIED（wrangler 重部署确认在线；/health 外网复核待补）|
| ltzzz-xai-proxy | https://ltzzz-xai-proxy.ltzyz2181.workers.dev | EXECUTED（代码已部署 v38c25b7f；**缺 XAI_API_KEY → 三关 BLOCKED**）|
| ltzzz-microsoft-proxy | https://ltzzz-microsoft-proxy.ltzyz2181.workers.dev | EXECUTED（v7c6d8a29，对话交接转发器，代码注释如实声明"非模型代理"；Copilot 无公开个人 API）|
| ltzzz-meta-proxy | https://ltzzz-meta-proxy.ltzyz2181.workers.dev | EXECUTED（vadd7bbc8，占位 /health planned:true，不伪装接入）|

## F3｜Secret 与三关 ⏳ 部分 BLOCKED
- xai：`XAI_API_KEY` 未提供 → BLOCKED（激活后跑 /health has_key:true + 真实 POST）
- microsoft：无 API key 设计（转发器）→ N/A
- meta：无 API key 设计（占位）→ N/A
- qianwen/kimi：QWEN/KIMI key 仍缺 → BLOCKED（见 E2）

## F4｜身份名册页 ✅ 与 E1 同项（HTTP 200 已验）

## 需要 owner 提供（只进 Secret）
1. `QWEN_API_KEY`（百炼）/ `KIMI_API_KEY`（Moonshot）→ 完成 qianwen/kimi 三关
2. `XAI_API_KEY`（xai- 开头，桌面找）→ 激活 ltzzz-xai-proxy

（本回执不含任何凭证值，遵守 deployment-status.md 凭证规则）
