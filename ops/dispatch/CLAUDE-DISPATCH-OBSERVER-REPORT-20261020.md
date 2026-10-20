# Claude 派单：观察席 10-20 审计报告的修复分工

提出：Claude（规划与独立审计）。状态：assigned，不是已完成。本卡不含付款、Key、签名；Claude 不执行修复，只在回执出来后做独立审计。
我已对照仓库复核报告中的 4 条：**Aave、认领适配层、wep3.html 付款显示、千问 Schema 均属实或部分属实**（见"复核"）。

## 复核（Claude 读主分支，4d447ae）
- Aave `wep3/aave-39372257199-attempt-1.json`：顶层 http=422、on_chain_executed=false、tx_hash=null；但 steps 里 approve 已 confirmed（tx 0x3c19…3493，区块 52841445，receipt_status=1），supply 无交易、错误 latest_cash_or_exposure_limit。**报告属实。**
- 认领：`scripts/lib/daily-task-board.mjs` 已调用 claim_task 并回读校验。**报告属实：DeepSeek/豆包"没有认领"的判断不成立。**
- `wep3.html` 付款显示仍为 `d.paid?'是':'否'`，字符串 "false" 会显示成"是"。**属实。**
- 千问 Schema（我派的卡）：对 `test_status` 其实已有 if/then；**报告说"没有 if/then"不准确**。但属实的有：`action_taken=none → status=open` 这条只写在描述里、没有条件约束；`run_id/sha256` 类型仍允许 null，所以 `actually_run=true` 时传 null 也能通过；输出末尾带"【交付结束】"不是纯 JSON（这是我卡片要求的，责任在派单方）。

## 分工
| 编号 | 事项 | 执行席 | 独立复核 | 部署/落地 |
|---|---|---|---|---|
| P1-02 | Aave：先只读对账，再改状态语义 | GPT 总控（有授权的执行席） | Claude 读回执；另请 xAI 复读代码 | 既有 wep3 部署工作流 |
| P1-01 | ANS 审核必须覆盖完整调用链 | xAI（改审核提示与检查清单） | 千问（原生）复读 | 既有 ANS/daily 工作流 |
| P1-03 | PR 门禁：何时必须原生 Claude 事前审 | GPT 写规则，老板确认 | Claude | 写入 config/claude-team.json |
| P2-a | wep3.html 付款显示一行修复 | xAI | 豆包 | Pages/既有前端部署 |
| P2-b | 千问 Schema 重做 | 千问（再派一张卡） | 豆包 | 仅入库，不部署 |
| P2-c | Kimi 状态拆成两字段 | 千问提议已被否，改由豆包实现 | xAI | 既有 provider-readiness |
| P2-d/e/f | 豆包指定审核文件落盘；observed_at 语义；DeepSeek 已拒仍显示 pending_review | 豆包 | 千问 | daily-board 写入逻辑 |
| P2-g | 三条记忆候选 | 豆包起草 | Claude 审 | 记忆门禁，不自动晋升 |
| 另 | TREASURY_001 验收器 passed:false 与字段全符合矛盾 | xAI | Claude | 查 10-20 原始日志 |

## 各项要求
**P1-02（碰钱，最先做）**
1. 只读：核对 approve 交易（0x3c19…3493）、当前 allowance、持久化 intent、最终余额。**未对账前禁止任何自动重试或重新 approve/supply。**
2. 改状态语义：只要任一步骤已确认上链，顶层不得再写 on_chain_executed=false；新增 `steps_confirmed`、`partial_on_chain=true`、`reconciliation_required=true`。
3. 回执要分开写：approve 是否成功、supply 是否成功、失败原因。
4. 我的独立审计只读回执与代码，不读链；若需链上复核请另派有节点访问的席位。

**P1-01**：ANS 审核提示必须附：被审结论涉及的**全部调用链文件路径**（含 `scripts/lib/daily-task-board.mjs`）；审核结论里必须列出"我读了哪些文件"。两家一致 ≠ 已验证。

**P1-03（建议，待老板确认）**：改动**涉及资金路径文件**（wep3-*.js、aave、treasury、签名相关）的 PR，合并前须有原生 Claude 事前审阅或老板书面豁免写入回执；非资金路径，任一不同供应方的事前独立审阅即可。Claude 无算力时由老板豁免，不得用事后补读倒填。

**P2-a**：`d.paid === true ? '是' : '否'`，标签改为"回执付款标记（未独立链上核验）"。只改展示。

**P2-b（Schema 重做卡要求）**：纯 JSON，无结束标记；`action_taken=none` → `follow_up_receipt=null` 且 `status=open` 用 allOf+if/then 强制；`actually_run=true` → `run_id`、`sha256` 必须是非空字符串（type 不含 null）；附 6 个正反例并实际用校验库跑过再交付。

**P2-c**：目录可用性（catalogue）与最近生成验收（generation）分字段存，各带日期，不互相覆盖。

## 不要做
- 不要因"两家模型一致"把工程结论标为已验证。
- 不要用事后补读冒充事前审核。
- 不要新增付款、不要重试未对账的链上动作。
- GPT 无算力期间，P1-02 的**对账**可由已授权的 Actions 只读工作流完成；写入链上的动作一律等 GPT/老板。
