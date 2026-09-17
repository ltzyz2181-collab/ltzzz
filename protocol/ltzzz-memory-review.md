# LTZZZ 每日长期记忆审查协议（ltzzz-memory-review）

> 版本：v0.1（dry-run 占位版）
> 维护：LTZZZ 多 Agent 协同体系
> 关联文件：`ltzzz-daily-memory-review-worker.js`（实现）、`knowledge/AI-ARCHIVE-INDEX.md`（分类体系）、`protocol/AGI-CO-MANAGEMENT.md`、`protocol/agent-roles.md`

---

## 一、目的与边界

1. 每天结束时（UTC+8 23:30），自动收集「当天各方关于 LTZZZ AI 长期记忆功能说了什么」。
2. 把分散在 GPT / DeepSeek / Doubao / Microsoft / XIA 聊天记录里的记忆相关言论，抽成当日清单并归类。
3. 产出对长期记忆功能的优化建议（Top5 + 待办），落盘为 Markdown 日报，供后续迭代用。
4. 边界：
   - 只收集与「长期记忆」直接相关的片段，不做全量聊天转写；
   - 不改写、不删除原始聊天记录（遵守 `knowledge/ai-chats/README.md` 原始记录原则）；
   - 不接触任何凭证；密钥类内容按脱敏红线永不入库；
   - 当前为 dry-run：无真实 LLM Key，分析靠本地规则 + 模板，LLM 复盘接口预留待接。

---

## 二、流程设计图（收集 → 提取 → 归类 → 产出 → 落盘）

```
┌─────────────────────────────────────────────────────────────────────┐
│ scheduled()  每日 cron：UTC+8 23:30  =  UTC 15:30  (30 15 * * *)   │
│        （手动触发：GET/POST /review?date=YYYY-MM-DD）                │
└──────────────────────────────┬──────────────────────────────────────┘
                               ▼
┌─────────────── 1. 收集 collectTodayFiles ───────────────┐
│  knowledge/ai-chats/<AI>/**.md   （GPT/Doubao/...）      │
│  knowledge/daily-plan/*.md       （当天规划稿，可缺省）   │
│  入选规则（满足其一）：                                  │
│   a) 文件名含当天日期（2026-09-17 或 20260917）          │
│   b) 文件 mtime 落在当天（UTC+8）                        │
│  跳过：index.md / README.md / 点文件 / 非 .md            │
└──────────────────────────────┬───────────────────────────┘
                               ▼
┌─────────────── 2. 提取 extractSnippets ─────────────────┐
│  关键词：记忆 / 长期 / 沉淀 / 知识库 / 上下文 / 人格 /    │
│          装备 / 元神 / 识神 / 魄 / 习气                  │
│  逐行扫描 → 命中行保留（≤140 字，每文件 ≤6 条）          │
└──────────────────────────────┬───────────────────────────┘
                               ▼
┌─────────────── 3. 归类 classifyOne ─────────────────────┐
│  按信号词打分，三选一 + 未归类：                          │
│   3.1 user-need        用户已表达的记忆需求              │
│                        （希望你记住/沉淀/存下来…）        │
│   3.2 ai-defect        AI 记忆缺陷                       │
│                        （忘了/重复/跨会话丢失/混淆…）     │
│   3.3 optimize-point   可落地优化点                      │
│                        （索引/标签/结构化/检索/回执…）    │
│   3.4 unclassified     命中关键词但倾向待判定            │
└──────────────────────────────┬───────────────────────────┘
                               ▼
┌─────────────── 4. 产出 buildMarkdown + LLM 占位 ────────┐
│  analyzeByLLM()：无 LLM_API_KEY → WAITING_CREDENTIAL    │
│  模板总结 → 优化建议 Top5 + 待办                         │
│  对照 AI-ARCHIVE-INDEX.md 分类体系挂类目（见第四节）      │
└──────────────────────────────┬───────────────────────────┘
                               ▼
┌─────────────── 5. 落盘 ─────────────────────────────────┐
│  knowledge/memory-review/YYYY-MM-DD.md                  │
│  （字段：收集概况 / 讨论清单表 / 三类归类 / Top5 / 待办） │
│  部署后：另写一份到 R2 绑定 MEMORY_REVIEW_BUCKET         │
└──────────────────────────────────────────────────────────┘
```

