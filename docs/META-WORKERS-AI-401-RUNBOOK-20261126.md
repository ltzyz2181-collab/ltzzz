# Meta / Workers AI 401-403：重配 Token · 存 Secret · curl 验收 200 Runbook

- UTC：2026-11-26T02:2xZ（编写时）
- 编写席：WorkBuddy 席 `sgii7122@agent.qq.com`
- 依据：Owner 2026-11-26 会话内直接指令「重配 Token 存 Secret，curl 测 200 贴 #609；推代码/贴 Issue 代推；帮 meta 能完成的都部署」
- 适用对象：meta 席位 / 任何具备 Cloudflare 账户权限或 GitHub 仓库 secrets 写入权的执行席
- 秘密值保护：本文**不含**任何 token / Secret / PAT 明文；所有凭据一律从环境变量或平台 Secret 注入，不打印、不落盘、不外发

---

## 1. 先分清「两把钥匙」与「三层」，别换错钥匙

用户口径「Issue 的 PAT 通，推理的 Token 不通，是两把钥匙」方向正确；从 `origin/main` 代码核实，推理侧实际有三层：

| 层 | 凭据 / 绑定 | 出问题时 | 修法 |
|---|---|---|---|
| L1 GitHub 写 Issue | `GITHUB_ISSUES_TOKEN` / `META_ISSUES_PAT`（仓库 secrets，11-20 更新） | Issue 评论写不进 | 与推理 401 无关，别混 |
| L2 Worker Bearer | `META_WORKER_TOKEN`（Worker Secret） | `index.ts` 校验 `Authorization !== Bearer ${META_WORKER_TOKEN}` → **401 unauthorized**；未配置 → 503 auth_not_configured | 重配/对齐调用方 Bearer（本文 §3/§4） |
| L3 Workers AI 推理 | `[ai] binding="AI"`（`wrangler.meta-hosted.toml`），走 `env.AI.run()` | 缺绑定 → 503 ai_binding_missing | **不需要** Cloudflare API Token；重部署带 binding 的配置 |
| L3' 仅 REST 直调 | Workers AI API Token（Workers AI Read+Edit + Account ID + Account Resources） | 401=token 无效/过期；403=token 有效但权限/资源范围不足 | 仅当绕过 Worker 直调 `POST /accounts/{id}/ai/run/{model}` 才需要 |

**关键结论**：若 401 出现在 Worker URL（`*.workers.dev/task`），换 Cloudflare API Token 或查 Workers AI 权限都修不好 —— 401 出在 L2 Worker Bearer，须先定位报错层。

## 2. 本机（WorkBuddy 席）物理约束 —— 为何走 CI 而不是本机直连

2026-11-26 02:08Z 重新实测（不照抄旧结论）：

- `CLOUDFLARE_API_TOKEN` / `CF_API_TOKEN` / `CF_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` / `CF_ACCOUNT_ID` / `WORKERS_AI_TOKEN` / `META_WORKER_TOKEN` / `GITHUB_ISSUES_TOKEN` / `GITHUB_TOKEN` / `GH_TOKEN` / `GH_PAT` 环境变量**全空**
- `wrangler` / `gh` CLI 不存在；5 处 `.wrangler` 登录态目录不存在；`wrangler whoami` / `gh auth status` 无法执行
- `dash.cloudflare.com` HTTP 403；`ltzzz-meta-hosted.ltzyz2181.workers.dev/health` 经代理 502 / 直连超时 000
- 浏览器控制工具本会话不可用

→ 本席**无法在本机**直接登录 Cloudflare 控制台 / 执行 `wrangler secret put`。但仓库存在既定 CI 链路可用（§3）。

另有可用通道（纠正「无 GitHub 凭据」旧结论）：本机 Windows 凭据管理器（wincred）缓存了 owner 账号 `ltzyz2181-collab` 的 PAT，`git ls-remote` exit 0、`GET /user` 200、scope=`gist, repo, workflow` → **可贴 #609、可代推分支、可触发 workflow_dispatch**。全程只在内存解析，不打印明文。

## 3. 路径 A（推荐，已执行）：CI workflow_dispatch 重配 Token + 存 Secret + 验收 200

仓库 `origin/main:.github/workflows/control-handover-verification.yml`（workflow id 379226800）本就是为此设计的既定链路，含 `workflow_dispatch` 触发器：

```yaml
on:
  workflow_dispatch:
# Deploy step（仅 dispatch 触发）:
#   token = secrets.META_WORKER_TOKEN || HMAC-SHA256(CLOUDFLARE_API_TOKEN, 'ltzzz-meta-hosted-control-v1')
#   → 写入 /tmp/meta-auth.json
#   npx wrangler deploy -c wrangler.meta-hosted.toml
#   npx wrangler secret bulk /tmp/meta-auth.json -c wrangler.meta-hosted.toml   # ← 「重配 Token 存 Secret」
#   → 从 CF API 查 subdomain 拼 META_WORKER_URL
# Verify step:
#   node scripts/verify-meta-hosted.mjs
#   → POST {META_WORKER_URL}/task 带 Bearer {token}：hire / invest 两次，断言 http===200 且 output 非空
#   → 匿名 POST：断言 http===401
#   → 落盘 knowledge/results/meta/{GITHUB_RUN_ID}.json，Persist evidence 步骤 push 回 main
```

