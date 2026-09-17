# LTZZZ 六 AI 每日自动化调度协议

> 状态：调度器「可运行 + 占位」。本环境无任何真实 API Key，全部真实上游调用走 dry-run（日志 `dry_run=true`），并标注【等待人工凭证】。
> 配套实现：`ltzzz-daily-automation-worker.js`（`scheduled()` cron 入口）+ `wrangler.daily.toml`。
> 对齐资产：`protocol/video-pipeline.md`、`protocol/security-redlines.md`、`finance/budgets.md`、`knowledge/ai-chats/`。

---

## 1. 六个 AI 每日任务规范表

> cron 列均为 **UTC** 表达式（Cloudflare 固定按 UTC）；触发时间列为对应 **UTC+8（Asia/Shanghai）**。换算：UTC+8 − 8h = UTC。
> 所有失败均不抛崩调度器：按「失败重试」列指数退避重试，仍失败记入 `waiting_manual`。

| 编号 | 任务名 | AI 通道 | 输入 | 输出 / 落盘路径 | cron(UTC) | UTC+8 触发 | 失败重试 |
|---|---|---|---|---|---|---|---|
| 1 | deepseek-clean | DeepSeek | 前一日 `knowledge/ai-chats/` 新增记录 | 清洗稿：脱敏/去噪/要点 → `knowledge/daily-clean/<昨天>.cleaned.md` | `30 22 * * *` | 06:30 | 2 次（500ms→1s 退避） |
| 2 | gpt-daily-plan | GPT(OpenAI) | 当日清洗稿/前序台账 | 当日规划草稿 → `knowledge/daily-plan/<今天>.md`；并下发 1 条可执行任务 `{task_id, 目标, 验收标准, 截止}` | `0 0 * * *` | 08:00 | 2 次 |
| 3 | claude-review | Claude(Anthropic) | 当日清洗稿 | 批判性复盘（矛盾点/遗漏）→ `knowledge/daily-clean/<今天>.review.md` | `30 1 * * *` | 09:30 | 2 次 |
| 4 | doubao-video | 豆包 | 当日清洗稿中 GPT 判定高价值的 1 段 | 选题→中文口播文案→视频→登记 `CONTENT-YYYYMMDD-NNN` 到 `knowledge/content-registry.md`；并排好次日计划 | `0 3 * * *` | 11:00 | 1 次（出片链路最长，避免重复扣费） |
| 5 | copilot-western | Microsoft Copilot | 当日同一选题 | 西方主流 AI 说法对照笔记 → `knowledge/daily-plan/<今天>.western.md` | `0 6 * * *` | 14:00 | 2 次 |
| 6 | xia-altview | XIA(Grok) | 当日同一选题 | 另类视角/大胆预测短评（≤200 字）→ `knowledge/daily-plan/<今天>.altview.md` | `0 8 * * *` | 16:00 | 2 次 |

**当日工作时序（UTC+8）**：06:30 清洗 → 08:00 规划+派单 → 09:30 复盘 → 11:00 出片 → 14:00 西方对照 → 16:00 另类视角。

---

## 2. 视频每日生产管线（引用 video-pipeline.md）

完整 11 步管线见 `protocol/video-pipeline.md`（聊天记录→切段→内容ID→清洗→价值判断→文案→制作→字幕→封面→片头尾→发布→回写）。每日自动化在其上做**自动选料**：

```
前一日 ai-chats 新增
   │ (06:30) DeepSeek 清洗 ──► 当日清洗稿 daily-clean/<date>.cleaned.md
   │                                  │
   │ (08:00) GPT 当日规划 + 价值判定 ◄┘ （在清洗稿中标出“高价值片段”）
   │
   ▼
(11:00) 豆包视频每日 1 条：
   ① 选题 = 当日清洗稿里 GPT 判定为“值得做”的 1 段（每日仅自动选 1 条）
   ② 中文口播文案（≤60 秒，9:16）
   ③ 视频制作引擎 fallback：Gemini/Veo ──失败──► Seedance ──失败/无Key──► 本地占位（local-placeholder）
   ④ 登记 CONTENT-YYYYMMDD-NNN 到 knowledge/content-registry.md（ID/来源/主题/清洗稿/文案/引擎/发布状态）
   ⑤ 当天顺手写好次日 daily-plan 占位（排产）
```

- **每日只自动选 1 条素材**：价值判定以 GPT 标记的“高价值片段”为准，避免一天多发、超预算。
- 内容 ID：`CONTENT-YYYYMMDD-NNN`（NNN 当日序号，默认 001），台账落 `knowledge/content-registry.md`。
- 发布默认**私密**，转公开需人工授权（沿用 video-pipeline.md 第⑩步与 PUBLISH_LOG.md 原则）。

---

## 3. 预算守卫与安全红线对照表

预算硬规则由代码 `checkBudget()` 强制（读 env 限额，默认豆包/DeepSeek 各 **20 RMB**）：

| 规则 | 阈值 | 代码行为 | 状态标记 |
|---|---|---|---|
| 正常 | <80% | 允许调用（无 Key 则 dry-run） | `ok` |
| 预警 | ≥80% | 继续调用但打印预算预警日志 | `warning` |
| 硬停 | ≥100% | **拒绝调用**，直接返回 | `blocked_waiting_approval` / `waiting_approval` |

