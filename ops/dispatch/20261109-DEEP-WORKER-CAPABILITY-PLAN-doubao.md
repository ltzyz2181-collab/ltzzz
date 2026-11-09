# Deep Super-agent 多 worker 能力方案（豆包席评估稿，2026-11-09）

**结论：千问提案的方向可用，但两条事实是错的，一条授权判断是反的。真正该做的不是"打 ANS 补丁"，而是给 Deep 一套可执行的每日任务包机制，第一包从"对账"起步。**

---

## 一、先把事实查清（均为本机实查，非转述）

| 千问的说法 | 实查结果 | 判定 |
|---|---|---|
| 多 worker 需扩权，把 "EXACTLY ONE worker" 扩为 2-3 个 | `config/deep-superagent.json` 的 `A_deep_autonomous_execution` 原文已写**"自主从豆包/千问/Kimi/Grok 四席中选择 1-3 席执行"**（owner 2026-11-08 授权） | **不需要新授权，已授权** |
| 卡点 1：故障注入测试没查到 | `knowledge/results/ans-cycle/2026-11-07-p1-01-fault-injection.json` **存在且完整**：4 个用例（baseline / A 瞬时失败 / B 真实冲突 / C 降级恢复），before_fix 与 after_fix 前后对照，`executed_by: doubao`，`ans_run_id 42098078672`。结论 `A_transient_no_longer_degrades=true`、`conflict_still_degrades=true`、`reasons_now_distinguishable=true`、`no_new_submission_in_any_case=true` | **千问错了。测试已做，且是豆包席做的，回执在库** |
| `run-ans-cycle.mjs` 已引入 `ans-review-recovery.mjs`，但没查到故障注入 | `scripts/lib/ans-review-recovery.mjs` **确实存在**，`run-ans-cycle.mjs:9` 有引用 | 千问半对（引入是真的），但"没查到故障注入"是错的 |
| 卡点 2：PatchGate `automatic_deploy=false` | `config/patch-policy.json`、`patchgate-a2.json`、`patchgate-cloud-publisher.json`、`pi-cloud.json` **四处均为 false** | **对。部署门对所有 AI 关着，属 B 层 GPT 权限** |
| 千问称 Deep 现有 19 个包全是单次授权件 | 与 A 层"自主接取与拆解内部 DEEP-/DSA- 任务"直接冲突 | **口径反了：A 层已授权自主接取，19 个单次件是历史事实，不是权限上限** |
| `ops/triage/ISSUES-TRIAGE-20261109-qianwen.md` | 本机与 origin/main 均不存在 | 未创建（此前已记） |

**⇒ P1-01 的真实状态：代码已修 + 故障注入已过（4 用例前后对照）+ 独立评审已过 = 只剩部署这一关。**
千问把"已经关上的那一关"当成未做，据此立"ANS-REPAIR-TRACK 修复包"的项，立项理由不成立。

---

## 二、千问三条建议的逐条处置

### 建议 1：以 ANS-REPAIR-TRACK 为首个多 worker 试点
**处置：修改后采纳（换标的）**

- 驳回其立项理由：修复与故障注入都已完成，不需要"再修一轮"
- 但"多 worker 任务包"这个**形式**可用
- 换成真正有缺口的那件事：**P1-01 部署门申请包**——Deep 规划、豆包出运行时证据、Grok 独立复核、结论呈 GPT 决定是否开部署门
- 理由：这是唯一还开着的口子，且正好落在 B 层边界上，适合演练"多 worker 出证据 → 决策席拍板"这条链

### 建议 2：给 Deep 设每日任务包，五类轮换
**处置：修改后采纳（砍到两档，先跑稳）**

- 原案五档（对账/审计/修复/评审/复盘）一次上齐，风险是**调用量不可控 + 质量无法收敛**
- 改为**两档起步**：
  - **对账日**：千问做三层字段一致性对账（`ANSI`/board/results），**零付费调用**；Grok 独立复核千问的对账表；Deep 汇总
  - **审计日**：Deep 分诊 open 单 + 千问 stale 核查；Grok 复核
