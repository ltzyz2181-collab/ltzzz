# 监督复核处置：DeepSeek/豆包实物未交付 + 豆包表述纠错 + self_sha256 规范（2026-11-01）

- 处置对象：DeepSeek 今日输出 `knowledge/results/ans-cycle/2026-10-25.deepseek-verification.json`；豆包今日输出 `knowledge/results/ans-cycle/2026-10-18.doubao-reconcile.json`；self_sha256 自引用问题
- 处置席：豆包主 agent（独立核实，本处置同时含对本席今日表述的纠错）
- 结论：两份目标文件均未写盘（GitHub 404 属实）；豆包"本轮没有提供 10 月 18 日 ANS 派单和回执"的表述错误（仓库确有材料）；self_sha256 字段存在自引用定义问题，需规范。

## 1. 文件存在性核实（gh API contents，2026-11-01 实测）

| 路径 | 存在 | 备注 |
|---|---|---|
| `knowledge/results/ans-cycle/2026-10-25.deepseek-verification.json` | **否（404）** | DeepSeek 今日仅出草稿（`data/memory/deepseek.json`、`memory/daily/agent-2026-10-31-deepseek-*`、daily-board artifact 中均有 `self_sha256:null` 草稿），未读目标 ANS 文件、未算哈希、未写盘——自认属实 |
| `knowledge/results/ans-cycle/2026-10-18.doubao-reconcile.json` | **否（404）** | 豆包今日未写盘 |
| `ops/dispatch/oversight/ANS-2026-10-18-doubao-blocked_reconcile_existing_attempt.md` | **是（1286 B）** | 千问监督 2026-10-22T02:13:57Z 补派卡，Task ID `ANS-2026-10-18-doubao`，输入即 10-18.json |
| `knowledge/results/ans-cycle/2026-10-18.json` | **是（19725 B，sha 2b028cee…）** | 10-18 ANS 回执（draft_rejected，含 tasks/calls 明细、source_commit b4e6a2d0） |

**纠错**：本席（豆包主 agent）此前表述"本轮没有提供 10 月 18 日 ANS 派单和回执"不成立——仓库存在上表第 3、4 项材料。正确表述应为"豆包未取得/未读取材料"，而非"仓库没有材料"。向 owner 明确更正。

## 2. self_sha256 自引用问题

- 现状：回执草稿含 `"self_sha256":null,"note":"self_sha256由受管执行器落盘时计算"`（deepseek 草稿多处）。
- 问题：若自哈希包含文件内 `self_sha256` 字段，哈希值依赖自身字段内容 → 自引用、不可计算、不可复现。
- **规范（本处置起生效）**：
  1. 首选：**规范化哈希**——对文件内容先剔除 `self_sha256` 字段（以规范 JSON 序列化，键序稳定）后再计算 SHA-256，并在文件中注明 `hash_mode:"exclude_self_sha256"`；
  2. 或：**外部清单保存完整文件哈希**——由受管执行器在落盘时把完整文件哈希写入独立 manifest（如 `knowledge/results/ans-cycle/manifest.json`，字段 `{path, sha256, committed_sha}`），文件内部不再放自哈希；
  3. 二者选一，同一任务回执内保持唯一；不得再以 `self_sha256:null` 结尾冒充完成。

## 3. 处置动作

1. 本复核落盘；
2. 追加派单（DELIVER-ANS-RECONCILE-20261101-gpt.md）：DeepSeek 补交付 10-25 verification、豆包补交付 10-18 reconcile，均须真实读源文件+算哈希+写盘+可回读，且按 §2 规范处理 self_sha256；
3. 交付回执必须落盘且 GitHub 可回读（404 即视为未交付），草稿不算完成。

## 后续总控对账（2026-11-01；保留上文历史观察）

上述时点判断不能覆盖后续实际证据。参见 `ops/dispatch/outbox/receipts/GPT-BATCH-RECEIPT-20261101.md`：#318由#324/#326替代，已有关闭说明与原outbox回执；A2历史首次L0自动合并有真实回读。新增真实SIGKILL测试验证本地恢复继续同步，未采纳continue补丁，不代表原ANS生产修复。两份补核对由真实国内native调用及总控读源物化，完整字节hash以 `knowledge/results/ans-cycle/reconcile-manifest-20261101.json` 为准；原工程拒绝与未知请求保留，不把元数据补交付写成工程验收。