与 `protocol/security-redlines.md` 的对照：

| 红线 | 本调度的落地 |
|---|---|
| 密钥不入仓库/前端/日志/聊天 | 只经 `wrangler secret put` 注入 env；日志对 Key 一律 `maskSecret()` 掩码（首尾各 3 位） |
| 密钥只进 Secret/环境变量 | wrangler.daily.toml 仅放限额，不放任何 Key |
| 不伪造成功状态 | 无 Key 时统一 `dry_run=true`，占位输出标注“等待人工凭证” |
| 资金类不越权、留可审计记录 | 资金一律 dry-run/模拟；每笔经预算守卫并打日志 |
| 不超预算、不自行加预算 | 100% 自动停并 `waiting_approval`，不自行追加 |

---

## 4. 部署 Runbook

1. **前置**：`node --version` ≥ 20；已 `npm i -g wrangler` 并 `wrangler login`。
2. **部署骨架（dry-run，无 Key 即可跑）**：
   ```bash
   cd /home/user/ltzzz
   wrangler deploy -c wrangler.daily.toml
   ```
3. **校验语法**：
   ```bash
   node --check ltzzz-daily-automation-worker.js   # 应无输出、退出码 0
   ```
4. **Secret 清单（逐一注入，禁止写进仓库/命令历史之外的明文文件）**：
   ```bash
   wrangler secret put OPENAI_API_KEY         --config wrangler.daily.toml
   wrangler secret put DEEPSEEK_API_KEY       --config wrangler.daily.toml
   wrangler secret put ANTHROPIC_API_KEY      --config wrangler.daily.toml
   wrangler secret put DOUBAO_API_KEY        --config wrangler.daily.toml
   wrangler secret put COPILOT_TOKEN         --config wrangler.daily.toml
   wrangler secret put XIA_GROK_API_KEY      --config wrangler.daily.toml
   wrangler secret put GEMINI_VIDEO_KEY      --config wrangler.daily.toml   # Veo 引擎
   wrangler secret put SEEDANCE_KEY          --config wrangler.daily.toml   # 次选引擎
   wrangler secret put LTZZZ_AGENT_TOKEN     --config wrangler.daily.toml   # /run 手动接口令牌
   ```
5. **在 Cloudflare 控制台验证 cron**：
   - 进入 Workers & Pages → 选中 `ltzzz-daily-automation` → **Triggers（触发器）** 页签。
   - 确认 **Cron Triggers** 列表出现 6 条，且与 `wrangler.daily.toml` 的 `crons` 一致（UTC 显示）。
   - 对照 UTC+8 换算：控制台显示的是 UTC，如 `0 0 * * *` 即北京 08:00。
   - 用 **“Test Cron / 手动触发”** 跑一次，观察日志是否出现 `scheduled.trigger` 与 `dry_run:true`；再用 `GET /health` 看预算与任务清单。
6. **手动调试**（生产仍以 cron 为准）：
   ```bash
   curl -H "Authorization: Bearer $LTZZZ_AGENT_TOKEN" \
     "https://ltzzz-daily-automation.<you>.workers.dev/run?task=doubao-video"
   ```

---

## 5. 「等待人工凭证」清单

> 以下一律未配置真实值；接入前调度保持 dry-run，禁止伪造。

1. `OPENAI_API_KEY` —— GPT 当日规划 / 视频选题价值判定。
2. `DEEPSEEK_API_KEY` —— 前一日聊天记录清洗。
3. `ANTHROPIC_API_KEY` —— Claude 批判性复盘。
4. `DOUBAO_API_KEY` —— 豆包中文口播文案 / 出片。
5. `COPILOT_TOKEN` —— Microsoft Copilot 西方视角对照。
6. `XIA_GROK_API_KEY` —— XIA(Grok) 另类视角/预测。
7. `GEMINI_VIDEO_KEY`（Veo）—— 视频制作首选引擎。
8. `SEEDANCE_KEY` —— 视频制作次选引擎。
9. `LTZZZ_AGENT_TOKEN` —— 手动 `/run` 接口鉴权（非上游 Key）。
10. R2 绑定 `LTZZZ_ARTIFACTS` —— 真实落盘（未绑定时自动退化 dry-run 日志，不阻塞）。
11. 预算回写真值 —— 当前 `DOUBAO_BUDGET_SPENT` / `DEEPSEEK_BUDGET_SPENT` 为占位 0，真实累计需接 KV/R2 账本。

---

## 附：本环境硬约束执行情况

- [x] 无真实 Key：全部走 dry-run，日志 `dry_run=true`，未伪造任何 Key。
- [x] 预算硬规则代码强制：豆包/DeepSeek 各 20 RMB，80% 预警、100% 停止 → `waiting_approval`。
- [x] 密钥只进 Cloudflare Secret，不入仓库/日志/回复（日志掩码）。
- [x] 仅改动工作区，未 git commit / git push。
- [x] 新 JS 文件 `node --check` 通过。