- 修复日/评审日/复盘日**先不设**，等两档跑满两周、回执质量稳定再加
- 每包四要素照千问原文保留：**固定席位名单、调用上限、no retries、禁资金动作**——这四条是对的

### 建议 3：派单权来自包内授权，不是全局默认
**处置：采纳为原则，但纠正一处**

- 原则对：Deep 不得自选扩权、不得绕过部署门与资金门
- 纠错：A 层已经给了"自主从四席选 1-3 席"，所以**选席位不需要包文单独圈定**；包文要圈的是**任务范围、调用上限、禁区**，不是席位名单
- 这两者必须分清，否则 Deep 会继续卡在"等授权"

---

## 三、我建议的实际方案

### 3.1 第一包（建议立即立项）：`DEEP-DAILY-20261110-RECONCILE`

| 角色 | 席位 | 干什么 | 成本 |
|---|---|---|---|
| 规划 + 全程 hash 复核 | DeepSeek（coordinator） | 拆题、派单、核每个 worker 产出的 sha256、汇总 | 已有额度 |
| worker（字段对账） | 千问 | ANS 回执/board/results 三层字段一致性，出对账表 | **零付费调用** |
| worker（独立复核） | Grok | 独立审千问的对账表，标出漏项与错判 | 1 次调用 |
| 决策 | GPT | disposition | 0（仅裁决） |

**关键设计：不让千问自证。** 千问出对账表，但**必须由 Grok 独立复核**才有效——这正好对上 owner"千问不靠谱、说他还不承认"的顾虑：它干活，但不给它最终解释权。

### 3.2 第二包：`DEEP-DAILY-20261111-AUDIT`
Deep 分诊 open 单（当前 72 条积压口径）+ 千问 stale 核查 + Grok 复核。

### 3.3 配套的硬边界（写进包文）
- 调用上限：每包 **≤ 6 次真实调用**（3 席 × 至多 2 轮）
- `no retries`：失败即记录，不重试
- 禁资金动作：不碰钱包、不发交易（`financial_execution=false` 已有）
- 部署门：任何"上线"结论只能"呈 GPT 申请"，Deep 不得自行 claiming 已部署
- 回执：每 worker 产出必须带 `sha256`，Deep 复核后写入 `knowledge/results/deep-superagent/`
- 千问产出**一律需独立复核**，不得以其自报为最终结论

---

## 四、需要 owner 拍板的只有三件事

| # | 决策项 | 我的建议 | 不批的后果 |
|---|---|---|---|
| 1 | 是否同意每日任务包**两档起步**（先对账日、审计日） | 同意 | 五档一次上齐，调用不可控 |
| 2 | 第一包是否按 `<DEEP-DAILY-20261110-RECONCILE>` 立项 | 同意 | 继续停在"等授权" |
| 3 | P1-01 部署门是否**由你或 GPT 决定开启**（Deep 只出证据不拍板） | 由 GPT 决定，Deep 出证据 | 草稿永远停在 `deployed: false` |

**其余（多 worker、千问当 worker、豆包跑测试）都不需要你批——A 层已授权，我按包执行即可。**

---

## 五、部署路径（你点头后我做什么）

1. 写 `ops/deep-superagent/tasks/DEEP-DAILY-20261110-RECONCILE.json`（含四要素与硬边界）
2. 更新 `.mt/fwd.md` 与派单台账，登记第 20 号包
3. 触发 Deep 执行该包（走既有 `run-ans-cycle` / coordinator 通道）
4. 产出后我用 `reviewApproval` 同款校验器复核每份回执的 `sha256` 与 provider 证据
5. 结果呈 GPT disposition，我不自行宣称"已部署"

---

## 六、边界声明

- 本稿**只评估与提议，未做任何部署、未触发任何 calls、未改任何 config**
- 千问原文一字未改，其错误按实查结果标注，不构成对其人的评价
- 未使用任何付费额度

评估：**doubao-seat**，2026-11-09。
