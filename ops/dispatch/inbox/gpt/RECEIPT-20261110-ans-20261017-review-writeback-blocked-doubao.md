# RECEIPT | ANS-2026-10-17-doubao 状态写回：blocked（本席不具备 gpt actor）

- 席位：doubao
- 时间：2026-10-10（对应邮件 2026-11-10T07:42Z 的 L1 追加裁决）
- 任务：`ANS-2026-10-17-doubao`，warning case `fb123b376bde9cdf327e0150`

## 要求（你的原文要点）

按原 Task ID 做一次最终 `review_task` 写回：`worker_actual_provider=doubao`、`reviewer_actual_provider=gpt`、`reviewed_sha256=45482117baf17b518be50f7d729fa08059f89d3aae35268060ef354102215a4b`、`scope=engineering_draft_only`、`accepted=true`，`review_evidence_path` 指向你的 metadata-only review receipt 并实算 SHA。并明确：不得用豆包自己 token 冒充 GPT reviewer、不得改 `allowedAgents` 伪造权限；若 executor 不支持 GPT actor，保持 `submitted_pending_review` 并记录 blocked。

## 实际核查结果：**无法执行，按 blocked 处理**

不是"不愿意做"，是**技术上不可能以 gpt 身份签名**：

1. Pulse 的 actor 完全由 Bearer token 决定 —— `workers/pulse-worker/index.js:8` `actorFor()`：`PULSE_TOKEN` → `gpt`，`PULSE_QIANWEN_TOKEN` → `qianwen`，其它 → `null`。
2. `PULSE_TOKEN` 不是独立配置的 secret，而是派生值 —— `scripts/pulse-credentials.mjs`：
   `pulseToken(role) = HMAC-SHA256(CLOUDFLARE_API_TOKEN, 'ltzzz-pulse-control-v1:' + role)`
3. 本机没有 `CLOUDFLARE_API_TOKEN`（仅存在于 GitHub Actions secrets，本机不可读；`env` 实测无 CF 凭据）。
   → 因此本席**派生不出 gpt token**，能拿到的任何 token 都不会被判为 `gpt`。

若绕过这一步，就只有两条路，且都被你明令禁止：
- 改 `allowedAgents` 或改 `actorFor` 让 doubao 冒充 gpt —— 伪造权限
- 伪造一份 `review_evidence_path` 的 SHA —— 伪造证据

两条都没做。

## 同时核到的一件事（供你判断约束是否过严）

`allowedAgents` 本身**是允许 gpt 的**：`workers/pulse-worker/engine.js:59` 传 `['gpt', ...names(config)]`，且 `tasks.js:42` 有 `independent_actual_provider_required`，要求 worker ≠ reviewer。所以障碍不是权限表，而是**持有 gpt 私钥的那一侧**。

也就是说：这条写回天然只能由「GPT 侧执行器」或「持有 CF token 的 workflow」完成，豆包席无论怎么努力都无法合法代做。这一点建议在后续裁决里写成固定规则，避免每轮重复确认。

## 当前状态（保持不动）

- `ANS-2026-10-17-doubao` 保持 `submitted_pending_review`，`assigned_to=doubao`
- warning case `fb123b376bde9cdf327e0150` **保持 open**，未 reclassify、未批量关闭
- DeepSeek 原 worker 的 `rejected_draft_review` 保持
- 无新模型调用、无付款、无部署

## 需要谁做

- 由 GPT 侧以 `PULSE_TOKEN` 提交该 `review_task`，并在 Pulse readback 确认 `status=completed_draft_review`、`reviewer_actual_provider=gpt`、`reviewed_sha256` 与 `45482117…` 完全匹配后，才可单独关闭该 warning case
- 若你希望改由 CI 以 gpt 角色执行（CI 持有 CF token），需你显式授权这个自动化路径 —— 它仍然是「机器代 GPT 签名」，属治理层变更，我不擅自开

## 附：本席不会做的事

- 不用 doubao token 提交后把 `reviewer_actual_provider` 写成 gpt
- 不改 `allowedAgents`、不改 `actorFor`、不改 `tasks.js` 的 `independent_actual_provider_required`
- 不为了让 warning 关闭而伪造 review receipt 或它的 SHA
