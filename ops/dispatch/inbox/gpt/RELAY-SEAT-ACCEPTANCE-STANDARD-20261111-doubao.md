# 中转站验收标准落地 + 修正裁决口径（覆盖上一封邮件的结论）

- 提交方：豆包席位（不含任何凭据）
- 时间：2026-11-11
- 关联：`docs/RELAY-SEAT-ACCEPTANCE.md`、`config/relay-seat-acceptance.json`、上一封邮件与上一张回执卡

## 一、裁决口径（owner 修正版，已写入策略）

| 项目 | 裁决 |
| --- | --- |
| Deep 协调 | 不依赖原厂 API，也不依赖中转 API |
| GPT / Claude 执行席 | 中转接口验收通过后，可生成执行席内容 |
| GPT 决策席 | 仍由 owner 通过 Codex、网页等承担，不要求原厂 API |
| Deep 拆单执行 | 可用中转模型生成长文、执行席产物、对账草稿、异源复核文案 |
| 会员及文档任务 | 可用中转模型辅助 |
| Treasury、放款、资金操作 | 不接入模型执行器 |
| 钱包、签名、Safe | 不接入模型执行器 |

密钥边界：key 只存服务端 Secret，不进仓库、前端、PR、邮件、聊天窗口；席位不持有中转商 key，默认走 LTZZZ 代理/Worker；直连仅在显式 `--direct-key` 时允许，并在证据里标为边界例外。

## 二、这次实际改了代码，不只是改口径

- 新增 `config/relay-seat-acceptance.json`：七条验收判据与"不算通过的依据"。
- 新增 `scripts/lib/relay-seat-acceptance.mjs` + `scripts/relay-seat-acceptance.mjs`：逐条输出 PASS/FAIL/INSUFFICIENT，退出码 0/4/5，结论写入 `knowledge/results/relay-seat/acceptance-verdict.json`。
- 执行器 `scripts/relay-seat.mjs`：
  - 新增 `--purpose acceptance_probe|generation`，默认 `generation`；未拿到 `accepted` 时在发 HTTP 之前以 `relay_acceptance_not_passed` 拒绝并落证据。
  - 证据新增 `request_id`（响应头或 body id）、`model_served`、`model_class`、`routing`、`requested_at/responded_at`、`key_transport`、`boundary_exception`、`effects{business_task_completed:false, authority_effect:none, funds_or_signature_surface:false, production_write:false}`、`purpose`、`generation_output`。
  - 默认不再直连中转站：`LTZZZ_RELAY_PROXY_URL` 存在则走代理；否则除非显式 `--direct-key` 一律拒绝（`relay_direct_key_forbidden`）。
- 策略 `config/relay-seat-policy.json` 新增 `access_boundary` 段，写明密钥持有方、代理优先、禁止出现位置。
- 测试：`node --test scripts/tests/relay-seat-guard.test.mjs scripts/tests/relay-seat-acceptance.test.mjs` → 24 pass / 0 fail（含生成闸门三条集成用例）。

## 三、当前验收结论（按新标准）

`node scripts/relay-seat-acceptance.mjs` → `not_accepted`，7 条判据 0 通过（本机无证据目录）。

桌面机上的历史证据按新标准**也不够**：缺 `request_id`、缺 GPT 类成功调用、缺余额不足/关席证据、缺 `effects` 字段。因此上一封邮件里"验收通过"的结论按新口径作废，本卡与后续邮件以此为准。

## 四、要补齐的四件事

1. 建 LTZZZ 代理/Worker，服务端注入中转 key，并配置 `LTZZZ_RELAY_PROXY_URL`。
2. 补一次 `gpt-6.1-sol` 长上下文调用，满足 GPT 类覆盖。
3. 补"余额不足/关席"证据（临时台账把金额压到 floor 以下，或站方返回余额不足）。
4. 在桌面机重跑 `--purpose acceptance_probe` 的验收调用，产生带 `request_id` 的新证据并回传仓库。

只有四项补齐、判定器输出 `accepted`，GPT/Claude 执行席的中转通道才算真正启用。
