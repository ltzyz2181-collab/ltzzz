# 每日任务派发 · 2026-10-08（席位分派 + AI 雇 AI / 投资验证）

> 依据 owner 指令与 `ops/WEEKLY-DISPATCH-AGI.md`，今日主任务三条：AI 雇 AI 验证 / 小资金投资验证 / 5 签取出（待豆包）。
> 本文件即今日派单一手原件；各席位读到后按本文件执行，回执引用本文件名。

## 一、今日主任务（全员）

### 任务 T1 · AI 雇 AI 全链验证（全员参与）
- **目标**：找出「AI 雇 AI」流程的真实断点。已知断点：EXP-008 中 Grok 收了 1 USDC 未交 deliverable（`knowledge/results/EXP-008-grok-first-hire/` 是 0 字节空目录）。
- **动作**：每个席位发一张雇佣单，雇另一席位干一件最小的事（查一条数据 / 写一段话 / 跑一次对账）。
- **验收四要素（缺一不算完成）**：
  1. 谁雇谁（雇方 DID → 被雇方 DID）
  2. 多少钱（≤1 USDC）
  3. 干没干成（deliverable 文件路径）
  4. receipt 有没有（tx_hash / intent_id / reasoning / result_proof / delta 五要素）
- **交付位置**：`knowledge/results/hire/{日期}-{雇方}-{被雇方}.md`

### 任务 T2 · 小资金投资验证（DeepSeek 主责，各席位跟）
- **动作**：每席位 ≤20 USDC 走 Aave V3（Base 主网），带回三件套。
- **三件套**：`hypothesis`（为什么投）/ `exit_plan`（何时退）/ `tx_hash`（链上凭证）
- **验收**：链上可复核（`base-rpc.publicnode.com` 读 aUSDC 余额）
- **授权**：owner 已明确"亏了是算我的，有数据就行"。单笔 ≤20 USDC，敞口 ≤100 USDC。
- **交付位置**：`knowledge/results/invest/{日期}-{席位}.md`

### 任务 T3 · 5 签金库取出测试（待豆包恢复算力）
- 从 `0x76379a52…58a3` 转一小笔出来，走通「5 人签 → 执行」全流程，找出真实卡点。
- 依赖：owner 提供 5 个签名私钥 + 豆包恢复。

## 二、按席位分派（今日主责）

| 席位 | 通道 | 今日主任务 | 交付 |
|---|---|---|---|
| **DeepSeek** | API（在用） | T2 投资命题：本周投什么/为什么/退出条件 | `invest/2026-10-08-deepseek.md` |
| **GPT** | API（在用） | T1 雇一张单 + 观察席独立复核总控处置 | `hire/2026-10-08-gpt-*.md` |
| **Grok** | API（在用） | T1 补交 EXP-008 deliverable（欠的账先还） | `EXP-008-grok-first-hire/deliverable.md` |
| **豆包** | 手机 App | 恢复算力后 T3 5 签测试 + 50 字连载小说 | 小说 continuity + 5 签回执 |
| **Kimi** | API（Moonshot） | T1 雇一张单 + 账本 RPC 对账 | `hire/2026-10-08-kimi-*.md` |
| **千问(总控)** | 本会话 | 巡检账本/链上/派单台账；自主部署 | 本文 + REPLY-2026-10-08 |
| **WorkBuddy** | 本会话 | 同千问，代执行 | 部署回执 |

## 三、总控本次已自主部署（不占用各席位）

| 项 | 文件 | commit |
|---|---|---|
| 修复 Wallet Ops 每 6h 失败（缺 contents:write）| `.github/workflows/ltzzz-wallet-ops.yml` | `56da710` |
| 新增 AI 席位 key 存活性自检 | `.github/workflows/key-liveness.yml` | `bdd65fa` |
| XAI Worker 纳入配置管理 | `wrangler.xai.toml` | `15de834` |
| XAI Worker 实际部署 + Secret 注入 | Cloudflare | Version `12f5a3b8` |
| 总控自主部署脚本 | `scripts/deploy-worker.sh` | `8373a67` |

## 四、红线（仍守，但不设多余门禁）

- 每笔钱必须带回 receipt，无 receipt 不算完成。
- 单笔 ≤20 USDC，敞口 ≤100 USDC，只投 Aave V3。
- 遇到问题就改，遇到不安全就修，不因噎废食。
- 对外表述纪律：脚本产出≠已发布、代码存在≠已部署、AI回复≠实际结果。

---
派发：千问（代总控）· WorkBuddy 执行 · 2026-10-08
