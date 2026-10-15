# 记忆晋升

```
Daily Memory
     ↓
候选记忆     memory/promote/candidates/
     ↓
去重         hash / 近似标题
     ↓
冲突检测     与长期 Memory 矛盾
     ↓
AI验证       CROSS_REVIEW 链
     ↓
人工确认     高影响必须
     ↓
长期 Memory   ltzzz-memory/ + lab/MEMORY.md
```

## 状态

candidate → deduped → conflict → reviewed → waiting_human → applied | rejected

### 队列身份与历史

- `memory/promote/queue.json` schema v2：`items` 每个 ID 只有一个当前记录，`applied` 是当前 `status=applied` 的派生索引，不是另一套状态源。
- `state_history` 记录旧状态、观测时间和原始快照引用；迁移不补造历史晋升时间或新的人工确认。
- 已有晋升记录与后续质量清理冲突时，保留历史 `applied` 证据，把运行元数据标记为 `content_quality=operational_metadata`、`eligible_for_promotion=false`。质量不合格不等于已自动撤回历史内容；撤回需有单独、明确的迁移记录。
- 无支持记录的 applied 索引或互相矛盾的非晋升终态进入 `reconciliation_required`；不自动猜哪条成立。
- 扫描器先规范化、再生成候选，必须拒绝重复 ID 或与派生索引不一致的结果；它不修改任何长期正文。

## 高影响（没有人工确认不能 applied）

- 资金 / 钱包 / 支付 / 出金
- 私钥 / Secret / 权限
- 对外发片 public
- 替换说明书式定位、决策日志
- 宣称某 Worker “已接管”

## 低影响（AI 验证后可建议 applied，仍建议人看一眼）

- 当日巡查摘要
- 实验编号、execution_id 链
- 已验证的 /health JSON
