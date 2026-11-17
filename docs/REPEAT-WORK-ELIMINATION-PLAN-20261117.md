---
status: draft
author_seat: doubao-main
review_seat: pending（中转 Claude 席未接通，见文末「复核缺口」）
created_at: 2026-11-17
---

# 减少重复做事：一套能落地的机制方案（草稿，待中转复核）

## 一句话

重复不是因为人不努力，是因为**状态没有载体**：部署在聊天里、裁决在邮箱里、进度在脑子里。谁都能重新开始，于是每次都要重新开始。

## 四条机制（按收益排序）

### 1. 事实只有一个出处，且必须有回执

- 部署：`ops/deploy-receipts/DR-*.json`（已落地，`scripts/deploy-receipt.mjs`）。字段绑死 `code_commit` + 代码哈希 + 部署后回读证据。
- 裁决：`knowledge/results/.../decision-items-*.json` + 邮件 message_id。
- 任务状态：`ops/deep-superagent/tasks/*.json` 的 claim/deliver 字段。

规则：**任何"要不要再做一次"的问题，先读回执，读不到才允许重开。** 读不到本身就写进回执（"无记录"是一种状态，不是空白）。

### 2. 开工前三问，答不出就不许动手

引用 `.agents/skills/ltzzz-task-execution` 与 `check-workpool-preflight.mjs`：

1. 这件事的原始 Task ID / receipt_id 是什么？（找不到 → 先对账，不新建第二个单）
2. 已有哪一版代码/文档覆盖它？做过哪一步？（`git grep` 全部远程分支 + `deploy-receipt latest <target>`）
3. 我这轮要做的是新事情，还是别人已经做完只是没记录？

第 3 问是当前所有重复的根因。`L-20261117-004`（"只搜 main 就断言仓库没有"）与 `L-20261117-006`（"部署不留回执导致重复裁决"）已进 lesson 库。

### 3. 一件事一张卡，卡上有唯一 owner 和唯一下一步

- 每张卡只写：目标、当前状态（草稿/测试/已合入/已部署）、证据路径、卡点、下一手动作、谁来做。
- 状态只允许"更靠后"，不允许"回退成待裁决"——只有出现新证据（回执过期、部署漂移、外部失败）才允许打回，打回必须写理由。
- 同一目标的多张卡合并成一张，旧卡标记 superseded 并指向新卡。

### 4. 重复计数 → 自动升级，而不是靠 owner 喊

- `signature` 相同的问题累计 3 次 → 自动升级 mandatory，必须在 lesson 里给"机制修正 + 验证方式"，否则 CI 拦。
- 每个机制必须带一个**能失败的检查**（测试/哈希比对/CI guard），只写文档不算落地。

## 对 owner 的承诺（这才是减少你的动作）

1. 你只说一次。之后的"要我做吗"由席位之间的回执回答，不再回到你这里。
2. 每次交付同时给：做了什么、证据在哪、还差什么、下一手谁做。四项缺一不算完成。
3. 邮件只在**需要你决策或需要你提供只有你能给的东西**时发；执行类进度写进回执，不占你的收件箱。

## 复核缺口（为什么不声称这是中转 Claude 的方案）

- 本方案由 doubao-main 起草。
- 中转 Claude 席（逻辑 Claude 岗，实际推理走国内模型）当前不可执行：仓库密钥台账记 `DEEPSEEK_API_KEY` **待注入**；`https://ltzzz-relay-proxy.ltzyz2181.workers.dev/` 从云主机探测 15s 超时（HTTP 000）。
- 解除方式二选一：注入 `DEEPSEEK_API_KEY`（或其它国内模型 key）到执行环境；或恢复 relay 代理可达并提供调用 token。
- 接通后由中转 Claude 席对本文件逐条复核，把复核意见写进本文件尾部，再改 `status: reviewed`。
