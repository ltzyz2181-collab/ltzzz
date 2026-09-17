# knowledge/daily/ — 六通道每日台账

本目录是 LTZZZ 六个 AI 通道**逐日连续积累**的知识落盘区，与 `knowledge/memory-review/` 的落盘风格一致（日期命名 `YYYY-MM-DD.md`）。

## 一、目录约定

六个子目录，一一对应六通道：

| 子目录 | 通道 | 主要产出 |
|---|---|---|
| `gpt/` | GPT(OpenAI) | 当日规划+部署 1 条任务、昨日记忆、一段「怜悯之心」（朝向「知其固然如此、知其本不该如此」）、≥1 条模板打磨提案 |
| `doubao/` | 豆包 | 装备论（魄/识神/装备肉身）学习笔记、每日整理（≥1 字位置变化提案）、1 条视频脚本入台账 |
| `xia/` | XAI/Grok | 装备论对心理问题（焦虑/抑郁/双相）的作用 1 条、≥1 条 APP(`app.html`)/Web3(`wallet-lab.html`+`contracts/`) 代码打磨提案 |
| `claude/` | Claude | 每日 ≥50 字小说片段，逐日连续积累 |
| `deepseek/` | DeepSeek | 中华传统文化 vs 装备论异同 1 条 |
| `copilot/` | Microsoft Copilot | 西方文化 vs 装备论异同 1 条 |

> 术语基线：身体=三维装备；魄（含尸狗）；识神/元神；习气；网状因果。

## 强制执行约定（MUST · 六通道每日必跑）

> 与 `protocol/ltzzz-daily-automation.md` 第 1 章「MUST 强制项」、`ltzzz-daily-automation-worker.js` 的 `TASK_TABLE`（六项均 `mandatory: true`）三方对齐。

1. **每天必有一篇**：六个通道（gpt / doubao / xia / claude / deepseek / copilot）每个自然日（UTC+8）**都必须**在本目录下有一篇当日文件 `<channel>/YYYY-MM-DD.md`，是硬约束，不是可选项。
2. **无 Key 写 dry-run 占位**：没有对应 API Key、上游不可用或预算触线时，**不得跳过该通道**；当天仍要建出文件，文件头标 `dry_run=true` 与 `WAITING_CREDENTIAL`，并在「## 当日产出」写明原因（如「无（原因：等待人工凭证 xxx，本次 dry-run 占位）」）。
3. **不得留空、不得伪造**：当日文件必须真实存在且非空壳——至少保留「## 仓库阅读记录」「## 当日产出」「## polish」三个小节；禁止把当天通道删掉、禁止用空文件充数、禁止把 dry-run 占位伪造成真实产出。
4. 不补历史：只保证「当天」六篇齐备，不为过去缺漏的日子回填；历史缺漏由 `memory-review` 对账时另行标注。
5. 不变项：预算红线（豆包/DeepSeek 各 20 RMB）、凭证只进 Secret、polish 的 proposed/applied 诚信双层——均维持原约定，见文末「诚信红线」。

## 二、文件命名

- 每个通道每日一个文件：`<channel>/YYYY-MM-DD.md`，例如 `gpt/2026-09-18.md`。
- 日期用 UTC+8（Asia/Shanghai），与 cron 触发对齐。
- 不补历史：只保证「当天」六篇齐备；当天即便没跑通/无凭证，也**必须**建带 `dry_run=true`/`WAITING_CREDENTIAL` 头的当日文件并写明原因（见上节「强制执行约定」），**严禁伪造当日内容**。

## 三、每文件小节模板

每个当日文件固定三个小节，顺序如下：

```markdown
# <通道名> 每日台账 · YYYY-MM-DD

> 状态：ok / dry_run=true / WAITING_CREDENTIAL
> 生成时间：YYYY-MM-DD HH:MM（UTC+8）

## 仓库阅读记录
- 当日读了哪些仓库文件（路径 + 读了什么）。
- 例如：`knowledge/ai-chats/GPT/`、`knowledge/memory-review/YYYY-MM-DD.md`、`app.html`。

## 当日产出
- 当日真正写出来的内容（规划/笔记/视频脚本/小说片段/异同条/怜悯之心段落）。
- 没跑通就写「无（原因：…）」，不硬凑。

## polish
- 代码打磨两层记录：
  - proposal #N：文件/位置/改前→改后/验收标准/状态=proposed
  - applied：仅当真实执行后回填 diff、commit(或 worktree-only)、执行时间、状态=applied
- 详见 `protocol/ltzzz-daily-automation.md` 第 3 章「代码打磨诚信机制」。
```

## 四、与其他资产的关系

- **`knowledge/content-registry.md`**：豆包每日视频脚本在此登记内容 ID `CONTENT-YYYYMMDD-NNN`（ID/来源/主题/脚本路径/出片状态）；本目录只存脚本正文，注册表只存索引。
- **`knowledge/memory-review/`**：每日 23:30（UTC+8）由 memory-review 扫描本目录与 `knowledge/ai-chats/`，抽取长期记忆候选并做「proposed vs applied」对账；本目录是它的主要阅读源之一。
- **`knowledge/ai-chats/`**：原始聊天记录，本目录是其**加工后的当日沉淀**，不替代原始记录。
- **`protocol/ltzzz-daily-automation.md`**：六任务规范表、cron、预算守卫、诚信机制的权威定义。

## 五、诚信红线

1. 无真实 diff 不得把 polish 标为 `applied`，只能停在 `proposed`。
2. 无凭证/dry-run 时只写状态头，不伪造产出内容。
3. 小说片段必须承接前一日结尾续写，不另起炉灶。
