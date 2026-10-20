# 回执 · P0 中转站防护（按 PR #170 修订派单）

| 字段 | 内容 |
|---|---|
| 派单 | https://github.com/ltzyz2181-collab/ltzzz/pull/170 |
| 执行席 | xAI / Grok（仓库代码 PR，不读 Key、不注入 Secret、不部署线上） |
| 时间 | 2026-10-21 |
| 状态 | **P0 代码已完成（默认门禁关）**；线上启用 REQUIRE_TOKEN / 部署仍待云豆包工作流 |

## 做了什么

1. 新增 `lib/proxy-guard.js`：可选 `REQUIRE_TOKEN`、`max_tokens` 硬顶、可选 `ALLOWED_ORIGINS`、按 IP 小时限频（Cache API 尽力）。
2. 接入四个中转站（均默认 **不强制** Bearer，避免打断现有调用方）：
   - `qianwen-proxy-worker.js`
   - `xai-proxy-worker.js`
   - `deepseek-proxy-worker-v2.js`（主深求部署文件）
   - `doubao-proxy-worker.js`（公开页兼容：默认不强制 Bearer；更紧的 token 顶 2048、限频默认 30/小时）
3. `/health` 增加只读字段：`require_token`、`auth_configured`、`rate_limit_per_hour`、`max_tokens_hard_cap` 等，便于部署后探针。

## 实际结果

| 项 | 结果 |
|---|---|
| 裸调消耗额度风险 | **部分缓解**：任意 `max_tokens` 被硬顶；豆包有限频；全量 Bearer 门禁仍需显式打开 |
| 现有调用方 | **不破坏**：`REQUIRE_TOKEN` 默认关，与派单「先改调用方再开门禁」一致 |
| 豆包公开页 | **仍可无 Bearer 调用**（符合派单「不能照搬 Bearer」）；部署后可配 `ALLOWED_ORIGINS` |
| Key / 付款 | **未接触、未新增** |

## 证据

- 分支：`p0-proxy-guard-20261021`
- 核心文件：`lib/proxy-guard.js` 及上述四个 worker
- 对照派单：Claude 复核卡 `ops/dispatch/CLAUDE-REVIEW-QWEN-HANDOFF-20261021.md`（PR #170）

## 下一步（非本回执范围）

1. **云豆包**：对四 Worker 跑既有 deploy 工作流，把本分支合入 main 后部署。
2. 内部调用方（daily automation、pulse、provenance 等）补 `Authorization: Bearer ${LTZZZ_AGENT_TOKEN}`。
3. 调用方齐后，各 Worker 设 `REQUIRE_TOKEN=true`（豆包若仍要公开页，可维持 false，仅收紧 `ALLOWED_ORIGINS` + 限频）。
4. 部署后外网探针：`GET /health` 看 `require_token` / `auth_configured`；`POST` 无 Bearer 在门禁开启时应 401。

## 红线自检

- 未写任何 Key 值
- 未在门禁开启前停用现有调用方
- 未新增付款
- 未把「代码合入」标成「线上已验证」
