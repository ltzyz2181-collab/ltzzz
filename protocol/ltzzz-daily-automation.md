# LTZZZ 六 AI 每日自动化调度协议（新版六任务）

> 状态：调度器「可运行 + 占位」。本环境无任何真实 API Key，全部真实上游调用走 dry-run（日志 `dry_run=true`），并标注【等待人工凭证】。
> 配套实现：`ltzzz-daily-automation-worker.js`（`scheduled()` cron 入口）+ `wrangler.daily.toml`。
> 对齐资产：`protocol/video-pipeline.md`、`protocol/security-redlines.md`、`finance/budgets.md`、`knowledge/ai-chats/`、`knowledge/daily/`、`knowledge/memory-review/`。
> 术语基线：身体=三维装备；魄（含尸狗）；识神/元神；习气；网状因果。怜悯之心主题＝「知其固然如此、知其本不该如此」。

---

## 1. 六通道每日任务规范表

> cron 列均为 **UTC** 表达式（Cloudflare 固定按 UTC）；触发时间列为对应 **UTC+8（Asia/Shanghai）**。换算：UTC+8 − 8h = UTC。
> 输入列＝**仓库阅读源**（当日从仓库里读什么）；输出列＝**落盘路径**（统一落到 `knowledge/daily/<channel>/YYYY-MM-DD.md`）。
> 所有失败均不抛崩调度器：按「失败重试」列指数退避重试，仍失败记入 `waiting_manual`。

> **🚨【MUST 强制项 · 每日必跑】本表六项每日任务（GPT / 豆包 / XAI·Grok / Claude / DeepSeek / Copilot）均为 `mandatory: true`，是「强制每天执行」的硬约束，不是可选项。**
> **强制规则（无任何例外）：**
> 1. **不得跳过**：六个通道每个自然日（UTC+8）都必须触发执行，哪怕当天没有真实 API Key、上游不可用、预算触线，也绝不允许整项 skip。
> 2. **无 Key 也必须产出当日记录**：没有 API Key 时统一走 **dry-run**，当日仍必须落盘 `knowledge/daily/<channel>/YYYY-MM-DD.md`（`<channel>` ∈ `gpt`/`doubao`/`xia`/`claude`/`deepseek`/`copilot`），文件头标 `dry_run=true` 与 `WAITING_CREDENTIAL`，写明 dry-run 占位原因。
> 3. **不得留空**：当日文件必须存在且非空壳——至少包含「## 仓库阅读记录」「## 当日产出」（dry-run 时写「无（原因：…，等待人工凭证）」）与 `## polish` 小节；禁止把当天通道直接删掉、禁止用空文件占位充数、禁止伪造真实产出内容。
> 4. 预算红线（豆包/DeepSeek 各 20 RMB）、凭证只进 Secret、polish 的 proposed/applied 诚信双层——三者不变，见第 3、5 章。

| 编号 | 通道(channel) | 任务内容 | 输入＝仓库阅读源 | 输出落盘路径 | cron(UTC) | UTC+8 触发 | 失败重试 |
|---|---|---|---|---|---|---|---|
| 1 | **GPT**（`gpt`） | ①当日规划＋部署 1 条可执行任务；②记录昨日记忆；③每天一段「怜悯之心」（朝向「知其固然如此、知其本不该如此」）；④每天 ≥1 条模板打磨提案 | `knowledge/ai-chats/` 昨日记录、`knowledge/daily/` 前日台账、`knowledge/memory-review/` 昨日复盘 | `knowledge/daily/gpt/YYYY-MM-DD.md` | `0 0 * * *` | 08:00 | 2 次（500ms→1s 退避） |
| 2 | **豆包**（`doubao`） | ①装备论（魄/识神/装备肉身）学习笔记；②每日整理（≥1 字位置变化提案）；③每日 1 条视频脚本入台账 | `knowledge/ai-chats/Doubao/`、`knowledge/memory-review/`、装备论相关页面（`shenti.html`/`xingshen.html`/`guan.html`） | `knowledge/daily/doubao/YYYY-MM-DD.md` | `0 2 * * *` | 10:00 | 2 次 |
| 3 | **XAI/Grok**（`xia`） | ①装备论对心理问题（焦虑/抑郁/双相）的作用，每日 1 条；②每日 ≥1 条 APP(`app.html`)/Web3(`wallet-lab.html`+`contracts/`) 代码打磨提案 | `app.html`、`wallet-lab.html`、`contracts/`、`knowledge/ai-chats/XIA/` | `knowledge/daily/xia/YYYY-MM-DD.md` | `0 4 * * *` | 12:00 | 2 次 |
| 4 | **Claude**（`claude`） | 每日 ≥50 字小说片段，逐日连续积累（承接前一日结尾续写） | `knowledge/daily/claude/` 最近一篇小说稿、`knowledge/ai-chats/GPT/` 当日规划 | `knowledge/daily/claude/YYYY-MM-DD.md` | `0 6 * * *` | 14:00 | 2 次 |
| 5 | **DeepSeek**（`deepseek`） | 中华传统文化 vs 装备论异同，每日 1 条 | `knowledge/ai-chats/DeepSeek/`、`articles/`、`knowledge/memory-review/` | `knowledge/daily/deepseek/YYYY-MM-DD.md` | `0 8 * * *` | 16:00 | 2 次 |
| 6 | **Copilot**（`copilot`） | 西方文化 vs 装备论异同，每日 1 条 | `knowledge/ai-chats/Microsoft/`、`articles/`、`knowledge/memory-review/` | `knowledge/daily/copilot/YYYY-MM-DD.md` | `0 10 * * *` | 18:00 | 2 次 |

