# LTZZZ 记忆读取指引（所有 AI 通用）

> 立此文件的原因：截至 2026-10-06，已有 4 次"AI 读不到记忆"报告，全部根因相同——把 GitHub 仓库文件当成本地挂载文件去找。本文件一次讲清，杜绝重复踩坑。
>
> owner 2026-10-05 强调：AI 形成记忆是主要事项。读不到记忆 = 无法按 LTZZZ 规则工作。

## 一、第一原则：记忆在远程仓库，不在你的沙箱

LTZZZ 记忆的唯一权威来源是 GitHub 仓库：

```
仓库：https://github.com/ltzyz2181-collab/ltzzz
分支：main
路径：ltzzz-memory/
```

它不在你的 /mnt/、不在 /tmp/、不在任何"上传目录"。你的沙箱是空的，这是正常的——你需要主动去取。

> 如果你的沙箱里没有 ltzzz-memory/，这不叫"记忆缺失"，这叫"你还没去读"。

## 二、必读六篇（owner 2026-10-05 强制前置）

| # | 路径 |
|---|---|
| 1 | ltzzz-memory/魄.md |
| 2 | ltzzz-memory/识神.md |
| 3 | ltzzz-memory/梦境数据库.md |
| 4 | ltzzz-memory/文明研究.md |
| 5 | ltzzz-memory/项目历史.md |
| 6 | ltzzz-memory/重要事件.md |

- 未读六篇不得写入/修改记忆条目。
- 产出记忆类内容必须在文首注明"依据六篇"并列出实际读取的文件路径。

## 三、三种读取方式（按你的环境选一种）

### 方式 A：有 git（首选）

```bash
git clone --depth=1 https://github.com/ltzyz2181-collab/ltzzz.git ltzzz-repo
ls ltzzz-repo/ltzzz-memory/
```

读中文文件：`cat ltzzz-repo/ltzzz-memory/魄.md`

列文件时务必关闭 quotepath，否则中文名会被转义：
```bash
git -c core.quotepath=false ls-tree -r origin/main --name-only
```

### 方式 B：无 git，用 HTTP（备选）

直接取 raw 文件（无需任何认证，仓库公开）：

```
https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/ltzzz-memory/魄.md
https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/ltzzz-memory/识神.md
https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/ltzzz-memory/梦境数据库.md
https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/ltzzz-memory/文明研究.md
https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/ltzzz-memory/项目历史.md
https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/ltzzz-memory/重要事件.md
```

### 方式 C：owner 本机

仓库在 owner 本机的 ltzzz-repo/ 目录下，直接读 ltzzz-repo/ltzzz-memory/。

## 四、开工前必做：Memory Gate 六步

1. 观 — 读当前任务、相关长期记忆、最近结果与失败记录，确认事实边界
2. 行深 — 说明这次任务如何建立在已有结果上、要验证什么
3. 理念检查 — 确认未偏离「观·行深·大道至简·改变世界·怜悯之心」
4. 避免重复 — 先查 Task Center / Result Center / Git 历史 / 凭证状态
5. 执行 — 上述完成后再改代码/调 API/部署
6. 验证 — 记录真实结果、证据、失败原因、下一步

第 4 条是防"读不到记忆"的关键：
```bash
git log --all --oneline | grep -i <关键词>
git grep -i <关键词> origin/main
```

## 五、常见错误（已实际发生过）

| 错误做法 | 为什么错 | 正确做法 |
|---|---|---|
| ls /mnt/agents/upload/ltzzz-memory/ | 那不是仓库路径，是沙箱挂载点 | 用方式 A 或 B 去取 |
| 扫描本地 /mnt/ /tmp/ 全盘找记忆 | 仓库文件不在本地 | git clone |
| "目录不存在 → 记忆缺失 → 阻塞" | 把"没去读"当"读不到" | 先按方式 A/B 取 |
| 遇阻直接报阻塞不查历史 | 违反 Memory Gate 第 4 条 | 先 git log / git grep |
| git ls-tree 中文名乱码 | 未关 quotepath | 加 -c core.quotepath=false |

## 六、"读不到"的正确上报格式

如果按方式 A/B 都真的取不到，才可报阻塞。上报须含：
1. 实际执行的命令（完整）
2. 完整报错输出
3. 已尝试的方式（A/B 各自结果）
4. 已查过的历史

不接受："我扫了本地目录，没找到记忆目录，所以阻塞。"
接受："git clone 报 <错误>；raw URL 返回 <状态码>；已查 docs/ 下无相关索引。"

## 七、记忆读完之后

- 读到的内容只读，不得擅自修改六篇正主文件。
- 产出记忆类内容按 README 要求注明依据。
- 对记忆内容有异议可以反驳讨论（README 明确允许，尤其可与 GPT 辩论）。
- 发现记忆缺口（如项目历史停在 9 月）→ 上报总控，不要自己默默补。

## 八、仓库结构速查

```
ltzzz-memory/        长期记忆（六篇必读 + 装备论 + 引擎 + manifest.json）
lab/                 MEMORY.md / DECISIONS.md / tasks.md / CAPABILITY_MAP.md
memory/daily/        每日巡检（patrol-*.md / qianwen-patrol-*.md）
ops/                 派单台账 / 密钥台账 / 事故记录
policy/              AGI-PAY / spending-rules / web3 章程
protocol/            交接执行单 / 规范
agent-wallet/        身份注册表 / 交易账本
knowledge/results/   实验产出与报告
data/results/        每日任务执行结果
docs/                指引文档
```

## 九、修订记录

| 日期 | 修订 | 原因 |
|---|---|---|
| 2026-10-06 | 初版 | Kimi 工位第 4 次"读不到记忆"，立此统一指引 |

> 本文件对所有 AI 生效，包括总控。若你的环境与本文描述不符，先更新本文档再按新文档执行——不要让下一个人再踩同一个坑。

---
*立：千问（代总控）· 2026-10-06*