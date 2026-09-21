# LTZZZ 任务池

---

## 进行中

| ID | 任务 | 备注 |
|----|------|------|
| T030 | 周一云豆包任务：整理 Memory/Results 与前端每日记录接入准备 | 等豆包 API/开发平台可执行凭证；先可做资料整理与验收清单 |
| T029 | Memory Engine 真读 + Execution ID + 交叉审 | TASK-20260921-001 |
| T028 | R2 现网绑定 | 等桶 ltzzz-memory |
| T010 | 凭证制度 | Secret 只在 CF |

## T030 周任务定义（2026-09-21 至 2026-09-27）

### 目标
整理一份可直接交给后续自动化执行器使用的 LTZZZ「Memory/Results → 前端每日记录」接入准备包，明确当前文件、字段、状态和验收方式；不需要 API Key，不触碰生产权限。

### 输入

- `ltzzz-memory/manifest.json`
- `ltzzz-memory/README.md`
- `ltzzz-memory/memory-engine.md`
- `ltzzz-memory/LTZZZ-OS.md`
- `lab/tasks.md`
- `ai/ai-capabilities.md`
- `memory/daily/` 与 `knowledge/daily/` 中已有记录

### 执行步骤

1. 对 Memory、Task、Result、Asset 四类资料建立路径清单。
2. 标出每类资料的必需字段、当前缺失字段和状态枚举。
3. 设计前端每日记录最小数据结构：日期、任务、执行状态、结果、验证、阻塞、下一步。
4. 产出一份“前端接入验收清单”，包括正常、dry-run、waiting_human、failed 四种状态。
5. 对已有重复字段提出合并建议，但不直接改生产代码，不修改密钥、资金、支付或权限。
6. 将实际结果写回 `knowledge/daily/doubao/<date>.md` 或等价文档，并给出文件路径与验收结论。

### 验收标准

- 至少列出 Memory/Task/Result/Asset 各自的来源路径。
- 至少给出 1 份前端每日记录字段表。
- 至少覆盖 4 种状态：verified、dry_run、waiting_human、failed。
- 每条结论可回指仓库文件路径。
- 没有 API Key 时也能完成资料整理；需要调用 API 的部分明确写“等人工凭证”。
- 不得声称已完成外部豆包 API 调用，除非有真实执行记录、响应证据和结果落盘。

### 当前实际结果（总控先行记录）

- 已建立任务定义与验收标准。
- 豆包 API/开发平台可执行凭证：等人工凭证。
- 外部豆包执行结果：未验证。

## 待办

| ID | 任务 | 备注 |
|----|------|------|
| T026 | YouTube/TikTok 人工确认后 private | 不默认 public |
| T021 | R2 对象同步 Secrets | 等桶 |
| T012 | 支付宝小额测 | 等官方 |

## 完成

| ID | 任务 | 结果 |
|----|------|------|
| T027 | Webhook | webhook-deploy.yml |
| T025 | 视频流水线 | waiting_human |
| T024 | wallet 账本 | 出金须人工确认 |
| T022 | daily 摘要 dry-run | patrol |
| T023 | Daily Worker | cron=0 * * * * |
| T020 | Memory Gateway | GitHub 源 |
| T003 | 豆包 Worker | /health ok |