---

## 三、当日「记忆功能讨论清单」字段约定

每条清单记录包含：

1. **来源文件**：相对路径（如 `knowledge/ai-chats/GPT/inbox-2026-09-17.md`）。
2. **AI**：来源渠道（GPT / Doubao / DeepSeek / Microsoft / XIA / plan）。
3. **命中关键词**：本条命中的 MEMORY_KEYWORDS。
4. **原文片段**：≤140 字，保留原话，不改写。
5. **归类/摘要**：归入 3.1~3.3 哪一类 + 一句话摘要。

---

## 四、长期记忆功能现状与优化方向（对照 AI-ARCHIVE-INDEX.md 分类体系）

### 4.1 现状（dry-run 视角）

1. 原始聊天已入库：`knowledge/ai-chats/`（Doubao 15 篇、GPT 4+inbox、DeepSeek 6 篇、Microsoft 1 篇、XIA 索引摘要），有统一索引 `AI-ARCHIVE-INDEX.md`。
2. 分类体系已定义：A 观·行深·识神·元神 / B 梦·魄·醒梦 / C 身体装备·睡眠 / D 时代·技术·人与装备 / E AI·AGI·多Agent / F~J 其余。
3. 缺口：记忆类讨论目前**只在聊天记录里，没有每日沉淀机制**——跨天、跨 AI 的记忆靠人肉翻索引，容易出现：
   - 跨会话丢失（新会话忘记昨天结论）；
   - 概念混淆（同一术语在不同 AI 处表述漂移）；
   - 重复提问（用户反复讲同一件事）。
4. 本协议就是补这个缺口的「每日记忆审查」闭环。

### 4.2 优化方向（与归档类目对齐）

| 优化方向 | 对应归档类目 | 落法 |
|---|---|---|
| 修行术语记忆区（元神/识神/魄/习气/装备） | A、B、C | 每日讨论清单自动挂到对应类目，Content ID 规则 `LTZZZ-YYYYMMDD-MEM001` |
| AI 协作记忆区（哪个 AI 说过什么、谁负责什么） | E | 跨 AI 差异表 + 角色边界（对照 agent-roles.md） |
| 技术/工程记忆区（worker、部署、凭证边界） | G | 只记结论与红线，不记临时报错 |
| 缺陷台账 | 跨类目 | ai-defect 类片段单独登记，按周统计复发率 |

### 4.3 记忆写入分级（强制）

1. 用户偏好/长期结论 → 长期记忆区（归档索引 + 日报）。
2. 单次任务结论 → 当日 `memory-review/YYYY-MM-DD.md`。
3. 凭证/密钥/Token → **永不进仓库**，只进 Secrets（沿用 ai-chats/README.md 脱敏红线）。

---

## 五、实现说明

### 5.1 Worker 文件

- 文件：`ltzzz-daily-memory-review-worker.js`（仓库根目录）。
- 分析内核是纯函数：收集 → 提取 → 归类 → 模板总结 → 渲染 Markdown，与运行时解耦。
- 数据源通过 `fileProvider` 接口注入（`listFiles` / `readFile`）：
  - 本地 dry-run：用 `node:fs` 递归扫仓库；
  - Cloudflare 运行时：无文件系统，当前返回空数据 + 占位说明，待 R2/KV 接入。

### 5.2 端点

| 端点 | 方法 | 作用 |
|---|---|---|
| `/status` | GET | 健康检查：返回 worker 名、cron、落盘目录、LLM 状态 |
| `/review` | GET/POST | 手动触发；支持 `?date=YYYY-MM-DD`；可选 `REVIEW_TOKEN` Bearer 鉴权 |
| `scheduled()` | cron | 每日自动跑（UTC 15:30） |

### 5.3 落盘目录约定

