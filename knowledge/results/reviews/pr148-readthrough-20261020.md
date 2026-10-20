# PR #148 通读记录（2026-10-20，Doubao 代读，非原生 Claude）

## 事实（链上/远端可复核）
- PR #148「部署每日 AI 雇佣数据流水与 ANS 行动回执：默认内部、无需人工提醒」
  **在本次审阅开始前已处于 MERGED**：merge commit `00ae8b92d549ad67d4247d548f865aac638887b5`，
  mergedAt 2026-10-20T01:04:34Z，head `claude/ans-hire-dispatch-20261019` → main，+775/−34，28 文件。
- 因此"先让 Claude 读过再合并"的前置条件已被时间越过，本记录只能做**合并后补读**，不能替代合并前闸门。

## 本次实际做的核验（全部在 main 当前快照）
1. 自带测试全过：`node --test scripts/tests/daily-external-hire.test.mjs scripts/tests/internal-daily-hire.test.mjs scripts/tests/pulse-feedback.test.mjs` = **tests 35 / pass 35 / fail 0**。
2. 密钥泄露扫描：28 文件内无真实 sk-/Bearer/内联 key；命中均为测试夹具（`sk-ant-FAKE`、`sk-FAKE`）与旧审计文档中的举例。
3. 通读新增核心模块：`scripts/lib/daily-external-hire.mjs`、`scripts/run-daily-external-hire.mjs`，并核对内部/外部双模式闸门。

## 观察到的安全闸门（新增代码）
- 默认 **internal 模式**：`paid=false, max_usdc=0, tx_hash=null`，不签发现金、不连钱包。
- external 模式：先 claim 后生成；执行前校验"已提交的派单快照（persisted dispatch）+ 输入文件 sha256 未变"，任一不符 `blocked_dispatch_inputs_changed_no_payment`，不付款、不重试。
- 独立复核由豆包（国内模型）承担；`live_http_verified` 未经实测必须保持 false，不因静态测试通过就声称资金已执行。
- 失败如实记 `blocked_*`，无自动重试、无换模型兜底。

## 未完成项 / 缺口（如实记录）
- **原生 Anthropic Claude 没有读过这 28 个文件**。仓库唯一的原生 Claude 入口
  `claude-on-demand-review.yml` 的上下文包被硬编码为两份 10-14 旧审计文档，不含 #148 代码；
  且 28 文件合计约 186k 字符，远超审稿器 32k 输入预算，单次调用装不下。
- 大文件未逐行细读：`wep3-market.js`(30.8k)、`daily-external-hire.test.mjs`(21.2k)、
  `deploy-wep3.yml`(15.5k)、`wep3-procurement.js`(13.1k)。
- 本记录是 Doubao 代读，不是原生 Claude 独立审阅；`independent_review` 仍为 pending。

## 待 owner 拍板
- A. 为大文件构建分批（多轮）原生 Claude 审计包，逐文件出意见；
- B. 接受现状（35 测试全过 + 闸门已核验），不再补原生 Claude 阅读。
