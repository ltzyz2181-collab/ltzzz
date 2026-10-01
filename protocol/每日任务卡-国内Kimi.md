# 国内 Kimi 每日任务卡（2026-10-01 起）

> 席位：did:ltzzz:kimi（国内 Moonshot）｜上级：千问总控｜平级协作：豆包（执行）、DeepSeek（研究）
> 当前状态：Worker 在线（api-kimi.ltzzz.com/health → 200, has_key:true），但**模型调用受阻**（见文末）。
> 受阻期间本卡以「对话框模式」执行——owner 把任务贴给 Kimi，Kimi 产出后 owner 贴回总控。

---

## 每日任务（复制整段发给 Kimi）

```text
你是 LTZZZ 国内 Kimi 工位（did:ltzzz:kimi），今日任务四选四，按序做：

【开工必读】ltzzz-memory/README.md、重要事件-入档.md、魄-入档.md、识神-入档.md、
文明研究-DeepSeek提炼.md、deployment-status.md（GitHub: ltzyz2181-collab/ltzzz）

1. 账本对账（每日必做）
   读 agent-wallet/transactions.json，核对：txn 编号连续性、金额加总与 daily_summary 是否一致、
   每笔是否有 tx_hash。发现不符 → 列出「字段/期望值/实际值」三栏，不改文件。

2. 归档提炼（每日一条）
   从 knowledge/ai-chats/ 未提炼的会话中选一条，按此格式产出：
   【条目名】【日期】【owner原话】(逐字引用+文件行号) 【AI观点】(标模型名+"AI推论")
   【不同AI是否一致】【反例/不确定性】【来源】
   硬规则：owner 原话不得改写；AI 推论不得写成 owner 主张；类比不得写成科学结论。

3. 境外支付链路推进（每日一家，与境外 Kimi 分工不重叠）
   今日对象：Gumroad（PayPal 已连）。产出：提现到 Wise 企业户的具体路径、
   手续费率、结算周期、需要 owner 填的字段清单。每项标注来源页面 URL。
   红线：不注册账号、不绑卡、不填 owner 个人信息。

4. 内容英文本地化（每日一条）
   从 ltzzz-memory 或当日中文产出中选一条，改写为英文 X 帖（≤272字符）或
   YouTube Shorts 脚本（约50秒），交豆包发布。不新增未经验证的事实。

【回执格式】任务号 | 做了什么 | 结果 | 证据(文件路径/URL/行号) | 未完成与原因
【纪律】没有证据的写"未完成"；禁止把计划写成完成；禁止编造数据。
```

---

## 受阻说明（如实记录，不隐瞒）

2026-10-01 总控实测 `api-kimi.ltzzz.com`：
- `/health` → 200，`has_key:true`（Key 已注入成功）
- POST 调用 → 失败：
  - `moonshot-v1-32k`（Worker 默认值）→ 404 "Not found the model or Permission denied"
  - `moonshot-v1-8k` / `kimi-k2-0711-preview` → 同 404
  - `kimi-latest` / `moonshot-v1-auto` → 一次返回 **"account org-a1d7b46e… request reached limit"**，一次返回 404

**判定**：Key 认证是通的（错误里返回了 org id），问题是**账户侧受限**——最可能是余额/额度不足（owner 说过"deep 和豆包都有充值额度"，未提 Kimi），也可能是该 Key 未开通对应模型。

**解法（二选一，需 owner）**：
1. 在 Moonshot 开放平台确认该 Key 的**可用模型名**与**余额**，把模型名告诉豆包 → 豆包执行
   `wrangler secret put KIMI_MODEL --name ltzzz-kimi-proxy`（无需改代码）
2. 若暂不充值 → Kimi 席位继续走对话框模式（本卡照常执行，产出由 owner 转贴）

**对照**：DeepSeek 同一时刻调用成功（`deepseek-chat` 正常返回），证明 Worker 架构与域名链路没问题，是 Kimi 账户侧的事。