1. 结果文件：`knowledge/memory-review/YYYY-MM-DD.md`（代码内常量 `OUTPUT_DIR`，文件名由 `outputPathFor(date)` 生成）。
2. 候选来源：`knowledge/ai-chats/`、`knowledge/daily-plan/`。
3. 缺陷台账（后续扩展）：`knowledge/memory-review/defect-log.md`。

### 5.4 本地 dry-run（当前主推运行方式）

```bash
cd /home/user/ltzzz
node ltzzz-daily-memory-review-worker.js            # 审查今天（UTC+8）
node ltzzz-daily-memory-review-worker.js 2026-09-16 # 审查指定日期
```

跑完会在 `knowledge/memory-review/` 下生成当日日报。

### 5.5 wrangler.toml 风格片段（文档化，暂不部署）

```toml
# wrangler.memory-review.toml  —— 每日长期记忆审查 Worker
name = "ltzzz-daily-memory-review"
main = "ltzzz-daily-memory-review-worker.js"
compatibility_date = "2026-09-17"

# cron：每日 UTC+8 23:30 = UTC 15:30
[triggers]
crons = ["30 15 * * *"]

[vars]
# 可选：/review 手动触发的 Bearer 令牌
# REVIEW_TOKEN = "待人工配置"
# 可选：LLM 复盘凭证（当前 dry-run，不配）
# LLM_API_KEY = "待人工配置"
# LLM_BASE_URL = "https://api.openai.com/v1/chat/completions"
# LLM_MODEL = "gpt-4o-mini"

# 部署后用于落盘的 R2 桶（当前仅文档化）
# [[r2_buckets]]
# binding = "MEMORY_REVIEW_BUCKET"
# bucket_name = "ltzzz-memory-review"
```

---

## 六、部署 Runbook（等待人工确认后执行）

1. 确认仓库无误提交：本协议与 worker 文件先留在工作区，不自动 git push。
2. 在 Cloudflare 建 R2 桶 `ltzzz-memory-review`，拿到 binding `MEMORY_REVIEW_BUCKET`。
3. 准备 knowledge/ 数据快照管道（二选一）：
   - GitHub Action 每日把 `knowledge/` 打包上传 R2；或
   - 部署后由 `/review` 触发时，从 R2 读取当日快照。
4. `wrangler deploy -c wrangler.memory-review.toml`。
5. 手动验证：
   - `curl https://<worker>/status` 返回 ok；
   - `curl https://<worker>/review` 跑一次当日审查；
   - Cloudflare Dashboard → Workers → Triggers 确认 cron `30 15 * * *` 已注册。
6. 观察首周：确认每日 23:30（UTC+8）都有新文件落到 R2。

---

## 七、「等待人工凭证 / 人工确认」清单

以下项目当前为空跑占位，**需人工补齐后才能从 dry-run 切到真实运行**：

1. [ ] `LLM_API_KEY`：真实 LLM 复盘凭证（当前 `analyzeByLLM()` 一律返回 `WAITING_CREDENTIAL`）。
2. [ ] `LLM_BASE_URL` / `LLM_MODEL`：复盘用模型 endpoint 与模型名。
3. [ ] `REVIEW_TOKEN`：手动 `/review` 端点的 Bearer 令牌。
4. [ ] R2 桶 `ltzzz-memory-review` 及绑定 `MEMORY_REVIEW_BUCKET`：Cloudflare 运行时无本地文件系统，落盘必须走 R2。
5. [ ] knowledge/ → R2 每日快照管道（GitHub Action 或等价方案）。
6. [ ] 首次真实部署确认（wrangler.toml 片段已文档化，未 deploy）。
7. [ ] 人工确认 `knowledge/memory-review/` 已纳入 git 跟踪（不被 .gitignore 忽略）。

---

## 八、验收口径

1. `node --check ltzzz-daily-memory-review-worker.js` 通过。
2. 本地 dry-run 能扫到当天文件、生成 `knowledge/memory-review/YYYY-MM-DD.md`。
3. 报告含：当日讨论清单、三类归类、优化建议 Top5、待办、落盘路径。
4. 无凭证时 LLM 状态必须显示 `WAITING_CREDENTIAL`，不得假装已调 LLM。
