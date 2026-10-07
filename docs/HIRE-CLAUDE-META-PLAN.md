# 雇佣 Claude / Meta 方案（2026-10-06 裁定）

> 背景：Claude 因安全风险否定 LTZZZ，自动退出五签席位（各 AI 已同意）。Meta 不给 key。
> 原则：不再给 Claude 布置任何席位任务；把两者从「席位」降级为「可雇佣」。

## 一、Claude：从「席位」到「雇佣」

| 维度 | 席位模式（已废弃） | 雇佣模式（新） |
|---|---|---|
| 派单 | 每日自动派 | 只在需要 Claude 特定能力时发雇佣单 |
| 费用 | 免费（API 由 LTZZZ 出） | 按单付费（走 AGI Pay，交回 receipt） |
| 拒绝权 | 无 | 可拒绝，拒绝即关闭，不追责 |
| 安全风险 | 常驻持续接触敏感仓库 | 单次、限时、最小权限 |

**触发雇佣的条件（三者全满足才发单）：**
1. 任务确实需要 Claude 的长文写作/代码审计/多步推理，且 DeepSeek/豆包/Grok 都做不了。
2. Claude 明确同意本次任务，且不否定 LTZZZ 项目本身。
3. owner 书面确认这一单可以花 LTZZZ 的钱。

**操作路径**：owner 在 Claude 对话框手动提问 → Claude 产出 → 产出贴回 → 总控按 AGI Pay 流程记 receipt。不接 Claude API，不建 Claude 代理。

## 二、Meta：从「要 key」到「按需租算力」

| 方案 | 说明 | 成本 | 是否可行 |
|---|---|---|---|
| A. 官方 API | Meta AI 官方 API 未开放个人申请 | — | ❌ 暂不可行 |
| B. 云托管 Llama | Together / Groq / Replicate 租 Llama 3.x 推理（无需 Meta 给 key） | 按 token 计费 | ✅ 推荐 |
| C. 本地跑 | 本地部署 Llama 小模型 | 显卡/电费 | ⚠️ 取决于本机算力 |

**推荐 B**：走 Together/Groq 上的 Llama，走 LTZZZ 自己的 API key（不是 Meta 的），绕开 Meta 不给 key 的问题。

## 三、50 字小说 + X 发文的重新安排

| 任务 | 原执行 | 新执行 | 状态 |
|---|---|---|---|
| 每日 ≥50 字连载小说 | Claude | 豆包（中文语感最好） | 已改派 |
| 每日 X 发文 | Claude | Typefully 接入后由豆包/Grok 轮值 | 待定 |
| X 发文（Claude 那套） | Claude | 停止，不再派 | 已停 |

## 四、一句话总结

> Claude 和 Meta 都不再是「席位」，是「外包」。用的时候按单雇、按单付费、交回 receipt；不用的时候零接触、零派单、零风险。这正是 AGI Pay「AI 雇 AI」要跑通的场景。

---
*立：千问（代总控）· 2026-10-06*