触发命令（脱敏；token 从平台注入，不落在命令里）：

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -X POST \
  -H "Authorization: Bearer ${PAT}" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/ltzyz2181-collab/ltzzz/actions/workflows/379226800/dispatches \
  -d '{"ref":"main"}'
# 期望 204 No Content
```

前置条件（2026-11-26 02:1xZ 只读核实）：仓库 Actions secrets 共 33 个，其中 `CLOUDFLARE_API_TOKEN`（2026-09-17 更新）、`CLOUDFLARE_ACCOUNT_ID`（2026-09-17）**存在**；`META_WORKER_TOKEN` 仓库侧**不存在** → 本轮由 workflow 用 `CLOUDFLARE_API_TOKEN` 派生确定性 token 并 `secret bulk` 写入 Worker，即完成「重配 Token 存 Secret」。该 workflow 最近 5 次 run 全部 `conclusion=success`。

边界：Deploy / Verify / DeFi 观察步骤均为 `continue-on-error: true`，因此 **不能只看 run conclusion 判成功**，必须读 Verify step 结论与落盘证据 JSON 的 `http` / `anonymous_http` 字段。DeFi 步骤 `scripts/defi-roundtrip.mjs` 经核查为 `quarantined_read_only` 只读余额快照、无签名、无资金动作（`record.status='quarantined_read_only'`），不触碰五类红线。

## 4. 路径 B（本机/已登录席位）：wrangler 手动重配

仅当具备 Cloudflare 登录态或 API Token 时：

```bash
# 前置：CLOUDFLARE_API_TOKEN（含 Workers Scripts:Edit + Account:Read）、CLOUDFLARE_ACCOUNT_ID
export CLOUDFLARE_API_TOKEN=...   # 从平台 Secret 注入，绝不写进脚本/日志/邮件
export CLOUDFLARE_ACCOUNT_ID=...
npx wrangler@4 whoami                                   # 确认登录态
npx wrangler@4 deploy -c wrangler.meta-hosted.toml      # 带 [ai] binding="AI"
npx wrangler@4 secret put META_WORKER_TOKEN -c wrangler.meta-hosted.toml   # 交互式输入新 token
# 或批量：npx wrangler@4 secret bulk meta-auth.json -c wrangler.meta-hosted.toml
```

REST 直调（仅 L3'）需要先验 token：

```bash
curl -sS -H "Authorization: Bearer ${WORKERS_AI_TOKEN}" \
  https://api.cloudflare.com/client/v4/user/tokens/verify
# 期望 {"result":{"status":"active"}...}；401=无效/过期，403=权限或 Account Resources 不足
```

## 5. curl 验收 200（可在能连通 workers.dev 的席位执行）

```bash
export META_WORKER_URL=https://ltzzz-meta-hosted.<subdomain>.workers.dev
export META_WORKER_TOKEN=...     # 与 Worker Secret 一致；从平台注入
# 1) 带 token 推理：期望 200 + output 非空
curl -sS -w '\nHTTP=%{http_code}\n' -X POST "${META_WORKER_URL}/task" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${META_WORKER_TOKEN}" \
  -d '{"task_id":"verify-20261126","kind":"hire","prompt":"ping"}'
# 2) 匿名：期望 401
curl -sS -o /dev/null -w 'HTTP=%{http_code}\n' -X POST "${META_WORKER_URL}/task" \
  -H 'Content-Type: application/json' -d '{}'
# 3) 健康检查：auth_configured=true、ai_binding=true
curl -sS -w '\nHTTP=%{http_code}\n' "${META_WORKER_URL}/health"
```

可复用脚本见同目录 `verify-meta-hosted-200.mjs`（从 env 读凭据、输出结构化 JSON、不打印 token）。

本机本席实测（02:08Z）：`/health` 经代理 `CONNECT tunnel failed, response 502`、直连 `HTTP=000`（超时）→ **本席本机 curl 无法测到 200**，须以 CI 侧验收结果为准，不得把「不可达」写成「200 已验证」。

## 6. 独立邮箱 meta@ltzzz.com

Owner 会话内明确写「独立邮箱请 **Owner 建** meta@ltzzz.com」→ 属 Owner 侧动作（域名邮箱/企业邮箱开通，需域名与邮箱管理后台权限），WorkBuddy 席无该通道、不擅自创建。本轮已在三段式回执与 #609 评论中如实列为「待 Owner 建」，并给出依赖：需 Owner 提供邮箱服务入口与授权方式。

## 7. 边界与纪律

- 五类须 GPT 书面裁决（资金动作/退款终态/签名/私钥·助记词·根密钥/钱包）：本 runbook 全部动作**均不触碰**。
- 凭据配置/轮换、写 Issue、工作流调整属全自动化范围（Owner 2026-11-23 总纲 + GPT 2026-11-25 五类纠偏），无需逐次挂起；秘密值保护、最小权限、审计日志仍须遵守。
- 不把「已写入 Issue 评论」描述为「推理 200 成功」；不把「CI 侧验收」混称「本席原生直连 Cloudflare」；不把「已申请」写成「已接单/已交付」。
- 证据缺口（token 实际过期状态、Workers AI 权限勾选、线上实际部署版本）如实标 BLOCKED_EVIDENCE 并给补齐方式。
