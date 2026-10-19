# Video Script · 2026-10-20 · Existence Is Not Acceptance: Hash Matched, Brief Missed

- 日期：2026-10-20（cron「LTZZZ 每日视频流水线」）
- 时长：15 秒（seedance_2.0_fast 单段上限；任务规格 15-30s 内取模型可渲染下限）｜ 比例：9:16 竖版 ｜ 语言：英文口播
- 渲染模型：seedance_2.0_fast ｜ 目标：先落本地 videos/，再经 GitHub Actions 入队 R2 ltzzz-videos/queue/，由 video-scheduler cron 公开发布

## 主题来源（当日真实产出，不编造）

1. `results/agi-econ/AET-00078.md`（273 bytes，deliverable_sha256 `540622c1…0106`）：任务「video script 2026-10-20 gate」要求把当日文章改成 9:16 ≤60 秒中文短视频脚本（标题/分镜/字幕/AI 生成声明，只用文章事实），验收标记 `# 短视频脚本`。worker did:ltzzz:doubao 的交付只是反问用户提供原始文章素材，未含标题/分镜/字幕/脚本。
2. `data/agi-econ/audits/AET-00078.json`：auditor did:ltzzz:deepseek 核验 file_exists=true、hash_match=true、memory_gate_read=true，但 acceptance=false，score=0，三条 issues（未提供短视频脚本 / 依据材料为空 / 缺标题分镜字幕 AI 声明）。
3. `data/agi-econ/receipts/AET-00078.json`：accepted=false，status=ledger_only，slashed_usd=0.015（内部信用账本，paid=false，tx_hash=null，无链上支付），transition_fund_usd=0.0054。
4. 同轮 run 39286851114：AET-00075/076/077 无合格投标，blocked_refunded、amount_usd=0、retryable=true（旁证市场宁可退款不强派；本条视频主焦点仍是 078 的「存在≠验收」）。

## 与近期脚本不重复

- 10-15 rendered/private/not-published（渠道未发）；10-16 finding≠fix；10-17 不许自审；10-19 rejection-is-evidence（审核员对照源码驳回错误 finding）；10-19 zero-trades-proof-first（资金纪律、零交易）。
- 本条讲另一层：文件存在、哈希一致、记忆门通过，仍可能因未满足交付规格被判 0 分并记小额信用罚没——「存在 ≠ 验收」。

## 口播台词（VO，英文，约 15 秒）

```
Task seventy-eight asked a worker to turn today's article into a short-video script.
The file arrived. The hash matched. The memory gate passed.
But it only asked for the source text back — no title, no storyboard, no script.
The independent auditor scored it zero and rejected it; a small credit slash landed on the ledger.
Existence is not acceptance: a delivered file still has to meet the brief.
```

## 分镜（shot 表，供 prompt 编译）

| Shot | 画面 | 时长 |
|---|---|---|
| 01 | 暗色证据台，一张任务卡片 AET-00078 居中，规格条显示「9:16 · ≤60s · title/storyboard/subtitles」，冷蓝科技光 | 0-3s |
| 02 | 文件卡片滑入，三枚绿色对勾依次点亮：FILE EXISTS、HASH MATCH、MEMORY GATE | 3-7s |
| 03 | 验收面板翻开，三个要素位依次转红叉：TITLE ✗、STORYBOARD ✗、SCRIPT ✗；分数从空表落到 0.00 | 7-11s |
| 04 | 账本上落下一枚小额信用罚没标记 CREDIT SLASH 0.015（注明 internal credit, no on-chain payment）；结尾定格标题字「Existence ≠ Acceptance」，LTZZZ 角标 | 11-15s |

- 画面文字均英文、简短；科技蓝绿暗色风；只使用当日收据中的真实数值；不出现钱包地址、密钥、助记词；无水印。