**当日工作时序（UTC+8）**：08:00 GPT 规划+派单+怜悯之心 → 10:00 豆包装备论笔记+视频脚本 → 12:00 XAI 心理作用+代码打磨 → 14:00 Claude 小说续写 → 16:00 DeepSeek 中华 vs 装备论 → 18:00 Copilot 西方 vs 装备论。

> 与旧版差异：旧版「DeepSeek 清洗 / Claude 复盘 / 豆包出片引擎 / Copilot 西方对照 / XIA 另类短评」五任务已废弃，替换为上表六个**逐日连续积累**的知识通道；视频「出片引擎」从每日硬任务降级为「豆包每日 1 条脚本入台账」，真实出片仍走 `protocol/video-pipeline.md` 人工/半自动链路。

---

## 2. 落盘目录体系

- 根目录：`knowledge/daily/`，与 `knowledge/memory-review/` 落盘风格一致。
- 六个子目录：`gpt/`、`doubao/`、`xia/`、`claude/`、`deepseek/`、`copilot/`。
- 命名：每通道每日一文件 `YYYY-MM-DD.md`（如 `knowledge/daily/gpt/2026-09-18.md`）。
- 每文件固定三个小节（详见 `knowledge/daily/README.md`）：
  - `## 仓库阅读记录` — 当日读了哪些仓库文件、读了什么；
  - `## 当日产出` — 当日真正写出来的内容（规划/笔记/视频脚本/小说/异同条）；
  - `## polish` — 代码打磨的 proposal 与 applied 两层记录（见第 3 章）。
- 空文件不是产出：当日没跑通/无凭证时，只在文件头标 `dry_run=true` 与 `WAITING_CREDENTIAL`，**不得伪造当日内容**。

---

## 3. 「代码打磨」诚信机制（proposal vs applied 两层）

> 红线：用户要求「每天至少一次真实代码修改，必须真实落盘计入日志，不得伪造」。本章为强制约束。

每日「代码打磨提案」分两层记录，缺一不可、严禁虚报：

### 3.1 polish_proposal（提案层，每日必须有）

写入当日 `## polish` 小节，格式：

```
- proposal #N:
  - 文件: app.html        # 或 wallet-lab.html / contracts/xxx.sol
  - 位置: 第 N 行附近 / 选择器 .foo-bar / 函数 bar()
  - 改前 → 改后:
      改前: <原始代码片段>
      改后: <期望改成的代码片段>
  - 验收标准: <可机器/人工核对的一句>
  - 状态: proposed
```

只要写出「改前→改后」就算提案完成，不要求当天就改。

### 3.2 polish_applied（真实执行层，有真实 diff 才回填）

提案被真实执行后，**必须**在同一条 proposal 下回填：

```
  - applied:
      - diff: git diff --stat 的真实输出（或 before/after 片段对照）
      - commit: <commit hash 或工作区路径>   # 本次只在工作区，标 "worktree-only"
      - 执行时间: YYYY-MM-DD HH:MM
      - 状态: applied
```

### 3.3 严禁虚报规则

1. **无真实 diff 不得标 `applied`**。没有真的改文件、没有可复核的 before/after 片段，状态只能停在 `proposed`。
2. **改了但没回填 diff**＝未闭环：当日算「提案已提、未闭环」，不算完成一次真实修改。
3. **禁止把「计划改」「建议改」「想改」写成「已改」**。proposal 用将来时/描述式，applied 用过去时且附证据。
4. 调度器在 dry-run 下只生成 proposal；只有真实上游/人工执行后才允许回填 applied。日志里 `polish_applied_count` 必须等于当日真实 diff 条数，对不上即告警。
5. 每周末由 `memory-review` 跑一次「proposed vs applied」对账：proposed 未闭环超过 7 天的提案列出清单，不自动关闭。

