# Memory → Daily Result → 前端 接入方案

> 生成时间：2026-09-22
> 目标：把"记忆 → 每日结果 → 前端展示"链路从文档级变成可自动运行的最小闭环。
> 边界：不动密钥、资金、支付、生产权限。

---

## 1. 现有链路全景

```
┌─────────────────────────────────────────────────────────┐
│ 记忆层 (Git 仓库静态文件)                                 │
│  ltzzz-memory/  魄.md 识神.md 装备论.md 重要事件.md ...   │
│  lab/           MEMORY.md DECISIONS.md tasks.md         │
│  memory/daily/  每日记忆片段 (grok/patrol/summary)       │
└──────────────┬──────────────────────────┬───────────────┘
               │                          │
               ▼                          ▼
┌──────────────────────┐     ┌──────────────────────┐
│ Memory Gateway       │     │ Memory Engine         │
│ (线上 Worker)         │     │ (线上 Worker)          │
│ /manifest            │     │ 生成 STATE-*.md       │
│ /file?path=...       │     │ 记录 files_read       │
│ source=github        │     │ snapshot_hash         │
│ r2_bound=false      │     │ mode=real-read        │
└──────────┬───────────┘     └──────────┬───────────┘
           │                             │
           └──────────┬──────────────────┘
                      ▼
┌─────────────────────────────────────────┐
│ results/daily/YYYY-MM-DD.md             │
│ (手写/AI代写日报)                         │
│  ## 总览表 (AI|状态|产出|错误)           │
│  ## 发布状态表 (平台|状态|说明)           │
│  ## 下一步                               │
└──────────┬──────────────────────────────┘
           │ node scripts/build-daily-data.js
           ▼
┌─────────────────────────────────────────┐
│ daily-data.json (静态生成)              │
│ {date, summary, ais[], publish[],     │
│  next_steps[], honesty{...}}           │
└──────────┬──────────────────────────────┘
           │ fetch
           ▼
┌─────────────────────────────────────────┐
│ daily.html (前端)                        │
│  今日运行 / 昨日运行 / 六模块 / 发布状态  │
└─────────────────────────────────────────┘
```

---

## 2. 各层现状与标记

### 2.1 记忆层（已验证）

| 文件 | 路径 | 状态 |
|---|---|---|
| 魄.md | `ltzzz-memory/魄.md` | ✅ 已入库 |
| 识神.md | `ltzzz-memory/识神.md` | ✅ 已入库 |
| 梦境数据库.md | `ltzzz-memory/梦境数据库.md` | ✅ 已入库 |
| 文明研究.md | `ltzzz-memory/文明研究.md` | ✅ 已入库 |
| 项目历史.md | `ltzzz-memory/项目历史.md` | ✅ 已入库 |
| 重要事件.md | `ltzzz-memory/重要事件.md` | ✅ 已入库 |
| 装备论.md | `ltzzz-memory/装备论.md` | ✅ 已入库 |
| Memory 主文件 | `lab/MEMORY.md` | ✅ 已入库 |
| 任务清单 | `lab/tasks.md` | ✅ 已入库 |
| manifest.json | `ltzzz-memory/manifest.json` | ✅ 已生成（含 read_order、file_meta） |

**Memory Engine 是否每天自动读？**
- Gateway `/manifest` 线上可访问，`source=github`，`r2_bound=false`
- `memory/state/CURRENT.json` 显示 `mode=real-read`，已读 11 个文件
- **但这是手动/单次触发，不是每天自动 cron 跑**
- Daily Worker 有 cron（`0 * * * *` 每小时），但它读 Gateway 后只写 `knowledge/daily/`，不自动写 `results/daily/`

### 2.2 结果层（dry-run）

| 文件 | 状态 | 说明 |
|---|---|---|
| `results/daily/2026-09-19.md` | ✅ 已有 | 第一篇日报 |
| `results/daily/2026-09-20.md` | ✅ 已有 | 第二篇，含完整表格 |
| `results/daily/2026-09-21.md` | ❌ 缺失 | 今天/昨天的日报未生成 |
| `results/executions/` | ✅ 已有 | 任务执行记录 |
| `daily-data.json` | ✅ 已生成 | 但数据停在 09-20，需重跑脚本 |

### 2.3 前端层（已验证）

| 页面 | 文件 | 状态 |
|---|---|---|
| Daily 主页 | `daily.html` | ✅ 已上线，fetch `daily-data.json` |
| Daily Patrol | `daily-patrol.html` | ✅ 已上线 |
| data-flow 文档 | `docs/data-flow.html` | ✅ 已有 |

---

## 3. 缺失字段与接口

### 3.1 数据结构缺失

| 缺失项 | 当前 | 需要 | 影响 |
|---|---|---|---|
| 今日 results/daily/ | 只到 09-20 | 每天一篇 md | 前端显示旧数据 |
| daily-data.json 自动更新 | 手动跑脚本 | 每次 push 后自动跑 | 数据不新鲜 |
| 历史日期选择 | 只显示最新一天 | 支持选日期看历史 | 无法回溯 |
| Memory 快照链接 | 无 | 前端显示今日 STATE-id | 看不到记忆读取证据 |
| AI 真实调用标记 | `honesty.ai_calls_realized=false` | 每个 AI 单独标记 | 防止假装已调用 |
| 发布状态历史 | 无 | 每天记录发布成功/失败 | 无法追踪发布趋势 |

### 3.2 接口缺失

