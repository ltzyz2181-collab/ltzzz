# 验收积压报告 · 2026-11-03（P0-2 · 只查不改）

> 派单卡 QW-DEPLOY-20261103 P0-2：查明 accepted 字段应由哪个 workflow/席位置 true；确认无人负责则上报 owner 决定承接方。
> 本报告只做只读调查，不修改任何机制代码。

## 一、结论摘要

1. **`data/results/*.json` 的 `delivery_integrity.accepted=false` 是设计行为，不是验收缺失的直接证据。**
   `scripts/delivery-integrity.mjs` 的 `assessDelivery()` 对「结构完整」的工件也**恒返回 `accepted:false`**（第 40 行）。该字段只是生成侧完整性门禁（检查【交付结束】标记、必读段、finish_reason），从不代表验收结果。

2. **真正的验收（accepted:true）在 daily-board 体系，且机制只覆盖 deepseek 一个席。**
   - `scripts/lib/daily-independent-review.mjs` 的 `inputs()` **硬编码** `worker=record.seats.deepseek`、`reviewer=record.seats.doubao`（第 9 行）——只有 DeepSeek 的日课工件被独立评审，评审块内嵌在 Doubao 当日日课调用中（不另增模型调用）。
   - review 回执落 `knowledge/results/daily-board/reviews/{date}-deepseek-{sha}.json`。
   - 状态机：`submitted_pending_review → completed_draft_review / rejected_draft_review`（`scripts/lib/daily-task-board.mjs`）。

3. **无人负责确凿：doubao / grok / qianwen 自始没有评审接收方。**
   `knowledge/results/daily-board/reviews/` 中 2026-10-27 → 2026-11-03 的评审回执**全部为 `-deepseek-` 命名**，没有任何 `-doubao- / -grok- / -qianwen-` 回执。10-20 与 11-02 的 board 中这三席状态均为 `submitted_pending_review` / `failed_no_repurchase`，`accepted` 无一条为 true。

4. **qianwen 是双线问题**：除验收积压外，11-02/11-03 因输出缺【派单监督】段被门禁拒（`missing_required_section` / `failed_no_repurchase`），属输出质量问题，应先修模板再谈验收；10-20 当天其工件结构完整但同样无评审接收方。

5. **gpt 席停用（disabled_by_owner）后，总控 relay（review_task 命令派发）承接未定**；且 `board_workflow` 指向的 `knowledge/results/daily-board/2026-11-03.json` **不存在**（目录最新为 11-02），11-03 验收链当日未跑。

## 二、证据明细

### 2.1 状态表（一手文件实读）

| 日期 | deepseek | doubao | grok | qianwen | 备注 |
|---|---|---|---|---|---|
| 2026-10-20 board | rejected_draft_review / accepted=false | submitted_pending_review / false | submitted_pending_review / false | submitted_pending_review / false | 三席无评审 |
| 2026-11-02 board | **completed_draft_review / accepted=true** | submitted_pending_review / false | submitted_pending_review / false | failed_no_repurchase / false | 仅 deepseek 闭环 |
| 2026-11-03 results | success / delivery_integrity.accepted=false | 同左 | 同左 | missing_required_section（缺【派单监督】） | board ledger 缺失 |

`data/results/2026-10-20.json` 四原生席 `delivery_integrity.status=structurally_complete` 且 `accepted=false`（生成侧恒 false）。
`knowledge/results/daily-board/2026-11-02.json`：deepseek `accepted=true, review_verified=true`；doubao/grok `submitted_pending_review`；qianwen `failed_no_repurchase`。

### 2.2 机制代码定位

| 文件:行 | 内容 | 含义 |
|---|---|---|
| `scripts/delivery-integrity.mjs:40` | `return {status:'structurally_complete',reason:'normal_stop_and_completion_marker',accepted:false}` | 门禁恒 false |
| `scripts/lib/daily-independent-review.mjs:9` | `worker=record.seats?.deepseek, reviewer=record.seats?.doubao` | 只审 deepseek |
| `scripts/lib/daily-independent-review.mjs:93` | `command({action:'review_task', agent:'doubao', ..., accepted:body.accepted, ...})` | 评审命令发出方=doubao |
| `scripts/run-ans-cycle.mjs:48` | `control({action:'review_task', agent:'doubao', accepted:record.audit.accepted, ...})` | ANS 链同模式 |
| `scripts/lib/daily-task-board.mjs:219` | `seat.status='submitted_pending_review'` | 提交后待评审 |
| `board_workflow`（11-03 results） | ledger_path=`knowledge/results/daily-board/2026-11-03.json`，文件缺失 | 当日验收链未跑 |

## 三、待 owner 决策（不代决）

1. **评审承接方**：是否扩展 `daily-independent-review` 覆盖 doubao/grok/qianwen（需选评审席与预算）；或指定 qianwen（active_deputy_coordinator）作为总控执行 review_task 派发；或维持现状（仅 deepseek 独立评审，其余席以门禁 + 抽查验收）。
2. **qianwen 缺段修复**：10-30 / 11-02 / 11-03 同源（缺【派单监督】段），是否派单修复输出模板（重跑前核对上一日 missing_sections），修复后才可进入验收。
3. **总控 relay 承接**：gpt 席停用后 control-relay 的总控职责由谁执行（现无 owner 批准）。

> 红线：本报告未修改任何代码/状态；无 receipt 一律未完成；凭据值不进本文件。


## GPT 当前复核（2026-11-04）

原观察与原生回执保留；现行处置见 `knowledge/results/dispatch/oversight/qianwen-gpt-decision-20261104.json`（原任务 `QW-FIX-TEMPLATE-20261103`）。GPT 逻辑总控在任；停用的是原厂付费日课，不据此另建 relay 或重请 owner 指派。暂不将千问扩为新验收承接方。

`generation_verified` 与格式/独立验收分层，不能把正常 stop 正文但缺段判为模型伪造机器标志。第二问实际仍缺【交付结束】，完整性回执未通过；缺少上下文不是证明历史动作不存在。首问的推理用量未记录，不能断定空正文由思考耗尽。纯文本席不能自行运行它承诺的 shell/测试命令。确切路径、哈希、模型配置与独立的编造他席结果证据均在上述复核。

缺段修复共享生成/校验的必填段与结束标记，不采用自动付费重试。观察从 2026-11-05 的既有日课预留开始，至少三日有实际格式、事实及独立内容审核证据后由 GPT 评估；当前不预先认定整改成功，也不重跑 11-04。
