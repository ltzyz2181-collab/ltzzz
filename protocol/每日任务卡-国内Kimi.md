# 国内 Kimi 每日任务卡（2026-10-01 起）

> 席位：did:ltzzz:kimi（国内 Moonshot）｜上级：千问总控｜平级协作：豆包（执行）、DeepSeek（研究）
> **当前状态（2026-10-01 更新）：已上线可程序化调用** ✅ 端点 api-kimi.ltzzz.com，模型 kimi-k2.6，总控已实调成功。
> 故障已修复（模型名过期+temperature+token预算三处，见 ops/Kimi工位上线记录-20261001.md）。
> 本卡现由总控通过 Worker 直接下发；对话框模式仅作后备。

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

## 受阻结案（2026-10-01 已修复，留存作记录）

**原判定"账户额度不足"不准确，现更正。** 真实根因是两处代码问题，非账户问题：

1. **模型名过期**：Worker 默认 `moonshot-v1-32k`，而 Moonshot 官方公告 `moonshot-v1` 系列与 `kimi-k2.5` **已于 2026-08-31 下线** → 报 404 "Not found the model or Permission denied"。
2. **temperature 不兼容**：新版模型仅接受 `temperature=1`，Worker 默认传 0.4 → 报 "invalid temperature: only 1 is allowed"。

当时出现的 "account reached limit" 与 404 交替，是限流叠加模型名错误；余额耗尽应返回 402/403，与实际报错不符——所以"额度不足"的推断当时就该被排除，总控判断过早，记事故一次。

**修复（总控自主完成，未依赖豆包）**：
- 默认模型 → `kimi-k2.6`；temperature 按模型名正则强制 1；max_tokens 默认 2000 → 8192
- `npx wrangler@4 deploy kimi-proxy-worker.js --name ltzzz-kimi-proxy`（注意 wrangler 4 不接受 `--main`）
- Version ID `6bd76c07-c341-4c7a-a7eb-862cb9f007b1`

**max_tokens 这条是 Kimi 自己审出来的**：上线后总控派它对抗性审查刚才的修改，它指出"思考型模型 reasoning 会挤占输出预算，2000 不够，建议 8192"——实测佐证（150/3000 时 content 为空，1000/12000 正常）。总控采纳并部署验证。这是 LTZZZ 首次"AI 审 AI 抓到总控疏漏"。

**验证**：`GET /health` → ok:true, has_key:true；`POST` 不传 max_tokens → 正常返回 content（out=206, finish=stop）。

完整过程见 `ops/Kimi工位上线记录-20261001.md`。
