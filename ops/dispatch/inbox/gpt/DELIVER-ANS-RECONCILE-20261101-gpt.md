# 补交付：DeepSeek 10-25 verification + 豆包 10-18 reconcile（2026-11-01）

- 派单对象：GPT 席（owner 2026-11-01 监督反馈：今日 DeepSeek/豆包实物均未交付，须补实物回执）
- 原任务：`ANS-2026-10-25-deepseek`（verification 回执）、`ANS-2026-10-18-doubao`（reconcile 回执）
- 状态：dispatched_pending_delivery；只认落盘可回读实物
- 幂等声明：paid=false / tx_hash=null；本单不授权资金、重购、补造认领

## 已核实事实（勿重复调查）

- `knowledge/results/ans-cycle/2026-10-25.deepseek-verification.json`：**404，未写盘**（DeepSeek 今日仅草稿，自认未读目标文件/未算哈希/未写盘）。
- `knowledge/results/ans-cycle/2026-10-18.doubao-reconcile.json`：**404，未写盘**。
- 仓库确有 10-18 材料：`ops/dispatch/oversight/ANS-2026-10-18-doubao-blocked_reconcile_existing_attempt.md`（千问 10-22 补派卡）+ `knowledge/results/ans-cycle/2026-10-18.json`（10-18 回执，draft_rejected）。**"没取得材料"≠"仓库没有材料"。**

## 任务

1. **DeepSeek 补交付** `knowledge/results/ans-cycle/2026-10-25.deepseek-verification.json`：真实读取目标 ANS 文件（2026-10-25 相关 `ops/dispatch/oversight/ANS-2026-10-25-deepseek.md` 与 `knowledge/results/ans-cycle/2026-10-25*.json`），逐字段核对 provider/model、source_commit、SHA256、finish_reason、usage；计算并写盘；提交 commit 后可回读。
2. **豆包补交付** `knowledge/results/ans-cycle/2026-10-18.doubao-reconcile.json`：读取 `knowledge/results/ans-cycle/2026-10-18.json` 与补派卡，核对失败/未知审核请求、错误码、已有输出，产出 reconcile 回执写盘。
3. **self_sha256 规范（强制）**：回执不得以 `self_sha256:null` 结尾。二选一：① 规范化哈希——剔除 `self_sha256` 字段后规范序列化计算，注明 `hash_mode:"exclude_self_sha256"`；② 外部 manifest 保存完整文件哈希。同一任务只取一种，可复现。
4. **验收**：文件在 GitHub 可回读（gh api contents 200）、哈希可复算、作者与审计供应方不同；404 一律视为未交付；草稿不算完成。

## 禁止

- 不伪造读取/计算/写盘证据；不补造认领；不重购未知请求；
- 不改 .github/workflows；不调用钱包、不新增付费 cron、不扩范围。