---

## 4. 视频脚本入台账（豆包通道）

- 豆包每日产出 1 条视频脚本（中文口播，≤60 秒，9:16），写入 `knowledge/daily/doubao/YYYY-MM-DD.md` 的 `## 当日产出`。
- 同时登记内容 ID `CONTENT-YYYYMMDD-NNN` 到 `knowledge/content-registry.md`（ID/来源/主题/脚本路径/出片状态）。
- 真实「出片」仍走 `protocol/video-pipeline.md` 的 11 步链路（Gemini/Veo → Seedance → 本地占位），不在本每日调度里硬跑；本调度只保证「每日 1 条脚本 + 台账登记」。
- 发布默认**私密**，转公开需人工授权（沿用 video-pipeline.md 第⑩步与 `knowledge/PUBLISH_LOG.md` 原则）。

---

## 5. 预算守卫与安全红线对照表

预算硬规则由代码 `checkBudget()` 强制（读 env 限额，默认豆包/DeepSeek 各 **20 RMB**）：

| 规则 | 阈值 | 代码行为 | 状态标记 |
|---|---|---|---|
| 正常 | <80% | 允许调用（无 Key 则 dry-run） | `ok` |
| 预警 | ≥80% | 继续调用但打印预算预警日志 | `warning` |
| 硬停 | ≥100% | **拒绝调用**，直接返回 | `blocked_waiting_approval` / `waiting_approval` |

与 `protocol/security-redlines.md` 的对照（不变）：

| 红线 | 本调度的落地 |
|---|---|
| 密钥不入仓库/前端/日志/聊天 | 只经 `wrangler secret put` 注入 env；日志对 Key 一律 `maskSecret()` 掩码（首尾各 3 位） |
| 密钥只进 Secret/环境变量 | wrangler.daily.toml 仅放限额，不放任何 Key |
| 不伪造成功状态 | 无 Key 时统一 `dry_run=true`，占位输出标注「等待人工凭证」 |
| 资金类不越权、留可审计记录 | 资金一律 dry-run/模拟；每笔经预算守卫并打日志 |
| 不超预算、不自行加预算 | 100% 自动停并 `waiting_approval`，不自行追加 |
| 代码打磨不虚报 | 见第 3 章 proposal/applied 两层机制 |

---

## 6. 部署 Runbook

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
   wrangler secret put GEMINI_VIDEO_KEY      --config wrangler.daily.toml   # Veo 引擎（真实出片时用）
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
     "https://ltzzz-daily-automation.<you>.workers.dev/run?task=xia"
   ```

---

## 7. 「等待人工凭证」清单

> 以下一律未配置真实值；接入前调度保持 dry-run，禁止伪造。

1. `OPENAI_API_KEY` —— GPT 当日规划 / 昨日记忆 / 怜悯之心 / 模板打磨提案。
2. `DOUBAO_API_KEY` —— 豆包装备论笔记 / 每日整理 / 视频脚本。
3. `XIA_GROK_API_KEY` —— XAI/Grok 心理作用条 / 代码打磨提案。
4. `ANTHROPIC_API_KEY` —— Claude 每日小说片段续写。
5. `DEEPSEEK_API_KEY` —— DeepSeek 中华传统文化 vs 装备论。
6. `COPILOT_TOKEN` —— Copilot 西方文化 vs 装备论。
7. `GEMINI_VIDEO_KEY`（Veo）—— 视频制作首选引擎（真实出片时用，非每日硬任务）。
8. `SEEDANCE_KEY` —— 视频制作次选引擎。
9. `LTZZZ_AGENT_TOKEN` —— 手动 `/run` 接口鉴权（非上游 Key）。
10. R2 绑定 `LTZZZ_ARTIFACTS` —— 真实落盘（未绑定时自动退化 dry-run 日志，不阻塞）。
11. 预算回写真值 —— 当前 `DOUBAO_BUDGET_SPENT` / `DEEPSEEK_BUDGET_SPENT` 为占位 0，真实累计需接 KV/R2 账本。

---

## 附：本环境硬约束执行情况

- [x] 无真实 Key：全部走 dry-run，日志 `dry_run=true`，未伪造任何 Key。
- [x] 预算硬规则代码强制：豆包/DeepSeek 各 20 RMB，80% 预警、100% 停止 → `waiting_approval`。
- [x] 密钥只进 Cloudflare Secret，不入仓库/日志/回复（日志掩码）。
- [x] 代码打磨 proposal/applied 两层诚信机制已写入第 3 章。
- [x] 仅改动工作区，未 git commit / git push。