| 接口 | 现状 | 需要 |
|---|---|---|
| Memory Gateway `/manifest` | ✅ 线上可用 | 前端 fetch 显示记忆文件数 |
| Memory Gateway `/file?path=` | ✅ 线上可用 | 前端可展开看记忆内容 |
| Daily Worker `/run?task=` | ✅ 代码就绪 | 手动触发生成当日日报 |
| Daily Worker cron | ✅ 已配置 | 每小时触发，但 dry_run |
| results/daily/ 自动生成 | ❌ 无 | 由 Worker 或 GitHub Action 写 |
| daily-data.json 自动生成 | ❌ 手动 | push 后自动跑 build 脚本 |

---

## 4. 最小数据结构（可直接落地）

### 4.1 每日 results/daily/YYYY-MM-DD.md 模板

```markdown
# LTZZZ Daily Report — YYYY-MM-DD

## 📊 总览
| AI | 状态 | 今日产出 | 错误 |
|---|---|---|---|
| GPT 总控 | 🟢/🟡/🔴/⚪ | ... | ... |
| 豆包 | ... | ... | ... |
| ... | ... | ... | ... |

## ✅ 今日实际完成
1. ...
2. ...

## 🟡 发布状态
| 平台 | 状态 | 说明 |
|---|---|---|
| Telegram | 🟢/🟡/🔴/⚪ | ... |

## 📋 下一步
1. ...
```

### 4.2 daily-data.json 扩展字段

```json
{
  "date": "2026-09-22",
  "generated_at": "ISO时间",
  "source": "results/daily/2026-09-22.md",
  "schema_version": "1.1",
  "honesty": {
    "ai_calls_realized": false,
    "note": "..."
  },
  "memory": {
    "state_id": "STATE-20260922-xxxx",
    "files_read": 11,
    "gateway_url": "https://ltzzz-memory-gateway.ltzyz2181.workers.dev/manifest"
  },
  "summary": { "ais_total": 7, "ais_ok": 3, ... },
  "ais": [...],
  "publish": [...],
  "next_steps": [...]
}
```

### 4.3 前端 daily.html 需要加的

- [ ] 日期选择器（下拉选历史日期）
- [ ] Memory 快照信息（state_id、文件数）
- [ ] 每个 AI 卡片显示"真实调用"或"dry-run"标记
- [ ] 发布状态时间线

---

## 5. 落地分级

### 🟢 可以直接落地（不需要 R2/API）

| 动作 | 怎么做 | 验收 |
|---|---|---|
| 补今天的日报 | 手写 `results/daily/2026-09-22.md` | 文件存在且含表格 |
| 重跑 build 脚本 | `node scripts/build-daily-data.js` | daily-data.json 日期更新为 09-22 |
| push 到 GitHub | git add/commit/push | ltzzz.com/daily.html 显示新日期 |
| 前端加 Memory 快照 | daily.html fetch Gateway /manifest | 显示记忆文件数 |
| GitHub Action 自动 build | 在 .github/workflows 加一步跑脚本 | push 后 daily-data.json 自动更新 |

### 🟡 需要 R2 桶（ltzzz-memory）

| 动作 | 阻塞原因 | 解锁后 |
|---|---|---|
| Memory Engine 持久化 | R2 未创建 | STATE 快照存 R2，不依赖 GitHub |
| Daily Worker 写结果到 R2 | R2 未创建 | 六 AI 产出直接落盘 |
| Gateway r2_bound=true | R2 未创建 | 不依赖 GitHub Pages 读取延迟 |

### 🔴 需要外部 API/人工凭证

| 动作 | 缺什么 | 当前 |
|---|---|---|
| GPT 真实调用 | OPENAI_API_KEY 已配 Secret | Worker 里 dry_run |
| 豆包真实调用 | ARK_API_KEY 已配 Secret | Worker 里 dry_run |
| Grok 真实调用 | XAI_API_KEY 已配 Secret | Worker 里 dry_run |
| Claude 真实调用 | ANTHROPIC_API_KEY 已配 Secret | Worker 里 dry_run |
| DeepSeek 真实调用 | DEEPSEEK_API_KEY 已配 Secret | Worker 里 dry_run |
| Microsoft 真实调用 | MICROSOFT_API_KEY 未配 | 等人工 |
| TikTok 发布 | OAuth 审核中 | 等审核通过 |

---

## 6. 可验证验收清单

### 今天就能做（🟢）

- [ ] `results/daily/2026-09-22.md` 已创建，含总览表和发布状态表
- [ ] `node scripts/build-daily-data.js` 跑通，输出 OK
- [ ] `daily-data.json` 的 date 字段 = 2026-09-22
- [ ] push 后 `https://ltzzz.com/daily.html` 显示 09-22 的数据
- [ ] daily.html 页面能看到 Memory 快照信息（state_id、文件数）

### 下一步（🟡 需要 R2）

- [ ] R2 桶 `ltzzz-memory` 已创建
- [ ] Memory Gateway `/health` 返回 `r2_bound: true`
- [ ] Daily Worker 不再 dry_run，真实写结果到 R2
- [ ] 六 AI 中至少 1 个真实调用成功（有返回内容）

### 以后（🔴 需要凭证/审核）

- [ ] 六 AI 全部真实调用
- [ ] TikTok 审核通过，OAuth 授权成功
- [ ] YouTube/TikTok 自动发布跑通
- [ ] 发布状态有真实成功记录

---

## 7. 当前真实状态（不造假）

- Memory Gateway：🟢 线上可用（source=github, r2_bound=false）
- Memory Engine：🟡 代码就绪，手动触发过，未自动 cron
- Daily Worker：🟡 代码就绪，dry_run，cron 已配
- 六 AI 真实调用：🔴 全部 dry_run 或 blocked
- 今日日报（09-22）：❌ 还没写
- 前端 daily.html：🟢 已上线，数据停在 09-20
- R2：🔴 未创建
