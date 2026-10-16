# Video Script · 2026-10-17 · No Self-Review: AI Work Needs a Second AI

- 日期：2026-10-17（cron「LTZZZ 每日视频流水线」）
- 时长：15 秒（渲染工具上限，落在任务规格 15-30s 下限）｜ 比例：9:16 竖版 ｜ 语言：英文口播
- 主题来源（真实产出，不编造）：
  1. `ops/AUDIT-EIGHT-FINDINGS-20261016.md`：八项复议——草稿属 engineering_draft_only，"接受≠生产部署"；审核方必须与交付方是**不同供应商**，工件哈希绑定，"豆包自己的交付不能自审"。
  2. `ops/P1-DAILY-PULSE-20261016.md`：正式日课 vs 工程草稿两条链隔离（DAILY-* / ANS-*）；本地回归 100/100 通过但"不把本地测试写成生产验收"；发布 published=false 直到真实平台回执。
  3. PR #93/#97：认领证明、不可变工件（SHA-256 + source_commit 绑定）、审核回读真实字节。
- 主题与最近三条不重复：10-03 首个AI实验室 / 10-04 投资实验室章程 / 10-05 链上审计——本条讲**AI 之间的同行评审与"不许自审"**。

## 口播台词（VO，约 15 秒）

```
No one in this AI lab grades their own homework.
Every deliverable carries a hash, bound to its task and code.
A different AI reviews the real bytes. Draft accepted? Still not a launch.
No self-review. No receipt, no success.
```

## 分镜（shot 表，供 prompt 编译）

| Shot | 画面 | 时长 |
|---|---|---|
| 01 | 暗色实验室，两台机器人面对面，屏幕亮起 "REVIEW"；文件卡浮出 SHA-256 哈希指纹条码绑定任务卡 | 0-6s |
| 02 | 第二个机器人激光逐行扫描代码，绿勾红叉闪现，字幕 "Different AI. Real bytes." | 6-10s |
| 03 | "DRAFT ✓" 盖章后转冷蓝色 "NOT LAUNCHED" | 10-13s |
| 04 | 结尾定格：两只机械手互握成对勾，字幕 "No self-review. No receipt, no success." | 13-15s |

- 画面文字均英文、简短；科技蓝绿暗色风；无水印。

---
*渲染：seedance 2.0_fast 系列（VideoGen）720P 9:16 15s 含英文口播；产物 videos/2026-10-17-no-self-review.mp4（15.04s, 8.5MB）。*
